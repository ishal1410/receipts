import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { repoLabel, type Analysis, type Task } from '../types';
import { coins, n, pct, shortId } from '../fmt';
import { Chip, Panel, Section } from './ui';

/* THE LEDGER. Six Bob tasks across three workspaces, each joined to the commit
   it produced and to how many of that commit's lines are still at HEAD.
   Collapsed, a row is one sentence of accounting. Expanded, it is the evidence
   for that sentence: the files, the commit, the window, and — where Receipts
   could not join a task to a commit — the reason, stated, rather than a zero
   left to be read as "wrote nothing". */

const EASE = [0.32, 0.72, 0, 1] as const;

const WHY: Record<string, string> = {
  'no-matching-commit':
    'Bob reported writing these files, but no commit in this repository contains those changes. Nothing can be credited to this task, and nothing is.',
  'no-files-written':
    'Bob was paid for this session and reported writing no files at all. There is no code to trace.',
};

type Filter = 'all' | 'unpaid' | 'alive';

const FILTERS: { k: Filter; label: string }[] = [
  { k: 'all', label: 'All sessions' },
  { k: 'unpaid', label: 'Nothing survives' },
  { k: 'alive', label: 'Code still at HEAD' },
];

/** One grid, declared once, so the header row and every body row cannot drift
 *  apart. Phone: title + chevron, figures on their own line. Desktop: a ledger. */
const GRID = 'grid-cols-[minmax(0,1fr)_2.5rem] md:grid-cols-[minmax(0,1fr)_9rem_10rem_2.5rem]';

const keep = (t: Task, f: Filter) =>
  f === 'all' ? true : f === 'alive' ? t.survived > 0 : t.survived === 0;

/** survived/authored as a lit bar. authored === 0 is not 0% — it is "no
 *  denominator", and the bar is replaced by the reason instead of drawn empty. */
function Survival({ t }: { t: Task }) {
  if (t.authored === 0) {
    return <Chip tone="var(--color-muted)">not attributed</Chip>;
  }
  const share = t.survived / t.authored;
  const tone = share === 1 ? 'var(--color-live)' : share === 0 ? 'var(--color-dead)' : 'var(--color-spend)';
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/8 sm:w-24">
        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: tone, boxShadow: `0 0 12px -2px ${tone}` }} />
      </div>
      <span className="num shrink-0 text-[13px]" style={{ color: tone }}>
        {t.survived}/{t.authored}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] tracking-[0.16em] text-muted uppercase">{label}</div>
      <div className="mt-1.5 text-[13.5px] leading-relaxed text-fg-2">{children}</div>
    </div>
  );
}

