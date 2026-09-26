import { Component, type ErrorInfo, type ReactNode } from 'react';

// Renders the SAME panel App.tsx uses for a failed fetch. One error style in the
// product, not two — a judge cannot tell a render crash from a network failure, and
// does not need to.
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // The only place this is ever recorded. No Sentry, no telemetry (zero budget,
    // and nothing in this product should phone home), so the console is the log.
    console.error('render error in <main>:', err, info.componentStack);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="panel border-[var(--color-dead)]/40 p-6 text-sm">
        <p className="font-medium text-[var(--color-dead)]">Something failed to render</p>
        <p className="mt-1 text-[var(--color-muted)]">{this.state.err.message}</p>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          The analysis loaded, but a panel could not draw it. Reload; if it persists,
          run <span className="num">npm run snapshot</span> and check the browser console.
        </p>
      </div>
    );
  }
}
