import { motion } from 'motion/react';
import type { Analysis } from '../types';

function Stat({ label, value, sub, i }:
  { label: string; value: string; sub?: string; i: number }) {
  return (
    <motion.div className="panel p-5"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: i * 0.05 }}>
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">{label}</p>
      <p className="num mt-2 text-3xl font-semibold">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--color-muted)]">{sub}</p>}
    </motion.div>
  );
}

export default function Summary({ analysis }: { analysis: Analysis }) {
  const { totals } = analysis;
  // NEVER fall back to 0 here. A total join failure (every task unattributed) would
  // render "Code surviving 0.0%" - a confident, plausible, WRONG headline number on
  // the public URL, which is the one measured claim this whole entry rests on. An
  // unknown must look unknown. Show the unattributed count beside it so the gap is
  // visible rather than silently priced as failure.
  const pct = totals.authored > 0 ? (totals.survived / totals.authored) * 100 : null;
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat i={0} label="Bob tasks"      value={String(totals.tasks)} />
      <Stat i={1} label="Bobcoins spent" value={totals.coins.toFixed(3)}
            sub={`${(totals.coins / Math.max(totals.tasks, 1)).toFixed(3)} per task`} />
      <Stat i={2} label="Code surviving"
            value={pct === null ? '—' : `${pct.toFixed(1)}%`}
            sub={pct === null
              ? `no task joined a commit (${totals.unattributed ?? totals.tasks} unattributed)`
              : `${totals.survived} of ${totals.authored} lines at ${analysis.repo.headShort}`} />
      <Stat i={3} label="Context tokens" value={totals.contextTokens.toLocaleString()} />
    </section>
  );
}
