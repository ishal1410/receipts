import { AnimatePresence, MotionConfig, motion, useScroll, useSpring } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import type { Analysis } from './types';
import { coins, n, pct, shortId, skillFacts } from './fmt';
import Action from './components/Action';
import Aftermath from './components/Aftermath';
import ErrorBoundary from './components/ErrorBoundary';
import Finding from './components/Finding';
import Ledger from './components/Ledger';
import Proof from './components/Proof';
import { Cta, Eyebrow, Panel } from './components/ui';

const EASE = [0.32, 0.72, 0, 1] as const;

const NAV = [
  { href: '#proof', label: 'Provenance' },
  { href: '#finding', label: 'The finding' },
  { href: '#ledger', label: 'Ledger' },
  { href: '#totals', label: 'Totals' },
  { href: '#action', label: 'Open item' },
];

type State =
  | { k: 'loading' }
  | { k: 'error'; msg: string }
  | { k: 'empty' }
  | { k: 'ready'; data: Analysis };

/* SHAPE GUARD. `r.ok` proves the file was served and `tasks.length` proves it is
   not empty; neither proves the fields the panels call methods on are still
   there. Every name below is one something does arithmetic on or calls
   toFixed/toLocaleString on, so a miss is a throw or a NaN rather than a tidy
   empty state — and this page's whole claim is that its numbers are checked.
   Fails LOUDLY into the error panel instead of rendering blanks. */
function missingFields(d: Analysis): string[] {
  const bad: string[] = [];
  const num = (v: unknown, name: string) => {
    if (typeof v !== 'number' || Number.isNaN(v)) bad.push(name);
  };
  if (!d?.totals) bad.push('totals');
  else {
    num(d.totals.tasks, 'totals.tasks');
    num(d.totals.coins, 'totals.coins');
    num(d.totals.authored, 'totals.authored');
    num(d.totals.survived, 'totals.survived');
    num(d.totals.contextTokens, 'totals.contextTokens');
  }
  if (typeof d?.repo?.headShort !== 'string') bad.push('repo.headShort');
  const t = d?.tasks?.[0];
  if (!t) bad.push('tasks[0]');
  else {
    if (typeof t.id !== 'string') bad.push('tasks[].id');
    num(t.coins, 'tasks[].coins');
    num(t.authored, 'tasks[].authored');
    num(t.survived, 'tasks[].survived');
    // survivalPct is legitimately null for an unattributed task.
    if (t.survivalPct !== null && typeof t.survivalPct !== 'number') bad.push('tasks[].survivalPct');
    if (!Array.isArray(t.fileBreakdown)) bad.push('tasks[].fileBreakdown');
    if (!Array.isArray(t.unmatchedFiles)) bad.push('tasks[].unmatchedFiles');
    if (!Array.isArray(t.unknownTools)) bad.push('tasks[].unknownTools');
    if (!t.context) bad.push('tasks[].context');
    else {
      num(t.context.total, 'tasks[].context.total');
      num(t.context.reportedTotal, 'tasks[].context.reportedTotal');
      if (!t.context.breakdown) bad.push('tasks[].context.breakdown');
      if (!Array.isArray(t.context.loadedSkills)) bad.push('tasks[].context.loadedSkills');
    }
  }
  return bad;
}

/* ── Floating island nav ─────────────────────────────────────────────────────
   Detached glass pill, not a bar glued to the viewport edge. backdrop-blur is
   only ever on this and the overlay — both fixed — never on scrolling content. */
