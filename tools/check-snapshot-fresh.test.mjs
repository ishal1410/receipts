// Proves tools/check-snapshot-fresh.mjs actually bites: constructs each failing
// condition (stale artifact, missing/incomplete provenance, a lying shallow flag,
// a REAL shallow clone via `git clone --depth 1`, a missing file, a corrupt file,
// no git repo at all) in a throwaway fixture and asserts the guard's exit code
// and printed reason. Run with: node --test tools/check-snapshot-fresh.test.mjs tools/secret-scan.test.mjs tools/verify-live.test.mjs
//  (NOT `node --test tools/` — the directory form throws
//   "Cannot find module ...\tools" from the CJS loader on Node 24 on this box, before
//   any test file is read. Verified 2026-09-24. Name the files explicitly.)
//
// ponytail: stdlib only (node:test, node:assert, node:fs, node:child_process,
// node:os, node:path, node:crypto). No frameworks, no fixtures library.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const GUARD_SRC = path.join(process.cwd(), 'tools', 'check-snapshot-fresh.mjs');
const REDACT_SRC = path.join(process.cwd(), 'tools', 'redact.mjs');
const PAST = new Date(Date.now() - 60_000); // 60s ago
const FUTURE = new Date(Date.now() + 60_000); // 60s from now

function mkFixture() {
  const dir = path.join(os.tmpdir(), `csf-test-${randomUUID()}`);
  for (const d of ['tools', 'src', 'bob_sessions', 'public']) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  fs.copyFileSync(GUARD_SRC, path.join(dir, 'tools', 'check-snapshot-fresh.mjs'));
  // The guard imports ./redact.mjs for its credential scan (Check 6), so the
  // fixture needs it as a sibling or every run dies at module resolution with
  // ERR_MODULE_NOT_FOUND before a single check executes.
  fs.copyFileSync(REDACT_SRC, path.join(dir, 'tools', 'redact.mjs'));
  fs.writeFileSync(path.join(dir, 'src', 'App.tsx'), '// placeholder\n');
  fs.writeFileSync(path.join(dir, 'bob_sessions', 'bob-task-1.json'), '{}');
  return dir;
}

function backdateSources(dir, when = PAST) {
  for (const d of ['tools', 'src', 'bob_sessions']) {
    const full = path.join(dir, d);
    for (const entry of fs.readdirSync(full)) {
      const p = path.join(full, entry);
      fs.utimesSync(p, when, when);
    }
  }
}

function writeAnalysis(dir, obj, when) {
  const p = path.join(dir, 'public', 'analysis.json');
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  if (when) fs.utimesSync(p, when, when);
}

function git(dir, args) {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function initRealRepo(dir, commits = 2) {
  git(dir, ['init', '-q']);
  git(dir, ['config', 'user.email', 'test@test.com']);
  git(dir, ['config', 'user.name', 'Test']);
  for (let i = 0; i < commits; i++) {
    fs.writeFileSync(path.join(dir, `f${i}.txt`), String(i));
    git(dir, ['add', '.']);
    git(dir, ['commit', '-q', '-m', `commit ${i}`]);
  }
  const headSha = git(dir, ['rev-parse', 'HEAD']).trim();
  const commitCount = Number(git(dir, ['rev-list', '--count', 'HEAD']).trim());
  return { headSha, commitCount };
}

function runGuard(dir, env) {
  return spawnSync(process.execPath, [path.join(dir, 'tools', 'check-snapshot-fresh.mjs')], {
    cwd: dir,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
  });
}

// Assembled from fragments rather than written as one literal so this test file
// never itself contains a 40-char token-shaped string for another scanner to hit.
// Shape only: ghp_ + 36 alphanumerics, which is what redact.mjs's github-token
// pattern matches. Not a real credential and never was.
const FAKE_TOKEN = 'ghp_' + 'q7Ht' + 'Zx2Lm9Vb' + 'Kd4Rw8Yn' + 'Ts6Cp1Gj' + 'Fa3Ue5Ob';

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

test('passes when analysis.json is fresh, complete, and from full history', () => {
  const dir = mkFixture();
  try {
    const { headSha, commitCount } = initRealRepo(dir, 3);
    backdateSources(dir);
    writeAnalysis(dir, { _generatedIn: { headSha, commitCount, isShallowRepo: false } });
    const r = runGuard(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^OK:/);
  } finally {
    cleanup(dir);
  }
});

test('fails when public/analysis.json is missing', () => {
  const dir = mkFixture();
  try {
    const r = runGuard(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /missing-analysis-json/);
    assert.match(r.stderr, /npm run snapshot/);
  } finally {
    cleanup(dir);
  }
});

test('fails when public/analysis.json is corrupt JSON', () => {
  const dir = mkFixture();
  try {
    fs.writeFileSync(path.join(dir, 'public', 'analysis.json'), '{ not valid json');
    const r = runGuard(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /corrupt-analysis-json/);
  } finally {
    cleanup(dir);
  }
});

test('fails when a source file is newer than analysis.json (stale)', () => {
  const dir = mkFixture();
  try {
    const { headSha, commitCount } = initRealRepo(dir, 2);
    backdateSources(dir);
    writeAnalysis(dir, { _generatedIn: { headSha, commitCount, isShallowRepo: false } }, PAST);
    // Edit a source file AFTER the snapshot was generated.
    fs.utimesSync(path.join(dir, 'src', 'App.tsx'), FUTURE, FUTURE);
    const r = runGuard(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /stale-analysis-json/);
  } finally {
    cleanup(dir);
  }
});

test('fails when _generatedIn is missing (unknown provenance is untrusted)', () => {
  const dir = mkFixture();
  try {
    initRealRepo(dir, 2);
    backdateSources(dir);
    writeAnalysis(dir, { totals: {} }); // no _generatedIn at all
    const r = runGuard(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /missing-provenance/);
  } finally {
    cleanup(dir);
  }
});

test('fails when _generatedIn.isShallowRepo is true', () => {
  const dir = mkFixture();
  try {
    const { headSha, commitCount } = initRealRepo(dir, 3);
    backdateSources(dir);
    writeAnalysis(dir, { _generatedIn: { headSha, commitCount, isShallowRepo: true } });
    const r = runGuard(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /generated-in-shallow-clone/);
  } finally {
    cleanup(dir);
  }
});

test('fails when commitCount <= 1 even if isShallowRepo says false (lying-flag defense)', () => {
  const dir = mkFixture();
  try {
    const { headSha } = initRealRepo(dir, 3);
    backdateSources(dir);
    writeAnalysis(dir, { _generatedIn: { headSha, commitCount: 1, isShallowRepo: false } });
    const r = runGuard(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /suspiciously-shallow-history/);
  } finally {
    cleanup(dir);
  }
});

test('fails when the local repo running the guard is a REAL shallow clone', () => {
  const source = mkFixture();
  let shallow;
  try {
    const { headSha, commitCount } = initRealRepo(source, 3);
    backdateSources(source);
    writeAnalysis(source, { _generatedIn: { headSha, commitCount, isShallowRepo: false } });
    git(source, ['add', '.']);
    git(source, ['commit', '-q', '-m', 'snapshot']);

    shallow = path.join(os.tmpdir(), `csf-shallow-${randomUUID()}`);
    // --no-local: plain local-path clones silently IGNORE --depth ("--depth is
    // ignored in local clones"), which would make this fixture not actually
    // shallow. --no-local forces git through the transport that honors it.
    git(os.tmpdir(), ['clone', '--depth', '1', '--no-local', source, shallow]);

    const r = runGuard(shallow);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /local-repo-is-shallow/);
  } finally {
    cleanup(source);
    if (shallow) cleanup(shallow);
  }
});

