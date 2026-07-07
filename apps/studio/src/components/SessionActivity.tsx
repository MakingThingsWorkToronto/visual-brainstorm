import { useState } from 'react';
import type { ProgressEvent } from '@visual-brainstorm/protocol';

/** HH:MM:SS in local time; honest dashes for an unparseable timestamp. */
function eventTime(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? '--:--:--' : date.toTimeString().slice(0, 8);
}

/**
 * Session activity strip — real progress events from the working Claude
 * session, streamed over the bridge. Collapsed: the latest note + a count.
 * Expanded: the full recent tail, newest last.
 */
export function SessionActivity({ events }: { events: ProgressEvent[] }) {
  const [open, setOpen] = useState(false);
  if (events.length === 0) return null;
  const latest = events[events.length - 1];
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
        {!open && <span className="min-w-0 flex-1 truncate text-ink-dim">{latest.note}</span>}
        <span className="ml-auto shrink-0 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] text-ink-dim">
          {events.length}
        </span>
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
