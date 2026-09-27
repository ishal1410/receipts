import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { Task } from '../types';
import { repoLabel } from '../types';

// SURVIVAL, DRAWN AT THE SIZE OF ITS SAMPLE. A full-width progress bar that reads
// 100% is a bar chart with nothing to compare. The tally draws ONE mark PER AUTHORED
// LINE, so the mark carries the sample size it claims: three lines look like three
// lines, twenty-five look like twenty-five, and a task a human overwrote is a solid
// coral block you can count. Coral, never red: this is a rework signal, not a
// quality score (deck/deck.css:52-54).
function Tally({ authored, survived }: { authored: number; survived: number }) {
  // ponytail: 120 marks is roughly one wrapped block at 390px. Past that the tally
  // stops being countable and the sentence below carries the claim; swap in a
  // grouped tally (tens) if a real session ever authors that much.
  if (authored === 0 || authored > 120) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-[3px]" aria-hidden="true">
      {Array.from({ length: authored }, (_, i) => (
        <span
          key={i}
          className="h-3.5 w-[5px]"
          style={{ background: i < survived ? 'var(--color-live)' : 'var(--color-dead)' }}
        />
      ))}
    </div>
  );
}

// Radius 0, 1px hairline, one existing token for the ink and the edge. No pills.
function Chip({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className="num inline-block border px-1.5 py-px text-[10px] uppercase tracking-[0.1em]"
      style={{ color: tone ?? 'var(--color-muted)', borderColor: tone ?? 'var(--color-line-strong)' }}
    >
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 text-xs text-[var(--color-text-2)]">{children}</p>
    </div>
  );
}

// THE FAILURES ARE NOT THE SAME FAILURE and the page must not blur them.
//   discarded   - the task reached a commit and a human overwrote the lines. Coral.
//   unjoined    - the task never reached a commit, so survival is UNKNOWN, not zero.
//   no files    - the task wrote no code at all, so there is nothing to survive.
// The last two are muted, never coral: colouring an unknown as a loss is the exact
// dishonesty this panel exists to avoid. snapshot.mjs writes `unattributed` as a
// code, so unknown codes fall through to the generic label rather than printing a
// slug at a judge.
const UNATTRIBUTED: Record<string, { label: string; detail: string }> = {
  'no-matching-commit': {
    label: 'No commit joined',
    detail: 'No commit landed in the join window after this session, so its lines cannot be traced to HEAD.',
  },
  'no-files-written': {
    label: 'No files written',
    detail: 'This session wrote no files, so there is no authored line to trace. It still cost bobcoins.',
  },
};

function verdict(t: Task) {
  if (t.survivalPct === null || !t.commit) {
    const u = t.unattributed ? UNATTRIBUTED[t.unattributed] : undefined;
    return {
      key: 'unjoined',
      label: u?.label ?? 'Not joined to a commit',
      tone: 'var(--color-muted)',
    };
  }
  if (t.authored > 0 && t.survived === 0) {
    return { key: 'discarded', label: 'Discarded', tone: 'var(--color-dead)' };
  }
  if (t.survived < t.authored) {
    return { key: 'partial', label: 'Partly rewritten', tone: 'var(--color-dead)' };
  }
  return { key: 'live', label: 'Live at HEAD', tone: 'var(--color-live)' };
}