test('fails (does not fail open) when there is no git repo at all', () => {
  const dir = mkFixture();
  try {
    backdateSources(dir);
    // Valid-looking provenance, but no .git directory anywhere above this fixture
    // to check it against — the guard must still refuse to pass.
    writeAnalysis(dir, { _generatedIn: { headSha: 'deadbeef', commitCount: 5, isShallowRepo: false } });
    const r = runGuard(dir);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /git-unavailable/);
  } finally {
    cleanup(dir);
  }
});

// --- Check 6: the file is committed to a public repo, so it gets scanned. ------

test('fails when a credential-shaped string reaches analysis.json, without printing it', () => {
  const dir = mkFixture();
  try {
    const { headSha, commitCount } = initRealRepo(dir, 3);
    backdateSources(dir);
    // Otherwise entirely valid: fresh, full history, complete provenance. The ONLY
    // defect is a token sitting in a task title, which is exactly how this leaks —
    // Bob exports carry whatever was on screen.
    writeAnalysis(dir, {
      _generatedIn: { headSha, commitCount, isShallowRepo: false },
      tasks: [{ id: 'a1', title: `deploy with ${FAKE_TOKEN}` }],
    });
    const r = runGuard(dir);
    assert.notEqual(r.status, 0, 'a token in analysis.json passed the guard');
    assert.match(r.stderr, /secret-in-analysis-json/);
    assert.match(r.stderr, /github-token/);
    // The whole point of reporting by offset: the guard must never echo the match
    // into a terminal, a CI log or this test's output.
    assert.ok(!r.stderr.includes(FAKE_TOKEN), 'the guard printed the matched credential');
    assert.ok(!r.stdout.includes(FAKE_TOKEN), 'the guard printed the matched credential to stdout');
  } finally {
    cleanup(dir);
  }
});

test('fails when the Windows username survives into analysis.json', () => {
  const dir = mkFixture();
  try {
    const { headSha, commitCount } = initRealRepo(dir, 3);
    backdateSources(dir);
    writeAnalysis(dir, {
      _generatedIn: { headSha, commitCount, isShallowRepo: false },
      tasks: [{ id: 'a1', wroteFiles: ['c:\\Users\\synthuser\\demo\\a.py'] }],
    });
    const r = runGuard(dir, { BOB_REDACT_USER: 'synthuser' });
    assert.notEqual(r.status, 0, 'an unredacted absolute path passed the guard');
    assert.match(r.stderr, /username-in-analysis-json/);
  } finally {
    cleanup(dir);
  }
});

test('does NOT fire on the benign content analysis.json legitimately carries', () => {
  const dir = mkFixture();
  try {
    const { headSha, commitCount } = initRealRepo(dir, 3);
    backdateSources(dir);
    // Long hex SHAs, code, a diff fragment and base64-ish blobs are all normal here.
    // A guard on the critical path at hour 40 that cries wolf gets switched off.
    writeAnalysis(dir, {
      _generatedIn: { headSha, commitCount, isShallowRepo: false },
      repo: { head: 'a'.repeat(40), headShort: 'aaaaaaa' },
      tasks: [{
        id: 'a1',
        title: 'refactor the survival join',
        commit: { sha: 'b3f1c2d4e5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0' },
        fileBreakdown: [{ file: 'tools/lib.mjs', authored: 40, survived: 38 }],
        patch: '@@ -1,3 +1,4 @@\n-const token = read();\n+const t = read();\n',
      }],
    });
    const r = runGuard(dir, { BOB_REDACT_USER: 'synthuser' });
    assert.equal(r.status, 0, `false positive on benign content:\n${r.stderr}`);
  } finally {
    cleanup(dir);
  }
});
