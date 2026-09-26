import { motion } from 'motion/react';
import type { Task } from '../types';

function SurvivalBar({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-[var(--color-muted)]">no code</span>;
  const p = Math.round(pct * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden bg-[var(--color-line)]">
        <div className="h-full"
             style={{ width: `${p}%`,
                      background: p >= 50 ? 'var(--color-live)' : 'var(--color-dead)' }} />
      </div>
      <span className="num text-xs">{p}%</span>
    </div>
  );
}

export default function TaskTable({ tasks }: { tasks: Task[] }) {
  return (
    <motion.section className="panel overflow-hidden"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.2 }}>
      <div className="border-b border-[var(--color-line)] px-5 py-4">
        <h2 className="text-sm font-semibold">Tasks</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Every Bob session, joined to the commit it produced.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
              <th className="px-5 py-3 font-medium">Task</th>
              <th className="px-5 py-3 font-medium">Commit</th>
              <th className="px-5 py-3 text-right font-medium">Coins</th>
              <th className="px-5 py-3 text-right font-medium">Lines</th>
              <th className="px-5 py-3 font-medium">Survives to HEAD</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-t border-[var(--color-line)]/60">
                <td className="max-w-[22rem] px-5 py-3">
                  <p className="truncate">{t.title}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {t.taskType} · {t.wroteFiles.length} file(s)
                  </p>
                </td>
                <td className="num px-5 py-3 text-xs">
                  {t.commit
                    ? <span className={t.commit.shared ? 'text-[var(--color-spend)]' : ''}>
                        {t.commit.short}{t.commit.shared ? ' shared' : ''}
                      </span>
                    : <span className="text-[var(--color-muted)]">none</span>}
                </td>
                <td className="num px-5 py-3 text-right">{t.coins.toFixed(4)}</td>
                <td className="num px-5 py-3 text-right">{t.authored}</td>
                <td className="px-5 py-3"><SurvivalBar pct={t.survivalPct} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}
