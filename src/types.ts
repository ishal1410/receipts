// The shape of public/analysis.json. That file is the only input this front end
// has and its shape is fixed — this is a description of it, never a wish.
//
// Optionality here is load-bearing, not defensive padding: anything marked `?`
// is a field an older snapshot can legitimately lack, and every consumer of one
// omits its element rather than printing a zero. `Analysis` is erased at build
// time, so App's runtime guard, not this file, is what stands between a renamed
// field and `undefined.toFixed(6)`.

export type FileSurvival = { file: string; authored: number; survived: number };

export type ContextBreakdown = {
  roleDefinition?: number; staticSections?: number; skills?: number;
  baseRules?: number; projectRules?: number; customInstructions?: number;
  environment?: number; toolSystemPrompts?: number; toolDefinitions?: number;
  mcpToolDefinitions?: number;
};

export type Commit = { sha: string; short: string; timeMs: number; shared: boolean };

export type Task = {
  id: string; title: string; status: string; taskType: string;
  createdAt: number | null; updatedAt: number | null;
  coins: number; contextTokens: number;
  wroteFiles: string[];
  commit: Commit | null;
  /** Set when a later commit owns, at HEAD, the lines this task wrote. */
  overwrittenBy?: { sha: string; short: string; subject: string } | null;
  authored: number; survived: number; survivalPct: number | null;
  fileBreakdown: FileSurvival[];
  unmatchedFiles: string[]; unattributed: string | null;
  unknownTools: { name: string; reason: string }[];
  context: { total: number; reportedTotal: number;
             breakdown: ContextBreakdown; loadedSkills: string[] };
  sourceFile: string;
  /** Read ONLY through repoLabel(): a missing, renamed or object-shaped value
   *  has to degrade to "no chip", never to "[object Object]" on a live URL. */
  workspace?: unknown;
  repo?: unknown;
};

/** "file:c:\…\bobtest" or "bobtest" -> "bobtest". Anything that is not a
 *  non-empty string returns null and the caller omits the chip. */
export function repoLabel(t: { workspace?: unknown; repo?: unknown }): string | null {
  const raw = t.workspace ?? t.repo;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const parts = raw.replace(/^file:\/*/i, '').split(/[\\/]+/).filter(Boolean);
  const last = parts[parts.length - 1];
  return last ? decodeURIComponent(last) : null;
}

/** One object per unpaid-for-itself finding. `prompt` is the literal text an
 *  operator pastes back into Bob; nothing on this page ever sends it. */
export type Remediation = {
  id: string;
  rule: string;
  taskId: string;
  workspace: string;
  file: string;
  coins: number;
  authored: number;
  survived: number;
  title: string;
  detail: string;
  action: string;
  prompt: string;
};

export type Analysis = {
  generatedAt: string;
  repo: { head: string; headShort: string; commitCount: number };
  workspaces?: string[];
  totals: { tasks: number; coins: number; authored: number;
            survived: number; contextTokens: number; unattributed?: number;
            discardedWork?: number; discardedCoins?: number };
  remediations?: Remediation[];
  tasks: Task[];
};
