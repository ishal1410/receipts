import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Eyebrow, Panel } from './ui';

// Renders the SAME card App.tsx uses for a failed fetch. One error style in the
// product, not two — a judge cannot tell a render crash from a network failure,
// and does not need to.
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { err: Error | null }
> {
  state = { err: null as Error | null };

  static getDerivedStateFromError(err: Error) {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    // The only place this is ever recorded. No Sentry, no telemetry — nothing in
    // this product phones home — so the console is the log.
    console.error('render error:', err, info.componentStack);
  }

  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <Panel>
            <div className="p-8">
              <Eyebrow tone="var(--color-dead)">A panel failed to render</Eyebrow>
              <p className="mt-5 text-[15px] leading-relaxed text-fg-2">{this.state.err.message}</p>
              <p className="mt-4 text-[13px] text-muted">
                The analysis loaded but one panel could not draw it. Reload; if it persists,
                run <span className="num">npm run snapshot</span> and check the console.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    );
  }
}
