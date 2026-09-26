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
};

export type Remediation = {
  id: string; severity: number; title: string; detail: string;
  action: string; evidence: string[];
};

export type Analysis = {
  generatedAt: string;
  repo: { head: string; headShort: string; commitCount: number };
  totals: { tasks: number; coins: number; authored: number;
            survived: number; contextTokens: number; unattributed?: number };
  remediations: Remediation[];
  tasks: Task[];
};
