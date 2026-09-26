#!/usr/bin/env node
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  loadSessions, commitLog, attributeTask, git,
} from './lib.mjs';
import { remediations } from './lib.mjs';
// public/analysis.json is COMMITTED to a public repo and is built out of Bob
// exports, which carry env blocks, absolute C:\Users\<you> paths, source code and
// unified diffs. ritual.mjs scans those exports on the way IN; without this,
// nothing ever scanned the file built OUT of them. See the write step below.
import { assertNoSecrets, containsUser, currentUser } from './redact.mjs';

const repo = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const sessionsDir = path.join(repo, 'bob_sessions');
const outFile = path.join(repo, 'public', 'analysis.json');

if (!existsSync(sessionsDir)) {
  console.error(`No bob_sessions/ at ${sessionsDir}`);
  process.exit(1);
}

const entries = loadSessions(sessionsDir);
if (entries.length === 0) {
  console.error('bob_sessions/ contains no *.json exports.');
  process.exit(1);
}

const commits = commitLog(repo);
const head = git(repo, ['rev-parse', 'HEAD']).trim();
// Required so tools/check-snapshot-fresh.mjs can refuse a shallow-clone snapshot
// (a Vercel build) instead of trusting it. See that file for the consumer.
const isShallowRepo = git(repo, ['rev-parse', '--is-shallow-repository']).trim() === 'true';

const tasks = entries.map((entry) => {
  const t = entry.task ?? {};
  const cw = t.costs?.contextWindowBreakdown ?? {};
  const attr = attributeTask(repo, entry, { commits });

  return {
    id: attr.id,
    title: t.title ?? '(untitled task)',
    status: t.status ?? 'unknown',
    taskType: t.taskType ?? 'unknown',
    createdAt: t.createdAt ?? null,
    updatedAt: t.updatedAt ?? null,
    coins: Number(t.costs?.cost ?? 0),
    contextTokens: Number(t.costs?.contextTokens ?? 0),
    wroteFiles: attr.wroteFiles,
    commit: attr.commit ? { ...attr.commit, shared: false } : null,
    authored: attr.authored,
    survived: attr.survived,
    survivalPct: attr.survivalPct,
    fileBreakdown: attr.fileBreakdown,
    unmatchedFiles: attr.unmatchedFiles,
    unattributed: attr.unattributed,
    unknownTools: attr.unknownTools,
    context: {
      total: Number(cw.total ?? 0),
      reportedTotal: Number(cw.reportedTotal ?? 0),
      breakdown: cw.breakdown ?? {},
      loadedSkills: cw.loadedSkills ?? [],
    },
    sourceFile: entry._file,
  };
}).sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));

// Mark commits claimed by more than one task: JOIN #1 is ambiguous there.
const counts = new Map();
for (const t of tasks) if (t.commit) counts.set(t.commit.sha, (counts.get(t.commit.sha) ?? 0) + 1);
for (const t of tasks) if (t.commit && counts.get(t.commit.sha) > 1) t.commit.shared = true;

const analysis = {
  generatedAt: new Date().toISOString(),
  // Provenance block consumed by tools/check-snapshot-fresh.mjs. Do not rename
  // these three fields; the guard reads them by name.
  _generatedIn: { headSha: head, commitCount: commits.length, isShallowRepo },
  repo: { head, headShort: head.slice(0, 7), commitCount: commits.length },
  totals: {
    tasks: tasks.length,
    coins: Number(tasks.reduce((n, t) => n + t.coins, 0).toFixed(6)),
    authored: tasks.reduce((n, t) => n + t.authored, 0),
    survived: tasks.reduce((n, t) => n + t.survived, 0),
    contextTokens: tasks.reduce((n, t) => n + t.contextTokens, 0),
    unattributed: tasks.filter((t) => t.unattributed).length,
  },
  remediations: remediations(tasks),
  tasks,
};

mkdirSync(path.dirname(outFile), { recursive: true });

// Serialise ONCE, scan that exact string, write that exact string. Do not
// re-stringify for the write: a second stringify is a second chance for the bytes
// that reach git to differ from the bytes that were scanned.
const json = JSON.stringify(analysis, null, 2) + '\n';
const user = currentUser();
// Throws, never prints the match — a hit means the credential is LIVE, so the
// correct outcome is a refused write and a human going to revoke it.
assertNoSecrets(json, 'public/analysis.json');
if (containsUser(json, user)) {
  throw new Error(
    `REFUSED: public/analysis.json still contains the Windows username "${user}".\n` +
    `A Bob export reached the pipeline unredacted. Re-run tools/ritual.mjs for that\n` +
    `export so redact.mjs scrubs it, then re-run npm run snapshot.`
  );
}
writeFileSync(outFile, json);

const pct = analysis.totals.authored
  ? ((analysis.totals.survived / analysis.totals.authored) * 100).toFixed(1)
  : 'n/a';
console.log(
  `${tasks.length} tasks | ${analysis.totals.coins} coins | ` +
  `${analysis.totals.survived}/${analysis.totals.authored} lines survive (${pct}%) | ` +
  `${analysis.remediations.length} remediation(s) -> public/analysis.json`
);
