import type { Board } from '@visual-brainstorm/protocol';
import { SvgPane } from '../primitives';

type Verdict = 'keep' | 'kill' | 'merge';
const VERDICTS: { value: Verdict; label: string; className: string }[] = [
  { value: 'keep', label: 'Keep', className: 'border-emerald-500 text-emerald-500' },
  { value: 'kill', label: 'Kill', className: 'border-red-500 text-red-500' },
  { value: 'merge', label: 'Merge', className: 'border-accent text-accent' },
];

/**
 * Theory 1 (convergence gate): generation is over. Every option MUST be
 * triaged before the send buttons unlock — the viewport itself becomes the
 * threshold that stops expanding and forces distillation.
 */
export function TriageGate({
  board,
  triage,
  finalId,
  onTriage,
  onFinal,
}: {
  board: Board;
  triage: Record<string, Verdict>;
  finalId: string | null;
  onTriage: (triage: Record<string, Verdict>) => void;
  onFinal: (id: string | null) => void;
}) {
  const done = board.options.filter((o) => triage[o.id]).length;
  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 text-center">
        <div className="text-sm font-semibold">The gate</div>
        <div className="text-xs text-ink-dim">
          No more generating. Every option gets a verdict — {done}/{board.options.length} triaged.
        </div>
        <div className="mx-auto mt-2 h-1.5 w-48 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${(done / board.options.length) * 100}%` }}
          />
        </div>
      </div>
      <div className="space-y-2">
        {board.options.map((option) => {
          const verdict = triage[option.id];
          return (
            <div
              key={option.id}
              className={`flex items-center gap-3 rounded-xl border p-2 ${
                verdict === 'kill' ? 'border-line opacity-50' : 'border-line'
              }`}
            >
              <div
                className={`h-14 w-14 shrink-0 rounded-lg bg-surface-2 p-2 text-ink ${
                  verdict === 'kill' ? 'grayscale' : ''
                }`}
              >
                <SvgPane svg={option.svg} className="h-full w-full" />
              </div>
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm font-medium ${verdict === 'kill' ? 'line-through' : ''}`}>
                  {option.label}
                </div>
                {option.description && (
                  <div className="truncate text-xs text-ink-dim">{option.description}</div>
                )}
              </div>
              <div className="flex gap-1">
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
                  title="Crown as THE final answer — finalizing captures it and triggers plan closeout"
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
                  🏁 Final
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
