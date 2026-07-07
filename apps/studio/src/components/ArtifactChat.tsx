import { useEffect, useRef, useState } from 'react';
import type { Artifact, ArtifactChatMessage } from '@visual-brainstorm/protocol';
import { SvgPane } from './primitives';

/**
 * Artifact chat — click a captured artifact to enlarge it fullscreen with a
 * dialog docked right. Deliberately simplified composer: ONE input, ONE Send.
 * Messages render from bridge state (persistence is the truth — never appended
 * locally). A Claude reply that revised the artifact carries `revisedSlug`;
 * the caller swaps `artifact` to the NEW capture (rule 7: the original is
 * never overwritten) while this dialog's messages stay on the original slug.
 */
export function ArtifactChat({
  artifact,
  messages,
  onSend,
  busy = false,
  onClose,
}: {
  artifact: Artifact;
  messages: ArtifactChatMessage[];
  onSend: (text: string) => void;
  busy?: boolean;
  onClose?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [svg, setSvg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Artifact SVGs live on disk (rule 7 capture); fetch the served copy.
  useEffect(() => {
    let stale = false;
    setSvg(null);
    fetch(`/api/artifact-svg/${encodeURIComponent(artifact.slug)}.svg`)
      .then((res) => (res.ok ? res.text() : null))
      .then((text) => {
        if (!stale) setSvg(text);
      })
      .catch(() => {});
    return () => {
      stale = true;
    };
  }, [artifact.slug]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, busy]);

  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const revises = artifact.provenance.revises;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/85 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-center gap-2 pb-3 text-white">
          <span className="truncate text-sm font-medium">{artifact.name}</span>
          {revises && (
            <span
              title={`New capture revising ${revises} — the original stays untouched`}
              className="rounded bg-accent/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
            >
              revised
            </span>
          )}
        </div>
        <div className="flex flex-1 items-center justify-center overflow-hidden">
          <div
            className="text-white"
            style={{ width: 'min(70vw, 80vh)', height: 'min(70vw, 80vh)' }}
          >
            {svg ? (
              <SvgPane svg={svg} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/50">
                loading {artifact.slug}…
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex w-80 shrink-0 flex-col border-l border-line bg-surface lg:w-96">
        <div className="flex items-center gap-2 border-b border-line p-3">
          <div className="min-w-0">
            <div className="text-sm font-bold">Artifact chat</div>
            <div className="truncate text-xs text-ink-dim">{artifact.name}</div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close artifact chat"
              className="ml-auto rounded-lg border border-line px-2.5 py-1 text-xs hover:border-accent"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {messages.length === 0 && !busy && (
            <div className="text-xs text-ink-dim">
              Ask about this artifact, or ask for a change — a change is captured as a new
              version; the original stays.
            </div>
          )}
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
                  <div className="mt-1 text-[11px] text-accent">
                    revised → {message.revisedSlug}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="shimmer text-xs text-ink-dim">Claude is thinking…</div>}
          <div ref={endRef} />
        </div>

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
      </div>
    </div>
  );
}
