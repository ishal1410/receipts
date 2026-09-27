export type FileSurvival = { file: string; authored: number; survived: number };

export type ContextBreakdown = {
  roleDefinition?: number; staticSections?: number; skills?: number;
  baseRules?: number; projectRules?: number; customInstructions?: number;
  environment?: number; toolSystemPrompts?: number; toolDefinitions?: number;
  mcpToolDefinitions?: number;
};

export type Task = {
  id: string; title: string; status: string; taskType: string;
  createdAt: number | null; updatedAt: number | null;
  coins: number; contextTokens: number;
  wroteFiles: string[];
  commit: { sha: string; short: string; timeMs: number; shared: boolean } | null;
  authored: number; survived: number; survivalPct: number | null;
  fileBreakdown: FileSurvival[];
  unmatchedFiles: string[]; unattributed: string | null;
  unknownTools: { name: string; reason: string }[];
  context: { total: number; reportedTotal: number;
             breakdown: ContextBreakdown; loadedSkills: string[] };
  sourceFile: string;
  // OPTIONAL BY CONTRACT. The corpus is being merged from three repositories and
  // snapshot.mjs is the writer; until it lands, neither field exists. Both are read
  // ONLY through repoLabel() below, which returns null for anything that is not a
  // non-empty string, so a missing, renamed or object-shaped field degrades to "no
  // chip" instead of "[object Object]" on the public URL. This is why neither name
  // appears in App's missingFields(): absent is a legal state here, not a defect.
  workspace?: unknown;
  repo?: unknown;
};

// "file:c:\Users\USER\bobtest" -> "bobtest". The exports spell the workspace as a
// file: URL with backslashes (tools/lib.mjs:54), so strip the scheme and take the
// last path segment. Anything unexpected returns null and the caller omits the chip.
export function repoLabel(t: Task): string | null {
  const raw = t.workspace ?? t.repo;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const parts = raw.replace(/^file:\/*/i, '').split(/[\\/]+/).filter(Boolean);
  const last = parts[parts.length - 1];
  return last ? decodeURIComponent(last) : null;
}

// WAS WRONG UNTIL THE RULE ENGINE LANDED. This declared `severity: number` and
// `evidence: string[]`; the objects tools/lib.mjs actually writes have neither, and
// carry six fields this did not name. Nothing caught it because the only consumer
// read `.length` off the array, so TypeScript was never asked about a member. Now
// that the fields are rendered, the shape has to be the real one.
//
// Read off public/analysis.json, 12 fields:
export type Remediation = {
  id: string;          // "R2-d0259633": rule id joined to the task's short id
  rule: string;        // "R2"
  taskId: string;
  workspace: string;
  file: string;        // workspace-prefixed, e.g. "bobtest/calc.py"
  coins: number;
  authored: number;
  survived: number;
  title: string;       // written to be read first, one line
  detail: string;      // the evidence, naming the commit that owns the code now
  action: string;      // the one-line fix
  prompt: string;      // the multi-sentence text an operator pastes into Bob
};

export type Analysis = {
  generatedAt: string;
  repo: { head: string; headShort: string; commitCount: number };
  totals: { tasks: number; coins: number; authored: number;
            survived: number; contextTokens: number; unattributed?: number;
            // Written by snapshot.mjs alongside the merged corpus. Optional because
            // an older snapshot.json has neither; Summary recomputes from tasks when
            // the field is absent, so the tile is never blank and never a guess.
            discardedWork?: number; discardedCoins?: number };
  remediations: Remediation[];
  tasks: Task[];
};
