import type { Board, BoardResponse } from '@visual-brainstorm/protocol';

/**
 * Package the user's survey response into labeled, executable instructions.
 * This is the iterative-cycle contract: EVERY UI gesture reaches the model in
 * a form any model (including a delegated subagent that never saw the board)
 * can act on — labels instead of ids, deltas instead of raw values.
 */
export function buildFeedbackDigest(board: Board, response: BoardResponse): string[] {
  const label = (id: string) => board.options.find((o) => o.id === id)?.label ?? id;
  const digest: string[] = [];

  digest.push(`Action: ${response.action} (round ${board.round}, phase ${board.phase}).`);

  if (response.action === 'back') {
    digest.push(
      'BACK: the user rejected this round — re-present the PREVIOUS round’s board unchanged ' +
        '(recover its exact options from brainstorm.md or round-N-1/board.json) and await a fresh ' +
        'answer. Do not advance the funnel; ignore the rest of this response as steering.',
    );
    return digest;
  }

  if (response.selectedOptionIds.length > 0) {
    digest.push(`Selected: ${response.selectedOptionIds.map(label).join(', ')}.`);
  } else {
    digest.push('Selected: none — read the dials/notes/phase fields for the actual signal.');
  }

  if (response.elaboration.trim()) {
    digest.push(`Elaboration: "${response.elaboration.trim()}"`);
  }

  if (response.paletteColors.length > 0) {
    digest.push(
      `Palette: generate the next round's SVGs using ONLY these colors: ${response.paletteColors
        .map((c) => `${c.name} (${c.value})`)
        .join(', ')}.`,
    );
  }

  for (const attachment of response.attachments) {
    const name = attachment.name || 'unnamed file';
    digest.push(
      attachment.savedPath
        ? `Attachment "${name}" saved at ${attachment.savedPath} — Read it and fold it into the next round.`
        : `Attachment "${name}" FAILED to persist (bad data URI or over 10MB) — tell the user honestly and ask them to retry.`,
    );
  }

  for (const [id, note] of Object.entries(response.perOptionNotes)) {
    digest.push(`Note on "${label(id)}": ${note}`);
  }

  for (const [a, b] of response.remixPairs) {
    digest.push(`Remix: mash up "${label(a)}" × "${label(b)}" — next round must show offspring of BOTH.`);
  }

  if (response.ranking.length > 0) {
    digest.push(
      `Deck ranking (strongest pull first): ${response.ranking.map(label).join(' > ')} — top ranks lead the synthesis vector.`,
    );
  }
  const deckKills = Object.entries(response.deckVerdicts)
    .filter(([, v]) => v === 'kill')
    .map(([id]) => label(id));
  if (deckKills.length > 0) {
    digest.push(`Deck KILL (flicked away — drop these directions for good): ${deckKills.join(', ')}.`);
  }
  for (const duel of response.duelResults) {
    const loser = duel.pair.find((id) => id !== duel.winner) ?? duel.pair[1];
    digest.push(`Duel: "${label(duel.winner)}" beat "${label(loser)}" head-to-head — a direct preference.`);
  }

  const dialLines = board.survey.axes
    .map((axis) => {
      const value = response.axisValues[axis.id] ?? axis.defaultValue;
      if (value === axis.defaultValue) return null;
      const direction = value > axis.defaultValue ? axis.rightLabel : axis.leftLabel;
      return `${axis.label}: ${axis.defaultValue}→${value} (toward "${direction}")`;
    })
    .filter(Boolean);
  if (dialLines.length > 0) {
    digest.push(
      `Dials moved — regenerate visibly re-tuned (a dial-only response is a complete instruction): ${dialLines.join('; ')}.`,
    );
  }

  for (const [id, lenses] of Object.entries(response.mutations)) {
    if (lenses.length > 0) {
      digest.push(`Mutation: "${label(id)}" revealed something under ${lenses.join(', ')} — lean the regeneration into those distortions.`);
    }
  }

  for (const [id, flaw] of Object.entries(response.flaws)) {
    digest.push(`Flaw in "${label(id)}": ${flaw} — return a fix candidate AND a variant embracing it.`);
  }

  if (response.clusters.length > 0) {
    const named = response.clusters
      .map((cluster, i) => `cluster ${i + 1}: [${cluster.map(label).join(', ')}]`)
      .join('; ');
    digest.push(`Proximity clusters (the user's implicit taxonomy): ${named}.`);
  }
  for (const gap of response.gapNotes) {
    digest.push(
      `Gap between cluster ${gap.between[0] + 1} and ${gap.between[1] + 1}: "${gap.note}" — generate the hybrid living there (highest-value signal).`,
    );
  }

  const triageGroups: Record<string, string[]> = { keep: [], kill: [], merge: [] };
  for (const [id, verdict] of Object.entries(response.triage)) triageGroups[verdict]?.push(label(id));
  if (triageGroups.keep.length) digest.push(`Triage KEEP (capture as artifacts): ${triageGroups.keep.join(', ')}.`);
  if (triageGroups.kill.length) digest.push(`Triage KILL (never regenerate this direction): ${triageGroups.kill.join(', ')}.`);
  if (triageGroups.merge.length) digest.push(`Triage MERGE (produce ONE synthesis of): ${triageGroups.merge.join(', ')}.`);

  if (response.action === 'finalize' && response.finalOptionId) {
    const viaBracket = response.duelResults.length > 0 ? ' It won the sudden-death bracket.' : '';
    digest.push(
      `FINAL: "${label(response.finalOptionId)}" is THE one.${viaBracket} capture_artifact it now, ` +
        'compose_poster to build the shareable contact sheet, then run .claude/commands/plan-closeout.md — ' +
        'finality triggers closeout; the thread is done.',
    );
  }

  if (response.requestedPhase) {
    digest.push(`Phase steer: user clicked the "${response.requestedPhase}" tab — next board MUST use that phase.`);
  }
  if (response.model) {
    digest.push(`Model routing: delegate next-round generation to ${response.model}.`);
  }
  for (const command of response.commands) {
    digest.push(`Command: run .claude/commands/${command === 'new-brainstorm' ? 'run-brainstorm' : command}.md NOW.`);
  }

  return digest;
}
