// node --test plans/_chk.test.mjs
//
// PORTABLE BY CONSTRUCTION. Nothing here reads a path outside the repo, so this
// suite passes on a fresh clone on any machine.
//
// The regression corpus is the four REAL Bob exports in tools/fixtures/repo-{a,b}/
// (checked in, run through tools/redact.mjs, zero username hits). The git side of
// the join cannot be checked in - a .git directory carries the author's name and
// email - so tools/fixtures/history.json records the real commit contents,
// messages and committer timestamps, and buildRepo() replays them into a temp
// directory. Same bytes, same times, same diffs; only the shas differ per run,
// which is why the tests resolve a sha by commit message instead of hardcoding it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as chk from './lib.mjs';

const {
  normalisePath, loadSessions, writtenFiles, classifyTools,
  commitLog, commitForTask, attributeTask, assertUniqueCommits, survivingLines,
  taskSurvival,
} = chk;

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const HISTORY = JSON.parse(readFileSync(path.join(FIXTURES, 'history.json'), 'utf8'));

// The workspace string as the redacted exports actually spell it. It is compared
// as a STRING PREFIX against the _meta.changes keys - it is never opened - so the
// replayed repo living somewhere else on disk is irrelevant to the join.
const WS = 'file:c:\\Users\\USER\\bobtest';

const trash = [];
process.on('exit', () => { for (const d of trash) rmSync(d, { recursive: true, force: true }); });

/** Replay one fixture history into a fresh temp repo. Returns { dir, sha(message) }. */
function buildRepo(name) {
  const dir = mkdtempSync(path.join(tmpdir(), `chk-${name}-`));
  trash.push(dir);
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'fixture@example.invalid');
  g('config', 'user.name', 'fixture');
  g('config', 'core.autocrlf', 'false'); // else every line differs from the export
  for (const c of HISTORY[name]) {
    for (const [f, body] of Object.entries(c.files)) {
      mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
      writeFileSync(path.join(dir, f), body);
    }
    g('add', '-A');
    // Committer time is what commitLog() reads and what the join compares against
    // task.updatedAt, so it has to be the real one, not "now".
    const iso = new Date(c.ts * 1000).toISOString();
    execFileSync('git', ['commit', '-qm', c.message], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso },
    });
  }
  const sha = (message) => {
    const out = g('log', '--format=%H %s', 'HEAD').split('\n')
      .find((l) => l.slice(41) === message);
    assert.ok(out, `fixture history has no commit "${message}"`);
    return out.slice(0, 40);
  };
  return { dir, sha };
}

const A = buildRepo('repo-a');
const B = buildRepo('repo-b');
const SESSIONS_A = path.join(FIXTURES, 'repo-a');
const SESSIONS_B = path.join(FIXTURES, 'repo-b');

const byId = (dir) => Object.fromEntries(loadSessions(dir).map((e) => [e.task.id.slice(0, 8), e]));

// ---------------------------------------------------------------- BUG 2
test('normalisePath decodes a real _meta.changes key to a repo-relative path', () => {
  assert.equal(normalisePath('calc.py', WS), 'calc.py');
  assert.equal(normalisePath('c:\\Users\\USER\\bobtest\\calc.py', WS), 'calc.py');
  // The form Bob actually emits as a _meta.changes key: file:/// + percent-encoded
  // drive colon + forward slashes + lowercase drive letter.
  assert.equal(normalisePath('file:///c%3A/Users/USER/bobtest/calc.py', WS), 'calc.py');
});

test('writtenFiles collects every _meta.changes entry, one per message', () => {
  const e = byId(SESSIONS_B).ef4ccef5;
  // Two apply_diff results in two separate messages, one file key each.
  assert.deepEqual(writtenFiles(e, e._workspace), ['a.py', 'b.py']);

  // Bob emits ONE _meta.changes entry per edit-tool result, each with exactly one
  // key; multiplicity lives ACROSS messages. Reading only the last one loses edits.
  const changesOnly = {
    task: { id: 'y', updatedAt: 1 },
    messages: [
      { data: { _meta: { changes: { 'file:///c%3A/Users/USER/bobtest/calc.py': {} } } } },
      { data: { _meta: { changes: { 'file:///c%3A/Users/USER/bobtest/sub/other.py': {} } } } },
    ],
  };
  assert.deepEqual(writtenFiles(changesOnly, WS), ['calc.py', 'sub/other.py']);
});

test('write detection is permission-driven, not a hardcoded tool-name list', () => {
  const e = byId(SESSIONS_B).ef4ccef5;
  const { writes, unknownTools } = classifyTools(e, e._workspace);
  // glob and FindSymbol are permission:"read" with arguments.path === undefined.
  assert.deepEqual(writes.map((w) => w.path).sort(), ['a.py', 'b.py']);
  assert.deepEqual(unknownTools, []);
});

