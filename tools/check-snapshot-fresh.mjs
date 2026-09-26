#!/usr/bin/env node
// Guard: exits non-zero when public/analysis.json is stale, missing, corrupt,
// or was generated in an environment whose git history cannot be trusted
// (a Vercel build's shallow clone). Run this locally before `git push` and
// before any `vercel --prod` deploy — NEVER inside the Vercel build itself,
// where the shallow clone it exists to catch would make the check meaningless.
//
// ponytail: no npm dependencies — stdlib (node:fs, node:path, node:child_process,
// node:url) plus ONE sibling local module, ./redact.mjs, for the credential scan
// in Check 6. Zero budget, nothing installed, Node 24.15.0 already on this box.
// (An earlier version of this line said "stdlib only"; that is now one import out
// of date, and the import is deliberate — see Check 6.)
//
// WHY THIS GUARD ALSO SCANS FOR SECRETS (Check 6): public/analysis.json is
// COMMITTED to a public repo and is built from IBM Bob session exports, which
// carry environment blocks, absolute Windows paths, source code and unified
// diffs. tools/ritual.mjs scans the exports on their way IN; nothing scanned the
// file built OUT of them. snapshot.mjs now scans before it writes, and this is
// the independent check on the consumer side — deliberately redundant, because
// the producer's scan is skipped entirely if anyone ever hand-edits the file or
// generates it with an older snapshot.mjs.
//
// DEPENDENCY ON FUTURE WORK (Task 4, snapshot.mjs — does not exist yet):
// this guard can only see what snapshot.mjs chooses to record. It requires
// snapshot.mjs to write a `_generatedIn` block on the analysis object:
//   _generatedIn: { headSha: string, commitCount: integer, isShallowRepo: boolean }
// computed at snapshot time via:
//   const isShallowRepo = git(repo, ['rev-parse', '--is-shallow-repository']).trim() === 'true';
// (headSha and commits.length are already computed in the Task 4 draft — just
// carry them into this new top-level field.) Until that field exists, every
// snapshot fails the "missing-provenance" check below, which is correct:
// unknown provenance must be treated as untrusted, never as a pass.
//
// Design rule: NEVER fail open. Any condition this script cannot positively
// verify is a FAIL, not a silent pass — that silent-pass is the exact failure
// mode 18 prose warnings in the plan exist to prevent.

import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanSecrets, containsUser, currentUser } from './redact.mjs';

const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const analysisPath = path.join(repo, 'public', 'analysis.json');

// "Relevant source" = everything analysis.json is derived from: the pipeline
// code (tools/ — snapshot.mjs, lib.mjs; src/ — types.ts shapes the output)
// and the raw Bob exports it reads (bob_sessions/*.json). Deliberately
// EXCLUDES deck/, README.md, package-lock.json, public/ itself: none of those
// change a single number in analysis.json, so churn there must not force a
// re-snapshot or block a push.
const SOURCE_DIRS = ['tools', 'src', 'bob_sessions'];
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

const failures = [];

function fail(id, problem, why, fix) {
  failures.push({ id, problem, why, fix });
}

function printFailures() {
  for (const f of failures) {
    console.error(`\n[FAIL] ${f.id}`);
    console.error(`  problem: ${f.problem}`);
    console.error(`  why it matters: ${f.why}`);
    console.error(`  fix: ${f.fix}`);
  }
  console.error(`\n${failures.length} check(s) failed. Not safe to push or deploy.\n`);
}

function newestMtime(dir) {
  let newest = { ms: 0, file: null };
  if (!existsSync(dir)) return newest;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = newestMtime(full);
      if (sub.ms > newest.ms) newest = sub;
    } else if (entry.isFile()) {
      const ms = statSync(full).mtimeMs;
      if (ms > newest.ms) newest = { ms, file: full };
    }
  }
  return newest;
}

