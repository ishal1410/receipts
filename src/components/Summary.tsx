import { motion } from 'motion/react';
import type { Analysis } from '../types';
import { repoLabel } from '../types';

// THE RECEIPT TOTAL. This used to be four stat tiles at the top of the page, one of
// which ("Context tokens 96,335") summed context.reportedTotal across tasks, a figure
// with no denominator that means nothing on its own. The share of the window that
// skills ate is the number that means something, and it leads the page in Finding.
// What is left here is what a receipt prints at the bottom: the totals, once, under
// a tear line.

function Line({ label, value, sub, tone }: {
  label: string; value: string; sub?: React.ReactNode; tone?: string;
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
  const { totals, remediations, tasks } = analysis;
  // NEVER fall back to 0 here. A total join failure (every task unattributed) would
  // render "0.0%", a confident, plausible, WRONG headline on the public URL, which is
  // the one measured claim this entry rests on. An unknown must look unknown.
  const pct = totals.authored > 0 ? (totals.survived / totals.authored) * 100 : null;
  const deadLines = Math.max(totals.authored - totals.survived, 0);
  const unjoined = totals.unattributed ?? tasks.filter((t) => t.survivalPct === null).length;
  // Coins a human then overwrote. Only tasks that reached a commit and kept nothing
  // count: an unjoined task is an unknown, and pricing an unknown as waste is the
  // dishonesty this panel exists to avoid.
  const burned =
    typeof totals.discardedCoins === 'number' && !Number.isNaN(totals.discardedCoins)
      ? totals.discardedCoins
      : tasks
          .filter((t) => t.survivalPct !== null && t.authored > 0 && t.survived === 0)
          .reduce((s, t) => s + t.coins, 0);
  const repos = new Set(tasks.map(repoLabel).filter(Boolean)).size;

  return (
    <motion.section
      className="panel p-6 md:p-8"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h2 className="text-sm font-semibold">Total</h2>
      <div
        className={`mt-5 grid gap-6 sm:grid-cols-2 ${
          burned > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
        }`}
      >
        <Line
          label="Bob tasks"
          value={String(totals.tasks)}
          sub={repos > 0 ? `across ${repos} ${repos === 1 ? 'repository' : 'repositories'}` : undefined}
        />
        <Line
          label="Bobcoins spent"
          value={totals.coins.toFixed(6)}
          tone="var(--color-spend)"
          sub={`${(totals.coins / Math.max(totals.tasks, 1)).toFixed(6)} per task`}
        />
        <Line
          label="Lines still at HEAD"
          value={pct === null ? 'not known' : `${totals.survived} of ${totals.authored}`}
          tone={pct === null ? undefined : 'var(--color-live)'}
          sub={
            pct === null
              ? `no task joined a commit (${unjoined} unattributed)`
              : (
                <>
                  <span className="num">{pct.toFixed(1)}%</span> at{' '}
                  <span className="num">{analysis.repo.headShort}</span>
                  {deadLines > 0 && (
                    <>
                      {', '}
                      <span className="num text-[var(--color-dead)]">{deadLines}</span>{' '}
                      overwritten
                    </>
                  )}
                </>
              )
          }
        />
        {burned > 0 && (
          <Line
            label="Spent on discarded code"
            value={burned.toFixed(6)}
            tone="var(--color-dead)"
            sub="bobcoins billed for lines a human later replaced"
          />
        )}
      </div>

      {/* remediations may legitimately be empty and that is a result, not a missing
          card. Say it in a sentence; do not invent a card to fill. */}
      <p className="perf text-xs leading-relaxed text-[var(--color-muted)]">
        {remediations.length > 0
          ? `${remediations.length} remediation${remediations.length === 1 ? '' : 's'} raised.`
          : deadLines === 0 && unjoined === 0
            ? 'No remediations raised: nothing this agent wrote has been discarded, and no task failed to join a commit.'
            : [
                deadLines > 0 &&
                  `${deadLines} authored line${deadLines === 1 ? ' reached a commit and was' : 's reached a commit and were'} later replaced by a human.`,
                unjoined > 0 &&
                  `${unjoined} task${unjoined === 1 ? '' : 's'} never joined a commit, so their survival is unknown rather than zero.`,
              ]
                .filter(Boolean)
                .join(' ')}
      </p>
    </motion.section>
  );
}
