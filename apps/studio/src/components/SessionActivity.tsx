import { useState } from 'react';
import type { ProgressEvent } from '@visual-brainstorm/protocol';
import { compactCount } from '../lib/format';

/** HH:MM:SS in local time; honest dashes for an unparseable timestamp. */
function eventTime(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '--:--:--' : date.toTimeString().slice(0, 8);
}

/**
 * Session activity strip — real progress events from the working Claude
 * session, streamed over the bridge. Collapsed: the latest note + a count
 * (and the thread's cumulative token meter, when known). Expanded: the
 * full recent tail, newest last.
 */
export function SessionActivity({
  events,
  tokens,
}: {
  events: ProgressEvent[];
  /** Cumulative input/output token totals for the live thread. */
  tokens?: { input: number; output: number };
}) {
  const [open, setOpen] = useState(false);
  const totalTokens = tokens ? tokens.input + tokens.output : 0;
  // Tokens can be known even before any live event arrives (reloaded thread):
  // the meter must not hide behind an empty activity tail.
  if (events.length === 0 && totalTokens === 0) return null;
  const latest = events.length > 0 ? events[events.length - 1] : null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={open ? 'Collapse the activity list' : 'Expand the recent activity list'}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-ink-dim">
          Session activity
        </span>
        {!open && latest && (
          <span className="min-w-0 flex-1 truncate text-ink-dim">{latest.note}</span>
        )}
        <span className="ml-auto shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] text-ink-dim">
          {events.length}
        </span>
        {totalTokens > 0 && (
          <span className="shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] text-ink-dim">
            {`Σ ${compactCount(totalTokens)} tok`}
          </span>
        )}
        <span className="shrink-0 text-ink-dim">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
          {events.map((event, i) => (
            <li key={`${event.at}-${i}`} className="flex items-baseline gap-2">
              <span className="shrink-0 font-mono text-[10px] text-ink-dim">{eventTime(event.at)}</span>
              <span className="shrink-0 rounded-full border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-dim">
                {event.source}
              </span>
              <span className="min-w-0 flex-1 break-words">{event.note}</span>
              {event.tokens && (
                <span className="shrink-0 text-[10px] text-ink-dim">
                  +{event.tokens.input + event.tokens.output} tok
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
