import { motion } from 'motion/react';
import type { Analysis } from '../types';

// The headline of the whole page. Everything else on it is supporting evidence.
//
// The number is context.breakdown.skills: the tokens Bob spends describing skills
// to the agent BEFORE the user types anything. context.loadedSkills is the list of
// skills the agent then actually read. When that list is empty, the entire skills
// budget was spent on nothing, every single task.
//
// DO NOT make the claim unconditional. If a future snapshot has a non-empty
// loadedSkills, the condition line below states that instead - the number stays
// true, the accusation does not.

const LABEL: Record<string, string> = {
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

const n = (v: number) => v.toLocaleString('en-US');

export default function Finding({ analysis }: { analysis: Analysis }) {
  const first = analysis.tasks[0];
  const b = first.context.breakdown;
  const total = first.context.total;
  const skills = b.skills ?? 0;
  const share = total > 0 ? (skills / total) * 100 : null;
  const loadedCount = analysis.tasks.reduce((s, t) => s + t.context.loadedSkills.length, 0);

  // ponytail: every task in this snapshot carries an identical breakdown, so ONE
  // chart is the whole story. If a future snapshot diverges, the caption says so
  // rather than quietly averaging two different context windows into one bar.
  const uniform = analysis.tasks.every(
    (t) => t.context.total === total && (t.context.breakdown.skills ?? 0) === skills,
  );

  const rows = Object.entries(b)
    .map(([k, v]) => ({ k, v: v ?? 0 }))
    .filter((r) => r.v > 0)
    .sort((x, y) => y.v - x.v);
  const max = rows[0]?.v || 1;
  const runnerUp = rows.find((r) => r.k !== 'skills')?.v ?? 0;

  return (
    <motion.section
      className="panel grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="p-6 md:p-8">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
          Finding
        </p>

        <p
          className="num num-hero mt-4 leading-[0.9] text-[var(--color-overhead)]"
          style={{ fontSize: 'clamp(3.25rem, 11vw, 5.75rem)' }}
        >
          {n(skills)}
        </p>

        <p className="mt-4 max-w-sm text-lg leading-snug text-[var(--color-text)]">
          tokens of skill definitions were loaded into the context of every task,
          before the user typed a character.
        </p>

        <div className="perf max-w-sm text-sm text-[var(--color-text-2)]">
          {loadedCount === 0 ? (
            <p>
              <span className="num">loadedSkills</span> was empty in{' '}
              {analysis.tasks.length === 1 ? 'the task' : `all ${analysis.tasks.length} tasks`}.
              Not one of those definitions was read.
            </p>
          ) : (
            <p>
              <span className="num">loadedSkills</span> names{' '}
              <span className="num">{loadedCount}</span> skill
              {loadedCount === 1 ? '' : 's'} actually read across{' '}
              <span className="num">{analysis.tasks.length}</span> tasks.
            </p>
          )}
          {share !== null && (
            <p className="mt-3">
              That is{' '}
              <span className="num font-semibold text-[var(--color-overhead)]">
                {share.toFixed(1)}%
              </span>{' '}
              of the <span className="num">{n(total)}</span>-token window Bob itemises
              for a task
              {runnerUp > 0 && (
                <>
                  {' '}
                  and <span className="num">{(skills / runnerUp).toFixed(1)}x</span> the
                  next largest line item
                </>
              )}
              .
            </p>
          )}
        </div>
      </div>

      {/* Ranked composition. ponytail: plain CSS bars, not recharts - eight rows of
          one-dimensional data need an axis, not a rendering library, and this version
          has no grow animation to suppress, no unnamed <svg> to label, and no 150px
          category gutter fighting a 390px viewport. */}
      <div className="border-t border-[var(--color-line)] p-6 md:p-8 lg:border-l lg:border-t-0">
        <h2 className="text-sm font-semibold">
          What filled the context window
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          {uniform
            ? `Itemised by Bob, identical in ${analysis.tasks.length === 1 ? 'the task' : `all ${analysis.tasks.length} tasks`}. Total ${n(total)} tokens.`
            : `Itemised by Bob for task 1 of ${analysis.tasks.length}; other tasks differ. Total ${n(total)} tokens.`}
        </p>

        <ul className="mt-5 space-y-3">
          {rows.map((r) => {
            const isSkills = r.k === 'skills';
            return (
              <li
                key={r.k}
                className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1.5 sm:grid-cols-[9rem_minmax(0,1fr)_4.5rem]"
              >
                <span
                  className={`order-1 text-xs ${
                    isSkills
                      ? 'font-semibold text-[var(--color-text)]'
                      : 'text-[var(--color-muted)]'
                  }`}
                >
                  {LABEL[r.k] ?? r.k}
                </span>
                <span
                  className={`num order-2 text-right text-xs sm:order-3 ${
                    isSkills
                      ? 'font-semibold text-[var(--color-overhead)]'
                      : 'text-[var(--color-text-2)]'
                  }`}
                >
                  {n(r.v)}
                </span>
                <span className="order-3 col-span-2 h-2 self-center sm:order-2 sm:col-span-1">
                  <span
                    className="block h-full"
                    style={{
                      width: `${Math.max((r.v / max) * 100, 0.6)}%`,
                      background: isSkills
                        ? 'var(--color-overhead)'
                        : 'var(--color-line-strong)',
                    }}
                  />
                </span>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 border-t border-[var(--color-line)] pt-3 text-xs leading-relaxed text-[var(--color-muted)]">
          Bob separately reports{' '}
          <span className="num">{n(first.context.reportedTotal)}</span> tokens for this
          task. The itemised lines above sum to{' '}
          <span className="num">{n(total)}</span>. This page charts the itemised
          figure, because that is the one with parts you can name.
        </p>
      </div>
    </motion.section>
  );
}
