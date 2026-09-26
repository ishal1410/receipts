// Proves the secret scan in tools/redact.mjs bites on a synthetic positive for
// EVERY pattern, stays silent on realistic Bob-export content (source code, a
// unified diff, long hashes, a base64 blob, docs placeholders), and that neither
// redactFile nor ritual can let a hit through to git.
//
// Run with:  node --test tools/secret-scan.test.mjs     (or: node --test tools/)
//
// ponytail: stdlib only (node:test, node:assert, node:fs, node:os, node:path).
// No frameworks, no fixture library.
//
// SAFETY: every "secret" below is filler the author typed. Nothing here is real,
// and the scan's own error text never echoes what it matched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { SECRET_PATTERNS, scanSecrets, assertNoSecrets, redactFile } from './redact.mjs';
import { ritual } from './ritual.mjs';

const names = (text, allow = []) => scanSecrets(text, allow).map((h) => h.name).sort();

/** assert.throws does not hand back the error; we need to inspect the message. */
function caught(fn) {
  try { fn(); } catch (e) { return e; }
  assert.fail('expected a throw, got none');
}

// --- synthetic positives, one per pattern -----------------------------------
// Obvious filler: repeated digits / sequential letters, never a real shape.
const POSITIVES = {
  'github-token': 'ghp_' + '0'.repeat(36),
  'github-pat-fine-grained': 'github_pat_' + '1'.repeat(40),
  jwt: 'eyJhbGciOiJub25lIn0.eyJmYWtlIjp0cnVlfQ.' + '0'.repeat(12),
  'openai-key': 'sk-' + '2'.repeat(24),
  'anthropic-key': 'sk-ant-api03-' + '3'.repeat(24),
  'google-api-key': 'AIza' + '4'.repeat(35),
  'npm-token': 'npm_' + '5'.repeat(36),
  'aws-access-key-id': 'AKIA' + 'ABCDEFGHIJKLMNOP',
  'slack-token': 'xoxb-0000000000-0000000000-abcdefghijkl',
  'private-key-pem': '-----BEGIN RSA PRIVATE KEY-----',
  'bearer-token': 'Authorization: Bearer aBcD3fGh1jKlMn0pQrStUvWx',
  'vercel-token-name': 'export VERCEL_OIDC_TOKEN=(unset)',
};

test('every declared pattern has a synthetic positive in this file', () => {
  assert.deepEqual(SECRET_PATTERNS.map((p) => p.name).sort(), Object.keys(POSITIVES).sort());
});

test('every declared pattern documents its false-positive surface', () => {
  for (const p of SECRET_PATTERNS) {
    assert.ok(p.fp && p.fp.length > 40, `${p.name} has no meaningful fp: note`);
  }
});

for (const [name, sample] of Object.entries(POSITIVES)) {
  test(`fires: ${name}`, () => {
    // embedded in ordinary prose, the way a transcript would carry it
    const hits = names(`the agent then ran ${sample} and the deploy went through`);
    assert.ok(hits.includes(name), `${name} did not fire (hits: ${hits.join(',') || 'none'})`);
  });
}

// --- realistic negatives ----------------------------------------------------
// Each of these is content a real 48h Bob export is FULL of.

const REAL_CODE = `
import { useCallback, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const GITHUB_API = "https://api.github.com/repos/ishal1410/receipts/commits";
const TASK_KINDS = ["task-management", "risk-assessment", "disk-usage-report"];

export function useReceipts({ pageSize = 50 } = {}) {
  const [rows, setRows] = useState([]);
  const key = useMemo(() => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, []);
  const load = useCallback(async () => {
    const res = await fetch(\`\${GITHUB_API}?per_page=\${pageSize}\`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error("github: " + res.status);
    setRows(await res.json());
  }, [pageSize]);
  return { rows, load, key, TASK_KINDS };
}
`;

const REAL_DIFF = `Index: file:///c%3A/Users/USER/hackathon-bob/src/lib/attribution.ts
===================================================================
--- src/lib/attribution.ts
+++ src/lib/attribution.ts
@@ -12,9 +12,17 @@ export type Attribution = {
-  const survived = lines.filter((l) => l.origin === "bob").length;
-  return survived / lines.length;
+  const survived = lines.filter((l) => l.origin === "bob" && !l.rewritten).length;
+  const total = lines.length || 1;
+  // ponytail: ratio only, no weighting by line length
+  return survived / total;
 }
@@ -40,6 +48,7 @@ export function summarize(files: FileAttribution[]) {
-  return { files, ratio: ratioOf(files) };
+  return { files, ratio: ratioOf(files), generatedAt: Date.now() };
`;

