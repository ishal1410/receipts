import { motion } from 'motion/react';
import { repoLabel, type Analysis } from '../types';
import { coins, n, overwritten, pct, shortId } from '../fmt';
import { Chip, Eyebrow, Panel, Section, Stat } from './ui';

/* THE DEATH, then THE TOTALS.
   The death beat is read off the task records and not off remediations[] —
   remediations may legitimately be empty and this still has to be tellable.
   The totals are read off totals.*, with the two optional fields recomputed
   from the tasks when an older snapshot lacks them, so a tile is never blank
   and never a guess. */

const EASE = [0.32, 0.72, 0, 1] as const;

/** One square per authored line: lit green if git blame still credits it to
 *  Bob at HEAD, coral if it does not. 29 squares is a number a reader can
 *  actually count, which is the entire argument for drawing it this way. */
function LineDots({ authored, survived }: { authored: number; survived: number }) {
  if (authored <= 0 || authored > 400) return null;
  return (
    <div className="flex flex-wrap gap-[5px]" aria-hidden>
      {Array.from({ length: authored }, (_, i) => {
        const alive = i < survived;
        return (
          <motion.span
            key={i}
            whileHover={{ scale: 1.55 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="block size-[13px] rounded-[3px]"
            style={{
              background: alive ? 'var(--color-live)' : 'var(--color-dead)',
              boxShadow: alive
                ? '0 0 10px -2px rgb(63 221 155 / 0.7)'
                : '0 0 14px -1px rgb(255 127 96 / 0.9)',
            }}
          />
        );
      })}
    </div>
  );
}

export default function Aftermath({ analysis }: { analysis: Analysis }) {
  const dead = overwritten(analysis);
  const T = analysis.totals;

  // Optional by contract. Recomputed rather than omitted, because the two
  // figures are derivable from the tasks that are always present.
  const discardedTasks = analysis.tasks.filter((t) => t.authored > 0 && t.survived === 0);
  const discardedWork = T.discardedWork ?? discardedTasks.length;
  const discardedCoins = T.discardedCoins ?? discardedTasks.reduce((s, t) => s + t.coins, 0);
  const survivalShare = T.authored > 0 ? T.survived / T.authored : null;
  const wsCount = analysis.workspaces?.length
    ?? new Set(analysis.tasks.map(repoLabel).filter(Boolean)).size;

  return (
    <>
      {dead && (
        <Section
          id="death"
          eyebrow="Paid for, then deleted"
          tone="var(--color-dead)"
          title={<>{coins(dead.coins)} bought one line.<br className="hidden sm:block" /> A human deleted it one commit later.</>}
          lede={
            <>
              This is the case Receipts exists to find. Bob was charged, Bob delivered, the
              work landed in a commit — and by the time anyone looked at{' '}
              <span className="text-fg">HEAD</span>, git blame credited none of it to him.
            </>
          }
          wide
        >
          <div className="grid gap-5 lg:grid-cols-12">
            <Panel className="lg:col-span-7">
              <div className="relative overflow-hidden p-6 sm:p-9 md:p-11">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -top-28 -right-24 size-72 rounded-full"
                  style={{ background: 'radial-gradient(circle, rgb(255 127 96 / 0.22), transparent 70%)' }}
                />
                <div className="relative">
                  {/* Tighter than .num's default: IBM Plex Mono gives the
                      decimal point a full advance, which at 88px reads as a
                      space in the middle of the number. */}
                  <div
                    className="num text-6xl leading-none font-semibold sm:text-7xl md:text-[5.5rem]"
                    // Inline, not a tracking-* utility: .num sets letter-spacing
                    // itself and is declared after Tailwind, so it would win.
                    style={{ color: 'var(--color-dead)', letterSpacing: '-0.05em' }}
                  >
                    {coins(dead.coins)}
                  </div>
                  <div className="mt-3.5 text-[11px] tracking-[0.18em] text-muted">
                    <span className="uppercase">bobcoins · session</span>{' '}
                    <span className="num tracking-normal">{shortId(dead.id)}</span>
                  </div>

                  <p className="mt-8 max-w-xl text-[15px] leading-relaxed text-fg-2">
                    “{dead.title}”
                  </p>

                  {/* Two commits, one line of code, one direction of travel. */}
                  <ol className="mt-9 space-y-0">
                    <li className="flex gap-4">
                      {/* The rule between the two commits is the beat: one
                          direction of travel, green into coral. */}
                      <div className="flex shrink-0 flex-col items-center self-stretch pt-1.5">
                        <span className="block size-3 shrink-0 rounded-full"
                              style={{ background: 'var(--color-live)', boxShadow: '0 0 12px rgb(63 221 155 / 0.8)' }} />
                        <span aria-hidden className="mt-1.5 w-px flex-1"
                              style={{ background: 'linear-gradient(180deg, rgb(63 221 155 / 0.55), rgb(255 127 96 / 0.55))' }} />
                      </div>
                      <div className="min-w-0 pb-7">
                        <div className="num text-[14px] text-fg">
                          {dead.commit?.short ?? '—'}
                        </div>
                        <div className="mt-1 text-[13.5px] text-fg-2">
                          Bob adds <span className="num text-fg">{dead.authored}</span>{' '}
                          {dead.authored === 1 ? 'line' : 'lines'}
                          {dead.fileBreakdown[0] ? <> to <span className="num text-fg">{dead.fileBreakdown[0].file}</span></> : null}.
                        </div>
                      </div>
                    </li>
                    <li className="flex gap-4">
                      <span className="mt-1.5 block size-3 shrink-0 rounded-full"
                            style={{ background: 'var(--color-dead)', boxShadow: '0 0 14px rgb(255 127 96 / 0.9)' }} />
                      <div className="min-w-0">
                        <div className="num text-[14px]" style={{ color: 'var(--color-dead)' }}>
                          {dead.overwrittenBy?.short}
                        </div>
                        <div className="mt-1 text-[13.5px] text-fg-2">
                          “{dead.overwrittenBy?.subject}” — owns that code now. git blame at
                          HEAD attributes{' '}
                          <span className="num" style={{ color: 'var(--color-dead)' }}>
                            {dead.survived} of {dead.authored}
                          </span>{' '}
                          to Bob.
                        </div>
                      </div>
                    </li>
                  </ol>
                </div>
              </div>
            </Panel>

            <div className="grid gap-5 lg:col-span-5">
              <Panel size="sm">
                <div className="p-6 sm:p-7">
                  <Eyebrow tone="var(--color-dead)">What it cost per surviving line</Eyebrow>
                  <p className="mt-5 text-[15px] leading-relaxed text-fg-2">
                    There is no denominator. The session produced{' '}
                    <span className="num text-fg">{dead.authored}</span> authored{' '}
                    {dead.authored === 1 ? 'line' : 'lines'} and{' '}
                    <span className="num" style={{ color: 'var(--color-dead)' }}>{dead.survived}</span>{' '}
                    surviving ones, so the cost per surviving line is undefined rather than
                    large. Receipts prints the two numbers and refuses to divide by zero for
                    effect.
                  </p>
                </div>
              </Panel>
              <Panel size="sm">
                <div className="p-6 sm:p-7">
                  <Eyebrow>Where Receipts looked</Eyebrow>
                  <dl className="mt-5 space-y-3 text-[13.5px]">
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">Workspace</dt>
                      <dd className="num text-fg">{repoLabel(dead) ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">Commit that added it</dt>
                      <dd className="num text-fg">{dead.commit?.short ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">Commit that owns it</dt>
                      <dd className="num" style={{ color: 'var(--color-dead)' }}>{dead.overwrittenBy?.short}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted">Snapshot HEAD</dt>
                      <dd className="num text-fg">{analysis.repo.headShort}</dd>
                    </div>
                  </dl>
                </div>
              </Panel>
            </div>
          </div>
        </Section>
      )}

      <Section
        id="totals"
        eyebrow="The totals"
        tone="var(--color-live)"
        title={<>What the agent cost, and what is left of it.</>}
        lede={<>Six sessions, one number each, all of them read out of the same snapshot.</>}
        wide
      >
        <div className="grid gap-5 lg:grid-cols-12">
          <Panel className="lg:col-span-7">
            <div className="p-6 sm:p-9">
              <div className="flex flex-wrap items-end justify-between gap-6">
                <Stat value={coins(T.coins)} label="bobcoins billed, all sessions" tone="var(--color-spend)" size="xl" />
                {survivalShare !== null && (
                  <Stat value={pct(survivalShare)} label="of authored lines still at HEAD" tone="var(--color-live)" size="lg" />
                )}
              </div>

              <div className="mt-9 border-t hair pt-7">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-[11px] tracking-[0.16em] text-muted uppercase">
                    every authored line, one square
                  </span>
                  <span className="num text-[13px]">
                    <span style={{ color: 'var(--color-live)' }}>{T.survived} alive</span>
                    <span className="text-muted"> · </span>
                    <span style={{ color: 'var(--color-dead)' }}>{T.authored - T.survived} gone</span>
                  </span>
                </div>
                <div className="mt-4">
                  <LineDots authored={T.authored} survived={T.survived} />
                </div>
              </div>
            </div>
          </Panel>

          <div className="grid gap-5 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-2">
            <Panel size="sm">
              <div className="p-5 sm:p-6">
                <Stat value={n(T.tasks)} label="sessions measured" sub={<>across <span className="num">{wsCount}</span> workspaces</>} />
              </div>
            </Panel>
            <Panel size="sm">
              <div className="p-5 sm:p-6">
                <Stat value={n(T.contextTokens)} label="context tokens billed" tone="var(--color-overhead)" />
              </div>
            </Panel>
            <Panel size="sm">
              <div className="p-5 sm:p-6">
                <Stat
                  value={coins(discardedCoins)}
                  label="paid for code now gone"
                  tone="var(--color-dead)"
                  sub={<><span className="num">{discardedWork}</span> {discardedWork === 1 ? 'session' : 'sessions'}</>}
                />
              </div>
            </Panel>
            <Panel size="sm">
              <div className="p-5 sm:p-6">
                <Stat
                  value={typeof T.unattributed === 'number' ? n(T.unattributed) : '—'}
                  label="sessions with no traceable commit"
                  sub="charged, but not joinable to git"
                />
              </div>
            </Panel>
            <div className="sm:col-span-2">
              <Chip tone="var(--color-muted)">
                snapshot {analysis.repo.headShort} · {analysis.repo.commitCount} commits
              </Chip>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
