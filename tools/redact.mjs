#!/usr/bin/env node
// Strip machine/user PII out of Bob task exports before they reach a public repo.
//
//   node tools/redact.mjs <file|dir>...        redact in place
//   node tools/redact.mjs --selftest <file>... redact COPIES and assert nothing broke
//
// Node 24, stdlib only.
//
// ponytail: the username scrub is one pass over the raw JSON *text*, not the parsed
// tree. Bob spells the same path three incompatible ways inside one export
// (`file:c:\Users\me\p`, `file:///c%3A/Users/me/p`, and bare `a.py`) and puts the
// path in object KEYS (_meta.changes, fileMtimes) as well as values. A text pass
// hits every spelling and keeps keys byte-identical to the values that reference
// them; a tree walk would need one rule per spelling and could desync a key from
// its twin. Username is alphanumeric, so no %-encoding variant exists.

import { readFileSync, writeFileSync, copyFileSync, statSync, globSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const PLACEHOLDER = "USER";
const SYSINFO = { platform: "redacted", release: "redacted", arch: "redacted", shell: "redacted" };

export function currentUser() {
  return process.env.BOB_REDACT_USER || os.userInfo().username;
}

const userRx = (user) => new RegExp(user.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");

/** Replace every spelling of the Windows username. Case-insensitive: the export
 *  uses `c:\Users\me` in env and `C:\Users\me` in the system prompt. */
export function redactText(text, user = currentUser()) {
  return text.replace(userRx(user), PLACEHOLDER);
}

export function containsUser(text, user = currentUser()) {
  return userRx(user).test(text);
}

// --- secret scan ------------------------------------------------------------
// These THROW, they do not redact. A silently redacted token is still live in
// the author's environment and nobody was told; a refused commit forces a human
// to go revoke it. Refusing to commit is the correct behaviour.
//
// Every pattern carries `fp:` — the innocent content that could trip it. Bob
// exports legitimately contain source code, unified diffs, long hex hashes and
// base64 blobs, so precision beats recall here: this runs at hour 40 on the
// critical path and a bogus hit costs the author time they do not have.

// Bearer-only. A shell variable, a docs placeholder or a filler run is never a
// live token. Real tokens are mixed-case random; ALL_CAPS_WITH_UNDERSCORES is a
// variable name. ponytail: an all-uppercase hex secret would be skipped here —
// ceiling accepted, because the other patterns are value-shaped and still see it.
const PLACEHOLDERISH = /^[$<{(]|^[A-Z0-9]+(?:[_-][A-Z0-9]+)+[}>)]?$|^(.)\1{19,}$|YOUR|EXAMPLE|PLACEHOLDER|HERE\b|REDACTED|\.\.\./;

export const SECRET_PATTERNS = [
  { name: "github-token",
    rx: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
    fp: "a word ending in gh + [pousr]_ followed by 36+ alphanumerics. The \\b and the exact 36-char floor (GitHub's own minted length) make this effectively unreachable by prose, code or a hash." },

  { name: "github-pat-fine-grained",
    rx: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g,
    fp: "the literal string `github_pat_` plus 40+ chars. Docs that mention `github_pat_` by name stop well short of 40." },

  { name: "jwt",
    rx: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    fp: "a base64 blob would have to contain `eyJ`, a dot, `eyJ` again and a third dot-separated run. Dots are not in the base64 alphabet, and BOTH segments must decode-prefix as `{\"` — requiring the second `eyJ` is what keeps this off ordinary base64. This is the pattern that catches VERCEL_OIDC_TOKEN." },

  { name: "openai-key",
    rx: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/g,
    fp: "words where `sk` follows a letter (task-, risk-, disk-, desk-) are excluded by the leading \\b. A segment boundary like `foo-sk-` DOES satisfy \\b, so the real guard is the 20+ UNBROKEN alphanumerics floor: a hyphenated identifier cannot reach it." },

  { name: "anthropic-key",
    rx: /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
    fp: "practically none — `sk-ant-` is unambiguous, which is why this one may include `-` and `_` in the body. ADDED because this is a Claude Code hackathon repo: an Anthropic key is the single most likely credential to be pasted into a Bob session here." },

  { name: "google-api-key",
    rx: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    fp: "a 39-char token starting with the exact literal `AIza`. ADDED because hackathon builds reach for Gemini/Maps free tiers and that key is handed over as a bare string with no env-var ceremony." },

  { name: "npm-token",
    rx: /\bnpm_[A-Za-z0-9]{36}\b/g,
    fp: "`npm_` plus exactly 36 alphanumerics. ADDED because this is a Node repo — `npm publish` / registry auth chatter is plausible in a 48h transcript, and the length is exact so it cannot collide with an npm_-prefixed identifier." },

  { name: "aws-access-key-id",
    rx: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    fp: "a 20-char ALL-UPPERCASE alphanumeric token beginning AKIA/ASIA. Lowercase hex hashes cannot match. ASIA (STS temporary) added alongside AKIA because a temporary key is just as live while it lives." },

  { name: "slack-token",
    rx: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g,
    fp: "the literal `xox` + [baprs] + `-`. No natural-language or code collision known." },

  { name: "private-key-pem",
    rx: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/g,
    fp: "documentation or a test fixture quoting the PEM header. That is a hit worth stopping on anyway — a PEM header in a public transcript is never something you want to find out about later." },

  { name: "bearer-token",
    rx: /\bBearer\s+([A-Za-z0-9._~+/=-]{20,})/gi,
    skip: (m) => PLACEHOLDERISH.test(m[1]),
    fp: "the noisiest one by construction, which is why it is the only pattern with a skip filter. `Authorization: Bearer $VERCEL_TOKEN`, `Bearer <YOUR_TOKEN_HERE>` and `Bearer xxxxxxxx...` are all filtered by PLACEHOLDERISH. A real README example using a realistic-looking fake token WILL trip it — deliberate: we cannot tell that apart from the real thing, and neither can a scraper." },

  { name: "vercel-token-name",
    rx: /\bVERCEL_(?:OIDC_)?TOKEN\b/g,
    fp: "HIGH — this fires on the NAME, not a value, so any sentence discussing the deploy procedure trips it. Kept at explicit request, and it is the first candidate for BOB_SCAN_ALLOW. Allow-listing it is safe: the token's VALUE is a JWT, so the `jwt` pattern still catches the real leak." },
];

// ponytail: deliberate gaps, each with its ceiling.
//  - No generic high-entropy / 40-char-base64 rule (would catch AWS *secret*
//    keys). Ceiling: an AWS secret key alone slips through. Upgrade path: add it
//    only if you are willing to eat false positives on every diff hunk and hash
//    in the export — measured against these exports it is pure noise.
//  - No generic `KEY=value` / `.env`-shaped rule for the same reason: the
//    exports are full of assignments in `_meta.changes[].patch`.
//  - The .png receipt is not scanned. Ceiling: a screenshot showing a token in a
//    terminal gets committed. Upgrade path is OCR; out of scope, eyeball it.

/** Pattern names that hit `text`. Never returns the matched text itself. */
export function scanSecrets(text, allow = (process.env.BOB_SCAN_ALLOW || "").split(",").filter(Boolean)) {
  const hits = [];
  for (const p of SECRET_PATTERNS) {
    if (allow.includes(p.name)) continue;
    p.rx.lastIndex = 0;
    let m, count = 0, first = -1;
    while ((m = p.rx.exec(text))) {
      if (p.skip?.(m)) continue;
      count++;
      if (first < 0) first = m.index;
    }
    if (count) hits.push({ name: p.name, count, offset: first, line: text.slice(0, first).split("\n").length });
  }
  return hits;
}

/** Throws if `text` carries anything credential-shaped. Never prints the match. */
export function assertNoSecrets(text, label) {
  const hits = scanSecrets(text);
  if (!hits.length) return;
  throw new Error(
    `SECRET SCAN FAILED, commit refused: ${label}\n` +
    hits.map((h) => `  ${h.name}  x${h.count}  first at line ${h.line} (byte offset ${h.offset})`).join("\n") +
    `\nThe matched text is deliberately NOT printed. Open the file at that offset yourself.\n` +
    `A hit means the credential is LIVE in your environment. Go revoke it, then re-export.\n` +
    `If you have opened it and confirmed a false positive, re-run with:\n` +
    `  BOB_SCAN_ALLOW=${hits.map((h) => h.name).join(",")}`
  );
}

/** Overwrite staticEnvInfo.systemInfo.{platform,release,arch,shell} wherever they appear. */
function scrubSysInfo(node) {
  if (Array.isArray(node)) return node.forEach(scrubSysInfo);
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node)) {
    if (k === "systemInfo" && v && typeof v === "object") {
      for (const f of Object.keys(SYSINFO)) if (f in v) v[f] = SYSINFO[f];
    } else scrubSysInfo(v);
  }
}

