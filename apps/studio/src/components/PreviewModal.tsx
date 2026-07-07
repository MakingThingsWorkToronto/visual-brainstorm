import { useEffect, useRef, useState } from 'react';
import type { ArtifactChatMessage } from '@visual-brainstorm/protocol';
import { BodyPortal, SvgPane } from './primitives';
import { ChatSection } from './ArtifactChat';

/**
 * Full-screen zoomable SVG preview — system-map boards can be dense.
 * Wheel zoom, drag pan, two-pointer pinch (mobile), double-click / ⟲ reset, Esc closes.
 * Right dock: the option's NOTE (editable on the live board, the persisted
 * response note read-only on previous rounds) above an optional CHAT about
 * this option (persists to the thread's artifacts/chat.jsonl and reloads).
 */
export function PreviewModal({
  svg,
  label,
  tags = [],
  note,
  onNoteChange,
  chat,
  onClose,
}: {
  svg: string;
  label: string;
  tags?: string[];
  /** Current per-option note; editable when onNoteChange is provided (live board only). */
  note?: string;
  onNoteChange?: (note: string) => void;
  /** Option/artifact chat docked under the notes; onSend absent → read-only. */
  chat?: {
    messages: ArtifactChatMessage[];
    busy?: boolean;
    onSend?: (text: string) => void;
  };
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const clamp = (s: number) => Math.min(24, Math.max(0.2, s));
  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <BodyPortal>
    <div className="fixed inset-0 z-50 flex bg-black">
      <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 p-3 text-white">
        <span className="truncate text-sm font-medium">{label}</span>
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/70"
          >
            {tag}
          </span>
        ))}
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
          <div
            className="h-full w-full text-white"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: 'center center',
            }}
          >
            <SvgPane svg={svg} className="h-full w-full" />
          </div>
        </div>
      </div>
      </div>
      {(onNoteChange || note || chat) && (
        <div className="flex w-80 shrink-0 flex-col border-l border-line bg-surface lg:w-96">
          <div className="border-b border-line p-3">
            <div className="text-sm font-bold">Notes</div>
            <div className="truncate text-xs text-ink-dim">{label}</div>
          </div>
          <div className={`flex flex-col p-3 ${chat ? '' : 'flex-1'}`}>
            {onNoteChange ? (
              <textarea
                value={note ?? ''}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder={`Notes on "${label}", sent with your response`}
                rows={chat ? 3 : undefined}
                className={`w-full resize-none rounded-xl border border-line bg-surface-2 p-2.5 text-sm outline-none placeholder:text-ink-dim focus:border-accent ${
                  chat ? '' : 'flex-1'
                }`}
              />
            ) : (
              <div className="whitespace-pre-wrap text-sm text-ink-dim">
                {note || 'No note was left on this option.'}
              </div>
            )}
          </div>
          {chat && (
            <>
              <div className="border-b border-t border-line p-3">
                <div className="text-sm font-bold">Chat</div>
                <div className="truncate text-xs text-ink-dim">
                  ask about this option — the dialog stays with the thread
                </div>
              </div>
              <ChatSection
                messages={chat.messages}
                busy={chat.busy}
                onSend={chat.onSend}
                emptyHint={
                  chat.onSend
                    ? 'Ask about this option or the choice it represents — the conversation persists with the thread.'
                    : 'No dialog was recorded for this option.'
                }
              />
            </>
          )}
        </div>
      )}
    </div>
    </BodyPortal>
  );
}
