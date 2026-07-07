import type { Phase, RoundRecord } from '@visual-brainstorm/protocol';

/**
 * Phase autopilot heuristics — mirrors the transition table in
 * .claude/skills/brainstorm-phases (the orchestrator still decides; this is
 * the studio's proposal). Pure; tested in scripts/ui-smoke.ts.
 */
export interface PhaseProposal {
  phase: Phase;
  reason: string;
}

export function proposeNextPhase(rounds: RoundRecord[], activePhase: Phase | null): PhaseProposal | null {
  if (rounds.length === 0) return null;
  const phase = activePhase ?? rounds[rounds.length - 1].board.phase;
  const pool = rounds.reduce((sum, r) => sum + r.board.options.length, 0);

  if (phase === 'converge') return null; // finalize is a human call, never proposed
  if (phase === 'cluster') return { phase: 'converge', reason: 'clusters are mapped, time to distill' };
  if (phase === 'wreck') return { phase: 'converge', reason: 'flaws are named, fix and distill' };
  if (phase === 'mutate') {
    return pool >= 8
      ? { phase: 'cluster', reason: `${pool} options in the pool, map them` }
      : { phase: 'converge', reason: 'distortions explored, time to narrow' };
  }
  // diverge / expand
  if (pool >= 8) return { phase: 'cluster', reason: `pool is full (${pool} options), map it` };
  if (rounds.length >= 3) return { phase: 'converge', reason: `${rounds.length} rounds in, force the narrowing` };
  return { phase: 'expand', reason: 'a direction resonating? grow it without dropping the rest' };
}
