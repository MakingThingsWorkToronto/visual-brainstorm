/**
 * Client-error observability: every uncaught error, unhandled rejection, and
 * error-boundary catch is POSTed to the bridge, which writes it to the same
 * FileLog ring served at GET /api/logs. A blank page must never be evidence-free
 * again (blank-page skew, 2026-07-07).
 *
 * Fire-and-forget: an old bridge without /api/client-log (or no bridge at all)
 * must never cascade — failures are swallowed.
 */

const LIMIT = 20;
let sent = 0;
const seen = new Set<string>();

export function reportClientError(source: string, message: string, stack?: string): void {
  const key = `${source}:${message}`;
  if (sent >= LIMIT || seen.has(key)) return;
  seen.add(key);
  sent += 1;
  try {
    void fetch('/api/client-log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source, message: message.slice(0, 4000), stack: stack?.slice(0, 8000) }),
    }).catch(() => {});
  } catch {
    /* reporting must never throw */
  }
}

/** Wire the global hooks once, at module scope of the entrypoint. */
export function installClientErrorReporting(): void {
  window.addEventListener('error', (event) => {
    reportClientError(
      'window.onerror',
      event.message ?? String(event.error ?? 'unknown error'),
      event.error instanceof Error ? event.error.stack : `${event.filename}:${event.lineno}:${event.colno}`,
    );
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportClientError(
      'unhandledrejection',
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? reason.stack : undefined,
    );
  });
}
