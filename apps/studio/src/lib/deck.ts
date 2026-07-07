/**
 * Judge-deck ranking mechanics — pure functions, tested in scripts/ui-smoke.ts.
 * Keeps accumulate in flick order; one adjacent-pair duel pass refines the
 * order. Every duel is preference data shipped in response.duelResults.
 */

export interface DuelResult {
  pair: [string, string];
  winner: string;
}

/** Move the duel winner above the loser (no-op when already above). */
export function applyDuel(ranking: string[], winner: string, loser: string): string[] {
  const wi = ranking.indexOf(winner);
  const li = ranking.indexOf(loser);
  if (wi === -1 || li === -1 || wi < li) return ranking;
  const next = ranking.filter((id) => id !== winner);
  next.splice(next.indexOf(loser), 0, winner);
  return next;
}

/** One refinement pass: each adjacent pair of the keep order becomes a duel. */
export function adjacentDuels(ranking: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < ranking.length; i++) pairs.push([ranking[i], ranking[i + 1]]);
  return pairs;
}
