import { motion } from 'motion/react';
import type { Task } from '../types';

// SURVIVAL AT n=2. A full-width progress bar that reads 100% twice is a bar chart
// with nothing to compare - two identical green rectangles as the visual climax of
// the page. The unit tally below draws ONE mark PER AUTHORED LINE instead, so the
// mark carries the sample size it is claiming: three lines look like three lines,
// twenty-five look like twenty-five, and a single discarded line is a single coral
// tick rather than a bar that slips from 100% to 96%.
function Tally({ authored, survived }: { authored: number; survived: number }) {
  // ponytail: 120 marks is roughly one wrapped block at 390px. Past that the tally
  // stops being countable and the sentence below carries the whole claim; swap in a
  // grouped tally (tens) if a real session ever authors that much.
  if (authored === 0 || authored > 120) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-[3px]" aria-hidden="true">
      {Array.from({ length: authored }, (_, i) => (
        <span
          key={i}
          className="h-3.5 w-[5px]"
          style={{
            background: i < survived ? 'var(--color-live)' : 'var(--color-dead)',
          }}
        />
      ))}
    </div>
  );
}

export default function TaskTable({ tasks }: { tasks: Task[] }) {
  return (
    <motion.section
      className="panel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="border-b border-[var(--color-line)] px-6 py-4">
        <h2 className="text-sm font-semibold">The ledger</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Every Bob session, joined to the commit it produced and to the lines of that
          commit still present at HEAD.
        </p>
      </div>

      <ul>
        {tasks.map((t) => {
          const dead = t.authored - t.survived;
          return (
            <li
              key={t.id}
              className="border-b border-[var(--color-line)] px-6 py-5 last:border-b-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                {/* Titles are the operator's verbatim prompt and run to a paragraph.
                    Clamped to two lines so the ledger stays a ledger; the full text
                    is still in the DOM and in the title attribute, not thrown away. */}
                <p
                  className="line-clamp-2 max-w-2xl text-sm leading-snug text-[var(--color-text)]"
                  title={t.title}
                >
                  {t.title}
                </p>
                <p className="num text-sm font-semibold text-[var(--color-spend)]">
                  {t.coins.toFixed(6)}
                  <span className="ml-1.5 text-[11px] font-normal uppercase tracking-[0.12em] text-[var(--color-muted)]">
                    bobcoins
                  </span>
                </p>
              </div>

              <p className="mt-1.5 text-xs text-[var(--color-muted)]">
                {t.taskType}
                {t.commit ? (
                  <>
                    {' · commit '}
                    <span
                      className={`num ${t.commit.shared ? 'text-[var(--color-spend)]' : ''}`}
                    >
                      {t.commit.short}
                    </span>
                    {t.commit.shared ? ' (shared with another task)' : ''}
                  </>
                ) : (
                  ' · no commit joined'
                )}
                {t.wroteFiles.length > 0 && (
                  <>
                    {' · '}
                    <span className="num">{t.wroteFiles.join(', ')}</span>
                  </>
                )}
              </p>

              {t.survivalPct === null ? (
                <p className="mt-3 text-xs text-[var(--color-muted)]">
                  Not attributable to a commit, so no line survival is claimed for it.
                </p>
              ) : (
                <>
                  <Tally authored={t.authored} survived={t.survived} />
                  <p className="mt-2 text-xs text-[var(--color-text-2)]">
                    <span className="num font-semibold text-[var(--color-live)]">
                      {t.survived}
                    </span>{' '}
                    of <span className="num">{t.authored}</span> authored lines still at
                    HEAD
                    {dead > 0 && (
                      <>
                        {', '}
                        <span className="num text-[var(--color-dead)]">{dead}</span>{' '}
                        since rewritten
                      </>
                    )}
                    .
                  </p>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
