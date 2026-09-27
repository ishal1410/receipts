// node --test plans/_chk.test.mjs
//
// PORTABLE BY CONSTRUCTION. Nothing here reads a path outside the repo, so this
// suite passes on a fresh clone on any machine.
//
// The regression corpus is the four REAL Bob exports in tools/fixtures/repo-{a,b}/
// (checked in, run through tools/redact.mjs, zero username hits). The git side of
// the join cannot be checked in - a .git directory carries the author's name and
// email - so tools/fixtures/history.json records the real commit contents,
// messages and committer timestamps, and buildRepo() (tools/replay.mjs) replays them
// into a temp directory. Same bytes, same times, same diffs; only the shas differ per
// run, which is why the tests resolve a sha by commit message instead of hardcoding
// it - and why `node tools/replay.mjs` compares verdicts rather than hashes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as chk from './lib.mjs';
// ONE reconstruction mechanism, shared with the judge-facing `node tools/replay.mjs`:
// if this suite replayed the fixture history its own way, the two could drift and a
// green suite would stop being evidence that the replay works.
import { buildRepo } from './replay.mjs';

const {
  normalisePath, loadSessions, writtenFiles, classifyTools,
  commitLog, commitForTask, attributeTask, assertUniqueCommits, survivingLines,
  taskSurvival,
} = chk;

