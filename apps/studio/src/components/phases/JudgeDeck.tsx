import { useEffect, useMemo, useState } from 'react';
import type { Board, BoardOption } from '@visual-brainstorm/protocol';
import { SvgPane } from '../primitives';
import { adjacentDuels, applyDuel, type DuelResult } from '../../lib/deck';

/**
 * Judge deck — flick-fast triage, one card at a time. Right keeps, left kills.
 * When every card is judged and two or more keeps exist, the deck deals one
 * pass of adjacent duels ("too close to call — pick one") and a live ranking
 * builds. Keeps/kills/duels/ranking all ship in the response.
 */
export function JudgeDeck({
  board,
  verdicts,
  ranking,
  onVerdict,
  onRanking,
  onDuel,
  onRestart,
  onPreview,
}: {
  board: Board;
  verdicts: Record<string, 'keep' | 'kill'>;
  ranking: string[];
  onVerdict: (id: string, verdict: 'keep' | 'kill') => void;
  onRanking: (ranking: string[]) => void;
  onDuel: (duel: DuelResult) => void;
  onRestart: () => void;
  onPreview: (option: BoardOption) => void;
}) {
  const current = board.options.find((o) => !verdicts[o.id]) ?? null;
  const judged = board.options.length - board.options.filter((o) => !verdicts[o.id]).length;
  const label = (id: string) => board.options.find((o) => o.id === id)?.label ?? id;

  // Duel pass: dealt once, after the last flick, when ≥2 keeps exist.
  const [duelQueue, setDuelQueue] = useState<[string, string][] | null>(null);
  const [duelIndex, setDuelIndex] = useState(0);
  const [skippedDuels, setSkippedDuels] = useState(false);
  useEffect(() => {
    if (!current && duelQueue === null && ranking.length >= 2) {
      setDuelQueue(adjacentDuels(ranking));
      setDuelIndex(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, duelQueue]);

  const duel =
    !current && !skippedDuels && duelQueue && duelIndex < duelQueue.length
      ? duelQueue[duelIndex]
      : null;
  const duelOptions = useMemo(
    () =>
      duel
        ? (duel
            .map((id) => board.options.find((o) => o.id === id))
            .filter(Boolean) as BoardOption[])
        : [],
    [duel, board.options],
  );

  const flick = (verdict: 'keep' | 'kill') => {
    if (!current) return;
    onVerdict(current.id, verdict);
    if (verdict === 'keep') onRanking([...ranking, current.id]);
  };

  const resolveDuel = (winner: string) => {
    if (!duel) return;
    const loser = duel.find((id) => id !== winner)!;
    onDuel({ pair: duel, winner });
    onRanking(applyDuel(ranking, winner, loser));
    setDuelIndex((i) => i + 1);
  };

  // Keyboard: ← kill / → keep while flicking; ← → pick a duel side.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (current) {
        if (e.key === 'ArrowRight') flick('keep');
        if (e.key === 'ArrowLeft') flick('kill');
      } else if (duel) {
        if (e.key === 'ArrowLeft') resolveDuel(duel[0]);
        if (e.key === 'ArrowRight') resolveDuel(duel[1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 text-center">
        <div className="text-sm font-semibold">Judge deck</div>
        <div className="text-xs text-ink-dim">
          {current
            ? `card ${judged + 1} of ${board.options.length}: left arrow kills, right arrow keeps`
            : duel
              ? 'too close to call, pick the stronger one'
              : `deck judged: ${ranking.length} keep${ranking.length === 1 ? '' : 's'}, ranked`}
        </div>
        <div className="mx-auto mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${(judged / board.options.length) * 100}%` }}
          />
        </div>
      </div>

      {current && (
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => flick('kill')}
            title="Kill: this direction is never re-shown (left arrow)"
            className="rounded-xl border border-red-500/50 px-4 py-3 text-sm font-semibold text-red-500 hover:bg-red-500/10"
          >
            kill
          </button>
          <div className="w-56 rounded-2xl border border-line bg-surface-2 p-4 shadow-md">
            <div
              className="aspect-square w-full cursor-zoom-in text-ink"
              onClick={() => onPreview(current)}
              title="Click for full-screen view (zoom, pan, notes)"
            >
              <SvgPane svg={current.svg} className="h-full w-full" />
            </div>
            <div className="mt-2 text-center text-sm font-semibold">{current.label}</div>
            {current.description && (
              <div className="mt-0.5 text-center text-xs text-ink-dim">{current.description}</div>
            )}
          </div>
          <button
            type="button"
            onClick={() => flick('keep')}
            title="Keep: joins the ranking (right arrow)"
            className="rounded-xl border border-emerald-500/50 px-4 py-3 text-sm font-semibold text-emerald-500 hover:bg-emerald-500/10"
          >
            keep
          </button>
        </div>
      )}

      {duel && duelOptions.length === 2 && (
        <div>
          <div className="flex items-center justify-center gap-3">
            {duelOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => resolveDuel(option.id)}
                className="w-48 rounded-2xl border border-line bg-surface-2 p-3 text-left transition-colors hover:border-accent"
              >
                <div className="aspect-square w-full text-ink">
                  <SvgPane svg={option.svg} className="h-full w-full" />
                </div>
                <div className="mt-2 text-center text-sm font-semibold">{option.label}</div>
              </button>
            ))}
          </div>
          <div className="mt-2 text-center text-[11px] text-ink-dim">
            duel {duelIndex + 1} of {duelQueue!.length} ·{' '}
            <button type="button" onClick={() => setSkippedDuels(true)} className="underline hover:text-ink">
              skip, the order is fine
            </button>
          </div>
        </div>
      )}

      {!current && !duel && (
        <div className="mx-auto max-w-sm">
          {ranking.length === 0 ? (
            <div className="text-center text-xs text-ink-dim">
              Everything was killed. Send that as the signal, or restart the deck.
            </div>
          ) : (
            <ol className="space-y-1">
              {ranking.map((id, i) => (
                <li
                  key={id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${
                    i === 0 ? 'border-accent bg-accent/10 font-semibold' : 'border-line'
                  }`}
                >
                  <span className="w-5 text-xs tabular-nums text-ink-dim">{i + 1}.</span>
                  {label(id)}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {judged > 0 && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => {
              setDuelQueue(null);
              setDuelIndex(0);
              setSkippedDuels(false);
              onRestart();
            }}
            className="text-[11px] text-ink-dim underline hover:text-ink"
          >
            restart the deck
          </button>
        </div>
      )}
    </div>
  );
}