test('a tool whose write status cannot be decided is counted, not dropped', () => {
  const entry = {
    task: { id: 'x', updatedAt: 1 },
    messages: [
      { data: { toolUsage: { signature: { name: 'mystery_writer', arguments: {} }, permission: 'edit' } } },
      { data: { toolUsage: { signature: { name: 'future_tool', arguments: { path: 'z.py' } }, permission: 'sudo' } } },
    ],
  };
  const { writes, unknownTools } = classifyTools(entry, null);
  assert.deepEqual(writes, []);
  assert.deepEqual(unknownTools.map((u) => u.name).sort(), ['future_tool', 'mystery_writer']);
});

// ---------------------------------------------------------------- BUG 1
test('commitForTask refuses a commit that contains none of the lines Bob wrote', () => {
  const commits = commitLog(A.dir);
  const e = byId(SESSIONS_A).da0e0ddc;
  // Bob added a divide-by-zero guard that was never committed. The next commit in
  // time is "C: human rewrites Bob's docstring". Crediting it is the bug.
  const c = commitForTask(commits, e.task.updatedAt, {
    repo: A.dir, entry: e, windowMs: Infinity,
  });
  assert.equal(c, null);
});

test('commitForTask still credits the commit that does carry Bob lines', () => {
  const commits = commitLog(A.dir);
  const e = byId(SESSIONS_A).d0259633;
  const c = commitForTask(commits, e.task.updatedAt, { repo: A.dir, entry: e });
  assert.equal(c.sha, A.sha('B: docstring on add (by Bob)'));
});

test('commitForTask honours an upper time bound', () => {
  const commits = commitLog(A.dir);
  const e = byId(SESSIONS_A).d0259633; // its commit lands 198s later
  assert.equal(commitForTask(commits, e.task.updatedAt,
    { repo: A.dir, entry: e, windowMs: 10_000 }), null);
});

test('a task with no joined commit reaches an unattributed bucket, never vanishes', () => {
  const rows = [
    ...loadSessions(SESSIONS_A).map((e) => attributeTask(A.dir, e)),
    ...loadSessions(SESSIONS_B).map((e) => attributeTask(B.dir, e)),
  ];
  assert.equal(rows.length, 4, 'all four tasks must survive the pipeline');
  const got = Object.fromEntries(rows.map((r) => [r.id.slice(0, 8), {
    files: r.wroteFiles, sha: r.commit?.short ?? null, pct: r.survivalPct, why: r.unattributed,
  }]));
  assert.deepEqual(got, {
    '1f84e13c': { files: [], sha: null, pct: null, why: 'no-files-written' },
    'd0259633': {
      files: ['calc.py'],
      sha: A.sha('B: docstring on add (by Bob)').slice(0, 7),
      pct: 0,
      why: null,
    },
    'da0e0ddc': { files: ['calc.py'], sha: null, pct: null, why: 'no-matching-commit' },
    'ef4ccef5': { files: ['a.py', 'b.py'], sha: null, pct: null, why: 'no-matching-commit' },
  });
});

test('two tasks claiming one commit is a hard failure, and the sha is printed', () => {
  const dup = [
    { id: 'aaa', commit: { sha: 'deadbeef' } },
    { id: 'bbb', commit: { sha: 'deadbeef' } },
  ];
  assert.throws(() => assertUniqueCommits(dup), /deadbeef[\s\S]*aaa[\s\S]*bbb|aaa[\s\S]*bbb/);
  assert.doesNotThrow(() => assertUniqueCommits([dup[0]]));
});

test('a brace is not evidence of authorship', () => {
  // The real corpus is Python, so it never exercises this: in a TS/TSX repo "}" is the
  // most-added line, and matching on it lets any human commit that touches the same
  // file be credited to Bob - collapsing the authorship half of the join. Synthetic,
  // because no export on disk has a brace-only edit.
  const entry = {
    _workspace: 'file:c:\\repo',
    task: { id: 'brace', workspace: 'file:c:\\repo', updatedAt: 1 },
    messages: [{
      data: {
        toolUsage: { permission: 'edit', isError: false,
          signature: { name: 'apply_diff', id: 't1', arguments: { path: 'a.ts' } } },
        _meta: { changes: { 'file:///c%3A/repo/a.ts': {
          before: 'const x = 1;\n',
          // Bob's only NEW lines here are a brace and a short paren - no real content.
          after: 'const x = 1;\nif (x) {\n}\n);\n',
        } } },
      },
    }],
  };
  const bob = chk.bobAddedLines(entry, 'file:c:\\repo');
  const lines = [...(bob.get('a.ts') ?? [])];
  assert.ok(!lines.includes('}'), 'a bare } must not count as a Bob-authored line');
  assert.ok(!lines.includes(');'), 'a bare ); must not count as a Bob-authored line');
  assert.deepEqual(lines, ['if (x) {'], 'only the >=4-char line survives as evidence');
});

