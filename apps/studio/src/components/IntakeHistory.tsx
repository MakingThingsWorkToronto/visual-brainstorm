import type { IntakeLogEntry } from '@visual-brainstorm/protocol';
import { Bubble, Marker } from './primitives';

/**
 * The intake CHAT HISTORY — the permanent timeline record of everything the
 * user said before round 1 (operator report 2026-07-11: "user messages shall
 * not disappear"). The submitted New Discussion brief renders as the thread's
 * first user bubble, every answered concierge exchange as a question/answer
 * pair, the gallery pick as a marker. Renders first in the timeline, live and
 * archived; the filmstrip's 🌱 brief chip jumps here (id `intake-history`).
 */
export function IntakeHistory({
  entries,
  modelLabels,
  onRevise,
}: {
  entries: IntakeLogEntry[];
  /** Model id → display label (the brief bubble shows its routing pick). */
  modelLabels?: Map<string, string>;
  /** Live thread only: reopen the New Discussion panel prefilled from this brief. */
  onRevise?: (brief: Extract<IntakeLogEntry, { kind: 'brief' }>) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div id="intake-history" className="space-y-3" data-testid="intake-history">
      {entries.map((entry, i) => {
        // Index in the key: the log is append-only, and kind+at alone could
        // collide for same-millisecond entries.
        const key = `${entry.kind}-${entry.at}-${i}`;
        switch (entry.kind) {
          case 'brief':
            return (
              <div key={key} className="space-y-1">
                <Bubble side="user">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
                    Your brief
                  </div>
                  {entry.prompt || '(seeded by a sketch or attachment — no text)'}
                  {entry.answers.length > 0 && (
                    <div className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-ink-dim">
                      {entry.answers.map((qa) => (
                        <div key={qa.question}>
                          <span className="font-medium">{qa.question}</span> — {qa.answers.join(' · ')}
                        </div>
                      ))}
                    </div>
                  )}
                  {entry.model && (
                    <div className="mt-1 text-xs text-ink-dim">
                      drawing with {modelLabels?.get(entry.model) ?? entry.model}
                    </div>
                  )}
                  {onRevise && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => onRevise(entry)}
                        title="Reopen the New Discussion panel prefilled with this brief — sending re-seeds the brainstorm from the revised brief"
                        className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-dim hover:border-accent hover:text-accent"
                      >
                        ✎ revise this brief
                      </button>
                    </div>
                  )}
                </Bubble>
              </div>
            );
          case 'concierge':
            return (
              <div key={key} className="space-y-3">
                <Bubble side="claude">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
                    Concierge
                  </div>
                  {entry.question}
                </Bubble>
                <Bubble side="user">
                  {entry.answer}
                  {entry.picked.length > 0 && entry.typed.trim() !== '' && (
                    <div className="mt-1 text-xs text-ink-dim">
                      tapped {entry.picked.join(' · ')} — typed “{entry.typed.trim()}”
                    </div>
                  )}
                </Bubble>
              </div>
            );
          case 'gallery-pick':
            return <Marker key={key}>Living Gallery · you picked {entry.method}</Marker>;
        }
      })}
    </div>
  );
}