/** Redact one export file in place. Throws if anything survives the pass. */
export function redactFile(file, user = currentUser()) {
  const raw = readFileSync(file, "utf8"); // export is UTF-8; this box's locale is cp1252
  let out = redactText(raw, user);

  if (file.toLowerCase().endsWith(".json")) {
    const obj = JSON.parse(out); // parses => the text pass did not corrupt the JSON
    scrubSysInfo(obj);
    out = JSON.stringify(obj);
  }
  // ponytail: for the .md companion only the username is scrubbed. Ceiling: if Bob
  // ever prints the OS release/shell into the markdown they survive. Upgrade path:
  // add the four SYSINFO literals to the text pass once an .md is seen carrying them.

  if (containsUser(out, user)) throw new Error(`redaction failed, username survives in ${file}`);
  // Secrets THROW rather than being scrubbed: see SECRET_PATTERNS. Checked
  // before the write, so a refused file is left exactly as Bob wrote it.
  assertNoSecrets(out, file);
  if (out !== raw) writeFileSync(file, out, "utf8");
  return { file, changed: out !== raw, bytesBefore: raw.length, bytesAfter: out.length };
}

function expand(args) {
  const files = [];
  for (const a of args) {
    if (statSync(a).isDirectory()) {
      files.push(...globSync("bob-task-*.{json,md}", { cwd: a }).map((f) => path.join(a, f)));
    } else files.push(a);
  }
  return files;
}