const LONG_HASHES = `
head 9f8e7d6c5b4a39281706f5e4d3c2b1a098765432
tree a3c1f0e9d8b7a6958473625140f3e2d1c0b9a8f7e6d5c4b3a2918071625344f5
sha256-6dcd4ce23d88e2ee9568ba546c007c63d9131c1b3d6b5c8f9a0e1d2c3b4a5968
integrity: sha512-9f2a1c0b8e7d6c5a4938271605f4e3d2c1b0a9f8e7d6c5b4a39281706f5e4d3c
bob-task-1f84e13cb3298627e05d9f9b496c19ac-2026-09-22.json
`;

// a PNG data URI fragment — contains "eyJ" on purpose, and base64 padding
const BASE64_BLOB =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAeyJAAAB9CAYAAAD' +
  'nQm5eyJxMAAAACXBIWXMAAAsTAAALEwEAmpwYAAAKT2lDQ1BQaG90b3Nob3AgSUND' +
  'IHByb2ZpbGUAAHjanVNnVFPpFj333vRCS4iAlEtvUhUIIFJCi4AUkSYqIQkQSggh' +
  'oNiQQQUcUUREsCGDIjhwdARkrKhiYVBAsQ/IIKKOg6OIisr74Xuja9a89+bN/rXX' +
  'Pues852zzwfACAyWSDNRNYAMqUIeEeCDx8TG4eQuQIEKJHAAEAizZCFz/SMBAPh+' +
  'PDwrIsAHvgABeNMLCADATZvAMByH/w/qQplcAYCEAcB0kThLCIAUAEB6jkKmAEBG' +
  'AYBdmCZTAKAEAGDLY2LjAFAtAGAnf+bTAICd+Jl7AQBblCEVAaCRACATZYhEAGg7' +
  'AKzPVopFAFgwABRmS8Q5ANgtADBJV2ZIALC3ACA7QyzIAiAwAMBEIRZmABDsAYAh' +
  'jwzxAyCYCUCRHfsCnr/gCnmJAgAAeJi0TC5JTlHgVkJr3MHVlYsHinPSxQoFI0wg' +
  'TBPKRbhfZoZMIM0DmJ9zDgAAeNsRAAAKm/XNAgD9mrb9q52t7RynOwCYVbf5/AcA' +
  '9I7fanPuY6XP2M4AAAAASUVORK5CYII=';

const DOCS_PLACEHOLDERS = `
## Deploying

    curl -H "Authorization: Bearer <YOUR_PERSONAL_ACCESS_TOKEN_HERE>" https://api.example.com/v1/deploy
    curl -H "Authorization: Bearer $API_TOKEN_FOR_STAGING" https://api.example.com/v1/deploy
    curl -H "Authorization: Bearer xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" https://api.example.com/v1/deploy
    curl -H "Authorization: Bearer REDACTED-BY-THE-EXPORT-RITUAL-0000" https://api.example.com/v1/deploy

Store the value in \`.env.local\`; never paste it into a session. The
github_pat_ prefix identifies a fine-grained PAT; classic ones start ghp_.
`;

const NEGATIVES = {
  'real source code': REAL_CODE,
  'unified diff from _meta.changes': REAL_DIFF,
  'long hex hashes and integrity strings': LONG_HASHES,
  'base64 image blob containing eyJ': BASE64_BLOB,
  'docs with bearer placeholders and bare prefixes': DOCS_PLACEHOLDERS,
};

for (const [what, text] of Object.entries(NEGATIVES)) {
  test(`silent on: ${what}`, () => {
    assert.deepEqual(names(text), [], `false positive on ${what}`);
  });
}

test('silent on all realistic negatives concatenated (no cross-boundary hits)', () => {
  assert.deepEqual(names(Object.values(NEGATIVES).join('\n')), []);
});

// --- reporting is safe and actionable ---------------------------------------

