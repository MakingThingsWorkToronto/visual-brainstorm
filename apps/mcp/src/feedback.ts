import type { Board, BoardResponse } from '@visual-brainstorm/protocol';
import { treeToOutline } from './tree-outline.js';

/**
 * Package the user's survey response into labeled, executable instructions.
 * This is the iterative-cycle contract: EVERY UI gesture reaches the model in
 * a form any model (including a delegated subagent that never saw the board)
 * can act on — labels instead of ids, deltas instead of raw values.
 */
export function buildFeedbackDigest(
  board: Board,
  response: BoardResponse,
  defaultModel?: string,
): string[] {
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

  // Mind-map decisions — the tree edit is the feedback (rule 7). editedTree is
  // the final SHAPE; treeOps are the INTENT. A digest that omits these cannot
  // re-synthesize a mind-map round, so both are spelled out for any model.
  if (response.editedTree) {
    // The tree IS the feedback (rule 7): embed the FULL traversable outline (topics
    // + ids + notes) so any model reads the exact structure the user shaped — not a
    // count. Run .claude/commands/read-mindmap.md to turn it into user intention that
    // anchors the next tree + the build plan.
    digest.push(
      'Mind-map edited — this tree IS the feedback; build the next round from it and, at ' +
        'closeout, anchor the plan on it (read-mindmap):\n' +
        treeToOutline(response.editedTree, 'Edited tree (the user\'s current structure)'),
    );
  }
  for (const op of response.treeOps) {
    if (op.op === 'explode') {
      digest.push(
        `EXPLODE "${op.topic || op.nodeId}"${op.note ? ` [note: ${op.note}]` : ''} — expand this node into ≥5 children relevant to its topic${op.note ? ' AND that note' : ''}; append them under it in the returned tree.`,
      );
    } else if (op.op === 'add') {
      digest.push(`ADD: user seeded ${op.count ?? 5} blank idea node${(op.count ?? 5) === 1 ? '' : 's'} under "${op.topic || op.nodeId}" — help fill them next round.`);
    } else if (op.op === 'delete') {
      digest.push(`DELETE: "${op.topic || op.nodeId}" was eliminated — never reintroduce this branch.`);
    } else if (op.op === 'note') {
      digest.push(`NOTE set on "${op.topic || op.nodeId}": ${op.note} — steers future expansion of this node.`);
    } else if (op.op === 'rename') {
      digest.push(`RENAME: "${op.nodeId}" → "${op.topic}".`);
    } else if (op.op === 'move') {
      digest.push(`MOVE: "${op.topic || op.nodeId}" was re-parented — respect the new structure.`);
    }
  }

  // Tweak vs redirect (token economy): a hands-on adjustment round — dials,
  // notes, flaws, mutation lenses, with NO structural signal (no selections,
  // remixes, triage, deck verdicts, phase steer, tree edits) — is asking to
  // re-tune what it SAW, not for new directions. Mutating this round's
  // captured SVGs preserves the liked geometry exactly (continuity) and pays
  // only the delta (tokens); a from-scratch re-authoring would pay the full
  // generation price for a small nudge.
  const structuralSignals =
    response.selectedOptionIds.length > 0 ||
    response.remixPairs.length > 0 ||
    Object.keys(response.triage).length > 0 ||
    response.clusters.length > 0 ||
    response.gapNotes.length > 0 ||
    Object.values(response.deckVerdicts).some((v) => v === 'kill') ||
    response.duelResults.length > 0 ||
    response.ranking.length > 0 ||
    Boolean(response.requestedPhase) ||
    Boolean(response.editedTree) ||
    response.treeOps.length > 0;
  const nudges =
    dialLines.length > 0 ||
    Object.keys(response.perOptionNotes).length > 0 ||
    Object.keys(response.flaws).length > 0 ||
    Object.values(response.mutations).some((lenses) => lenses.length > 0);
  if (response.action === 'iterate' && !structuralSignals && nudges) {
    const pad = String(board.round).padStart(2, '0');
    digest.push(
      `TWEAK, not redirect — MUTATE, don't redraw: this response only adjusts what it saw, so ` +
        `the next round is a targeted MUTATION of THIS round's captured SVGs (thread dir ` +
        `round-${pad}/option-<id>.svg), never a from-scratch re-authoring. Hand the artisan those ` +
        `source files plus ONLY the deltas above; geometry the deltas don't touch is preserved ` +
        `verbatim. Exception: if the elaboration reads as a NEW direction, treat this as a ` +
        `redirect and author fresh.`,
    );
  }

  if (response.requestedPhase) {
    digest.push(`Phase steer: user clicked the "${response.requestedPhase}" tab — next board MUST use that phase.`);
  }
  // Routing is ALWAYS explicit (token-economy decision 4): a response without a
  // per-round pick still routes, by name, to the session's best-SVG default —
  // never a model:undefined fallthrough decided by omission.
  if (response.model) {
    digest.push(`Model routing: delegate next-round generation to ${response.model}.`);
  } else if (defaultModel) {
    digest.push(
      `Model routing: no per-round pick — delegate next-round generation to the best-SVG default ${defaultModel} (explicit; never route by omission).`,
    );
  }
  for (const command of response.commands) {
    digest.push(`Command: run .claude/commands/${command === 'new-brainstorm' ? 'run-brainstorm' : command}.md NOW.`);
  }

  return digest;
}
