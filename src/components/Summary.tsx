import { motion } from 'motion/react';
import type { Analysis } from '../types';

// THE RECEIPT TOTAL. This used to be four stat tiles at the top of the page, one of
// which ("Context tokens 96,335") summed context.reportedTotal across tasks - a
// figure with no denominator that means nothing on its own. The share of the window
// that skills ate is the number that means something, and it now leads the page in
// Finding. What is left here is what a receipt actually prints at the bottom:
// the totals, once, under a tear line.

function Line({ label, value, sub, tone }: {
  label: string; value: string; sub?: string; tone?: string;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
        {label}
      </p>
      <p className="num num-hero mt-1.5 text-2xl" style={tone ? { color: tone } : undefined}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-[var(--color-muted)]">{sub}</p>}
    </div>
  );
}

export default function Summary({ analysis }: { analysis: Analysis }) {
  const { totals, remediations } = analysis;
  // NEVER fall back to 0 here. A total join failure (every task unattributed) would
  // render "0.0%" - a confident, plausible, WRONG headline number on the public URL,
  // which is the one measured claim this whole entry rests on. An unknown must look
  // unknown. Show the unattributed count beside it so the gap is visible rather than
  // silently priced as failure.
  const pct = totals.authored > 0 ? (totals.survived / totals.authored) * 100 : null;
  return (
    <motion.section
      className="panel p-6 md:p-8"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h2 className="text-sm font-semibold">Total</h2>
      <div className="mt-5 grid gap-6 sm:grid-cols-3">
        <Line label="Bob tasks" value={String(totals.tasks)} />
        <Line
          label="Bobcoins spent"
          value={totals.coins.toFixed(6)}
          tone="var(--color-spend)"
          sub={`${(totals.coins / Math.max(totals.tasks, 1)).toFixed(6)} per task`}
        />
        <Line
          label="Lines still at HEAD"
          value={pct === null ? '—' : `${totals.survived} of ${totals.authored}`}
          tone={pct === null ? undefined : 'var(--color-live)'}
          sub={
            pct === null
              ? `no task joined a commit (${totals.unattributed ?? totals.tasks} unattributed)`
              : `${pct.toFixed(1)}% at ${analysis.repo.headShort}`
          }
        />
      </div>

      {/* remediations is an empty array in this snapshot and that is a result, not a
          missing card. Say it in a sentence; do not invent a card to fill. */}
      <p className="perf text-xs text-[var(--color-muted)]">
        {remediations.length === 0
          ? 'No remediations raised: nothing this agent wrote has been discarded, and no task failed to join a commit.'
          : `${remediations.length} remediation${remediations.length === 1 ? '' : 's'} raised.`}
      </p>
    </motion.section>
  );
}