test('the error names the pattern and a location but never the matched text', () => {
  const secret = POSITIVES['github-token'];
  const err = caught(() => assertNoSecrets(`line one\nline two ${secret}\n`, 'fixture.json'));
  assert.match(err.message, /SECRET SCAN FAILED/);
  assert.match(err.message, /github-token/);
  assert.match(err.message, /first at line 2/);
  assert.ok(!err.message.includes(secret), 'error message leaked the matched text');
  assert.ok(!err.message.includes('0'.repeat(12)), 'error message leaked part of the match');
  assert.match(err.message, /BOB_SCAN_ALLOW=github-token/);
});

test('BOB_SCAN_ALLOW suppresses a named pattern and nothing else', () => {
  const text = `${POSITIVES['vercel-token-name']}=${POSITIVES.jwt}`;
  assert.deepEqual(names(text), ['jwt', 'vercel-token-name']);
  // allow-listing the NAME rule still leaves the VALUE rule in place: that is
  // why vercel-token-name is safe to suppress when it fires on prose.
  assert.deepEqual(names(text, ['vercel-token-name']), ['jwt']);
});

// --- wiring: nothing with a hit can reach disk or git -----------------------

const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'secret-scan-'));

test('redactFile throws and leaves the file byte-identical', () => {
  const dir = tmpdir();
  const f = path.join(dir, 'bob-task-fixture.json');
  const body = JSON.stringify({ tasks: [{ messages: [{ content: `key is ${POSITIVES['openai-key']}` }] }] });
  fs.writeFileSync(f, body, 'utf8');
  const err = caught(() => redactFile(f, 'someuser'));
  assert.match(err.message, /SECRET SCAN FAILED/);
  assert.equal(fs.readFileSync(f, 'utf8'), body, 'redactFile wrote a file it refused');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ritual refuses before it ever calls git', () => {
  const dir = tmpdir(); // deliberately NOT a git repo
  const stem = 'bob-task-fixture-2026-09-25';
  fs.writeFileSync(path.join(dir, stem + '.json'), JSON.stringify({ tasks: [] }), 'utf8');
  fs.writeFileSync(path.join(dir, stem + '.md'), `ran:\n\n    ${POSITIVES['bearer-token']}\n`, 'utf8');
  fs.writeFileSync(path.join(dir, stem + '.png'), '\x89PNG\r\n');

  // commit:true — if the scan did not stop it, execFileSync("git", ...) would
  // run here and fail with a git error instead. A scan error proves git was
  // never reached.
  const err = caught(() => ritual(dir, { commit: true, log: () => {}, team: 'receipts', slug: 'fixture' }));
  assert.match(err.message, /SECRET SCAN FAILED/);
  assert.match(err.message, /bearer-token/);
  assert.ok(!/git/i.test(err.message), `ritual reached git: ${err.message}`);
  const filed = fs.existsSync(path.join(dir, 'bob_sessions'))
    ? fs.readdirSync(path.join(dir, 'bob_sessions')) : [];
  assert.deepEqual(filed, [], `moved the trio anyway: ${filed.join(' ')}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a clean trio still passes ritual end to end', () => {
  const dir = tmpdir();
  const stem = 'bob-task-clean-2026-09-25';
  fs.writeFileSync(path.join(dir, stem + '.json'),
    JSON.stringify({ tasks: [{ messages: [{ content: REAL_CODE + REAL_DIFF + LONG_HASHES }] }] }), 'utf8');
  fs.writeFileSync(path.join(dir, stem + '.md'), DOCS_PLACEHOLDERS, 'utf8');
  fs.writeFileSync(path.join(dir, stem + '.png'), '\x89PNG\r\n');
  const r = ritual(dir, { commit: false, log: () => {}, team: 'receipts', slug: 'clean_run' });
  // filed = all three moved into bob_sessions/. staged = what git is told about,
  // which excludes the .png: pixels are unscannable and a public commit cannot be
  // undone, so the screenshot waits for a human to look. See ritual.mjs's header.
  assert.equal(r.filed.length, 3);
  assert.equal(r.staged.length, 2);
  assert.equal(r.committed, false);
  assert.ok(r.filed.includes('bob_sessions/receipts_task01_clean_run_summary.png'),
    `screenshot not filed under the organiser name: ${r.filed.join(' ')}`);
  assert.ok(!r.staged.includes('bob_sessions/receipts_task01_clean_run_summary.png'),
    'the .png was staged without review');
  assert.deepEqual(r.pendingPng, ['bob_sessions/receipts_task01_clean_run_summary.png']);
  fs.rmSync(dir, { recursive: true, force: true });
});
