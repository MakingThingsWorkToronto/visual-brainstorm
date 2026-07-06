import type { Phase } from '@visual-brainstorm/protocol';

const STEPS: { phase: Phase; label: string; hint: string }[] = [
  { phase: 'diverge', label: 'Diverge', hint: 'expand freely — no gates' },
  { phase: 'expand', label: 'Expand', hint: 'select — the pool grows with syntheses' },
  { phase: 'mutate', label: 'Mutate', hint: 'distort one thing at a time' },
  { phase: 'wreck', label: 'Wreck', hint: 'nothing is precious' },
  { phase: 'cluster', label: 'Cluster', hint: 'distance is data' },
  { phase: 'converge', label: 'Converge', hint: 'triage everything, crown the final' },
];

/**
 * The funnel made visible AND steerable: widths narrow toward converge; the
 * current phase glows; clicking a tab switches the active mechanic locally and
 * requests that phase for the next round (response.requestedPhase).
 */
export function PhaseBar({
  phase,
  onSelect,
}: {
  phase: Phase;
  onSelect?: (phase: Phase) => void;
}) {
  return (
    <div className="flex items-end gap-1" aria-label={`Current phase: ${phase}`}>
      {STEPS.map((step, i) => {
        const active = step.phase === phase;
        return (
          <button
            key={step.phase}
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(step.phase)}
            title={`${step.label} — ${step.hint}${onSelect ? ' (click to switch)' : ''}`}
            className={`rounded-t-md text-center text-[10px] font-semibold uppercase tracking-wider transition-all ${
              active
                ? 'bg-accent text-white'
                : 'bg-surface-2 text-ink-dim hover:bg-accent/25 hover:text-ink'
            } ${onSelect ? 'cursor-pointer' : ''}`}
            style={{
              width: `${108 - i * 12}px`,
              paddingTop: active ? '8px' : '4px',
              paddingBottom: active ? '8px' : '4px',
            }}
          >
            {step.label}
          </button>
        );
      })}
    </div>
  );
}
