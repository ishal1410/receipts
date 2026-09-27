import { useState } from 'react';
import { motion } from 'motion/react';
import type { Analysis, Task } from '../types';

// The headline of the whole page. Everything else on it is supporting evidence.
//
// POSTURE, decided after decoding IBM's own extension.js: breakdown.skills is
// tokens(systemPrompt.skills) + sum(loadedSkills), so an empty loadedSkills means
// the whole catalog was injected unconditionally. That is BY DESIGN, not a bug, and
// the copy below says so. The page is not an indictment of the IDE; it is the panel
// that reads a measurement the IDE already takes and then throws away. Flattering
// about the instrumentation, factual about the number.
//
// DO NOT make the claim unconditional. If a future snapshot has a non-empty
// loadedSkills, the condition line states that instead; the number stays true.

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

// No new hues: the four greys below are existing tokens, ordered so that adjacent
// segments of the strip never share one. Skills always takes --color-overhead.
const GREYS = [
  'var(--color-line-strong)',
  'var(--color-muted)',
  'var(--color-line)',
  'var(--color-text-2)',
];

const n = (v: number) => v.toLocaleString('en-US');

export default function Finding({ analysis }: { analysis: Analysis }) {
  // The segment the operator is pointing at. Null means "show the largest line",
  // so the readout is never blank and a screenshot still carries the finding.
  const [active, setActive] = useState<string | null>(null);

  const tasks = analysis.tasks;
  const skillsOf = (t: Task) => t.context.breakdown.skills ?? 0;

  // ponytail: one chart, not six. If every task itemises the same window, one is the
  // whole story; if they diverge, chart the LARGEST and say which task it is rather
  // than averaging different context windows into one misleading bar.
  const uniform = tasks.every(
    (t) => t.context.total === tasks[0].context.total && skillsOf(t) === skillsOf(tasks[0]),
  );
  const lead = uniform
    ? tasks[0]
    : tasks.reduce((a, t) => (skillsOf(t) > skillsOf(a) ? t : a), tasks[0]);

  const b = lead.context.breakdown;
  const total = lead.context.total;
  const skills = skillsOf(lead);
  const share = total > 0 ? (skills / total) * 100 : null;
  const loadedCount = tasks.reduce((s, t) => s + t.context.loadedSkills.length, 0);
  const lo = Math.min(...tasks.map(skillsOf));
  const hi = Math.max(...tasks.map(skillsOf));

  const rows = Object.entries(b)
    .map(([k, v]) => ({ k, v: v ?? 0 }))
    .filter((r) => r.v > 0)
    .sort((x, y) => y.v - x.v);
  const max = rows[0]?.v || 1;
  const runnerUp = rows.find((r) => r.k !== 'skills')?.v ?? 0;
  const cur = rows.find((r) => r.k === active) ?? rows[0];
  const tone = (k: string, i: number) =>
    k === 'skills' ? 'var(--color-overhead)' : GREYS[i % GREYS.length];

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

        {/* Reveal, not a count-up: tabular figures that tick are unreadable and land
            mid-roll in a thumbnail. Transform and opacity only, no delay, so the
            still frame a judge grabs is always the finished state. */}
        <motion.p
          className="num num-hero mt-4 leading-[0.9] text-[var(--color-overhead)]"
          style={{ fontSize: 'clamp(3.25rem, 11vw, 5.75rem)' }}
          initial={{ opacity: 0, y: 10, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {n(skills)}
        </motion.p>

        <p className="mt-4 max-w-sm text-lg leading-snug text-[var(--color-text)]">
          {uniform
            ? 'tokens of skill definitions entered the context of every task, before the operator typed a character.'
            : 'tokens of skill definitions entered this task’s context before the operator typed a character.'}
        </p>

        <div className="perf max-w-sm space-y-3 text-sm text-[var(--color-text-2)]">
          {loadedCount === 0 ? (
            <p>
              <span className="num">loadedSkills</span> was empty in{' '}
              {tasks.length === 1 ? 'the task' : `all ${tasks.length} tasks`}. The
              catalog ships whole either way:{' '}
              <span className="num">breakdown.skills</span> is the skills section of
              the system prompt plus whatever a task loads, so a task that loads
              nothing still carries the shelf. That is the design, not a defect.
            </p>
          ) : (
            <p>
              <span className="num">loadedSkills</span> names{' '}
              <span className="num">{loadedCount}</span> skill
              {loadedCount === 1 ? '' : 's'} actually read across{' '}
              <span className="num">{tasks.length}</span> tasks. The rest of the
              catalog shipped anyway.
            </p>
          )}
          {share !== null && (
            <p>
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
              {!uniform && (
                <>
                  . Across the corpus the same line runs{' '}
                  <span className="num">{n(lo)}</span> to{' '}
                  <span className="num">{n(hi)}</span>
                </>
              )}
              .
            </p>
          )}
          <p className="text-[var(--color-muted)]">
            Bob counts all of this to the token, on every task, and then closes the
            session without showing it. Receipts is the panel that reads it back.
          </p>
        </div>
      </div>

      {/* WHERE THE WINDOW WENT. One task's context window drawn as a single object,
          to scale, then itemised under it. ponytail: plain flex segments and CSS
          bars, not recharts - eight one-dimensional values need an axis, not a
          rendering library, and this version has no unnamed <svg> to label and no
          150px category gutter fighting a 390px viewport. Hover, focus and tap all
          drive the same `active` state, so a keyboard and a thumb see what a mouse
          sees, and the readout defaults to the largest line so nothing is hidden
          behind a hover. */}
      <div className="border-t border-[var(--color-line)] p-6 md:p-8 lg:border-l lg:border-t-0">
        <h2 className="text-sm font-semibold">Where the window went</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          {uniform
            ? `Itemised by Bob, identical in ${tasks.length === 1 ? 'the task' : `all ${tasks.length} tasks`}. Total ${n(total)} tokens.`
            : `Itemised by Bob for the largest of ${tasks.length} tasks. Total ${n(total)} tokens.`}
        </p>

        <div
          className="mt-4 flex h-9 w-full overflow-hidden border border-[var(--color-line-strong)]"
          onMouseLeave={() => setActive(null)}
        >
          {rows.map((r, i) => (
            <button
              key={r.k}
              type="button"
              aria-label={`${LABEL[r.k] ?? r.k}, ${n(r.v)} tokens`}
              aria-pressed={cur.k === r.k}
              onMouseEnter={() => setActive(r.k)}
              onFocus={() => setActive(r.k)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(r.k)}
              className="h-full cursor-pointer border-r border-[var(--color-surface)] transition-[opacity,filter] duration-150 last:border-r-0"
              style={{
                flexGrow: r.v,
                flexBasis: 0,
                minWidth: 3,
                background: tone(r.k, i),
                opacity: cur.k === r.k ? 1 : 0.55,
              }}
            />
          ))}
        </div>

        {/* Live readout. Always populated, so this reads correctly in a still. */}
        <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-semibold text-[var(--color-text)]">
            {LABEL[cur.k] ?? cur.k}
          </span>
          <span className="num text-[var(--color-text-2)]">{n(cur.v)} tokens</span>
          <span className="num text-[var(--color-muted)]">
            {total > 0 ? `${((cur.v / total) * 100).toFixed(1)}% of the window` : ''}
          </span>
        </p>

        <ul className="mt-4 space-y-1">
          {rows.map((r, i) => {
            const on = cur.k === r.k;
            const isSkills = r.k === 'skills';
            return (
              <li key={r.k}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(r.k)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(r.k)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(r.k)}
                  className="grid w-full cursor-pointer grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1.5 px-1.5 py-1 text-left transition-colors duration-150 active:translate-y-px sm:grid-cols-[9rem_minmax(0,1fr)_4.5rem]"
                  style={{ background: on ? 'var(--color-raised)' : 'transparent' }}
                >
                  <span
                    className={`order-1 text-xs ${
                      isSkills || on
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
                      className="block h-full transition-opacity duration-150"
                      style={{
                        width: `${Math.max((r.v / max) * 100, 0.6)}%`,
                        background: tone(r.k, i),
                        opacity: on ? 1 : 0.7,
                      }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="mt-5 border-t border-[var(--color-line)] pt-3 text-xs leading-relaxed text-[var(--color-muted)]">
          Bob separately reports{' '}
          <span className="num">{n(lead.context.reportedTotal)}</span> tokens for this
          task. The itemised lines above sum to{' '}
          <span className="num">{n(total)}</span>. This page charts the itemised
          figure, because that is the one with parts you can name.
        </p>
      </div>
    </motion.section>
  );
}
