import { useState, type ReactNode } from 'react';
import type { DiscussionSummary } from '@visual-brainstorm/protocol';
import { compactCount } from '../lib/format';

function ThreadButton({
  thread,
  active,
  onClick,
}: {
  thread: DiscussionSummary;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg px-3 py-2 text-left ${active ? 'bg-accent/15' : 'hover:bg-surface-2'}`}
    >
      <div className="flex items-baseline gap-2">
        <div className="min-w-0 flex-1 truncate text-sm">{thread.title}</div>
        {thread.tokens > 0 && (
          <span className="shrink-0 text-[10px] text-ink-dim">
            {`${compactCount(thread.tokens)} tok`}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-ink-dim">
        {thread.startedAt.slice(0, 10)} · {thread.rounds} round{thread.rounds === 1 ? '' : 's'}
        {thread.artifacts > 0 && ` · ${thread.artifacts} kept`}
      </div>
    </button>
  );
}

/**
 * Left nav: brand block (app identity + New Discussion) above live threads
 * from discussion, plus a top-level Archive section for threads moved
 * to _completed/ by plan-closeout, and a footer (theme, logs) pinned bottom.
 */
export function Sidebar({
  discussions,
  archive,
  liveId,
  selectedId,
  onSelect,
  brand,
  footer,
}: {
  discussions: DiscussionSummary[];
  archive: DiscussionSummary[];
  liveId: string | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** App identity + New Discussion, rendered above the Discussions heading. */
  brand?: ReactNode;
  /** Pinned to the bottom of the nav (theme picker sits bottom right). */
  footer?: ReactNode;
}) {
  const [archiveOpen, setArchiveOpen] = useState(false);
  return (
    <nav className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-surface">
      {brand && <div className="border-b border-line px-4 py-4">{brand}</div>}
      <div className="px-4 pb-2 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-dim">
        Discussions
      </div>
      <div className="scroll-fade flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {liveId && (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
              selectedId === null ? 'bg-accent/15 text-ink' : 'hover:bg-surface-2'
            }`}
          >
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Live session
          </button>
        )}
        {discussions.map((d) => (
          <ThreadButton
            key={d.id}
            thread={d}
            active={selectedId === d.id || (d.id === liveId && selectedId === null)}
            onClick={() => onSelect(d.id === liveId ? null : d.id)}
          />
        ))}
        {discussions.length === 0 && !liveId && (
          <div className="px-3 py-2 text-xs text-ink-dim">No cached threads yet.</div>
        )}

        <button
          type="button"
          onClick={() => setArchiveOpen(!archiveOpen)}
          className="mt-3 flex w-full items-center gap-2 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-ink-dim hover:text-ink"
        >
          <span className={`transition-transform ${archiveOpen ? 'rotate-90' : ''}`}>▸</span>
          Archive ({archive.length})
        </button>
        {archiveOpen &&
          archive.map((d) => (
            <ThreadButton
              key={d.id}
              thread={d}
              active={selectedId === d.id}
              onClick={() => onSelect(d.id)}
            />
          ))}
        {archiveOpen && archive.length === 0 && (
          <div className="px-3 py-1 text-xs text-ink-dim">
            Plan-closeout moves finished threads here.
          </div>
        )}
      </div>
      {footer && <div className="border-t border-line px-3 py-3">{footer}</div>}
    </nav>
  );
}
