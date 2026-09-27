#!/usr/bin/env node
/**
 * REPRODUCE THE OVERWRITE VERDICT FROM A FRESH CLONE.  `node tools/replay.mjs`
 *
 * The headline claim of this project is that one Bob task was paid for a line a
 * human then overwrote. The git history that proves it lives in two sibling
 * workspaces on the author's machine, so on any other box the only evidence used
 * to be public/analysis.json asserting it - "trust our output file", which is the
 * exact objection this project exists to refute.
 *
 * So the history is checked in as DATA: tools/fixtures/history.json holds every
 * commit's file contents, message and committer timestamp, and the Bob exports in
 * tools/fixtures/repo-{a,b}/ are the real (redacted) ones. buildRepo() replays the
 * data into a temp repo, and the same join the dashboard uses runs against it.
 * Nothing here reads a path outside this repo.
 *
 * WHY THE SHAS DIFFER, AND WHY THAT IS NOT A DISCREPANCY
 * A commit sha hashes content + author + timestamp. The real commits are authored
 * by a Windows username, and publishing that is not acceptable, so the replay uses
 * a neutral fixture identity. Contents, messages and committer times are identical;
 * the hashes are not. What has to reproduce is the VERDICT - lines authored, lines
 * surviving at HEAD, and which later commit owns the code now - not the hash. The
 * timestamps DO have to match, because the task->commit join is time-windowed.
 *
 * Exits non-zero if the rebuilt verdict disagrees with public/analysis.json on any
 * fixture-backed task. That is the check: it can fail, which is what makes it proof.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadSessions, attributeTask, remediations } from './lib.mjs';

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const HISTORY = JSON.parse(readFileSync(path.join(FIXTURES, 'history.json'), 'utf8'));

const trash = [];
process.on('exit', () => { for (const d of trash) rmSync(d, { recursive: true, force: true }); });

/**
 * Replay one fixture history into a fresh temp repo. Returns { dir, sha(message) }.
 * Shared with tools/lib.test.mjs so there is ONE reconstruction mechanism: a second
 * copy could drift and then "the tests pass" would stop meaning "the replay works".
 */
export function buildRepo(name) {
  const commits = HISTORY[name];
  if (!commits) throw new Error(`tools/fixtures/history.json has no history "${name}"`);
  const dir = mkdtempSync(path.join(tmpdir(), `chk-${name}-`));
  trash.push(dir);
  const g = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  // Neutral identity on purpose: see the header. This is why the shas move.
  g('config', 'user.email', 'fixture@example.invalid');
  g('config', 'user.name', 'fixture');
  g('config', 'core.autocrlf', 'false'); // else every line differs from the export
  for (const c of commits) {
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
    const line = g('log', '--format=%H %s', 'HEAD').split('\n')
      .find((l) => l.slice(41) === message);
    if (!line) throw new Error(`fixture history "${name}" has no commit "${message}"`);
    return line.slice(0, 40);
  };
  return { dir, sha };
}

/** The two fixture pairs: one replayed history, one directory of real Bob exports. */
const PAIRS = [
  { history: 'repo-a', exports: path.join(FIXTURES, 'repo-a') },
  { history: 'repo-b', exports: path.join(FIXTURES, 'repo-b') },
];