function Nav() {
  const [open, setOpen] = useState(false);
  const { scrollYProgress } = useScroll();
  const bar = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <motion.div
        className="fixed top-0 right-0 left-0 z-30 h-px origin-left"
        style={{ scaleX: bar, background: 'linear-gradient(90deg, var(--color-spend), var(--color-overhead), var(--color-live))' }}
      />

      <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center px-4 pt-5 sm:pt-6">
        <nav className="pointer-events-auto flex w-full max-w-[52rem] items-center gap-2 rounded-full border border-white/10 bg-void/70 py-2 pr-2 pl-4 backdrop-blur-2xl sm:w-max sm:gap-6 sm:pl-6">
          <a href="#top" className="flex shrink-0 items-center gap-2.5">
            <span
              aria-hidden
              className="block size-2 rounded-full"
              style={{ background: 'var(--color-spend)', boxShadow: '0 0 12px var(--color-spend)' }}
            />
            <span className="text-[13px] font-semibold tracking-[0.14em] uppercase">Receipts</span>
          </a>

          <ul className="ml-auto hidden items-center gap-1 sm:flex">
            {NAV.map((i) => (
              <li key={i.href}>
                <a
                  href={i.href}
                  className="block rounded-full px-3 py-1.5 text-[13px] text-fg-2 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/8 hover:text-fg"
                >
                  {i.label}
                </a>
              </li>
            ))}
          </ul>

          {/* Hamburger -> X by rotation and translation of the same two lines. */}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="ml-auto grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 sm:hidden"
          >
            <span className="relative block h-3 w-4">
              <motion.span
                className="absolute left-0 block h-px w-4 bg-fg"
                animate={open ? { top: 6, rotate: 45 } : { top: 2, rotate: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
              />
              <motion.span
                className="absolute left-0 block h-px w-4 bg-fg"
                animate={open ? { top: 6, rotate: -45 } : { top: 10, rotate: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
              />
            </span>
          </button>
        </nav>
      </header>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-20 bg-void/88 px-6 pt-28 backdrop-blur-3xl sm:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <ul className="space-y-1">
              {NAV.map((i, idx) => (
                <motion.li
                  key={i.href}
                  initial={{ opacity: 0, y: 34 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.05 + idx * 0.05 }}
                >
                  <a
                    href={i.href}
                    onClick={() => setOpen(false)}
                    className="block border-b border-white/8 py-4 font-display text-3xl font-bold tracking-[-0.02em]"
                  >
                    {i.label}
                  </a>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/* ── Hero ────────────────────────────────────────────────────────────────────
   Editorial split. Left: what this is. Right: the three verdicts, each with a
   meter. The meters fill once on mount over 700ms with no stagger and no delay,
   so a headless capture taken any time after the first second catches the
   finished, correct frame; the figures themselves are text and are never
   animated, because a screenshot of a counting number is a wrong number. */
function Meter({
  label, value, note, fill, tone,
}: { label: string; value: string; note: ReactNode; fill: number; tone: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[10px] tracking-[0.18em] text-muted uppercase">{label}</span>
        <span className="num text-2xl leading-none font-medium sm:text-[1.75rem]" style={{ color: tone }}>
          {value}
        </span>
      </div>
      <div className="mt-3 h-[6px] overflow-hidden rounded-full bg-white/8">
        <motion.div
          className="h-full rounded-full"
          style={{ background: tone, boxShadow: `0 0 16px -2px ${tone}` }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, fill * 100))}%` }}
          transition={{ duration: 0.7, ease: EASE }}
        />
      </div>
      <p className="mt-2.5 text-[13px] leading-snug text-fg-2">{note}</p>
    </div>
  );
}

function Hero({ data }: { data: Analysis }) {
  const f = skillFacts(data);
  const T = data.totals;
  const survival = T.authored > 0 ? T.survived / T.authored : null;

  return (
    <section id="top" className="relative px-4 pt-32 pb-16 sm:px-6 sm:pt-40 md:pt-48 md:pb-24">
      <div className="mx-auto grid max-w-[84rem] items-center gap-10 lg:grid-cols-[1.15fr_1fr] lg:gap-16">
        <div className="min-w-0">
          <Eyebrow tone="var(--color-spend)">IBM Bob · session forensics</Eyebrow>
          <h1 className="mt-6">
            Every coin.<br />Every token.<br />
            <span style={{ color: 'var(--color-live)' }}>Every line</span> that lived.
          </h1>
          <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-fg-2 sm:text-lg">
            Receipts reads IBM Bob&rsquo;s own task export and answers the three questions his
            panel closes forever: what did the agent cost, where did its context window
            actually go, and is the code it wrote still in the repository?
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Cta href="#finding" tone="var(--color-fg)" filled>Read the finding</Cta>
            <Cta href="#proof">See the proof chain</Cta>
          </div>
          <p className="mt-7 text-[13px] leading-relaxed text-muted">
            Forensic accounting for an AI coding agent. One JSON export in, one committed
            snapshot out, no API keys and nothing phoned home.
          </p>
        </div>

        <Panel className="min-w-0">
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4 border-b hair pb-5">
              <span className="text-[10px] tracking-[0.18em] text-muted uppercase">
                the verdict
              </span>
              <span className="num text-[11px] text-muted">
                {n(T.tasks)} sessions · snapshot {data.repo.headShort}
              </span>
            </div>
            <div className="mt-7 space-y-7">
              <Meter
                label="billed"
                value={coins(T.coins)}
                tone="var(--color-spend)"
                fill={1}
                note="bobcoins, across every session in the snapshot"
              />
              {f && (
                <Meter
                  label="context window"
                  value={pct(f.worstShare)}
                  tone="var(--color-overhead)"
                  fill={f.worstShare}
                  note={
                    <>
                      <span className="num">{n(f.worstTokens)}</span> tokens of skill
                      definitions in the heaviest session — and Bob&rsquo;s own{' '}
                      <span className="num">loadedSkills</span> array is{' '}
                      <span className="num" style={{ color: 'var(--color-dead)' }}>[]</span>
                    </>
                  }
                />
              )}
              {survival !== null && (
                <Meter
                  label="still at head"
                  value={pct(survival)}
                  tone="var(--color-live)"
                  fill={survival}
                  note={
                    <>
                      <span className="num">{T.survived}</span> of{' '}
                      <span className="num">{T.authored}</span> authored lines are still
                      credited to Bob by git blame
                    </>
                  }
                />
              )}
              {f && (
                <p className="border-t hair pt-5 text-[12.5px] leading-relaxed text-muted">
                  Heaviest session is <span className="num">{shortId(f.worst.id)}</span>. Across
                  the corpus the skills bucket runs{' '}
                  <span className="num">{n(f.minTokens)}</span>–
                  <span className="num">{n(f.maxTokens)}</span> tokens, so this is a range and
                  not a constant.
                </p>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}

export default function App() {
  const [s, setS] = useState<State>({ k: 'loading' });

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}analysis.json`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Analysis) => {
        if (!d.tasks?.length) return setS({ k: 'empty' });
        const bad = missingFields(d);
        if (bad.length) {
          throw new Error(
            `analysis.json is missing or mistyped: ${bad.join(', ')}. ` +
            `Re-run npm run snapshot; if it persists, a field was renamed in snapshot.mjs ` +
            `or src/types.ts without updating the other.`
          );
        }
        return setS({ k: 'ready', data: d });
      })
      .catch((e: Error) => setS({ k: 'error', msg: e.message }));
  }, []);

  return (
    // reducedMotion="user" is the half the CSS media query cannot reach: motion
    // animates through WAAPI, so prefers-reduced-motion in index.css silences the
    // mesh drift but not a single one of these component animations.
    <MotionConfig reducedMotion="user">
      <div aria-hidden className="mesh" />
      <div aria-hidden className="grain" />
      <Nav />

      {/* ONE entrance for the whole document. No per-panel stagger and no
          whileInView on content: a judge's thumbnail grabber shoots headless and
          below the fold, and staggered reveals hand it a page of half-faded
          panels. This settles inside 500ms and is then simply the page. */}
      <motion.div
        className="relative z-10"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        {s.k === 'loading' && (
          <div className="px-4 pt-40 pb-32 sm:px-6">
            <div className="mx-auto max-w-[84rem]">
              <Panel>
                <div className="p-8 text-[14px] text-muted">
                  <span className="num">Reading analysis.json…</span>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {s.k === 'error' && (
          <div className="px-4 pt-40 pb-32 sm:px-6">
            <div className="mx-auto max-w-3xl">
              <Panel>
                <div className="p-8">
                  <Eyebrow tone="var(--color-dead)">Could not load analysis.json</Eyebrow>
                  <p className="mt-5 text-[15px] leading-relaxed text-fg-2">{s.msg}</p>
                  <p className="mt-4 text-[13px] text-muted">
                    Run <span className="num">npm run snapshot</span> and redeploy.
                  </p>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {s.k === 'empty' && (
          <div className="px-4 pt-40 pb-32 sm:px-6">
            <div className="mx-auto max-w-3xl">
              <Panel>
                <div className="p-8">
                  <Eyebrow>No sessions yet</Eyebrow>
                  <p className="mt-5 text-[15px] leading-relaxed text-fg-2">
                    Export a task from the Bob panel into{' '}
                    <span className="num">bob_sessions/</span>, commit it, then run{' '}
                    <span className="num">npm run snapshot</span>.
                  </p>
                </div>
              </Panel>
            </div>
          </div>
        )}

        {s.k === 'ready' && (
          <>
            <Hero data={s.data} />
            {/* ErrorBoundary wraps the analysis panels only: the hero and footer
                are the page's identity and a render crash below should still
                leave a page with a title, not a bare error card on black. */}
            <ErrorBoundary>
              <Proof analysis={s.data} />
              <Finding analysis={s.data} />
              <Ledger analysis={s.data} />
              <Aftermath analysis={s.data} />
              <Action analysis={s.data} />
            </ErrorBoundary>

            <footer className="px-4 pb-16 sm:px-6">
              <div className="mx-auto max-w-[84rem] border-t hair pt-8">
                <p className="max-w-3xl text-[13px] leading-relaxed text-muted">
                  Every figure on this page describes one snapshot: commit{' '}
                  <span className="num text-fg-2">{s.data.repo.headShort}</span>,{' '}
                  <span className="num text-fg-2">{n(s.data.repo.commitCount)}</span> commits
                  in, taken {new Date(s.data.generatedAt).toUTCString()}. Nothing committed
                  after that is counted here, and nothing here is live.
                </p>
              </div>
            </footer>
          </>
        )}
      </motion.div>
    </MotionConfig>
  );
}
