import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * DISPLAY LABEL ONLY - never a predicate. Across all four real exports `apply_diff`
 * is the only write tool ever observed; the other three were guesses, and any tool
 * not on a guessed list is silently counted as "wrote nothing". isWrite() below
 * decides from the permission field instead.
 */
export const WRITE_TOOLS = new Set([
  'apply_diff', 'write_file', 'insert_content', 'search_and_replace',
]);

/** How long after a task's last update a commit may still be that task's. */
// ponytail: flat 2h window, a knob not a law. Widen it if the team batches commits;
// the authorship test below is what actually keeps a human's commit out.
export const DEFAULT_WINDOW_MS = 2 * 60 * 60 * 1000;

/**
 * Turns anything Bob calls a path into a repo-relative forward-slash path.
 * git speaks repo-relative forward slashes. Without this the join silently
 * returns zero files and every survival number reads 0%.
 *
 * The two inputs are NOT the same shape and differ four ways at once:
 *   task.workspace         "file:c:\\Users\\USER\\bobtest"                  (scheme + backslashes)
 *   _meta.changes key      "file:///c%3A/Users/USER/bobtest/calc.py"       (scheme + slashes + %3A)
 * So the scheme is stripped from BOTH sides, the key is percent-decoded, and the
 * comparison is case-insensitive (the drive letter's case differs between them).
 *
 * arguments.path, by contrast, is a bare relative filename in all 14 tool calls of
 * the four real exports - the absolute-path branch is defensive, not observed.
 */
