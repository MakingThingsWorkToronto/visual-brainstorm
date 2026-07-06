import type { Phase } from '@visual-brainstorm/protocol';

const STEPS: { phase: Phase; label: string; hint: string }[] = [
  { phase: 'diverge', label: 'Diverge', hint: 'expand freely — no gates' },
  { phase: 'mutate', label: 'Mutate', hint: 'distort one thing at a time' },
  { phase: 'wreck', label: 'Wreck', hint: 'nothing is precious' },
  { phase: 'cluster', label: 'Cluster', hint: 'distance is data' },
  { phase: 'converge', label: 'Converge', hint: 'the gate — triage everything' },
];

/** The funnel made visible: widths narrow toward converge; current phase glows. */
export function PhaseBar({ phase }: { phase: Phase }) {
  return (
    <div className="flex items-end gap-1" aria-label={`Current phase: ${phase}`}>
      {STEPS.map((step, i) => {
        const active = step.phase === phase;
        return (
          <div
            key={step.phase}
            title={`${step.label} — ${step.hint}`}
            className={`rounded-t-md text-center text-[10px] font-semibold uppercase tracking-wider transition-all ${
              active ? 'bg-accent text-white' : 'bg-surface-2 text-ink-dim'
            }`}
            style={{
              width: `${112 - i * 16}px`,
              paddingTop: active ? '8px' : '4px',
              paddingBottom: active ? '8px' : '4px',
            }}
          >
            {step.label}
          </div>
        );
      })}
    </div>
  );
}