function Row({ t, open, onToggle }: { t: Task; open: boolean; onToggle: () => void }) {
  const ws = repoLabel(t);
  const dead = t.survived === 0 && t.authored > 0;

  return (
    <motion.li
      className="relative"
      animate={{ backgroundColor: open ? 'rgb(255 255 255 / 0.028)' : 'rgb(255 255 255 / 0)' }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <motion.button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        whileHover={{ x: 4 }}
        transition={{ duration: 0.4, ease: EASE }}
        className={`group grid w-full items-center gap-x-5 gap-y-3.5 px-5 py-5 text-left sm:px-7 ${GRID}`}
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {ws && <Chip>{ws}</Chip>}
            <span className="num text-[11px] text-muted">{shortId(t.id)}</span>
            {dead && <Chip tone="var(--color-dead)">overwritten</Chip>}
          </div>
          <p className="mt-2 line-clamp-2 text-[14.5px] leading-snug text-fg">{t.title}</p>
        </div>

        {/* md:contents drops this wrapper out of the layout on desktop so the
            two figures land in their own ledger columns; on a phone it keeps
            them as one row under the title instead of two stacked ones. */}
        <div className="col-span-2 flex items-center justify-between gap-4 md:contents">
          <div className="num text-[15px] md:col-start-2 md:row-start-1 md:justify-self-end"
               style={{ color: 'var(--color-spend)' }}>
            {coins(t.coins)}
          </div>
          <div className="md:col-start-3 md:row-start-1 md:justify-self-end">
            <Survival t={t} />
          </div>
        </div>

        <span
          aria-hidden
          className="col-start-2 row-start-1 grid size-8 shrink-0 place-items-center justify-self-end rounded-full border hair bg-white/4 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] md:col-start-4"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          <svg viewBox="0 0 16 16" className="size-3.5 text-fg-2" fill="none">
            <path d="m4 6.2 4 4 4-4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="grid gap-6 border-t hair px-5 py-6 sm:px-7 md:grid-cols-3">
              <div className="space-y-5">
                <Field label="Commit">
                  {t.commit ? (
                    <>
                      <span className="num text-fg">{t.commit.short}</span>{' '}
                      <span className="num text-[12px] break-all text-muted">{t.commit.sha}</span>
                    </>
                  ) : (
                    'No commit in this repository matches this session.'
                  )}
                </Field>
                {t.overwrittenBy && (
                  <Field label="Overwritten by">
                    <span className="num" style={{ color: 'var(--color-dead)' }}>{t.overwrittenBy.short}</span>{' '}
                    <span className="text-fg-2">{t.overwrittenBy.subject}</span>
                  </Field>
                )}
                <Field label="Export">
                  <span className="num text-[12px] break-all">{t.sourceFile}</span>
                </Field>
              </div>

              <div className="space-y-5">
                <Field label="Lines by file">
                  {t.fileBreakdown.length ? (
                    <ul className="space-y-2.5">
                      {t.fileBreakdown.map((f) => {
                        const sh = f.authored > 0 ? f.survived / f.authored : 0;
                        const tone = sh === 1 ? 'var(--color-live)' : sh === 0 ? 'var(--color-dead)' : 'var(--color-spend)';
                        return (
                          <li key={f.file}>
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="num min-w-0 truncate text-[12.5px] text-fg">{f.file}</span>
                              <span className="num shrink-0 text-[12.5px]" style={{ color: tone }}>
                                {f.survived}/{f.authored}
                              </span>
                            </div>
                            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/8">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ background: tone }}
                                initial={{ width: 0 }}
                                animate={{ width: `${sh * 100}%` }}
                                transition={{ duration: 0.6, ease: EASE, delay: 0.1 }}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : t.unattributed ? (
                    <span>{WHY[t.unattributed] ?? t.unattributed}</span>
                  ) : (
                    <span>No file-level breakdown in this snapshot.</span>
                  )}
                </Field>
                {t.unmatchedFiles.length > 0 && (
                  <Field label="Reported written, not found in any commit">
                    <span className="num text-[12.5px]">{t.unmatchedFiles.join(', ')}</span>
                  </Field>
                )}
              </div>

              <div className="space-y-5">
                <Field label="Context window">
                  <div className="space-y-1.5">
                    <div className="flex justify-between gap-3">
                      <span>Bob reported</span>
                      <span className="num text-fg">{n(t.context.reportedTotal)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Itemised</span>
                      <span className="num text-fg">{n(t.context.total)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Skill definitions</span>
                      <span className="num" style={{ color: 'var(--color-overhead)' }}>
                        {typeof t.context.breakdown.skills === 'number'
                          ? `${n(t.context.breakdown.skills)} · ${pct(t.context.breakdown.skills / t.context.total)}`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Skills Bob loaded</span>
                      <span className="num" style={{ color: t.context.loadedSkills.length ? 'var(--color-fg)' : 'var(--color-dead)' }}>
                        {t.context.loadedSkills.length || '[]'}
                      </span>
                    </div>
                  </div>
                </Field>
                {t.unknownTools.length > 0 && (
                  <Field label={`Tool calls Receipts could not classify (${t.unknownTools.length})`}>
                    <span className="num text-[12.5px]">
                      {t.unknownTools.map((u) => u.name).join(', ')}
                    </span>{' '}
                    — counted as spend, not as authorship.
                  </Field>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}

export default function Ledger({ analysis }: { analysis: Analysis }) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const rows = analysis.tasks.filter((t) => keep(t, filter));
  const ws = analysis.workspaces?.length
    ? analysis.workspaces
    : [...new Set(analysis.tasks.map(repoLabel).filter((x): x is string => !!x))];

  return (
    <Section
      id="ledger"
      eyebrow="The ledger"
      tone="var(--color-spend)"
      title={<>Every session, joined to the commit it produced.</>}
      lede={
        <>
          <span className="num">{analysis.tasks.length}</span> tasks across{' '}
          <span className="num">{ws.length}</span> workspaces. For each one: what Bob
          charged, which commit carries the work, and how many of those lines
          <span className="text-fg"> git blame still attributes to it at HEAD</span>. Open a
          row for the evidence.
        </>
      }
    >
      {/* Filter. The sliding pill is one layoutId, not four transitions. */}
      <div className="mb-5 flex flex-wrap items-center gap-1.5 rounded-full border hair bg-white/3 p-1.5 w-fit">
        {FILTERS.map((f) => (
          <button
            key={f.k}
            type="button"
            onClick={() => setFilter(f.k)}
            className="relative rounded-full px-3.5 py-1.5 text-[12.5px] font-medium whitespace-nowrap"
            style={{ color: filter === f.k ? 'var(--color-void)' : 'var(--color-fg-2)' }}
          >
            {filter === f.k && (
              <motion.span
                layoutId="ledger-filter"
                className="absolute inset-0 rounded-full bg-fg"
                transition={{ duration: 0.4, ease: EASE }}
              />
            )}
            <span className="relative">{f.label}</span>
          </button>
        ))}
      </div>

      <Panel>
        <div className={`hidden w-full items-center gap-x-5 border-b hair px-7 py-3.5 text-[10px] tracking-[0.16em] text-muted uppercase md:grid ${GRID}`}>
          <span>Session</span>
          <span className="justify-self-end">Bobcoins</span>
          <span className="justify-self-end">Lines at HEAD</span>
          <span />
        </div>
        {rows.length ? (
          <ul className="divide-y divide-white/6">
            {rows.map((t) => (
              <Row key={t.id} t={t} open={open === t.id} onToggle={() => setOpen(open === t.id ? null : t.id)} />
            ))}
          </ul>
        ) : (
          <p className="p-8 text-[14px] text-muted">No session in this snapshot matches that filter.</p>
        )}
      </Panel>
    </Section>
  );
}