function runGit(args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

// --- Check 1: missing analysis.json. Hard stop; nothing else is checkable. ---
if (!existsSync(analysisPath)) {
  fail(
    'missing-analysis-json',
    'public/analysis.json does not exist.',
    'The app, the deck, and the video all read this one file. Nothing downstream can be trusted or deployed without it.',
    'npm run snapshot'
  );
  printFailures();
  process.exit(1);
}

// --- Check 2: unparseable analysis.json. Also a hard stop. ---
let analysis;
let analysisStat;
// Kept as raw text, not re-serialised from `analysis`: Check 6 must scan the exact
// bytes that git will commit. A round-trip through JSON.parse/stringify can change
// escaping and key order, so a scan of the re-serialised form is a scan of a
// different string than the one on disk.
let analysisRaw;
try {
  analysisStat = statSync(analysisPath);
  analysisRaw = readFileSync(analysisPath, 'utf8');
  analysis = JSON.parse(analysisRaw);
} catch (err) {
  fail(
    'corrupt-analysis-json',
    `public/analysis.json exists but is not valid JSON: ${err.message}`,
    'A half-written or hand-edited file will crash the app\'s fetch() at runtime and silently break the deck and video numbers, which are pulled from the same file.',
    'npm run snapshot'
  );
  printFailures();
  process.exit(1);
}

// --- Check 3: staleness — analysis.json must be newer than everything it was derived from. ---
const newestSource = SOURCE_DIRS
  .map((d) => newestMtime(path.join(repo, d)))
  .reduce((a, b) => (b.ms > a.ms ? b : a), { ms: 0, file: null });

if (newestSource.ms > analysisStat.mtimeMs) {
  fail(
    'stale-analysis-json',
    `${newestSource.file} was modified after public/analysis.json was generated.`,
    'A stale snapshot silently feeds the app, the deck, and the video from numbers that no longer match the code or the Bob exports — no error, just wrong numbers everywhere at once.',
    'npm run snapshot'
  );
}

// --- Check 4: provenance recorded IN the artifact by snapshot.mjs. ---
const gen = analysis._generatedIn;
if (!gen || typeof gen.isShallowRepo !== 'boolean' || typeof gen.headSha !== 'string' || !gen.headSha || !Number.isInteger(gen.commitCount)) {
  fail(
    'missing-provenance',
    'public/analysis.json has no (or an incomplete) `_generatedIn` block.',
    'Without a recorded { headSha, commitCount, isShallowRepo } this guard cannot tell whether the file was generated in a shallow clone (e.g. a Vercel build) — which silently produces plausible-but-wrong survival numbers with no error. Unknown provenance must be treated as untrusted, not as a pass.',
    'Update tools/snapshot.mjs to write _generatedIn (plan Task 4, Step 2), then run: npm run snapshot'
  );
} else if (gen.isShallowRepo === true) {
  fail(
    'generated-in-shallow-clone',
    `public/analysis.json records isShallowRepo: true (headSha ${gen.headSha.slice(0, 7)}, commitCount ${gen.commitCount}).`,
    'commitForTask and git blame return the oldest fetched commit for every earlier task in a shallow clone — different, plausible, wrong survival numbers, with no error. This is exactly what "build must NEVER run npm run snapshot" exists to prevent.',
    'Re-run from a full clone: git fetch --unshallow (or re-clone), then npm run snapshot'
  );
} else if (gen.commitCount <= 1) {
  fail(
    'suspiciously-shallow-history',
    `_generatedIn.commitCount is ${gen.commitCount}.`,
    "isShallowRepo said false, but a 1-commit history is exactly what Vercel's default shallow fetch (depth 1) produces — trust the commit count over a flag that could itself have been computed wrong.",
    'Re-run from a full clone: git fetch --unshallow (or re-clone), then npm run snapshot'
  );
}

// --- Check 5: the environment running THIS check, right now, must also have full history. ---
try {
  const isShallow = runGit(['rev-parse', '--is-shallow-repository']).trim();
  if (isShallow === 'true') {
    fail(
      'local-repo-is-shallow',
      'The repository this guard is running in is itself a shallow clone.',
      'Anything generated here right now — including a fresh npm run snapshot — inherits the same truncated history and cannot be trusted, even if the committed analysis.json looks fine.',
      'git fetch --unshallow'
    );
  }
} catch (err) {
  fail(
    'git-unavailable',
    `Could not run "git rev-parse --is-shallow-repository" in ${repo}: ${err.message}`,
    'This guard cannot prove the repo has full history. A guard that cannot determine the answer must fail, not pass.',
    'Run this from inside the project git repo, with git installed and on PATH.'
  );
}

// --- Check 6: credentials and the author's username in the committed bytes. ---
// This file goes into a PUBLIC repo. A commit cannot be taken back: a force-push
// clears neither forks nor IBM's scanner, and a hit means the credential is live.
// Runs against analysisRaw (see the note where it is read) so what is scanned is
// what is committed.
const scanUser = currentUser();
try {
  const hits = scanSecrets(analysisRaw);
  if (hits.length) {
    fail(
      'secret-in-analysis-json',
      `public/analysis.json matches ${hits.length} credential pattern(s): ` +
        hits.map((h) => `${h.name} x${h.count} (first at line ${h.line})`).join(', '),
      'This file is committed to a public repo and is built from Bob exports that contain env blocks, source code and diffs. The matched text is deliberately NOT printed here — a hit means the credential is LIVE in your environment.',
      'Open public/analysis.json at that line, revoke the credential, then re-export the session and re-run npm run snapshot. If you have confirmed a false positive: BOB_SCAN_ALLOW=' +
        hits.map((h) => h.name).join(',')
    );
  }
  if (containsUser(analysisRaw, scanUser)) {
    fail(
      'username-in-analysis-json',
      `public/analysis.json still contains the Windows username "${scanUser}".`,
      'Bob exports carry absolute C:\\Users\\<you> paths. redact.mjs replaces them on the way in; if one reached this file, the redaction was skipped or an unredacted export was used as input.',
      'Re-run tools/ritual.mjs for the affected export so it is redacted, then npm run snapshot.'
    );
  }
} catch (err) {
  // Design rule at the top of this file: what cannot be verified is a FAIL.
  fail(
    'secret-scan-unavailable',
    `Could not scan public/analysis.json for credentials: ${err.message}`,
    'A guard that cannot run its own check must not report a pass. Without this scan there is nothing between a leaked token and an irreversible public commit.',
    'Confirm tools/redact.mjs sits next to this file and exports scanSecrets/containsUser/currentUser.'
  );
}

if (failures.length > 0) {
  printFailures();
  process.exit(1);
}

console.log(
  `OK: public/analysis.json is fresh and was generated from full git history ` +
  `(${analysis._generatedIn.commitCount} commits, ${analysis._generatedIn.headSha.slice(0, 7)}).`
);
process.exit(0);
