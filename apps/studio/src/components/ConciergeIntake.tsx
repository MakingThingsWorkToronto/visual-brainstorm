import { useState } from 'react';
import type { ConciergeExchange } from '@visual-brainstorm/protocol';
import { Bubble } from './primitives';

/**
 * The adaptive concierge surface (wiki/Product/intake-methodologies.md): after
 * the brief, Claude asks clarifying questions one at a time. The user taps any
 * of the suggestion chips, types their own, or both, then sends — the assembled
 * answer packages back into the digest the orchestrator builds on. As many
 * questions as it takes: each answer clears this surface until the next arrives.
 */
export function ConciergeIntake({
  exchange,
  onAnswer,
}: {
  exchange: ConciergeExchange;
  onAnswer: (id: string, answer: string) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [freeText, setFreeText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (chip: string) =>
    setPicked((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));

  const assembled = [...picked, freeText.trim()].filter(Boolean).join(' · ');
  const canSend = assembled.length > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await onAnswer(exchange.id, assembled);
      // The surface clears when the next question (or none) arrives over WS.
    } catch (err) {
      setError(String(err));
      setSending(false);
    }
  };

  return (
    <div className="space-y-3" data-testid="concierge-intake">
      <Bubble side="claude">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
          Concierge
        </div>
        {exchange.question}
      </Bubble>

      <div className="rounded-2xl border border-line bg-surface p-4">
        {exchange.suggestions.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2" data-testid="concierge-chips">
            {exchange.suggestions.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => toggle(chip)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  picked.includes(chip)
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line text-ink-dim hover:border-accent hover:text-ink'
                }`}
              >
                {chip}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={freeText}
          onChange={(e) => setFreeText(e.target.value)}
          placeholder="Answer in your own words — or just tap the chips above"
          rows={2}
          className="w-full resize-y rounded-xl border border-line bg-surface-2 p-3 text-sm outline-none focus:border-accent"
        />
        {error && <div className="mt-2 text-xs text-red-500">{error}</div>}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={!canSend}
            onClick={send}
            title="Send this answer. The concierge may ask more."
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow hover:brightness-105 disabled:opacity-50"
          >
            Send answer
          </button>
          <span className="ml-auto text-xs text-ink-dim">
            {canSend ? 'the concierge may ask a few more' : 'tap a chip or type an answer'}
          </span>
        </div>
      </div>
    </div>
  );
}
