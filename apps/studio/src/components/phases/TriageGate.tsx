import { useState } from 'react';
import type { Board, BoardOption } from '@visual-brainstorm/protocol';
import { SvgPane } from '../primitives';
import type { DuelResult } from '../../lib/deck';

type Verdict = 'keep' | 'kill' | 'merge';
const VERDICTS: { value: Verdict; label: string; className: string }[] = [
  { value: 'keep', label: 'Keep', className: 'border-emerald-500 text-emerald-500' },
  { value: 'kill', label: 'Kill', className: 'border-red-500 text-red-500' },
  { value: 'merge', label: 'Merge', className: 'border-accent text-accent' },
];

/**
 * Theory 1 (convergence gate): generation is over. Every option MUST be
 * triaged before the send buttons unlock — the viewport itself becomes the
 * threshold that stops expanding and forces distillation. Cards, not rows:
 * each option carries its verdict buttons AND its note in one surface.
 */
export function TriageGate({
  board,
  triage,
  finalId,
  notes = {},
  onNote,
  onTriage,
  onFinal,
  onDuel,
  onPreview,
}: {
  board: Board;
  triage: Record<string, Verdict>;
  finalId: string | null;
  /** Per-option notes — shipped with the response as perOptionNotes. */
  notes?: Record<string, string>;
  onNote?: (id: string, note: string) => void;
  onTriage: (triage: Record<string, Verdict>) => void;
  onFinal: (id: string | null) => void;
  onDuel?: (duel: DuelResult) => void;
  onPreview: (option: BoardOption) => void;
}) {
  const done = board.options.filter((o) => triage[o.id]).length;
  const keeps = board.options.filter((o) => triage[o.id] === 'keep');
  // Sudden death: king-of-the-hill bracket over the keeps; the last card
  // standing is auto-crowned. Every duel ships as preference data.
  const [bracket, setBracket] = useState<{ champion: string; challenger: number } | null>(null);
  const canSuddenDeath =
    !bracket && !finalId && done === board.options.length && keeps.length >= 2 && keeps.length <= 4;

  const resolveBracketDuel = (winner: string) => {
    if (!bracket) return;
    const challenger = keeps[bracket.challenger];
    const pair: [string, string] = [bracket.champion, challenger.id];
    onDuel?.({ pair, winner });
    const nextChallenger = bracket.challenger + 1;
    if (nextChallenger >= keeps.length) {
      setBracket(null);
      onFinal(winner); // crowned — 🏁 Finalize is now one click away
    } else {
      setBracket({ champion: winner, challenger: nextChallenger });
    }
  };

  const cols =
    board.options.length <= 2
      ? 'sm:grid-cols-2'
      : board.options.length <= 6
        ? 'sm:grid-cols-2 lg:grid-cols-3'
        : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 text-center">
        <div className="text-sm font-semibold">The gate</div>
        <div className="text-xs text-ink-dim">
          No more generating. Every option gets a verdict: {done}/{board.options.length} triaged.
        </div>
        <div className="mx-auto mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${(done / board.options.length) * 100}%` }}
          />
        </div>
      </div>
      <div className={`grid grid-cols-1 gap-4 ${cols}`}>
        {board.options.map((option) => {
          const verdict = triage[option.id];
          return (
            <div
              key={option.id}
              className={`flex flex-col rounded-2xl border bg-surface-2/50 p-3 ${
                finalId === option.id
                  ? 'border-accent shadow-[0_0_0_1px_var(--color-accent)]'
                  : verdict === 'kill'
                    ? 'border-line opacity-60'
                    : 'border-line'
              }`}
            >
              <button
                type="button"
                onClick={() => onPreview(option)}
                className="block w-full cursor-zoom-in rounded-xl"
                title="Click for full-screen view (zoom, pan, notes)"
              >
                <div
                  className={`aspect-square w-full rounded-xl bg-surface-2 p-5 text-ink ${
                    verdict === 'kill' ? 'grayscale' : ''
                  }`}
                >
                  <SvgPane svg={option.svg} className="h-full w-full" />
                </div>
              </button>
              <div className="mt-2 min-w-0">
                <div className={`truncate text-sm font-semibold ${verdict === 'kill' ? 'line-through' : ''}`}>
                  {option.label}
                </div>
                {option.description && (
                  <div className="mt-0.5 text-xs text-ink-dim">{option.description}</div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {VERDICTS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => {
                      onTriage({ ...triage, [option.id]: v.value });
                      if (v.value !== 'keep' && finalId === option.id) onFinal(null);
                    }}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                      verdict === v.value ? `${v.className} bg-current/10` : 'border-line text-ink-dim hover:text-ink'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
                <button
                  type="button"
                  title="Mark as THE final answer. Finalizing saves it and triggers plan closeout."
                  onClick={() => {
                    if (finalId === option.id) {
                      onFinal(null);
                    } else {
                      onFinal(option.id);
                      onTriage({ ...triage, [option.id]: 'keep' });
                    }
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    finalId === option.id
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-line text-ink-dim hover:text-ink'
                  }`}
                >
                  Final
                </button>
              </div>
              {onNote && (
                <textarea
                  value={notes[option.id] ?? ''}
                  onChange={(e) => onNote(option.id, e.target.value)}
                  placeholder={`Why this verdict on "${option.label}"?`}
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-line bg-surface-2 p-2 text-xs outline-none placeholder:text-ink-dim focus:border-accent"
                />
              )}
            </div>
          );
        })}
      </div>

      {canSuddenDeath && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setBracket({ champion: keeps[0].id, challenger: 1 })}
            title="Deal the keeps into an elimination bracket. The last card standing wins."
            className="rounded-xl border-2 border-accent bg-accent/10 px-4 py-2 text-sm font-bold text-accent hover:bg-accent/20"
          >
            Sudden death: duel the {keeps.length} keeps to a winner
          </button>
        </div>
      )}

      {bracket && (
        <div className="mt-4 rounded-2xl border-2 border-accent/60 bg-accent/5 p-4">
          <div className="mb-2 text-center text-sm font-semibold">
            Sudden death: pick the survivor ({bracket.challenger}/{keeps.length - 1})
          </div>
          <div className="flex items-center justify-center gap-3">
            {[keeps.find((o) => o.id === bracket.champion)!, keeps[bracket.challenger]].map(
              (option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => resolveBracketDuel(option.id)}
                  className="w-44 rounded-2xl border border-line bg-surface-2 p-3 transition-colors hover:border-accent"
                >
                  <div className="aspect-square w-full text-ink">
                    <SvgPane svg={option.svg} className="h-full w-full" />
                  </div>
                  <div className="mt-2 text-center text-sm font-semibold">{option.label}</div>
                </button>
              ),
            )}
          </div>
          <div className="mt-2 text-center">
            <button
              type="button"
              onClick={() => setBracket(null)}
              className="text-[11px] text-ink-dim underline hover:text-ink"
            >
              call it off
            </button>
          </div>
        </div>
      )}

      {finalId && !bracket && (
        <div className="mt-3 text-center text-xs text-accent">
          Final chosen. The Finalize button below saves it, composes the decision poster, and closes out.
        </div>
      )}
    </div>
  );
}