export function normalisePath(p, repoRoot) {
  if (!p) return null;
  let s = String(p).replace(/^file:\/*/i, '');
  try { s = decodeURIComponent(s); } catch { /* not percent-encoded; use as-is */ }
  s = s.replace(/\\/g, '/');
  if (repoRoot) {
    const root = String(repoRoot)
      .replace(/^file:\/*/i, '')
      .replace(/\\/g, '/')
      .replace(/\/+$/, '');
    if (root && s.toLowerCase().startsWith(root.toLowerCase() + '/')) s = s.slice(root.length + 1);
  }
  return s.replace(/^\.\//, '').replace(/^\/+/, '');
}

/** Reads every bob_sessions/*.json and flattens their tasks[] into one list. */
export function loadSessions(dir) {
  const out = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    let raw;
    try {
      raw = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    } catch (e) {
      throw new Error(`bob_sessions/${f} is not valid JSON: ${e.message}`);
    }
    for (const entry of raw.tasks ?? []) {
      out.push({ ...entry, _workspace: raw.workspace ?? null, _file: f });
    }
  }
  // DEDUPE BY task.id. Bob tasks are resumable and the ritual exports "Current
  // Task" every time, so re-opening a task to ask one follow-up produces a second
  // file with the SAME task.id and a later updatedAt. Without this, totals.coins
  // is inflated (and will not match the Bob panel at the H+11 checkpoint) and
  // React sees duplicate keys in the table, scatter and context chart.
  const byId = new Map();
  for (const e of out) {
    const id = e.task?.id;
    if (!id) continue;
    const prev = byId.get(id);
    if (!prev || (e.task.updatedAt ?? 0) > (prev.task.updatedAt ?? 0)) byId.set(id, e);
  }
  return [...byId.values()];
}

/**
 * Splits a task's tool calls into writes and "could not tell". `permission` is a
 * plain STRING ("read" | "edit") on toolUsage, one per tool-result message - it is
 * NOT an object, so `permission.read` is undefined and any test on it is vacuous.
 * The arguments.path guard is load-bearing: `glob` and `FindSymbol` are edit-less
 * reads whose arguments.path is undefined.
 */
export function classifyTools(entry, repoRoot) {
  const writes = [];
  const unknownTools = [];
  for (const m of entry.messages ?? []) {
    const tu = m?.data?.toolUsage;
    if (!tu) continue;
    const sig = tu.signature ?? {};
    const name = sig.name ?? '(unnamed)';
    if (tu.permission === 'read') continue;
    if (tu.permission !== 'edit') {
      // A tool that admits what it could not attribute is more credible than one
      // that reports 0%. Surfaced, never swallowed.
      unknownTools.push({ name, reason: `unrecognised permission ${JSON.stringify(tu.permission)}` });
      continue;
    }
    if (sig.isError === true) continue;
    if (typeof sig.arguments?.path !== 'string') {
      unknownTools.push({ name, reason: 'edit tool with no arguments.path' });
      continue;
    }
    const p = normalisePath(sig.arguments.path, repoRoot);
    if (p) writes.push({ name, path: p });
  }
  return { writes, unknownTools };
}

/**
 * Every file touched by a `_meta.changes` entry. Bob emits ONE entry per edit-tool
 * RESULT, each an object with exactly one key; multiplicity appears ACROSS messages.
 * Reading only the last change-bearing message loses edits, so scan them all.
 */
export function changedFiles(entry, repoRoot) {
  const out = [];
  for (const m of entry.messages ?? []) {
    for (const key of Object.keys(m?.data?._meta?.changes ?? {})) {
      const p = normalisePath(key, repoRoot);
      if (p) out.push({ path: p, change: m.data._meta.changes[key] });
    }
  }
  return out;
}

/** JOIN #2: repo-relative paths this task successfully wrote to. */
export function writtenFiles(entry, repoRoot) {
  const seen = new Set(classifyTools(entry, repoRoot).writes.map((w) => w.path));
  for (const c of changedFiles(entry, repoRoot)) seen.add(c.path);
  return [...seen].sort();
}

/**
 * file -> the set of lines this task actually ADDED, from _meta.changes before/after.
 * This is the evidence the authorship test runs on. A change with no before/after
 * yields nothing, which makes the task unattributed rather than falsely credited.
 */
export function bobAddedLines(entry, repoRoot) {
  const map = new Map();
  for (const { path: f, change } of changedFiles(entry, repoRoot)) {
    if (change?.after === undefined) continue;
    const remaining = new Map();
    for (const l of String(change.before ?? '').split('\n')) {
      const k = l.trim();
      if (k) remaining.set(k, (remaining.get(k) ?? 0) + 1);
    }
    const set = map.get(f) ?? new Set();
    for (const l of String(change.after).split('\n')) {
      const k = l.trim();
      if (!k) continue;
      const n = remaining.get(k) ?? 0;
      if (n > 0) remaining.set(k, n - 1);
      // Candidate lines under 4 chars are not evidence of authorship: "}", "{", ");"
      // and "})" are the most-added lines in a TS/TSX repo, so a human commit touching
      // the same file would match on a brace and be credited to Bob - collapsing the
      // authorship half of the join. The 4-export corpus was Python, which never
      // exposed this. Keep the multiset decrement above for ALL lines; only the
      // authorship candidate set is filtered.
      else if (k.length >= 4) set.add(k);
    }
    if (set.size) map.set(f, set);
  }
  return map;
}

/** Thin git wrapper. Never called from the browser. */
export function git(repo, args) {
  return execFileSync('git', args, {
    cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
}
/** All commits reachable from HEAD, oldest first, author time in MILLISECONDS. */
export function commitLog(repo) {
  // %ct is COMMITTER time and it is the right field here: an author time can
  // predate the task that produced the code (rebase, cherry-pick, git am,
  // --date), and we are asking "which commit came after this task", which is
  // a repo-state question.
  const out = git(repo, ['log', '--format=%H %ct', 'HEAD']);
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [sha, ct] = line.trim().split(' ');
      return { sha, timeMs: Number(ct) * 1000 };
    })
    // `git log --reverse` reverses GRAPH order, not TIME order. They coincide
    // only on a linear, never-amended history. Sorting explicitly removes the
    // dependency on git's ordering: one out-of-order commit would otherwise
    // mis-attribute every task after it, silently.
    .sort((a, b) => a.timeMs - b.timeMs);
}

/** file -> set of trimmed lines this commit ADDED. Trimmed, so CRLF cannot matter. */
export function commitAddedLines(repo, sha) {
  const out = git(repo, ['show', '--format=', '--unified=0', '--no-renames', '--first-parent', sha]);
  const map = new Map();
  let file = null;
  for (const raw of out.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('+++ ')) {
      const t = line.slice(4).trim();
      file = t === '/dev/null' ? null : t.replace(/^b\//, '');
      continue;
    }
    if (line.startsWith('---') || line.startsWith('diff ') || line.startsWith('@@')) continue;
    if (!file || !line.startsWith('+')) continue;
    const k = line.slice(1).trim();
    if (!k) continue;
    if (!map.has(file)) map.set(file, new Set());
    map.get(file).add(k);
  }
  return map;
}

/**
 * JOIN #1. gitSha in the export came back null on every task exported, so we join
 * on time AND on content. Time alone is not a join: the first commit at or after a
 * task's last update is just as likely to be a human's, and crediting it reports
 * 100% survival on code that was thrown away. Two guards, both required:
 *
 *   1. UPPER BOUND - the commit must land within `windowMs` of the task.
 *   2. AUTHORSHIP  - the commit must ADD at least one line the task's own
 *      _meta.changes says Bob wrote. Measured: task da0e0ddc added a
 *      divide-by-zero guard that was never committed; the next commit in time is
 *      "C: human rewrites Bob's docstring", which shares none of Bob's lines.
 *
 * Both are mandatory: there is no 2-argument form, because the 2-argument form is
 * the bug. A task whose commit cannot be found returns null and MUST be surfaced
 * by the caller (see attributeTask), not dropped.
 *
 * Still true: batched commits collapse several tasks onto one commit and each
 * would claim its full added-line count - assertUniqueCommits refuses that.
 */
export function commitForTask(commits, updatedAtMs, opts = {}) {
  const { repo, entry, windowMs = DEFAULT_WINDOW_MS } = opts;
  if (!repo || !entry) {
    throw new Error('commitForTask(commits, updatedAtMs, { repo, entry }): the authorship test is not optional');
  }
  const bob = bobAddedLines(entry, opts.repoRoot ?? entry._workspace ?? entry.task?.workspace ?? null);
  if (bob.size === 0) return null;
  for (const c of commits) { // commitLog() is sorted by time, so we can stop early
    if (c.timeMs < updatedAtMs) continue;
    if (c.timeMs > updatedAtMs + windowMs) return null;
    const added = commitAddedLines(repo, c.sha);
    for (const [f, lines] of bob) {
      const inCommit = added.get(f);
      if (!inCommit) continue;
      for (const l of lines) if (inCommit.has(l)) return { sha: c.sha, timeMs: c.timeMs, bobLines: bob };
    }
  }
  return null;
}

/** path -> lines added by this commit. Binary files (added === '-') are skipped. */
export function addedLines(repo, sha) {
  // --no-renames: since git 2.9 diff.renames defaults on, so a renamed file prints
  // as "old.ts => new.ts" - a key that matches nothing from writtenFiles, silently
  // shrinking the denominator. --first-parent keeps merge commits from printing
  // zero file rows.
  const out = git(repo, ['show', '--numstat', '--no-renames', '--format=', '--first-parent', sha]);
  const map = new Map();
  for (const line of out.split('\n')) {
    const [added, , file] = line.split('\t');
    if (!file || added === '-' || added === undefined) continue;
    const p = file.trim().replace(/\\/g, '/');
    map.set(p, (map.get(p) ?? 0) + Number(added));
  }
  return map;
}

/** Lines of `file` still present at HEAD that blame to `sha`. */
export function survivingLines(repo, sha, file) {
  try {
    git(repo, ['cat-file', '-e', `HEAD:${file}`]);
  } catch {
    return 0; // deleted or renamed at HEAD -> nothing survived. Documented limit.
  }
  let out;
  try {
    // -w -M -C are not optional: without them one `black .` / prettier run late in
    // the build re-indents everything, every line blames to the formatter commit,
    // and every task collapses to ~0% survival with no error.
    out = git(repo, ['blame', '-w', '-M', '-C', '--line-porcelain', 'HEAD', '--', file]);
  } catch {
    return 0;
  }
  let n = 0;
  for (const line of out.split('\n')) {
    // Porcelain record header: "<sha> <orig> <final>[ <count>]".
    // Content lines are TAB-prefixed, so they cannot match this anchor.
    const m = /^([0-9a-f]{40}) \d+ \d+(?: \d+)?$/.exec(line);
    if (m && m[1] === sha) n++;
  }
  return n;
}

/**
 * Trimmed contents of the lines at HEAD in `file` that blame to `sha`.
 * survivingLines() returns only a COUNT, and a count cannot be intersected with
 * Bob's own authored set - which is why the task-level numerator needs this.
 * --line-porcelain emits one TAB-prefixed content line per record, after its header.
 */
export function survivingLineSet(repo, sha, file) {
  const out = new Set();
  try { git(repo, ['cat-file', '-e', `HEAD:${file}`]); } catch { return out; }
  let blame;
  try {
    blame = git(repo, ['blame', '-w', '-M', '-C', '--line-porcelain', 'HEAD', '--', file]);
  } catch { return out; }
  let armed = false;
  for (const line of blame.split('\n')) {
    const m = /^([0-9a-f]{40}) \d+ \d+(?: \d+)?$/.exec(line);
    if (m) { armed = m[1] === sha; continue; }
    if (armed && line.startsWith('\t')) {
      const k = line.slice(1).trim();
      if (k) out.add(k);
      armed = false;
    }
  }
  return out;
}

/**
 * Survival for one task. TASK-LEVEL when `bobLines` is supplied (the normal path,
 * and what every shipped doc claims): the denominator is every line THIS TASK
 * wrote, and the numerator is how many of those exact lines are still attributed
 * to `sha` at HEAD. Result carries `level: 'task'`.
 *
 * Falls back to the older COMMIT-LEVEL ratio (every line the commit added vs what
 * survives at HEAD) only for callers with no line set — see the note below for why
 * that ratio misreports a commit that mixes Bob and human lines.
 */
export function taskSurvival(repo, sha, files, bobLines) {
  // bobLines (returned by commitForTask) switches the denominator from "every line
  // this COMMIT added" to "every line THIS TASK wrote" - which is what README-DRAFT,
  // the long description and USAGE-STATEMENT all claim. Without it, a commit mixing
  // 1 Bob line with 9 human lines reports authored=10, so a task whose contribution
  // was fully reverted can render ~90% survived and one that fully survived ~10%.
  // The commit-level path below is kept for callers that have no line set.
  if (bobLines && bobLines.size) {
    let authored = 0, survived = 0;
    const per = [];
    const unmatched = [];
    for (const f of files) {
      const mine = bobLines.get(f);
      // A file Bob wrote but whose lines we cannot locate (path drift, case drift,
      // rename) must be SURFACED, not scored 0/0 - scoring it silently is the
      // "confident wrong number" failure the commit-level path guarded against.
      if (!mine || mine.size === 0) { unmatched.push(f); continue; }
      const alive = survivingLineSet(repo, sha, f);
      let hit = 0;
      for (const l of mine) if (alive.has(l)) hit++;
      authored += mine.size; survived += hit;
      per.push({ file: f, authored: mine.size, survived: hit });
    }
    return {
      authored, survived,
      pct: authored ? survived / authored : null,
      files: per.sort((x, y) => y.authored - x.authored),
      unmatched,
      level: 'task',
    };
  }
  const added = addedLines(repo, sha);
  let authored = 0, survived = 0;
  const per = [];
  // Every written file this commit does not account for lands here instead of
  // vanishing. Surfaced in analysis.json and rendered as the unattributed rate.
  const unmatched = [];
  for (const f of files) {
    const a = added.get(f) ?? 0;
    if (a === 0) {
      // THE master silent-zero. This one line swallows: absolute paths that were
      // never relativised, case drift (the build box is case-insensitive NTFS so
      // nothing else catches it), rename-mangled keys, and files the commit did
      // not include. A PARTIAL mismatch is the dangerous case: it yields a
      // confident non-zero percentage computed over a subset of the files.
      // Never swallow it silently.
      unmatched.push(f);
      continue;
    }
    const s = Math.min(survivingLines(repo, sha, f), a);
    authored += a; survived += s;
    per.push({ file: f, authored: a, survived: s });
  }
  return {
    authored, survived,
    pct: authored ? survived / authored : null,
    files: per.sort((x, y) => y.authored - x.authored),
    unmatched,
  };
}
const _logCache = new Map();

/**
 * The whole join for one task, with nowhere for a task to vanish. Every task that
 * goes in comes out; when it has no commit it carries `unattributed` saying why
 * instead of disappearing between commitForTask() and the results table.
 * `unmatched` only ever caught path mismatches, so no-commit tasks used to be
 * invisible - 4 tasks in, 2 rows out, no error.
 */
export function attributeTask(repo, entry, opts = {}) {
  const t = entry.task ?? {};
  const root = entry._workspace ?? t.workspace ?? null;
  const { unknownTools } = classifyTools(entry, root);
  const files = writtenFiles(entry, root);

  if (!_logCache.has(repo)) _logCache.set(repo, commitLog(repo));
  const commits = opts.commits ?? _logCache.get(repo);

  let commit = null;
  let unattributed = null;
  if (files.length === 0) unattributed = 'no-files-written';
  else if (!t.updatedAt) unattributed = 'no-updatedAt';
  else {
    commit = commitForTask(commits, t.updatedAt, { repo, entry, repoRoot: root, windowMs: opts.windowMs });
    if (!commit) unattributed = 'no-matching-commit';
  }

  // commit.bobLines is what makes this TASK-level rather than commit-level. Drop the
  // 4th argument and taskSurvival silently falls back to counting every line the
  // commit added, which inverts the metric on any mixed-authorship commit.
  const surv = commit
    ? taskSurvival(repo, commit.sha, files, commit.bobLines)
    : { authored: 0, survived: 0, pct: null, files: [], unmatched: files };

  return {
    id: String(t.id ?? entry._file),
    wroteFiles: files,
    commit: commit ? { sha: commit.sha, short: commit.sha.slice(0, 7), timeMs: commit.timeMs } : null,
    authored: surv.authored,
    survived: surv.survived,
    survivalPct: surv.pct,
    fileBreakdown: surv.files,
    unmatchedFiles: surv.unmatched,
    unattributed,
    unknownTools,
  };
}

/** One commit cannot be two tasks' work: each would claim its full added-line count. */
export function assertUniqueCommits(tasks) {
  const bySha = new Map();
  for (const t of tasks) {
    const sha = t.commit?.sha;
    if (!sha) continue;
    if (!bySha.has(sha)) bySha.set(sha, []);
    bySha.get(sha).push(t.id);
  }
  const clashes = [...bySha].filter(([, ids]) => ids.length > 1);
  if (clashes.length === 0) return;
  throw new Error(
    'JOIN #1 collision: a commit is claimed by more than one task\n'
    + clashes.map(([sha, ids]) => `  ${sha} claimed by ${ids.join(', ')}`).join('\n'),
  );
}

// Replaced by the real rule engine in Task 9.
export function remediations(_tasks) { return []; }