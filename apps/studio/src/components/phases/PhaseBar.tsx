import type { Phase } from '@visual-brainstorm/protocol';

const STEPS: { phase: Phase; label: string; hint: string }[] = [
  { phase: 'diverge', label: 'Diverge', hint: 'expand freely, no gates' },
  { phase: 'expand', label: 'Expand', hint: 'select and the pool grows' },
  { phase: 'mutate', label: 'Mutate', hint: 'distort one thing at a time' },
  { phase: 'wreck', label: 'Wreck', hint: 'nothing is precious' },
  { phase: 'cluster', label: 'Cluster', hint: 'distance is data' },
  { phase: 'converge', label: 'Converge', hint: 'triage everything, crown the final' },
];

/**
 * The funnel made visible AND steerable: liquid-chrome tabs sized to their
 * words, attached to the guide bubble below; the current phase glows; clicking
 * a tab switches the active mechanic locally and requests that phase for the
 * next round (response.requestedPhase).
 */
export function PhaseBar({
  phase,
  onSelect,
}: {
  phase: Phase;
  onSelect?: (phase: Phase) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-1" aria-label={`Current phase: ${phase}`}>
      {STEPS.map((step) => {
        const active = step.phase === phase;
        return (
          <button
            key={step.phase}
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(step.phase)}
            title={`${step.label}: ${step.hint}${onSelect ? ' (click to switch)' : ''}`}
            className={`rounded-t-lg px-3 text-center text-[10px] font-semibold uppercase tracking-wider transition-all ${
              active ? 'tab-liquid-active text-white' : 'tab-liquid text-ink-dim hover:text-ink'
            } ${onSelect ? 'cursor-pointer' : ''}`}
            style={{
              paddingTop: active ? '8px' : '5px',
              paddingBottom: active ? '8px' : '5px',
            }}
          >
            {step.label}
          </button>
        );
      })}
    </div>
  );
}
