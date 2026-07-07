import { useState } from 'react';
import type { LivingGallery as LivingGalleryData } from '@visual-brainstorm/protocol';
import { Bubble, SvgPane } from './primitives';

/**
 * The Living Gallery (wiki/Product/intake-methodologies.md): the concierge's
 * final response surface. Each methodology (Mind map, Funnel, Wreck, Cluster)
 * is a card with a LIVE mini seeded from the brief + answers; the recommended
 * card is accent-ringed and ribboned with a reason chip quoting the answers.
 * Picking a card routes the session into that methodology (the pick returns to
 * Claude, which starts that method).
 */
export function LivingGallery({
  gallery,
  onPick,
}: {
  gallery: LivingGalleryData;
  onPick: (id: string, method: string) => Promise<void>;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = async (method: string) => {
    if (picking) return;
    setPicking(method);
    setError(null);
    try {
      await onPick(gallery.id, method);
      // The surface clears when the gallery envelope goes null over WS.
    } catch (err) {
      setError(String(err));
      setPicking(null);
    }
  };

  return (
    <div className="space-y-3" data-testid="living-gallery">
      <Bubble side="claude">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
          Living Gallery
        </div>
        {gallery.prompt || 'Pick how you want to explore this.'}
      </Bubble>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {gallery.cards.map((card) => (
          <button
            key={card.method}
            type="button"
            onClick={() => pick(card.method)}
            disabled={!!picking}
            aria-label={`Start the ${card.label} methodology`}
            data-testid={`method-card-${card.method}`}
            className={`group relative flex flex-col rounded-2xl border bg-surface p-4 text-left transition-shadow disabled:opacity-60 ${
              card.recommended
                ? 'border-accent shadow-[0_0_0_1px_var(--color-accent)] ring-2 ring-accent/40'
                : 'border-line hover:shadow-md'
            }`}
          >
            {card.recommended && (
              <div
                data-testid="recommended-ribbon"
                className="absolute -top-2 left-4 rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow"
              >
                Recommended
              </div>
            )}
            <div className="mx-auto aspect-square w-24 text-ink">
              <SvgPane svg={card.svg} className="h-full w-full" />
            </div>
            <div className="mt-2 text-sm font-semibold">{card.label}</div>
            {card.blurb && <div className="mt-0.5 text-xs text-ink-dim">{card.blurb}</div>}
            {card.recommended && card.reason && (
              <div
                data-testid="reason-chip"
                className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] leading-snug text-accent"
              >
                {card.reason}
              </div>
            )}
            <div className="mt-3 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
              {picking === card.method ? 'starting…' : `Start ${card.label} →`}
            </div>
          </button>
        ))}
      </div>
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  );
}
