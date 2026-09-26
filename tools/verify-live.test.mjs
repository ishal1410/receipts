// Proves tools/verify-live.mjs actually bites. Stands up a throwaway localhost
// HTTP server that impersonates each way a deploy can lie — including Vercel's
// SSO wall (302 -> /login -> 200 text/html login page), the exact shape that
// silently PASSED the old "200 + text/html" check — then runs the real script
// against it as a subprocess and asserts its exit code and printed reason.
//
// Run with: node --test tools/check-snapshot-fresh.test.mjs tools/secret-scan.test.mjs tools/verify-live.test.mjs
//  (NOT `node --test tools/` — the directory form throws
//   "Cannot find module ...\tools" from the CJS loader on Node 24 on this box, before
//   any test file is read. Verified 2026-09-24. Name the files explicitly.)
//
// ponytail: stdlib only (node:test, node:assert, node:http, node:child_process,
// node:path). No frameworks, no fixtures library, no network access — the two
// cases that need an ABSOLUTE https://vercel.com/sso-api Location and a hashed
// *.vercel.app hostname are asserted against the pure judge() instead of a
// server, because faking a real hostname would mean either a live request or an
// /etc/hosts edit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { judge, isHashedDeploymentUrl, extractAssetRefs } from './verify-live.mjs';

const SCRIPT = path.join(import.meta.dirname, 'verify-live.mjs');

const goodHtml = (src) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <title>Receipts — every number traced to a commit</title>
    <script type="module" crossorigin src="${src}"></script>
    <link rel="stylesheet" crossorigin href="./assets/ok.css" />
  </head>
  <body><div id="root"></div></body>
</html>`;

// A Vercel-style login page: 200, text/html, plausible size, no app bundle.
const LOGIN_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>Login</title></head><body><main><h1>Authentication Required</h1>
<form method="post" action="/sso-api"><input name="email" type="email" />
<input name="password" type="password" autocomplete="current-password" />
<input type="hidden" name="_vercel_sso_nonce" value="abc123" />
<button type="submit">Continue</button></form></main></body></html>`;

const routes = {
  '/happy': (res) => html(res, goodHtml('./assets/ok.js')),
  '/walled': (res) => {
    // Hop 1 exactly as measured on the live deployment URL, but relative and
    // local so the test makes no outbound request.
    res.writeHead(302, { location: '/login?next=%2Fsso-api%3Furl%3Dhttp%253A%252F%252Flocal%26nonce%3D1' });
    res.end();
  },
  '/login': (res) => html(res, LOGIN_HTML),
  '/boom': (res) => { res.writeHead(500, { 'content-type': 'text/html' }); res.end('<html>nope</html>'); },
  '/gone': (res) => { res.writeHead(404, { 'content-type': 'text/html' }); res.end('<html>404</html>'); },
  '/tiny': (res) => html(res, '<html>hi</html>'),
  '/empty': (res) => html(res, ''),
  '/no-bundle': (res) => html(res, `<!doctype html><html><head><title>Coming soon</title></head>
<body><h1>Coming soon</h1><p>${'padding '.repeat(30)}</p></body></html>`),
  '/bundle-404': (res) => html(res, goodHtml('./assets/missing.js')),
  '/bundle-is-html': (res) => html(res, goodHtml('./assets/html.js')),
  // 200 text/html, real working bundle, but the page is an auth screen.
  '/password-page': (res) => html(res, goodHtml('./assets/ok.js').replace('<div id="root"></div>',
    '<form><input type="password" name="password" /></form>')),
  '/json': (res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, pad: 'x'.repeat(300) })); },
  '/assets/ok.js': (res) => { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end('export const a=1;'); },
  '/assets/ok.css': (res) => { res.writeHead(200, { 'content-type': 'text/css' }); res.end(':root{}'); },
  '/assets/missing.js': (res) => { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); },
  // SPA catch-all rewrite serving index.html for a missing asset: 200, but HTML.
  '/assets/html.js': (res) => html(res, goodHtml('./assets/ok.js')),
};

function html(res, body) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

let server;
let base;

