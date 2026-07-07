import { Component, type ReactNode } from 'react';
import { reportClientError } from '../lib/client-log';

/**
 * Error boundary around the whole app: a render crash shows THIS panel instead
 * of an unmounted blank page, and the error lands in the bridge log
 * (blank-page skew, 2026-07-07). Class component — React error boundaries
 * have no hook equivalent.
 */
export class CrashBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    reportClientError(
      'error-boundary',
      error.message,
      `${error.stack ?? ''}${info.componentStack ?? ''}`,
    );
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ maxWidth: 720, margin: '10vh auto', padding: 24, fontFamily: 'ui-sans-serif, system-ui' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>The studio crashed while rendering</h1>
        <p style={{ marginTop: 8, fontSize: 13, opacity: 0.8 }}>
          The error was reported to the bridge log (sidebar → Logs, or GET /api/logs). Your
          brainstorm state lives on the server — nothing is lost. Reload to reconnect.
        </p>
        <pre
          style={{
            marginTop: 12,
            padding: 12,
            fontSize: 11,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            border: '1px solid #8884',
            borderRadius: 8,
            maxHeight: '40vh',
            overflow: 'auto',
          }}
        >
          {this.state.error.stack ?? String(this.state.error)}
        </pre>
        <button
          type="button"
          onClick={() => location.reload()}
          style={{
            marginTop: 12,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid #8886',
            cursor: 'pointer',
          }}
        >
          Reload the studio
        </button>
      </div>
    );
  }
}
