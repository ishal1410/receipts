#!/usr/bin/env node
// Guard: exits non-zero unless a URL actually serves OUR BUILT APP to a visitor
// with no Vercel account, no cookies, and no session. Run it on every deploy and
// on the URL that goes into the hackathon submission form.
//
//   node tools/verify-live.mjs https://bob-rehearsal.vercel.app
//   node tools/verify-live.mjs --submission https://bob-rehearsal.vercel.app
//
// TWO MODES, because two different questions get asked of the same URL:
//   default       "does this URL serve the app right now?"
//                 A hashed deployment URL with protection off genuinely does,
//                 so it WARNS and exits 0. Failing it here would make this
//                 script lie about what a visitor sees.
//   --submission  "is this exact string safe to paste into the lablab
//                 Application URL field?" A hashed deployment URL is never
//                 safe there — it is pinned to one build and rotates on the
//                 next deploy — so it is a hard FAIL. That field is marked
//                 "Required for interactive evaluation": a rotated or walled
//                 URL there zeroes the largest scoring surface in the comp.
// Every other check is identical in both modes.
//
// THE DEFECT THIS EXISTS TO KILL: the old check asserted `HTTP 200` +
// `Content-Type: text/html` with redirects followed. Vercel's Deployment
// Protection wall ends its redirect chain on a 200 text/html LOGIN PAGE, so the
// old check PASSED a URL no judge can open. Status code and content type cannot
// tell "my app" from "Vercel's login screen" — so this script never asks them
// to. It inspects every redirect hop, and it demands POSITIVE proof of the build
// (a same-origin JS bundle that index.html names and that itself fetches 200
// with a JS content type). A login page cannot produce that proof.
//
// ponytail: stdlib only (node:url, global fetch — Node 24.15.0 on this box).
// Zero dependencies, no npm install, runs from PowerShell or Git Bash.
//
// Design rule, copied from check-snapshot-fresh.mjs: NEVER FAIL OPEN. Any
// condition this script cannot positively verify — a DNS error, a socket reset,
// a timeout, a thrown bug in this file — is a FAIL. A check that passes on its
// own bug is worse than no check.

import { pathToFileURL } from 'node:url';

const MAX_HOPS = 10;
const TIMEOUT_MS = 15_000;
const MIN_BODY_BYTES = 200; // a real Vite index.html is ~400B; a 12B stub is not an app
const MAX_ASSETS_CHECKED = 4;
const UA = { 'user-agent': 'verify-live/1 (hackathon-bob)' };