/** Re-run the dashboard's own join against the replayed history. */
export function replay() {
  const rows = [];
  for (const pair of PAIRS) {
    const { dir } = buildRepo(pair.history);
    for (const entry of loadSessions(pair.exports)) {
      const t = entry.task ?? {};
      rows.push({
        ...attributeTask(dir, entry),
        title: t.title ?? '(untitled task)',
        coins: Number(t.costs?.cost ?? 0),
        // Same derivation as snapshot.mjs: the export's own redacted workspace
        // string, basename only, so no absolute path can reach the output.
        workspace: path.basename(String(entry._workspace ?? pair.history)
          .replace(/[\\/]+$/, '').replace(/\\/g, '/')),
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------- CLI
// Compared as PATHS, not as URL strings: on Windows `file://${argv[1]}` yields
// file://C:/... while import.meta.url is file:///C:/..., so the string form of this
// guard is silently false and the whole CLI does nothing but exit 0.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const analysisPath = fileURLToPath(new URL('../public/analysis.json', import.meta.url));
  const analysis = JSON.parse(readFileSync(analysisPath, 'utf8'));
  // Every shipped task that came from a sibling workspace, i.e. exactly the ones a
  // judge cannot otherwise re-derive. `receipts` tasks join against this repo's own
  // git history, which they already have.
  const shipped = new Map(analysis.tasks.filter((t) => t.workspace !== 'receipts')
    .map((t) => [t.id, t]));

  const rows = replay();
  // A deliberate corruption knob, so tools/replay.test.mjs can prove this check is
  // capable of failing. Never set in normal use.
  if (process.env.REPLAY_SELFTEST_CORRUPT) rows[0].survived += 1;

  console.log('REPLAY: rebuilding the sibling workspaces from tools/fixtures/history.json');
  console.log('        (checked-in data - no repo outside this clone is read)\n');
  console.log('SHAS WILL DIFFER from the ones the dashboard cites. A sha hashes content +');
  console.log('author + time, and the real commits are authored by a Windows username that');
  console.log('must not be published, so the replay commits under a neutral fixture author.');
  console.log('Contents, messages and committer timestamps are identical. The verdict is what');
  console.log('reproduces, not the hash - each row prints the dashboard sha next to it.\n');

  const fmt = (p) => (p === null ? '  n/a' : `${(p * 100).toFixed(0).padStart(3)}%`);
  const disagreements = [];

  for (const r of rows) {
    const s = shipped.get(r.id);
    console.log(`${r.workspace}  ${r.id.slice(0, 8)}  ${r.title}`);
    if (r.commit) {
      console.log(`    commit ${r.commit.short} (dashboard: ${s?.commit?.short ?? '?'})`
        + `  ${r.authored} authored / ${r.survived} surviving  ${fmt(r.survivalPct)} survival`);
    } else {
      console.log(`    no commit: ${r.unattributed} - a throwaway spike, nothing was overwritten`);
    }
    if (r.overwrittenBy) {
      console.log(`    OVERWRITTEN BY ${r.overwrittenBy.short} "${r.overwrittenBy.subject}"`
        + `  (dashboard: ${s?.overwrittenBy?.short ?? '?'})`);
    }
    if (!s) { disagreements.push(`${r.id} is not in public/analysis.json at all`); continue; }
    // The sha is excluded on purpose (it cannot match); everything the verdict is
    // made of is compared, including WHY a task has no commit.
    for (const k of ['authored', 'survived', 'survivalPct', 'unattributed']) {
      if (r[k] !== s[k]) disagreements.push(`${r.id.slice(0, 8)} ${k}: rebuilt ${r[k]}, shipped ${s[k]}`);
    }
    const a = r.overwrittenBy?.subject ?? null;
    const b = s.overwrittenBy?.subject ?? null;
    if (a !== b) disagreements.push(`${r.id.slice(0, 8)} overwrittenBy: rebuilt ${a}, shipped ${b}`);
    console.log('');
  }

  const rebuilt = remediations(rows);
  console.log(`R2 remediation(s) re-derived from the rebuild: ${rebuilt.length}`);
  for (const rem of rebuilt) {
    console.log(`  ${rem.id}  ${rem.title}`);
    console.log(`    ${rem.detail}`);
    console.log(`    PROMPT FOR BOB: ${rem.prompt}`);
  }
  const shippedRems = (analysis.remediations ?? []).filter((x) => x.workspace !== 'receipts');
  if (rebuilt.length !== shippedRems.length) {
    disagreements.push(`remediations: rebuilt ${rebuilt.length}, shipped ${shippedRems.length}`);
  }
  for (const [i, rem] of rebuilt.entries()) {
    if (shippedRems[i] && rem.file !== shippedRems[i].file) {
      disagreements.push(`remediation ${i} file: rebuilt ${rem.file}, shipped ${shippedRems[i].file}`);
    }
  }

  console.log('');
  if (disagreements.length) {
    console.log(`VERDICT: the rebuild DISAGREES with public/analysis.json on ${disagreements.length} point(s):`);
    for (const d of disagreements) console.log(`  ${d}`);
    console.log('\nThe committed snapshot and the checked-in history are out of sync. Re-run');
    console.log('`npm run snapshot` on a machine that has the sibling repos, or fix the fixture.');
    process.exit(1);
  }
  console.log(`VERDICT: the rebuild AGREES with public/analysis.json on all ${rows.length} `
    + 'fixture-backed task(s) - lines authored, lines surviving at HEAD, survival %,'
    + ' and which commit overwrote the work.');
}
