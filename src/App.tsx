export default function App() {
  return (
    <div className="min-h-dvh px-6 py-10 md:px-10">
      <header className="mx-auto max-w-6xl">
        <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--color-muted)]">
          IBM Bob session forensics
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Receipts</h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)]">
          What the agent spent, and whether the code it wrote is still here.
        </p>
      </header>
      <main className="mx-auto mt-10 max-w-6xl">
        <div className="panel p-6 text-sm text-[var(--color-muted)]">
          Waiting for analysis.json
        </div>
      </main>
    </div>
  );
}
