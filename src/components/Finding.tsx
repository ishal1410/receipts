import { motion } from 'motion/react';
import { useState } from 'react';
import type { Analysis, Task } from '../types';
import { n, pct, segments, shortId, skillFacts, type Segment } from '../fmt';
import { Chip, Eyebrow, Panel, Section, Stat } from './ui';

/* THE FINDING.
   19,009 tokens of skill definitions in a window Bob itemises at 29,977, while
   Bob's own loadedSkills array is empty. Every figure here is derived in
   fmt.skillFacts() from analysis.json — nothing on this panel is typed in.

   The bar is deliberately ONE lit segment against nine dim ones. A ten-colour
   stack is a chart; one colour against grey is an accusation, and this section
   has an accusation to make. */

const EASE = [0.32, 0.72, 0, 1] as const;

/** Grey ramp for the segments that are not the finding. Graded by rank so the
 *  bar still reads as structure rather than as one block of noise. */
const dim = (i: number) => `rgb(255 255 255 / ${Math.max(0.055, 0.2 - i * 0.02).toFixed(3)})`;

function SegBar({
  segs, hover, setHover,
}: { segs: Segment[]; hover: string | null; setHover: (k: string | null) => void }) {
  return (
    <div
      className="flex h-16 w-full gap-[3px] sm:h-24"
      onMouseLeave={() => setHover(null)}
      role="img"
      aria-label={segs.map((s) => `${s.label} ${pct(s.share)}`).join(', ')}
    >
      {segs.map((s, i) => {
        const isSkills = s.key === 'skills';
        const active = hover === s.key;
        return (
          <motion.div
            key={s.key}
            onMouseEnter={() => setHover(s.key)}
            className="relative min-w-[3px] cursor-default overflow-hidden rounded-[5px]"
            style={{
              flexGrow: s.tokens,
              flexBasis: 0,
              background: isSkills
                ? 'linear-gradient(180deg, var(--color-overhead), rgb(111 186 242 / 0.55))'
                : dim(i),
              boxShadow: isSkills ? '0 0 34px -6px rgb(111 186 242 / 0.65)' : undefined,
            }}
            animate={{ opacity: hover && !active ? 0.45 : 1, scaleY: active ? 1.04 : 1 }}
            transition={{ duration: 0.4, ease: EASE }}
          >
            {isSkills && (
              <div className="absolute inset-0 flex flex-col justify-center px-3 sm:px-5">
                <div className="num text-lg leading-none font-semibold text-[#06121D] sm:text-3xl">
                  {pct(s.share)}
                </div>
                <div className="mt-1 hidden text-[10px] font-medium tracking-[0.16em] whitespace-nowrap text-[#06121D]/70 uppercase sm:block">
                  skill definitions
                </div>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}

function Legend({
  segs, hover, setHover, total,
}: { segs: Segment[]; hover: string | null; setHover: (k: string | null) => void; total: number }) {
  return (
    <ul className="divide-y divide-white/6" onMouseLeave={() => setHover(null)}>
      {segs.map((s, i) => {
        const isSkills = s.key === 'skills';
        const active = hover === s.key;
        return (
          <motion.li
            key={s.key}
            onMouseEnter={() => setHover(s.key)}
            animate={{ x: active ? 5 : 0, opacity: hover && !active ? 0.5 : 1 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="flex items-center gap-3 py-2.5"
          >
            <span
              aria-hidden
              className="block size-2.5 shrink-0 rounded-[3px]"
              style={{
                background: isSkills ? 'var(--color-overhead)' : dim(i),
                boxShadow: isSkills ? '0 0 10px rgb(111 186 242 / 0.8)' : undefined,
              }}
            />
            <span className={`min-w-0 flex-1 truncate text-[13px] ${isSkills ? 'font-medium text-fg' : 'text-fg-2'}`}>
              {s.label}
            </span>
            <span className="num shrink-0 text-[13px]" style={isSkills ? { color: 'var(--color-overhead)' } : undefined}>
              {n(s.tokens)}
            </span>
            <span className="num w-14 shrink-0 text-right text-[12px] text-muted">{pct(s.share)}</span>
          </motion.li>
        );
      })}
      <li className="flex items-center gap-3 pt-3 text-[13px]">
        <span className="size-2.5 shrink-0" aria-hidden />
        <span className="flex-1 font-medium">Itemised window</span>
        <span className="num shrink-0">{n(total)}</span>
        <span className="num w-14 shrink-0 text-right text-[12px] text-muted">100%</span>
      </li>
    </ul>
  );
}

export default function Finding({ analysis }: { analysis: Analysis }) {
  const f = skillFacts(analysis);
  const [hover, setHover] = useState<string | null>(null);

  if (!f) {
    return (
      <Section id="finding" eyebrow="The finding" tone="var(--color-overhead)"
               title="No session in this snapshot itemises its context window.">
        <Panel><p className="p-8 text-[15px] text-fg-2">
          Receipts reads the skills figure out of each export's
          {' '}<span className="num">contextWindowBreakdown</span>. No task in
          {' '}<span className="num">analysis.json</span> carries one, so there is nothing to
          report here rather than something to estimate.
        </p></Panel>
      </Section>
    );
  }

  const t: Task = f.worst;
  const segs = segments(t.context.breakdown, t.context.total);
  const unitemised = t.context.reportedTotal - t.context.total;
  const spread = f.maxTokens - f.minTokens;

  return (
    <Section
      id="finding"
      eyebrow="The finding"
      tone="var(--color-overhead)"
      title={<>{pct(f.worstShare)} of the window was spent<br className="hidden sm:block" /> before the operator typed a word.</>}
      lede={
        <>
          Bob itemises what fills his context window. In the heaviest of the{' '}
          <span className="num">{f.counted}</span> sessions measured here,{' '}
          <span className="num text-overhead">{n(f.worstTokens)}</span> of{' '}
          <span className="num">{n(t.context.total)}</span> itemised tokens are skill
          definitions — {pct(f.worstShare)} of the window, paid for on every task, spent
          on instructions before the prompt arrives.
        </>
      }
      wide
    >
      <div className="grid gap-5 lg:grid-cols-12">
        {/* ── The bar. col-span-8, the largest thing on the page after the hero. */}
        <Panel className="lg:col-span-8">
          <div className="flex h-full flex-col p-5 sm:p-7 md:p-9">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h3>The itemised context window</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted">
                  Session <span className="num">{shortId(t.id)}</span> ·{' '}
                  <span className="num">{n(t.context.total)}</span> tokens itemised. Hover a
                  band.
                </p>
              </div>
              <Chip tone="var(--color-overhead)">{n(t.context.total)} itemised</Chip>
            </div>

            <div className="mt-7">
              <SegBar segs={segs} hover={hover} setHover={setHover} />
            </div>

            {/* The readout under the bar changes on hover; it never disappears,
                so a still frame always carries a true caption. */}
            <div className="mt-5 flex min-h-[3.25rem] flex-wrap items-baseline gap-x-3 gap-y-1 border-t hair pt-4">
              {(() => {
                const s = segs.find((x) => x.key === hover) ?? segs.find((x) => x.key === 'skills') ?? segs[0];
                if (!s) return null;
                const lit = s.key === 'skills';
                return (
                  <>
                    <span className="num text-2xl leading-none font-medium"
                          style={{ color: lit ? 'var(--color-overhead)' : 'var(--color-fg)' }}>
                      {n(s.tokens)}
                    </span>
                    <span className="text-[15px] text-fg-2">tokens · {s.label}</span>
                    <span className="num text-[13px] text-muted">{pct(s.share, 2)} of the itemised window</span>
                  </>
                );
              })()}
            </div>

            {/* Same hover state as the bar, both directions: the legend is the
                bar's axis labels, moved somewhere they can be read. */}
            <div className="mt-6 border-t hair pt-4">
              <Legend segs={segs} hover={hover} setHover={setHover} total={t.context.total} />
            </div>

            <p className="mt-6 text-[13px] leading-relaxed text-muted">
              Bob reported <span className="num">{n(t.context.reportedTotal)}</span> tokens for
              this session and itemised <span className="num">{n(t.context.total)}</span> of
              them. Every share above is of the itemised part; Receipts does not know what
              the other <span className="num">{n(unitemised)}</span> were, so it does not say.
            </p>
          </div>
        </Panel>

        {/* ── Evidence column. Three stacked cards, the bento's short side. */}
        <div className="grid gap-5 lg:col-span-4">
          <Panel size="sm">
            <div className="p-5 sm:p-7">
              <Eyebrow tone="var(--color-dead)">loadedSkills is empty</Eyebrow>
              <p className="mt-4 text-[15px] leading-relaxed text-fg-2">
                The same object that carries the skills token count also carries a{' '}
                <span className="num">loadedSkills</span> array. In{' '}
                <span className="num text-fg">{f.emptyLoaded}</span> of{' '}
                <span className="num text-fg">{f.counted}</span> sessions it is empty:
              </p>
              <pre className="num mt-4 overflow-x-auto rounded-lg border hair bg-raised p-3.5 text-[12.5px] leading-relaxed">
                <span className="text-muted">"skills"</span>
                <span className="text-fg-2">: </span>
                <span className="text-overhead">{n(f.worstTokens)}</span>
                <span className="text-fg-2">,</span>{'\n'}
                <span className="text-muted">"loadedSkills"</span>
                <span className="text-fg-2">: </span>
                <span className="text-dead">[]</span>
              </pre>
              <p className="mt-3.5 text-[13px] leading-relaxed text-muted">
                Both lines come from the same object in the same export.
              </p>
            </div>
          </Panel>

          <Panel size="sm">
            <div className="p-5 sm:p-7">
              <Eyebrow>Across the corpus</Eyebrow>
              <div className="mt-4 grid grid-cols-2 gap-5">
                <Stat value={n(f.minTokens)} label="lightest session" tone="var(--color-fg-2)" />
                <Stat value={n(f.maxTokens)} label="heaviest session" tone="var(--color-overhead)" />
              </div>
              <p className="mt-5 text-[13px] leading-relaxed text-muted">
                {spread === 0 ? (
                  <>
                    Every one of the <span className="num">{f.counted}</span> sessions measured
                    reports the same figure.
                  </>
                ) : (
                  <>
                    A spread of <span className="num">{n(spread)}</span> tokens across{' '}
                    <span className="num">{f.counted}</span> sessions, or{' '}
                    <span className="num">{pct(f.minShare)}</span>–
                    <span className="num">{pct(f.maxShare)}</span> of each itemised window. It
                    is not a constant, so Receipts reports the range rather than an average
                    dressed up as one.
                  </>
                )}
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </Section>
  );
}
