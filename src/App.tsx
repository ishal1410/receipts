import { useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import type { Analysis } from './types';
import Finding from './components/Finding';
import Summary from './components/Summary';
import TaskTable from './components/TaskTable';
import ErrorBoundary from './components/ErrorBoundary';

type State =
  | { k: 'loading' }
  | { k: 'error'; msg: string }
  | { k: 'empty' }
  | { k: 'ready'; data: Analysis };

// SHAPE GUARD. `r.ok` proves the file was served; `tasks?.length` proves it is not
// empty. Neither proves the fields the cards actually read are still there — and
// Tasks 4, 5 AND 9 all write this file's shape, so a field rename at hour 40 passes
// both existing guards and paints a grid of blank or NaN cards instead.
//
// It has to be a guard and not a type: `Analysis` is erased at build time, so the
// only thing standing between a renamed field and `undefined.toFixed(3)` at runtime
// is this function. Every name below is one the components call a METHOD on
// (toFixed / toLocaleString) or divide by, so a miss is a throw or a NaN, never a
// tidy empty state. Keep this list in sync with Summary and TaskTable; if you add a
// card that reads a new field, add it here in the same edit.
//
// Rollback depth here is 1 and the discovery window is the demo itself, so this
// fails LOUDLY into the error panel that already exists rather than rendering.
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
    // survivalPct is legitimately null for an unattributed task, so null passes
    // here — SurvivalBar is the component that handles it.
    if (t.survivalPct !== null && typeof t.survivalPct !== 'number') bad.push('tasks[].survivalPct');
    // Added with the Finding panel, which divides by context.total, calls
    // toLocaleString on context.reportedTotal and reads .length on loadedSkills.
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
    // reducedMotion="user" is the half the CSS media query cannot reach:
    // motion/react animates via WAAPI, so prefers-reduced-motion in index.css
    // silences the pill and the row hover but NOT these panel entrances.
    <MotionConfig reducedMotion="user">
    <div className="min-h-dvh px-4 py-10 sm:px-6 md:px-10">
      <header className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
            IBM Bob session forensics
          </p>
          <h1 className="mt-2">Receipts</h1>
          <p className="mt-2 max-w-md text-sm text-[var(--color-muted)]">
            What the agent spent, what it spent it on, and whether the code it wrote is
            still here.
          </p>
        </div>
        {s.k === 'ready' && (
          <p className="text-xs text-[var(--color-muted)]">
            One snapshot of{' '}
            <span className="num">{s.data.repo.headShort}</span>
          </p>
        )}
      </header>

      {/* ErrorBoundary wraps <main> only: the header and footer are static text and
          cannot throw, and leaving them outside means a render crash still shows a
          page with a title instead of a bare panel on white. */}
      <ErrorBoundary>
      <main className="mx-auto mt-10 max-w-6xl space-y-6">
        {s.k === 'loading' && (
          <div className="panel animate-pulse p-6 text-sm text-[var(--color-muted)]">
            Loading analysis…
          </div>
        )}
        {s.k === 'error' && (
          <div className="panel border-[var(--color-dead)]/40 p-6 text-sm">
            <p className="font-medium text-[var(--color-dead)]">Could not load analysis.json</p>
            <p className="mt-1 text-[var(--color-muted)]">{s.msg}</p>
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              Run <span className="num">npm run snapshot</span> and redeploy.
            </p>
          </div>
        )}
        {s.k === 'empty' && (
          <div className="panel p-6 text-sm text-[var(--color-muted)]">
            No Bob sessions yet. Export a task from the Bob panel into
            <span className="num"> bob_sessions/</span>, commit, then run
            <span className="num"> npm run snapshot</span>.
          </div>
        )}
        {s.k === 'ready' && (
          <>
            <Finding analysis={s.data} />
            <TaskTable tasks={s.data.tasks} />
            <Summary analysis={s.data} />
          </>
        )}
      </main>
      </ErrorBoundary>

      {s.k === 'ready' && (
        // Wording is deliberate: this page renders ONE snapshot file, so it can only
        // ever be as fresh as that file. "Generated <now>" implied the figures track
        // the repository live; they describe the commit named here and nothing after
        // it. Same data, no implied freshness.
        <footer className="mx-auto mt-10 max-w-6xl text-xs leading-relaxed text-[var(--color-muted)]">
          Every figure on this page describes one snapshot: commit{' '}
          <span className="num">{s.data.repo.headShort}</span>,{' '}
          <span className="num">{s.data.repo.commitCount}</span> commits in,
          taken {new Date(s.data.generatedAt).toUTCString()}. Nothing committed after
          that is counted here.
        </footer>
      )}
    </div>
    </MotionConfig>
  );
}
