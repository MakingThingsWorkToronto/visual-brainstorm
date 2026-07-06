import type { Board } from '@visual-brainstorm/protocol';
import { SvgPane } from '../primitives';

/**
 * Theory 3 (Saboteur): destroying is psychologically cheaper than perfecting.
 * Tilted, low-stakes cards beg to be criticized; red flaw scribbles are the
 * whole interaction. The gate: at least 3 flaws before the survey can send —
 * Claude's next round converts each flaw into a methodical fix candidate.
 */
export function WreckYard({
  board,
  flaws,
  onFlaws,
}: {
  board: Board;
  flaws: Record<string, string>;
  onFlaws: (flaws: Record<string, string>) => void;
}) {
  const found = Object.values(flaws).filter((f) => f.trim() !== '').length;
  const needed = Math.min(3, board.options.length);
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4">
      <div className="mb-4 text-center">
        <div className="text-sm font-semibold text-red-500">Wreckage mode</div>
        <div className="text-xs text-ink-dim">
          Nothing here is precious. Find the cracks, the lies, the ugliness — breaking is how we
          get unstuck. {found}/{needed} flaws found{found >= needed ? ' — gate open' : ''}.
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {board.options.map((option, i) => {
          const flawed = (flaws[option.id] ?? '').trim() !== '';
          return (
            <div
              key={option.id}
              className={`rounded-2xl border bg-surface p-3 transition-transform ${
                flawed ? 'border-red-500/60' : 'border-line'
              }`}
              style={{ transform: `rotate(${((i % 3) - 1) * 1.6}deg)` }}
            >
              <div className={`aspect-square rounded-xl bg-surface-2 p-5 text-ink ${flawed ? 'opacity-60' : ''}`}>
                <SvgPane svg={option.svg} className="h-full w-full" />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-semibold">{option.label}</span>
                {flawed && <span className="text-xs text-red-500">✗ flawed</span>}
              </div>
              <textarea
                value={flaws[option.id] ?? ''}
                onChange={(e) => onFlaws({ ...flaws, [option.id]: e.target.value })}
                placeholder="What breaks first? What's ugly? What lies?"
                rows={2}
                className="mt-2 w-full resize-none rounded-lg border border-red-500/30 bg-surface-2 p-2 text-xs text-ink outline-none placeholder:text-red-400/60 focus:border-red-500"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