// ---------------------------------------------------------------- git blame flags
test('a whitespace-only reformat does not erase the authoring commit', () => {
  const repo = mkdtempSync(path.join(tmpdir(), 'chk-blame-'));
  const g = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' });
  try {
    g('init', '-q', '-b', 'main');
    g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
    g('config', 'core.autocrlf', 'false');
    writeFileSync(path.join(repo, 'f.py'), 'def a():\n  return 1\n\ndef b():\n  return 2\n');
    g('add', '-A'); g('commit', '-qm', 'bob writes f.py');
    const sha = g('rev-parse', 'HEAD').trim();
    // A formatter run: same lines, 4-space indent.
    writeFileSync(path.join(repo, 'f.py'), 'def a():\n    return 1\n\ndef b():\n    return 2\n');
    g('add', '-A'); g('commit', '-qm', 'black .');
    assert.equal(survivingLines(repo, sha, 'f.py'), 5,
      'without `git blame -w` a reformat collapses every task to ~0% survival');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

// ------------------------------------------------- task-level vs commit-level
test('survival counts the lines THIS TASK wrote, not every line its commit added', () => {
  // The regression this guards, and it inverts rather than merely inflating:
  // taskSurvival() used to take its denominator from addedLines(repo, sha) - every
  // line the commit added - while README-DRAFT, the long description and
  // USAGE-STATEMENT all promise "the lines that task wrote". On a commit holding
  // 1 Bob line plus 9 human lines, a task whose contribution was FULLY REVERTED
  // reported ~90% survived. No test covered a mixed-authorship commit, which is
  // exactly how it shipped. bobLines comes back from commitForTask now.
  const repo = mkdtempSync(path.join(tmpdir(), 'mixed-'));
  trash.push(repo);
  const g = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  g('config', 'core.autocrlf', 'false');

  const BOB = 'def bob_helper(): return 42';
  const HUMAN = Array.from({ length: 9 }, (_, i) => `def human_${i}(): return ${i}`);

  // One commit, mixed authorship: Bob's single line plus nine of the human's.
  writeFileSync(path.join(repo, 'm.py'), [BOB, ...HUMAN].join('\n') + '\n');
  g('add', '-A'); g('commit', '-qm', 'mixed authorship');
  const sha = g('rev-parse', 'HEAD').trim();

  // Revert ONLY Bob's line. All nine human lines stay at HEAD.
  writeFileSync(path.join(repo, 'm.py'), HUMAN.join('\n') + '\n');
  g('add', '-A'); g('commit', '-qm', 'revert bob only');

  const entry = {
    _workspace: repo,
    task: { workspace: repo },
    messages: [{ data: { _meta: { changes: {
      [`file:///${repo.replace(/\\/g, '/')}/m.py`]: { before: '', after: BOB + '\n' },
    } } } }],
  };

  const commits = commitLog(repo);
  const picked = commitForTask(commits, commits[0].timeMs, { repo, entry });
  assert.ok(picked, 'the mixed commit contains a Bob line, so it must attribute');
  assert.ok(picked.bobLines?.size, 'commitForTask must hand back the authored line set');

  const commitLevel = taskSurvival(repo, sha, ['m.py']);
  const taskLevel = taskSurvival(repo, sha, ['m.py'], picked.bobLines);

  // Ground truth: Bob wrote 1 line, 0 of it survives -> 0%.
  assert.equal(taskLevel.authored, 1, "denominator must be Bob's lines, not the commit's");
  assert.equal(taskLevel.survived, 0);
  assert.equal(taskLevel.pct, 0);
  assert.equal(taskLevel.level, 'task');

  // And the old path really did report the opposite, which is why this test exists.
  assert.ok(commitLevel.pct > 0.5,
    'commit-level math inflates a fully-reverted task above 50% - the defect being guarded');
});

// ---------------------------------------------------------------- portability
test('no machine-specific absolute path survives in the shipped join code', () => {
  // The regression this guards: the corpus used to be read from two absolute paths
  // with the author's username in them. They existed on one laptop, so the suite
  // was green here and 6 of 11 ENOENT'd in a clean clone - which is worse than a
  // broken feature, because the README quoted the green number.
  const machinePath = /[A-Za-z](?::|%3A)[\\/]+Users[\\/]+(?!USER\b)[A-Za-z0-9._-]+/i;
  const hits = [];
  for (const f of ['lib.mjs', 'lib.test.mjs']) {
    readFileSync(path.join(HERE, f), 'utf8').split('\n').forEach((line, i) => {
      if (machinePath.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, []);
});
