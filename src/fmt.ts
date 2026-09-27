// Pure formatters and the one derivation every panel shares. Kept out of the
// component files so oxlint's only-export-components rule stays quiet and so
// there is exactly one place that decides how a coin or a token is spelled.

import type { Analysis, ContextBreakdown, Task } from './types';

export const n = (v: number) => v.toLocaleString('en-US');

/** Coins always at six decimals: that is the precision Bob's export carries,
 *  and rounding it is how a forensic page stops being one. */
export const coins = (v: number) => v.toFixed(6);

export const pct = (v: number, dp = 1) => `${(v * 100).toFixed(dp)}%`;

export const shortId = (id: string) => id.slice(0, 8);

/** Human labels for the raw keys in context.breakdown. Anything not listed is
 *  rendered as its own key rather than dropped — an unrecognised bucket is a
 *  real bucket of real tokens, and hiding it would be the one lie this page
 *  cannot afford. */
const LABELS: Record<string, string> = {
  roleDefinition: 'Role definition',
  staticSections: 'Static sections',
  skills: 'Skill definitions',
  baseRules: 'Base rules',
  projectRules: 'Project rules',
  customInstructions: 'Custom instructions',
  environment: 'Environment',
  toolSystemPrompts: 'Tool system prompts',
  toolDefinitions: 'Tool definitions',
  mcpToolDefinitions: 'MCP tool definitions',
};

export const label = (k: string) =>
  LABELS[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());

export type Segment = { key: string; label: string; tokens: number; share: number };

/** breakdown -> descending segments of the itemised window. Non-numeric and
 *  zero buckets are dropped from the bar (a 0-width segment is noise) but the
 *  count of them is reported by the caller so the reader knows they existed. */
export function segments(b: ContextBreakdown | undefined, total: number): Segment[] {
  if (!b || !(total > 0)) return [];
  return Object.entries(b as Record<string, unknown>)
    .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0)
    .map(([key, tokens]) => ({ key, label: label(key), tokens, share: tokens / total }))
    .sort((a, b2) => b2.tokens - a.tokens);
}

export type SkillFacts = {
  /** The session with the largest skills bucket — the headline case. */
  worst: Task;
  worstTokens: number;
  worstShare: number;
  minTokens: number;
  maxTokens: number;
  minShare: number;
  maxShare: number;
  /** How many of the corpus's sessions report an empty loadedSkills array. */
  emptyLoaded: number;
  counted: number;
};

/** THE FINDING, derived rather than asserted. Every number the finding panel
 *  prints comes out of here, and here reads only analysis.json. Returns null
 *  when no session carries a usable skills figure, and the panel then says so
 *  instead of printing a zero. */
export function skillFacts(a: Analysis): SkillFacts | null {
  const rows = a.tasks
    .filter((t) => typeof t.context?.breakdown?.skills === 'number' && t.context.total > 0)
    .map((t) => ({
      t,
      tokens: t.context.breakdown.skills as number,
      share: (t.context.breakdown.skills as number) / t.context.total,
    }));
  if (!rows.length) return null;
  const tokens = rows.map((r) => r.tokens);
  const shares = rows.map((r) => r.share);
  const worst = rows.reduce((m, r) => (r.share > m.share ? r : m), rows[0]);
  return {
    worst: worst.t,
    worstTokens: worst.tokens,
    worstShare: worst.share,
    minTokens: Math.min(...tokens),
    maxTokens: Math.max(...tokens),
    minShare: Math.min(...shares),
    maxShare: Math.max(...shares),
    emptyLoaded: rows.filter((r) => (r.t.context.loadedSkills?.length ?? 0) === 0).length,
    counted: rows.length,
  };
}

/** The task that was paid for code a later commit overwrote. Read off the task
 *  records, NOT off remediations[] — remediations may legitimately be empty and
 *  this beat still has to be tellable. Worst = most coins for the least code. */
export function overwritten(a: Analysis): Task | null {
  const cands = a.tasks.filter((t) => t.overwrittenBy && t.authored > 0 && t.survived < t.authored);
  if (!cands.length) return null;
  return cands.reduce((m, t) => (t.coins > m.coins ? t : m), cands[0]);
}
