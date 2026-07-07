import { useState, type CSSProperties } from 'react';
import type { Board, BoardOption } from '@visual-brainstorm/protocol';
import { SvgPane } from '../primitives';

/**
 * Theory 2 (SCAMPER): the big picture is hidden — ONE option fills the stage.
 * Distortion lenses apply real transforms; the user marks which distortions
 * reveal something. Marked lenses return as response.mutations.
 */
const LENSES: { id: string; label: string; style: CSSProperties }[] = [
  { id: 'flip', label: 'Flip', style: { transform: 'scaleX(-1)' } },
  { id: 'invert', label: 'Invert', style: { filter: 'invert(1) hue-rotate(180deg)' } },
  { id: 'stretch', label: 'Stretch', style: { transform: 'scaleX(1.7) scaleY(0.65)' } },
  { id: 'compress', label: 'Compress', style: { transform: 'scale(0.4)' } },
  { id: 'tilt', label: 'Tilt', style: { transform: 'rotate(135deg)' } },
  { id: 'xray', label: 'X-ray', style: { filter: 'grayscale(1) contrast(4)' } },
];

export function MutationLab({
  board,
  mutations,
  onMutations,
  onPreview,
}: {
  board: Board;
  mutations: Record<string, string[]>;
  onMutations: (mutations: Record<string, string[]>) => void;
  onPreview: (option: BoardOption) => void;
}) {
  const [index, setIndex] = useState(0);
  const [lens, setLens] = useState<string | null>(null);
  const option = board.options[index];
  const kept = mutations[option.id] ?? [];
  const active = LENSES.find((l) => l.id === lens);

  const toggleKeep = (lensId: string) => {
    const next = kept.includes(lensId) ? kept.filter((k) => k !== lensId) : [...kept, lensId];
    onMutations({ ...mutations, [option.id]: next });
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setIndex((index - 1 + board.options.length) % board.options.length);
            setLens(null);
          }}
          className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="text-sm font-semibold">{option.label}</div>
          <div className="text-xs text-ink-dim">
            {index + 1} / {board.options.length}, the rest is hidden on purpose
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setIndex((index + 1) % board.options.length);
            setLens(null);
          }}
          className="rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent"
        >
          ›
        </button>
      </div>

      <div
        className="mx-auto mt-4 aspect-square w-full max-w-md cursor-zoom-in overflow-hidden rounded-xl bg-surface-2 p-8 text-ink"
        onClick={() => onPreview(option)}
        title="Click for full-screen view (zoom, pan, notes)"
      >
        <div className="h-full w-full transition-all duration-300" style={active?.style}>
          <SvgPane svg={option.svg} className="h-full w-full" />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLens(lens === l.id ? null : l.id)}
            className={`rounded-xl border px-3 py-1.5 text-sm ${
              lens === l.id
                ? 'border-accent bg-accent/15'
                : kept.includes(l.id)
                  ? 'border-accent/50 text-accent'
                  : 'border-line hover:border-accent'
            }`}
          >
            {l.label}
            {kept.includes(l.id) && ' (marked)'}
          </button>
        ))}
      </div>

      {lens && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => toggleKeep(lens)}
            className={`rounded-xl px-4 py-2 text-sm font-medium ${
              kept.includes(lens)
                ? 'bg-accent/20 text-accent'
                : 'bg-accent text-white hover:brightness-105'
            }`}
          >
            {kept.includes(lens) ? 'Marked: this lens reveals something' : 'This lens reveals something'}
          </button>
        </div>
      )}
    </div>
  );
}