test('start fixture server', async () => {
  server = http.createServer((req, res) => {
    const route = routes[new URL(req.url, 'http://x').pathname];
    if (route) return route(res);
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('no route');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

// MUST be async, not spawnSync: spawnSync blocks this process's event loop, so
// the fixture server above could never answer the child's request and every test
// would deadlock. (It did. That is why this is a spawn + promise.)
function run(url, ...flags) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...flags, ...(url === undefined ? [] : [url])], { encoding: 'utf8' });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('PASSES the happy path: real HTML + a same-origin JS bundle that fetches 200', async () => {
  const r = await run(`${base}/happy`);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /^\[mode: default/);
  assert.match(r.stdout, /\nOK: /);
});

test('--submission passes a NON-hashed URL that serves the app, and says which mode ran', async () => {
  const r = await run(`${base}/happy`, '--submission');
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /^\[mode: --submission/);
  assert.match(r.stdout, /Safe to paste into the submission form\./);
});

test('--submission still runs every other check: a walled URL fails in submission mode too', async () => {
  const r = await run(`${base}/walled`, '--submission');
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /sso-wall/);
  assert.match(r.stderr, /mode: --submission/);
});

test('FAILS the SSO wall — the case that silently passed the old 200+text/html check', async () => {
  const r = await run(`${base}/walled`);
  // Prove the old check would have been fooled: the chain really does end on a
  // 200 text/html page.
  assert.match(r.stderr, /sso-wall/);
  assert.match(r.stderr, /Location: \/login\?next=%2Fsso-api/);
  assert.equal(r.status, 1, r.stderr);
});

test('FAILS an absolute https://vercel.com/sso-api Location (host pattern, no network)', () => {
  const { failures } = judge({
    url: 'https://x.vercel.app',
    hops: [{ from: 'https://x.vercel.app/', status: 302, location: 'https://vercel.com/sso-api?url=https%3A%2F%2Fx&nonce=9' }],
    status: 200,
    finalUrl: 'https://vercel.com/login',
    contentType: 'text/html; charset=utf-8',
    body: LOGIN_HTML,
    assets: [],
  });
  assert.deepEqual(failures.map((f) => f.id).sort(), ['login-page-body', 'no-app-bundle', 'off-site-redirect', 'sso-wall']);
});

// Regression: the live walled URL lands on vercel.com/login, whose OWN
// same-origin JS bundle satisfies the "app bundle loaded" proof. Without
// off-site-redirect, a walled URL with no password field and no sso-api string
// in the body would pass every other check.
test('FAILS a chain that lands on someone else\'s host even when THAT page has a working bundle', () => {
  const { failures } = judge({
    url: 'https://bob-rehearsal-iaq21tlxr-ishal1410s-projects.vercel.app',
    hops: [{ from: 'https://bob-rehearsal-iaq21tlxr-ishal1410s-projects.vercel.app/', status: 307, location: '/somewhere' }],
    status: 200,
    finalUrl: 'https://some-other-host.example.net/somewhere',
    contentType: 'text/html; charset=utf-8',
    body: goodHtml('https://some-other-host.example.net/assets/app.js') + '<!-- no auth markers at all -->',
    assets: [{ url: 'https://some-other-host.example.net/assets/app.js', status: 200, contentType: 'application/javascript' }],
  });
  assert.deepEqual(failures.map((f) => f.id), ['off-site-redirect']);
});

test('a scheme upgrade and a www prefix are NOT off-site', () => {
  const ok = (url, finalUrl) => judge({
    url, hops: [], status: 200, finalUrl,
    contentType: 'text/html', body: goodHtml('./assets/a.js'),
    assets: [{ url: `${new URL(finalUrl).origin}/assets/a.js`, status: 200, contentType: 'application/javascript' }],
  }).failures.map((f) => f.id);
  assert.deepEqual(ok('http://receipts.example.com', 'https://receipts.example.com/'), []);
  assert.deepEqual(ok('https://receipts.example.com', 'https://www.receipts.example.com/'), []);
});

test('FAILS HTTP 5xx', async () => {
  const r = await run(`${base}/boom`);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /http-error/);
  assert.match(r.stderr, /HTTP 500/);
});

test('FAILS HTTP 4xx', async () => {
  const r = await run(`${base}/gone`);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /http-error/);
  assert.match(r.stderr, /HTTP 404/);
});

test('FAILS an empty body', async () => {
  const r = await run(`${base}/empty`);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /empty-body/);
});