const HERE = fileURLToPath(new URL('.', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

// The workspace string as the redacted exports actually spell it. It is compared
// as a STRING PREFIX against the _meta.changes keys - it is never opened - so the
// replayed repo living somewhere else on disk is irrelevant to the join.
const WS = 'file:c:\\Users\\USER\\bobtest';

// The temp repos this file creates for its own one-off histories. buildRepo()
// cleans up the ones IT creates.
const trash = [];
process.on('exit', () => { for (const d of trash) rmSync(d, { recursive: true, force: true }); });

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

// ------------------------------------------------------- merged corpus (3 repos)
// snapshot.mjs used to read ONE exports dir joined against ONE repo (bob_sessions/
// against receipts), so 4 of the 6 real Bob tasks on disk never reached the
// dashboard - and with them went the only task whose code a human overwrote. A
// 2-task corpus at 100% survival falsifies the product's own pitch. This test
// pins the merge: all 6 tasks, all 3 workspaces, and the death that already exists.
test('the shipped corpus merges all three repos and keeps the dead-code datapoint', (t) => {
  const CORPUS = fileURLToPath(new URL('../public/analysis.json', import.meta.url));
  let analysis;
  try {
    analysis = JSON.parse(readFileSync(CORPUS, 'utf8'));
  } catch (e) {
    t.skip(`public/analysis.json is absent (${e.code ?? e.message}) - it is generated; `
         + 'run `npm run snapshot` first, then re-run this test.');
    return;
  }
  const tasks = analysis.tasks ?? [];

  assert.equal(tasks.length, 6,
    `expected the 6 real Bob tasks (2 in bob_sessions/ + 3 in fixtures/repo-a/ + 1 in `
    + `fixtures/repo-b/), got ${tasks.length}. A short count means snapshot.mjs dropped an `
    + '(exportsDir, repo) pair.');

  // Every task must say which repo it came from, or the UI cannot tell three repos
  // apart and the merge is indistinguishable from one big workspace.
  const missing = tasks.filter((x) => !x.workspace).map((x) => x.id);
  assert.deepEqual(missing, [], 'tasks with no `workspace` field');
  const workspaces = new Set(tasks.map((x) => x.workspace));
  assert.ok(workspaces.size >= 3,
    `expected tasks from >=3 distinct workspaces, got ${workspaces.size}: `
    + `[${[...workspaces].join(', ')}]`);

  // THE POINT OF THE MERGE. bobtest commit "C: human rewrites Bob's docstring"
  // overwrites, in the very next commit, the docstring Bob was paid 0.285058 coins
  // for and that was approved. That is a real ~0%-survival task. It is measured,
  // never manufactured - do not "fix" this by editing any repo's history.
  const dead = tasks.filter((x) => x.survivalPct !== null && x.survivalPct < 0.25);
  assert.ok(dead.length >= 1,
    'NO DEAD-CODE DATAPOINT. survivalPct across the corpus is '
    + `${tasks.map((x) => x.survivalPct).join('/')}, so the dashboard claims 100% survival and `
    + 'R2 (and with it the loop-close) can never fire. The bobtest task overwritten by commit '
    + '"C: human rewrites Bob\'s docstring" must be in this corpus.');

  // A task whose code a human overwrote is DISCARDED WORK: it reached a commit and
  // was measured. A task that never reached any commit is a THROWAWAY SPIKE and is
  // counted separately, as `unattributed`. Conflating them inflates the loss.
  for (const d of dead) {
    assert.ok(d.commit && d.authored > 0,
      `${d.id} counted as discarded work without a commit it authored lines in`);
  }
  assert.equal(analysis.totals.discardedWork, dead.length);
});

// ------------------------------------------------- loop-close eligibility (§3b)
// WHY THIS TEST EXISTS, AND WHY IT READS THE SHIPPED CORPUS
//
// The product's headline feature is "Copy prompt for Bob": Receipts hands Bob a
// prompt, Bob executes it, the metric visibly moves. SCHEDULE.md §3b fixes which
// remediation may be that prompt:
//
//   "Take the highest-ranked rule whose fix is an edit to a file inside this
//    repo, and skip any rule whose fix is an IDE or account setting."
//
// So the loop-close needs remediations() to emit at least ONE candidate whose
// `action` names a concrete file edit. Of the four rules, only R2 can:
//
//   R1 (skills dominate context) -- action is "Trim the skill pack for this
//      workspace": a Bob/IDE workspace setting. §3b excludes it by name ("the
//      skills-overhead rule that opens the video ... is a narration beat, not the
//      loop-close target").
//   R2 (dead code, survivalPct < 0.25) -- action is "Re-add N line(s) task <id>
//      wrote to <file>, or add a test asserting they are intentionally absent."
//      A file edit. THE ONLY ELIGIBLE RULE. (Its own fallback branch, taken when
//      there is no usable fileBreakdown, degrades to process advice and is
//      likewise ineligible -- by design, per its comment.)
//   R3 (batched commits) -- action is "Commit once per Bob task": a change to how
//      the human drives git, not a diff Bob can produce.
//   R4 (most expensive surviving line) -- action is "Split tasks this large":
//      process advice about future task authoring, not an edit.
//
// The rest of the suite exercises remediations() against synthetic fixtures, so the
// engine can be entirely green while being INERT on the dataset that actually ships.
// This test closes that gap: real committed corpus, real rule engine, one assertion.
test('the remediation engine emits at least one FILE-EDIT candidate for the loop-close', (t) => {
  // public/analysis.json is generated by `npm run snapshot`, so a clean clone may
  // not have it yet. Skip loudly rather than fail for the wrong reason.
  const CORPUS = fileURLToPath(new URL('../public/analysis.json', import.meta.url));
  let analysis;
  try {
    analysis = JSON.parse(readFileSync(CORPUS, 'utf8'));
  } catch (e) {
    t.skip(`public/analysis.json is absent (${e.code ?? e.message}) - it is generated; `
         + 'run `npm run snapshot` first, then re-run this test.');
    return;
  }

  const tasks = analysis.tasks ?? [];
  assert.ok(tasks.length, 'the shipped corpus must contain tasks to reason about');

  // The §3b candidate filter, encoded. "An edit to a file inside this repo" means the
  // action sentence names a repo-relative path with a source-file extension - that is
  // what makes the emitted prompt actionable by Bob in Agent mode. Existence at HEAD is
  // deliberately NOT required: a legitimate remediation may name a file that was deleted.
  const NAMES_A_FILE = /\b[\w.-]+(?:\/[\w.-]+)*\/[\w.-]+\.(?:mjs|cjs|js|jsx|ts|tsx|json|md|css|html|py)\b/;
  const loopCloseEligible = (r) => NAMES_A_FILE.test(r.action ?? '');

  const all = chk.remediations(tasks);
  const eligible = all.filter(loopCloseEligible);

  assert.ok(eligible.length >= 1,
    'NO LOOP-CLOSE CANDIDATE. remediations() returned '
    + `[${all.map((r) => r.id).join(', ') || 'nothing'}] for the ${tasks.length} shipped task(s), `
    + 'and none of them names a file edit, so "Copy prompt for Bob" has nothing to hand Bob '
    + 'and §3b condition 2 ("Bob changed the repo") cannot be met.\n'
    + '  WHAT MUST FIRE: R2 ("Spend on code that did not survive"). It is the only rule whose '
    + 'action is a file edit; R1 is a workspace setting (§3b excludes it explicitly), R3 and R4 '
    + 'are process advice.\n'
    + '  WHY IT CANNOT HERE: R2 selects tasks with survivalPct < 0.25, and this corpus is '
    + `${tasks.map((x) => x.survivalPct).join('/')} survival - nothing is dead, so R2 is silent.\n`
    + '  THE FIX: Task 12\'s demo-dataset freeze manufactures the near-0% `control` exemplar '
    + '(rewrite a Bob-authored file in place, never delete it - `git blame HEAD` fatals on a path '
    + 'absent at HEAD). That one task unlocks R2, and R2 is what unlocks the loop-close.');
});

// ------------------------------------------------------- R2: discarded work
// The rule the loop-close depends on, exercised against the replayed fixture
// history (repo-a: A initial calc -> B Bob's docstring -> C human rewrites it)
// rather than the shipped corpus, so it still means something on a fresh clone.

test('overwrittenBy names the LATER commit that owns the file at HEAD', () => {
  const bob = A.sha("B: docstring on add (by Bob)");
  const w = chk.overwrittenBy(A.dir, bob, 'calc.py', commitLog(A.dir));
  assert.ok(w, 'a task whose line is gone must be able to name who owns it now');
  assert.equal(w.subject, "C: human rewrites Bob's docstring");
  assert.equal(w.short, w.sha.slice(0, 7));
  // f7e2ca4 ("A: initial calc") owns MORE lines of calc.py at HEAD than C does.
  // Picking the majority owner would name the wrong commit; only commits after
  // Bob's own can have overwritten Bob.
  assert.notEqual(w.sha, A.sha('A: initial calc'));
});

test('attributeTask records overwrittenBy on a task whose lines did not survive', () => {
  const e = byId(SESSIONS_A)['d0259633'];
  const row = attributeTask(A.dir, e);
  assert.equal(row.survivalPct, 0);
  assert.equal(row.overwrittenBy?.subject, "C: human rewrites Bob's docstring");
});

test('R2 fires on discarded work and hands Bob a file-edit prompt', () => {
  const discarded = {
    id: 'd0259633f134c3db6bfd3e596a142240',
    workspace: 'bobtest',
    coins: 0.285058,
    commit: { sha: '2d6bacb6af92a3303865111b8770dc93d6aa2a1a', short: '2d6bacb' },
    authored: 1,
    survived: 0,
    survivalPct: 0,
    fileBreakdown: [{ file: 'calc.py', authored: 1, survived: 0 }],
    overwrittenBy: { short: '8e8b929', subject: "C: human rewrites Bob's docstring" },
  };
  const [r, ...rest] = chk.remediations([discarded]);
  assert.equal(rest.length, 0);
  assert.equal(r.rule, 'R2');
  assert.equal(r.taskId, discarded.id);
  assert.equal(r.workspace, 'bobtest');
  assert.equal(r.file, 'bobtest/calc.py');
  assert.equal(r.coins, 0.285058);
  assert.equal(r.authored, 1);
  assert.equal(r.survived, 0);
  assert.ok(r.id.includes('d0259633'), 'id must identify the task it came from');
  // The three human-facing strings. `detail` is the evidence line, so it has to
  // name the commit that took the work - a claim with no sha is not a receipt.
  for (const k of ['title', 'detail', 'prompt', 'action']) {
    assert.equal(typeof r[k], 'string', `${k} must be a string`);
    assert.ok(r[k].length > 10, `${k} must say something`);
  }
  assert.ok(r.detail.includes('8e8b929'), 'detail must name the overwriting commit');
  assert.ok(r.prompt.includes('bobtest/calc.py'),
    'the prompt is pasted into Bob in another workspace: a bare filename is ambiguous');
});

test('R2 stays silent on healthy work and on tasks that never reached a commit', () => {
  const healthy = {
    id: 'aaa', workspace: 'bobtest', coins: 1, commit: { sha: 'x', short: 'x' },
    authored: 10, survived: 10, survivalPct: 1,
    fileBreakdown: [{ file: 'calc.py', authored: 10, survived: 10 }],
  };
  // A spike that never committed is a THROWAWAY, not discarded work: no human
  // overwrote it, so there is nothing to reconcile and nothing to accuse.
  const spike = {
    id: 'bbb', workspace: 'bobtest', coins: 1, commit: null,
    authored: 0, survived: 0, survivalPct: null,
    fileBreakdown: [], unattributed: 'no-matching-commit',
  };
  assert.deepEqual(chk.remediations([healthy, spike]), []);
});