// --- the one runnable check -------------------------------------------------
// Copies the real exports to a temp dir, redacts the copies, and asserts the
// product's data survived. Fails loudly if the redactor starts eating payload.
function selftest(sources) {
  const user = currentUser();
  const tmp = mkdtempSync(path.join(os.tmpdir(), "bob-redact-"));
  let files = 0;
  for (const src of sources) {
    const before = JSON.parse(readFileSync(src, "utf8"));
    const dst = path.join(tmp, path.basename(src));
    copyFileSync(src, dst);
    redactFile(dst, user);

    const text = readFileSync(dst, "utf8");
    const hits = (text.match(userRx(user)) || []).length;
    const after = JSON.parse(text); // still parses

    const msgs = (j) => j.tasks.flatMap((t) => t.messages);
    const changes = (j) => msgs(j).flatMap((m) => Object.entries(m.data?._meta?.changes ?? {}));
    const cb = changes(before), ca = changes(after);
    const perms = (j) => msgs(j).map((m) => m.data?.toolUsage?.permission ?? null).join(",");
    const stamps = (j) => msgs(j).map((m) => m.data?._meta?.timestamp ?? null).join(",");
    const cost = (j) => j.tasks.map((t) => t.task.costs?.cost).join(",");

    const ok = (cond, what) => {
      if (!cond) throw new Error(`FAIL ${path.basename(src)}: ${what}`);
    };
    ok(hits === 0, `username still present (${hits})`);
    ok(msgs(after).length === msgs(before).length, "message count changed");
    ok(ca.length === cb.length, `change entries lost (${cb.length} -> ${ca.length})`);
    for (let i = 0; i < cb.length; i++) {
      ok(ca[i][0] === redactText(cb[i][0], user), "change key mangled");
      ok(ca[i][1].before === cb[i][1].before, "change.before altered");
      ok(ca[i][1].after === cb[i][1].after, "change.after altered");
      ok(ca[i][1].patch === redactText(cb[i][1].patch, user), "change.patch altered beyond username");
      ok(/^Index: /m.test(ca[i][1].patch), "patch header destroyed");
    }
    ok(perms(after) === perms(before), "toolUsage.permission altered");
    ok(stamps(after) === stamps(before), "timestamps altered");
    ok(cost(after) === cost(before), "costs altered");
    for (const t of after.tasks) {
      const si = t.task.env?.staticEnvInfo?.systemInfo;
      if (si) ok(Object.keys(SYSINFO).every((f) => si[f] === "redacted"), `systemInfo not scrubbed: ${JSON.stringify(si)}`);
    }
    const raw = readFileSync(src, "utf8");
    console.log(
      `ok ${path.basename(src)}  user-hits ${(raw.match(userRx(user)) || []).length} -> 0  ` +
      `msgs ${msgs(after).length}  changes ${ca.length}  parses yes`
    );
    files++;
  }
  console.log(`\nselftest PASSED on ${files} export(s)  [copies under ${tmp}, sources untouched]`);
}

if (import.meta.filename === process.argv[1]) {
  const args = process.argv.slice(2);
  const test = args[0] === "--selftest";
  const rest = expand(test ? args.slice(1) : args);
  if (!rest.length) {
    console.error("usage: redact.mjs [--selftest] <file|dir>...");
    process.exit(2);
  }
  try {
    if (test) selftest(rest);
    else for (const f of rest) {
      const r = redactFile(f);
      console.log(`${r.changed ? "redacted" : "clean   "} ${r.file}  ${r.bytesBefore} -> ${r.bytesAfter} bytes`);
    }
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