test('FAILS a suspiciously tiny body', async () => {
  const r = await run(`${base}/tiny`);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /tiny-body/);
});

test('FAILS a login page served as 200 text/html with a working bundle', async () => {
  const r = await run(`${base}/password-page`);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /login-page-body/);
  assert.match(r.stderr, /password <input>/);
});

test('FAILS HTML with no app bundle at all', async () => {
  const r = await run(`${base}/no-bundle`);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /no-app-bundle/);
});

test('FAILS when index.html is served but the JS bundle 404s', async () => {
  const r = await run(`${base}/bundle-404`);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /bundle-missing/);
  assert.match(r.stderr, /HTTP 404/);
});

test('FAILS when an SPA rewrite serves index.html in place of the JS bundle (200 text/html)', async () => {
  const r = await run(`${base}/bundle-is-html`);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /bundle-is-html/);
});

test('FAILS a non-HTML entry point', async () => {
  const r = await run(`${base}/json`);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /not-html/);
});

test('NEVER FAILS OPEN: an unreachable host is a FAIL, not a pass', async () => {
  const r = await run('http://127.0.0.1:1/nothing-listens-here');
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /probe-failed/);
});

test('NEVER FAILS OPEN: no URL argument is a FAIL', async () => {
  const r = await run(undefined);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /no-url-argument/);
});

test('NEVER FAILS OPEN: a non-http argument is a FAIL', async () => {
  // A synthetic path on purpose. This argument is rejected by the ^https?://
  // guard before anything touches the filesystem, so the case does NOT depend
  // on any directory existing — but naming a real local build directory here
  // reads like it does, and that trap is not worth one line of realism.
  const r = await run('file:///nonexistent/dist/index.html');
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /bad-url-argument/);
});

test('hashed deployment URL WARNS but does not fail an otherwise-good deploy', () => {
  const record = {
    url: 'https://bob-rehearsal-iaq21tlxr-ishal1410s-projects.vercel.app',
    hops: [],
    status: 200,
    finalUrl: 'https://bob-rehearsal-iaq21tlxr-ishal1410s-projects.vercel.app/',
    contentType: 'text/html; charset=utf-8',
    body: goodHtml('./assets/index-a1b2c3.js'),
    assets: [
      { url: 'https://bob-rehearsal-iaq21tlxr-ishal1410s-projects.vercel.app/assets/index-a1b2c3.js', status: 200, contentType: 'application/javascript' },
    ],
  };
  const { failures, warnings } = judge(record);
  assert.deepEqual(failures, []);
  assert.deepEqual(warnings.map((w) => w.id), ['hashed-deployment-url']);

  // SAME URL, SAME RESPONSE, --submission mode: now a hard failure. The two
  // assertions below are the whole point of the flag — one question says the
  // URL works, the other says it must not be submitted, and both are true.
  const strict = judge({ ...record, submission: true });
  assert.deepEqual(strict.warnings, []);
  assert.deepEqual(strict.failures.map((f) => f.id), ['hashed-deployment-url']);
  assert.match(strict.failures[0].why, /Required for interactive evaluation/);
});

test('isHashedDeploymentUrl distinguishes production domains from deployment URLs', () => {
  assert.equal(isHashedDeploymentUrl('https://bob-rehearsal-iaq21tlxr-ishal1410s-projects.vercel.app'), true);
  assert.equal(isHashedDeploymentUrl('https://bob-rehearsal.vercel.app'), false);
  assert.equal(isHashedDeploymentUrl('https://receipts-bob.vercel.app/'), false);
  assert.equal(isHashedDeploymentUrl('https://example.com'), false);
  assert.equal(isHashedDeploymentUrl('not a url'), false);
});

test('extractAssetRefs resolves ./assets (base: "./") and ignores cross-origin refs', () => {
  const refs = extractAssetRefs(
    '<script src="./assets/i-1.js"></script><script src="https://cdn.example.com/x.js"></script><link href="./assets/i-1.css">',
    'https://app.example.com/'
  );
  assert.deepEqual(refs, ['https://app.example.com/assets/i-1.js', 'https://app.example.com/assets/i-1.css']);
});

test('stop fixture server', () => {
  server.close();
});
