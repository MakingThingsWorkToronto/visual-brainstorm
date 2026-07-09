import { useEffect, useRef, useState } from 'react';
import type { ArtifactChatMessage } from '@visual-brainstorm/protocol';
import { BodyPortal, SvgPane } from './primitives';

/**
 * The chat half of the fullscreen dock — message list + simplified composer
 * (ONE input, ONE Send). Read-only (no composer) when onSend is absent, e.g. a
 * reloaded dialog on a completed thread.
 */
export function ChatSection({
  messages,
  busy = false,
  onSend,
  emptyHint,
  autoFocus = false,
}: {
  messages: ArtifactChatMessage[];
  busy?: boolean;
  onSend?: (text: string) => void;
  emptyHint: string;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState('');
  // Honest pending (rule 6): a reply comes from a LIVE brainstorm orchestrator
  // (run-brainstorm handles the artifact-chat detour). If none is engaged the
  // message is recorded + queued but nothing answers — so after a short wait we
  // stop claiming "Claude is thinking…" and tell the truth instead of spinning
  // a lie forever.
  const [waited, setWaited] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, busy]);

  useEffect(() => {
    if (!busy) {
      setWaited(false);
      return;
    }
    const timer = setTimeout(() => setWaited(true), 25_000);
    return () => clearTimeout(timer);
  }, [busy]);

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.length === 0 && !busy && <div className="text-xs text-ink-dim">{emptyHint}</div>}
        {messages.map((message, i) => (
          <div
            key={`${message.at}-${i}`}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl border px-3 py-2 text-sm leading-relaxed ${
                message.role === 'user'
                  ? 'rounded-br-sm border-accent/30 bg-accent/10'
                  : 'rounded-bl-sm border-line bg-surface-2'
              }`}
            >
              {message.text}
              {message.revisedSlug && (
                <div className="mt-1 text-[11px] text-accent">revised → {message.revisedSlug}</div>
              )}
            </div>
          </div>
        ))}
        {busy &&
          (waited ? (
            <div className="text-xs text-ink-dim">
              Sent — your message is saved to this artifact. A reply comes when a brainstorm
              session is running (in Claude Code); it will appear here the moment it does.
            </div>
          ) : (
            <div className="shimmer text-xs text-ink-dim">Claude is thinking…</div>
          ))}
        <div ref={endRef} />
      </div>

      {onSend && (
        <form
          className="flex items-center gap-2 border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            const text = draft.trim();
            if (!text) return;
            onSend(text);
            setDraft('');
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask or ask for a change…"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-ink-dim focus:border-accent"
          />
          <button
            type="submit"
            disabled={draft.trim().length === 0}
            className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-105 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      )}
    </>
  );
}

export type FullscreenNotes = {
  value: string;
  /** Live per-keystroke edits — the live board's per-option note rides the response. */
  onChange?: (notes: string) => void;
  /** Draft + Save commit — a captured artifact's persisted notes. */
  onSave?: (notes: string) => void;
};

export type FullscreenChat = {
  messages: ArtifactChatMessage[];
  busy?: boolean;
  /** Present → composer shown; absent → read-only replay. */
  onSend?: (text: string) => void;
  emptyHint?: string;
};

/**
 * The ONE fullscreen surface for any artifact or round-history option — the
 * single path every click opens (captured keeps, pinned artifacts, previous-
 * round options). A zoom/pan SVG stage on the left, a right dock with the
 * NOTES above the CHAT. The SVG is either inline markup (`svg`, round options)
 * or fetched from disk by slug (`fetchSlug`, captured artifacts — revisions
 * swap the slug and the stage re-centers). Consolidating the old PreviewModal
 * + ArtifactChat here removes their duplicated shell/notes/esc handling.
 */
export function ArtifactFullscreen({
  title,
  tags = [],
  svg,
  fetchSlug,
  revised = false,
  notes,
  chat,
  pin,
  onClose,
}: {
  title: string;
  tags?: string[];
  svg?: string;
  fetchSlug?: string;
  revised?: boolean;
  notes: FullscreenNotes;
  /** Present → a chat dock under the notes; absent → notes only (live board option). */
  chat?: FullscreenChat;
  /** Present → a Pin/Unpin toggle in the header (live captured artifacts). */
  pin?: { pinned: boolean; onToggle: () => void };
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);

  // Fetched SVG (captured artifacts live on disk, rule 7); inline `svg` wins.
  const [fetched, setFetched] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState(notes.value);

  const clamp = (s: number) => Math.min(24, Math.max(0.2, s));
  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Follow the shown source (a revision swaps fetchSlug): re-center + refetch.
  useEffect(() => {
    reset();
  }, [fetchSlug, svg]);

  useEffect(() => setNoteDraft(notes.value), [notes.value]);

  useEffect(() => {
    if (!fetchSlug) {
      setFetched(null);
      return;
    }
    let stale = false;
    setFetched(null);
    fetch(`/api/artifact-svg/${encodeURIComponent(fetchSlug)}.svg`)
      .then((res) => (res.ok ? res.text() : null))
      .then((text) => {
        if (!stale) setFetched(text);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [fetchSlug]);

  const shown = svg ?? fetched;

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-50 flex bg-black">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 p-3 text-white">
            <span className="truncate text-sm font-medium">{title}</span>
            {revised && (
              <span
                title="A new capture revising an earlier one — the original stays untouched"
                className="rounded bg-accent/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
              >
                revised
              </span>
            )}
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70"
              >
                {tag}
              </span>
            ))}
            {pin && (
              <button
                type="button"
                onClick={pin.onToggle}
                title={pin.pinned ? 'Unpin from the filmstrip' : 'Pin to the filmstrip'}
                className={`ml-1 rounded-lg px-2 py-0.5 text-xs ${
                  pin.pinned ? 'bg-accent/30 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {pin.pinned ? '📌 Pinned' : '📌 Pin'}
              </button>
            )}
            <span className="ml-2 rounded bg-white/10 px-2 py-0.5 text-xs tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <div className="ml-auto flex items-center gap-1">
              {[
                ['−', () => setScale((s) => clamp(s / 1.4))],
                ['+', () => setScale((s) => clamp(s * 1.4))],
                ['⟲', reset],
                ['✕', onClose],
              ].map(([labelBtn, fn]) => (
                <button
                  key={labelBtn as string}
                  type="button"
                  onClick={fn as () => void}
                  className="h-9 w-9 rounded-lg bg-white/10 text-base hover:bg-white/20"
                >
                  {labelBtn as string}
                </button>
              ))}
            </div>
          </div>
          <div
            className="flex-1 touch-none overflow-hidden"
            style={{ cursor: 'grab' }}
            onDoubleClick={reset}
            onWheel={(e) => setScale((s) => clamp(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))}
            onPointerDown={(e) => {
              (e.target as Element).setPointerCapture?.(e.pointerId);
              pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pointers.current.size === 2) {
                const [a, b] = [...pointers.current.values()];
                pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
              }
            }}
            onPointerMove={(e) => {
              const prev = pointers.current.get(e.pointerId);
              if (!prev) return;
              const current = { x: e.clientX, y: e.clientY };
              pointers.current.set(e.pointerId, current);
              if (pointers.current.size === 1) {
                setOffset((o) => ({ x: o.x + current.x - prev.x, y: o.y + current.y - prev.y }));
              } else if (pointers.current.size === 2) {
                const [a, b] = [...pointers.current.values()];
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                if (pinchDist.current > 0) {
                  setScale((s) => clamp((s * dist) / pinchDist.current));
                }
                pinchDist.current = dist;
              }
            }}
            onPointerUp={(e) => {
              pointers.current.delete(e.pointerId);
              pinchDist.current = 0;
            }}
            onPointerCancel={(e) => {
              pointers.current.delete(e.pointerId);
              pinchDist.current = 0;
            }}
          >
            <div className="flex h-full w-full items-center justify-center">
              {shown ? (
                <div
                  className="h-full w-full text-white"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    transformOrigin: 'center center',
                  }}
                >
                  <SvgPane svg={shown} className="h-full w-full" />
                </div>
              ) : (
                <div className="text-sm text-white/50">loading {fetchSlug}…</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex w-80 shrink-0 flex-col border-l border-line bg-surface lg:w-96">
          <div className="flex items-center gap-2 border-b border-line p-3">
            <div className="min-w-0">
              <div className="text-sm font-bold">Notes</div>
              <div className="truncate text-xs text-ink-dim">{title}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto rounded-lg border border-line px-2.5 py-1 text-xs hover:border-accent"
            >
              ✕
            </button>
          </div>

          <div className={`border-b border-line p-3 ${chat ? '' : 'flex flex-1 flex-col'}`}>
            {notes.onSave ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  notes.onSave?.(noteDraft);
                }}
              >
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder={`Notes on "${title}" — saved with the artifact`}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-line bg-surface-2 p-2.5 text-sm outline-none placeholder:text-ink-dim focus:border-accent"
                />
                <div className="mt-1 flex items-center justify-end gap-2">
                  {noteDraft !== notes.value && <span className="text-[11px] text-ink-dim">unsaved</span>}
                  <button
                    type="submit"
                    disabled={noteDraft === notes.value}
                    className="rounded-lg border border-line px-2.5 py-1 text-xs hover:border-accent disabled:opacity-40"
                  >
                    Save notes
                  </button>
                </div>
              </form>
            ) : notes.onChange ? (
              <textarea
                value={notes.value}
                onChange={(e) => notes.onChange?.(e.target.value)}
                placeholder={`Notes on "${title}", sent with your response`}
                className={`w-full resize-none rounded-xl border border-line bg-surface-2 p-2.5 text-sm outline-none placeholder:text-ink-dim focus:border-accent ${
                  chat ? '' : 'flex-1'
                }`}
                rows={chat ? 3 : undefined}
              />
            ) : (
              <div className="whitespace-pre-wrap text-sm text-ink-dim">
                {notes.value || 'No notes recorded.'}
              </div>
            )}
          </div>

          {chat && (
            <ChatSection
              messages={chat.messages}
              busy={chat.busy}
              onSend={chat.onSend}
              autoFocus
              emptyHint={
                chat.emptyHint ??
                'Ask about this, or ask for a change — a change is captured as a new version; the original stays.'
              }
            />
          )}
        </div>
      </div>
    </BodyPortal>
  );
}