// A redirect into an auth wall. Matched on the PATH, not just the vercel.com
// host: the wall's second hop is a RELATIVE `/login?next=%2Fsso-api...` on the
// app's own domain, which a host-only pattern would miss.
const AUTH_PATH = /(^|\/)(sso-api|sso|login|signin|sign-in|oauth)(\/|\?|#|$)/i;
const AUTH_HOST = /(^|\.)vercel\.com$/i;

// Negative body signals. Deliberately structural, not English prose — see the
// justification at Check 5.
const LOGIN_BODY_SIGNALS = [
  [/<input[^>]+type\s*=\s*["']?password/i, 'a password <input>'],
  [/autocomplete\s*=\s*["']?(current|new)-password/i, 'an autocomplete=password field'],
  [/_vercel_sso_nonce/i, 'the _vercel_sso_nonce field'],
  [/vercel\.com\/sso-api/i, 'a vercel.com/sso-api reference'],
  [/vercel\.com\/(login|signup)/i, 'a vercel.com login link'],
];

function printFindings(failures, warnings) {
  for (const w of warnings) {
    console.error(`\n[WARN] ${w.id}`);
    console.error(`  problem: ${w.problem}`);
    console.error(`  why it matters: ${w.why}`);
    console.error(`  fix: ${w.fix}`);
  }
  for (const f of failures) {
    console.error(`\n[FAIL] ${f.id}`);
    console.error(`  problem: ${f.problem}`);
    console.error(`  why it matters: ${f.why}`);
    console.error(`  fix: ${f.fix}`);
  }
}

// --- hashed deployment URL -------------------------------------------------
// `bob-rehearsal-iaq21tlxr-ishal1410s-projects.vercel.app` vs the production
// domain `bob-rehearsal.vercel.app`: Vercel's per-deployment hostnames carry a
// generated-id segment.
export function isHashedDeploymentUrl(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  if (!/\.vercel\.app$/i.test(host)) return false;
  const label = host.replace(/\.vercel\.app$/i, '');
  return label.split('-').some((seg) => seg.length >= 9 && /[a-z]/i.test(seg) && /\d/.test(seg));
}

// DECISION: a hashed deployment URL is a WARNING, not a FAIL. Justification:
// with protection off, a hashed URL genuinely does serve the app, so failing it
// would make this script lie about what a judge sees — and the real harm (the
// SSO wall, which is ON by default for exactly these URLs) is already a hard
// FAIL below. What a hashed URL *is* is a submission hazard: pinned to one
// build, rotated on the next deploy, and the one that gets walled. So: warn
// loudly, still exit 0 if everything else proves out.

// --- asset references ------------------------------------------------------
export function extractAssetRefs(html, baseUrl) {
  const refs = new Set();
  const origin = new URL(baseUrl).origin;
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    if (!/\.(m?js|css)(\?|#|$)/i.test(m[1])) continue;
    try {
      const abs = new URL(m[1], baseUrl);
      if (abs.origin !== origin) continue; // same-origin only: a CDN 200 proves nothing about OUR build
      refs.add(abs.href);
    } catch {
      /* unparseable ref: cannot be used as proof either way */
    }
  }
  return [...refs];
}

// --- judgement (pure) ------------------------------------------------------
// `record` is everything the network step observed. Pure and separate so the
// self-check can feed it synthetic responses with no network involved.
export function judge(record) {
  const failures = [];
  const warnings = [];
  const fail = (id, problem, why, fix) => failures.push({ id, problem, why, fix });

  const { url, hops = [], status, finalUrl, contentType = '', body = '', assets = [], submission = false } = record;

  if (isHashedDeploymentUrl(url)) {
    // Same finding, different severity by mode. See the two-modes note at the
    // top of this file: default asks "does it serve the app" (it does, so WARN);
    // --submission asks "is this string safe to submit" (it is not, so FAIL).
    (submission ? failures : warnings).push({
      id: 'hashed-deployment-url',
      problem: `${url} is a per-deployment Vercel hostname, not the bare production domain.`,
      why: submission
        ? 'This is the string that would go in the lablab Application URL field, which is marked "Required for interactive evaluation". It is pinned to one build and is replaced by the next deploy, so by judging time it can 404 or sit behind Deployment Protection — zeroing the largest scoring surface in the competition.'
        : 'It is pinned to one build, it is rotated by the next deploy, and it is the URL Deployment Protection walls by default. It does not belong in a submission form or a demo video.',
      fix: 'Use the production domain (e.g. https://bob-rehearsal.vercel.app) everywhere a human will click.',
    });
  }

  // --- Check 1: the SSO wall. The one that silently passed before. ---
  for (const hop of hops) {
    const loc = hop.location || '';
    let locPath = loc;
    let locHost = '';
    try {
      const u = new URL(loc, finalUrl || url);
      locPath = u.pathname;
      locHost = u.hostname;
    } catch {
      /* relative/garbage Location: fall back to matching the raw string */
    }
    if (AUTH_PATH.test(locPath) || AUTH_HOST.test(locHost)) {
      fail(
        'sso-wall',
        `Redirect hop ${hop.status} from ${hop.from} points at an auth wall: Location: ${loc.slice(0, 140)}`,
        'This is Vercel Deployment Protection. The chain ENDS on a 200 text/html login page, so a status+content-type check passes it while every judge without a Vercel account sees a login screen instead of the app.',
        'Use the production domain, or set Deployment Protection to Disabled / add a public bypass in Vercel project settings.'
      );
      break;
    }
  }

  // --- Check 1b: the chain left our host entirely. ---
  // Found by running this guard against the live walled URL: the wall's final
  // page is on vercel.com, and vercel.com's OWN same-origin bundle satisfied
  // Check 6 below. So Check 6's positive proof only proves "some app loaded" —
  // this check is what makes it prove "MY app". Scheme changes and a www prefix
  // are normal and allowed; a different host is not.
  const bareHost = (u) => { try { return new URL(u).hostname.replace(/^www\./i, '').toLowerCase(); } catch { return null; } };
  if (finalUrl && bareHost(url) && bareHost(finalUrl) !== bareHost(url)) {
    fail(
      'off-site-redirect',
      `${url} ended up on a different host: ${finalUrl}`,
      'Whatever is served there is not your deployment. Any "the app loaded" proof taken from that page is proof about someone else\'s page — this is how an auth wall passes an asset check.',
      'Point the URL at your own domain and re-run.'
    );
  }

  // --- Check 2: HTTP status. ---
  if (typeof status !== 'number') {
    fail(
      'no-status',
      'No final HTTP status was observed.',
      'This guard cannot prove anything about a response it never saw. Unknown must be a fail, not a pass.',
      'Re-run; if it persists, the URL or the network is the problem.'
    );
  } else if (status >= 400) {
    fail(
      'http-error',
      `Final response was HTTP ${status} at ${finalUrl}.`,
      'A judge opening this link gets an error page, not the app.',
      'Check the deploy succeeded and that the domain is assigned to it.'
    );
  } else if (status >= 300) {
    fail(
      'unresolved-redirect',
      `Redirect chain did not settle within ${MAX_HOPS} hops (last status ${status}).`,
      'A redirect loop is indistinguishable from a broken site to a visitor.',
      'Inspect the chain with: curl -sSIL <url>'
    );
  }

  // --- Check 3: not HTML at all. ---
  if (typeof status === 'number' && status < 300 && !/text\/html/i.test(contentType)) {
    fail(
      'not-html',
      `Final Content-Type was "${contentType || '(none)'}", not text/html.`,
      'The app entry point must be an HTML document. Anything else means a raw file, an API route, or a misconfigured rewrite is on the domain.',
      'Check the Vercel output directory and framework preset.'
    );
  }

  // --- Check 4: empty or suspiciously tiny body. ---
  const bytes = Buffer.byteLength(body, 'utf8');
  if (bytes === 0) {
    fail(
      'empty-body',
      `Final response body is empty (0 bytes) at ${finalUrl}.`,
      'A blank page is a failed deploy that still answers 200. Judges see nothing.',
      'Rebuild and redeploy; confirm dist/index.html is non-empty.'
    );
  } else if (bytes < MIN_BODY_BYTES) {
    fail(
      'tiny-body',
      `Final response body is only ${bytes} bytes (< ${MIN_BODY_BYTES}) at ${finalUrl}.`,
      'A real Vite index.html is several hundred bytes. Something this small is a placeholder, an error stub, or a half-written file — not the app.',
      'Rebuild and redeploy; inspect dist/index.html.'
    );
  }

  // --- Check 5: login/auth page by body content. ---
  // SIGNAL JUSTIFICATION: the strong signal is the POSITIVE one in Check 6 — a
  // same-origin JS bundle that our own index.html names and that actually
  // fetches as JS. A login page can never produce that, whatever language it is
  // written in. These negative signals are the cheap second net, and they are
  // structural markers (a password input, an autocomplete token, a Vercel SSO
  // nonce, an sso-api URL) rather than an English string like "Log in", which
  // breaks under i18n, rewording, or minification.
  for (const [re, label] of LOGIN_BODY_SIGNALS) {
    if (re.test(body)) {
      fail(
        'login-page-body',
        `Final body at ${finalUrl} contains ${label}.`,
        'The page served is an authentication screen, not the app — even though it answered 200 text/html.',
        'Disable Deployment Protection (or use the public production domain) and re-run.'
      );
      break;
    }
  }

  // --- Check 6: POSITIVE proof a built app is really there. ---
  // "MY app" rather than "some app" is Check 1b's job — the two together are the
  // proof. Neither alone is enough; see the note on Check 1b.
  const js = assets.filter((a) => /\.m?js(\?|#|$)/i.test(a.url));
  if (assets.length === 0) {
    fail(
      'no-app-bundle',
      `index.html at ${finalUrl} references no same-origin .js/.css assets.`,
      "A built Vite app (base: './') always emits a <script> tag pointing at ./assets/*.js. HTML with none is a placeholder, a login screen, or a broken build — and this is the check a status code can never make.",
      'Confirm vite build ran and that Vercel served dist/, not the repo root.'
    );
  } else if (js.length === 0) {
    fail(
      'no-app-bundle',
      `index.html at ${finalUrl} references CSS but no same-origin JS bundle.`,
      'A React app with no script tag renders an empty page.',
      'Confirm dist/index.html contains its <script type="module"> tag.'
    );
  }
  for (const a of assets) {
    if (a.error) {
      fail(
        'asset-unfetchable',
        `Referenced asset ${a.url} could not be fetched: ${a.error}`,
        'If this guard cannot fetch an asset the page needs, it cannot prove the app loads. Unknown is a fail.',
        'Re-run; if it persists the asset is genuinely unreachable.'
      );
    } else if (a.status !== 200) {
      fail(
        'bundle-missing',
        `Referenced asset ${a.url} returned HTTP ${a.status}.`,
        'index.html was served but the JS/CSS it needs is not, so the page loads blank or unstyled. index.html answering 200 hides this completely.',
        "Check vite.config.ts base (this app pins base: './') and that all of dist/assets/ was uploaded."
      );
    } else if (/text\/html/i.test(a.contentType || '')) {
      fail(
        'bundle-is-html',
        `Referenced asset ${a.url} answered 200 but with Content-Type ${a.contentType}.`,
        'This is an SPA catch-all rewrite serving index.html for a missing asset. The browser refuses the module and the page stays blank, while every status code in the chain reads 200.',
        'Fix the rewrite so /assets/* is served as a static file, and confirm the files exist in dist/assets/.'
      );
    }
  }

  return { failures, warnings };
}

// --- network step ----------------------------------------------------------
export async function probe(url) {
  const hops = [];
  let current = url;
  let res;

  for (let i = 0; i < MAX_HOPS; i++) {
    res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: UA });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      hops.push({ from: current, status: res.status, location: loc });
      // Drain the redirect's own body. An unconsumed fetch body leaves an open
      // undici socket, and process.exit() on top of one trips a libuv assertion
      // on Windows (!(handle->flags & UV_HANDLE_CLOSING), exit 0xC0000409) —
      // i.e. the guard crashes instead of reporting. Observed, not theoretical.
      await res.body?.cancel();
      current = new URL(loc, current).href;
      continue;
    }
    break;
  }

  const body = await res.text();
  const record = {
    url,
    hops,
    status: res.status,
    finalUrl: current,
    contentType: res.headers.get('content-type') || '',
    body,
    assets: [],
  };

  for (const ref of extractAssetRefs(body, current).slice(0, MAX_ASSETS_CHECKED)) {
    try {
      const ar = await fetch(ref, { redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS), headers: UA });
      record.assets.push({ url: ref, status: ar.status, contentType: ar.headers.get('content-type') || '' });
      await ar.body?.cancel(); // same reason as above: never leave a body dangling
    } catch (err) {
      record.assets.push({ url: ref, error: err.message });
    }
  }

  return record;
}

// --- CLI -------------------------------------------------------------------
// Runs only when executed directly, so the self-check can import the pure parts.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const argv = process.argv.slice(2);
  const submission = argv.includes('--submission');
  const url = argv.find((a) => !a.startsWith('--'));
  const MODE = submission
    ? 'mode: --submission (is this string safe to paste into the submission form?)'
    : 'mode: default (does this URL serve the app right now?)';
  // ponytail: pessimistic default. Every path out of here must explicitly earn
  // a 0; a crash after this line still exits 1.
  let exitCode = 1;
  let failures = [];
  let warnings = [];

  try {
    if (!url) {
      failures = [{
        id: 'no-url-argument',
        problem: 'No URL argument given.',
        why: 'Nothing was checked, so nothing is verified.',
        fix: 'node tools/verify-live.mjs https://your-app.vercel.app',
      }];
    } else if (!/^https?:\/\//i.test(url)) {
      failures = [{
        id: 'bad-url-argument',
        problem: `"${url}" is not an http(s) URL.`,
        why: 'A judge clicks an http(s) link. Anything else is untestable.',
        fix: 'Pass the full URL including https://',
      }];
    } else {
      ({ failures, warnings } = judge({ ...(await probe(url)), submission }));
    }
  } catch (err) {
    // A thrown error is a FAIL, never a pass: DNS failure, TLS error, timeout,
    // or a bug in this very file all land here.
    failures = [{
      id: 'probe-failed',
      problem: `The check itself could not complete for ${url}: ${err.message}`,
      why: 'An unverifiable URL is an unverified URL. This guard refuses to pass on its own failure.',
      fix: 'Re-run; if it persists the host is unreachable or this script has a bug — fix it, do not ignore it.',
    }];
  }

  printFindings(failures, warnings);

  // Always state which question was answered. At hour 46 of a 48-hour build,
  // "it said OK" is worth nothing unless you can see which OK it was.
  if (failures.length === 0) {
    console.log(`[${MODE}]`);
    console.log(
      `OK: ${url} serves the built app to an anonymous visitor ` +
      `(no auth redirect, own host, HTML entry point, same-origin JS bundle fetched 200)` +
      `${warnings.length ? ` — ${warnings.length} warning(s) above` : ''}.` +
      `${submission ? ' Safe to paste into the submission form.' : ''}`
    );
    exitCode = 0;
  } else {
    console.error(`\n[${MODE}]`);
    console.error(`${failures.length} check(s) failed. ${url ?? '(no url)'} is NOT safe to submit.\n`);
  }

  // NOT process.exit(): calling it while undici still holds a keep-alive socket
  // trips a libuv assertion on Windows and kills the process with 0xC0000409
  // (3221226505) INSTEAD of the verdict above — measured on this box, on every
  // run that made more than one request. Setting exitCode lets the loop drain.
  process.exitCode = exitCode;
}