export default function TaskTable({ tasks }: { tasks: Task[] }) {
  // A row a human overwrote opens itself. It is the one row whose detail changes what
  // the page means, and a judge who screenshots without clicking still sees it.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      tasks.filter((t) => verdict(t).key === 'discarded').map((t) => [t.id, true]),
    ),
  );

  // Group by repository so the multi-repo corpus reads at a glance. Stable: tasks
  // without a label keep their snapshot order at the end.
  const rows = tasks
    .map((t, i) => ({ t, i, repo: repoLabel(t) }))
    .sort((a, b) =>
      (a.repo ?? '￿').localeCompare(b.repo ?? '￿') || a.i - b.i,
    );
  const repos = new Set(rows.map((r) => r.repo).filter(Boolean));

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
          <span className="num">{tasks.length}</span> Bob session
          {tasks.length === 1 ? '' : 's'}
          {repos.size > 0 && (
            <>
              {' across '}
              <span className="num">{repos.size}</span>
              {repos.size === 1 ? ' repository' : ' repositories'}
            </>
          )}
          , joined to the commit each produced and to the lines of that commit still
          present at HEAD. Open a row for the files, the commit and the line count.
        </p>
      </div>

      <ul>
        {rows.map(({ t, repo }) => {
          const dead = t.authored - t.survived;
          const v = verdict(t);
          const isOpen = !!open[t.id];
          const files = Array.isArray(t.fileBreakdown) ? t.fileBreakdown : [];
          const unmatched = Array.isArray(t.unmatchedFiles) ? t.unmatchedFiles : [];
          return (
            <li
              key={t.id}
              className="border-b border-[var(--color-line)] last:border-b-0"
              style={{
                borderLeft: `2px solid ${
                  v.key === 'discarded' ? 'var(--color-dead)' : 'transparent'
                }`,
              }}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen((o) => ({ ...o, [t.id]: !o[t.id] }))}
                className="block w-full cursor-pointer px-6 py-5 text-left transition-colors duration-150 hover:bg-[var(--color-raised)] active:translate-y-px"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  {/* Titles are the operator's verbatim prompt and run to a paragraph.
                      Clamped to two lines closed, shown in full when the row opens. */}
                  <p
                    className={`max-w-2xl text-sm leading-snug text-[var(--color-text)] ${
                      isOpen ? '' : 'line-clamp-2'
                    }`}
                  >
                    {t.title}
                  </p>
                  {/* Coins turn coral on a discarded row: the money and the loss are
                      the same fact, and reading them in two different inks is what
                      let this row look like every other row. */}
                  <p
                    className="num text-sm font-semibold"
                    style={{
                      color:
                        v.key === 'discarded'
                          ? 'var(--color-dead)'
                          : 'var(--color-spend)',
                    }}
                  >
                    {t.coins.toFixed(6)}
                    <span className="ml-1.5 text-[11px] font-normal uppercase tracking-[0.12em] text-[var(--color-muted)]">
                      bobcoins
                    </span>
                  </p>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-[var(--color-muted)]">
                  {repo && <Chip>{repo}</Chip>}
                  <Chip tone={v.tone}>{v.label}</Chip>
                  <span>{t.taskType}</span>
                  {t.commit ? (
                    <span>
                      {'commit '}
                      <span
                        className={`num ${t.commit.shared ? 'text-[var(--color-spend)]' : ''}`}
                      >
                        {t.commit.short}
                      </span>
                      {t.commit.shared ? ' (shared)' : ''}
                    </span>
                  ) : (
                    <span>no commit joined</span>
                  )}
                  {t.wroteFiles.length > 0 && (
                    <span className="num">{t.wroteFiles.join(', ')}</span>
                  )}
                </div>

                {t.survivalPct === null ? (
                  <p className="mt-3 text-xs text-[var(--color-muted)]">
                    {(t.unattributed && UNATTRIBUTED[t.unattributed]?.detail) ??
                      'Not attributable to a commit, so no line survival is claimed.'}{' '}
                    An unknown, not a zero.
                  </p>
                ) : (
                  <>
                    <Tally authored={t.authored} survived={t.survived} />
                    <p
                      className={
                        v.key === 'discarded'
                          ? 'mt-2 max-w-xl text-sm leading-snug text-[var(--color-text)]'
                          : 'mt-2 text-xs text-[var(--color-text-2)]'
                      }
                    >
                      {t.survived === 0 && t.authored > 0 ? (
                        <>
                          <span className="num font-semibold text-[var(--color-dead)]">
                            {t.coins.toFixed(6)}
                          </span>{' '}
                          bobcoins bought{' '}
                          <span className="num">{t.authored}</span> line
                          {t.authored === 1
                            ? ' of code, and it has since been replaced.'
                            : 's of code, and every one of them has since been replaced.'}{' '}
                          Nothing this session wrote is at HEAD.
                        </>
                      ) : (
                        <>
                          <span className="num font-semibold text-[var(--color-live)]">
                            {t.survived}
                          </span>{' '}
                          of <span className="num">{t.authored}</span> authored lines
                          still at HEAD
                          {dead > 0 && (
                            <>
                              {', '}
                              <span className="num font-semibold text-[var(--color-dead)]">
                                {dead}
                              </span>{' '}
                              since rewritten
                            </>
                          )}
                          .
                        </>
                      )}
                    </p>
                  </>
                )}

                <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  {isOpen ? 'Hide detail' : 'Show detail'}
                </p>
              </button>

              {/* Height animation only on a deliberate click, so nothing is mid-flight
                  in a cold screenshot: every row is either closed or already open when
                  the page settles. */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="detail"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-dashed border-[var(--color-line-strong)] bg-[var(--color-raised)] px-6 py-5">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Commit">
                          {t.commit ? (
                            <span className="num">{t.commit.sha?.slice(0, 12) ?? t.commit.short}</span>
                          ) : (
                            'none joined'
                          )}
                        </Field>
                        <Field label="Context itemised">
                          <span className="num">
                            {(t.context?.total ?? 0).toLocaleString('en-US')}
                          </span>{' '}
                          tokens
                        </Field>
                        <Field label="Skills injected">
                          <span className="num">
                            {(t.context?.breakdown?.skills ?? 0).toLocaleString('en-US')}
                          </span>{' '}
                          tokens,{' '}
                          <span className="num">
                            {t.context?.loadedSkills?.length ?? 0}
                          </span>{' '}
                          read
                        </Field>
                        <Field label="Finished">
                          {t.updatedAt
                            ? new Date(t.updatedAt).toISOString().slice(0, 10)
                            : 'not recorded'}
                        </Field>
                      </div>

                      {files.length > 0 && (
                        <ul className="mt-5 space-y-1.5">
                          {files.map((f) => (
                            <li
                              key={f.file}
                              className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-[var(--color-line)] pb-1.5 last:border-b-0"
                            >
                              <span className="num text-xs text-[var(--color-text-2)]">
                                {f.file}
                              </span>
                              <span
                                className="num text-xs font-semibold"
                                style={{
                                  color:
                                    f.survived === 0 && f.authored > 0
                                      ? 'var(--color-dead)'
                                      : 'var(--color-live)',
                                }}
                              >
                                {f.survived} of {f.authored} lines
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {unmatched.length > 0 && (
                        <p className="mt-4 text-xs text-[var(--color-muted)]">
                          Written but not found in the joined commit:{' '}
                          <span className="num">{unmatched.join(', ')}</span>.
                        </p>
                      )}
                      {t.unattributed && (
                        <p className="mt-4 text-xs text-[var(--color-muted)]">
                          Join result:{' '}
                          <span className="num">{t.unattributed}</span>.{' '}
                          {UNATTRIBUTED[t.unattributed]?.detail ?? ''}
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
