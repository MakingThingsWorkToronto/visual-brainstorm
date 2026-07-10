import type { Artifact, Board, BoardResponse } from '@visual-brainstorm/protocol';
import { treeToOutline } from './tree-outline.js';

/**
 * Package the user's survey response into labeled, executable instructions.
 * This is the iterative-cycle contract: EVERY UI gesture reaches the model in
 * a form any model (including a delegated subagent that never saw the board)
 * can act on — labels instead of ids, deltas instead of raw values.
 * `artifacts` (when the caller has them) folds the fullscreen keep/kill
 * verdicts + their notes in — standing judgements that steer every next round.
 */
export function buildFeedbackDigest(
  board: Board,
  response: BoardResponse,
  defaultModel?: string,
  artifacts?: Artifact[],
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

  // Answers to Claude's mid-round clarifying questions (Board.questions).
  for (const [qid, answers] of Object.entries(response.questionAnswers)) {
    if (answers.length === 0) continue;
    const question = board.questions.find((q) => q.id === qid)?.question ?? qid;
    digest.push(`Answer — "${question}": ${answers.join(' · ')} — fold this into the next round's direction.`);
  }

  // Marks drawn ON an option's SVG — per-element intent (an arrow AT a shape
  // beats a paragraph ABOUT it). The composite PNG attachment is the eyes; the
  // structured field is the coordinates/colors.
  for (const [id, ann] of Object.entries(response.optionAnnotations)) {
    if (ann.items.length === 0) continue;
    const counts = new Map<string, number>();
    for (const item of ann.items) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
    const summary = [...counts.entries()].map(([t, n]) => `${n} ${t}${n === 1 ? '' : 's'}`).join(', ');
    const notes = ann.items
      .filter((item) => item.type === 'note' && item.text?.trim())
      .map((item) => `"${item.text!.trim()}"`)
      .join('; ');
    const composite = response.attachments.find((a) => a.name === `annotated-${id}.png` && a.savedPath);
    digest.push(
      `Annotated ON "${label(id)}" (marks drawn directly on the option): ${summary}${notes ? ` — notes: ${notes}` : ''}. ` +
        `Arrows point AT the element to change (tail→head); structure with coordinates + palette color names is in ` +
        `this round's response.json under optionAnnotations["${id}"]` +
        (composite ? `; VIEW ${composite.savedPath} to SEE the marks in place.` : '.'),
    );
  }

  for (const [a, b] of response.remixPairs) {
    const recipe = response.remixNotes[`${a}×${b}`] ?? response.remixNotes[`${b}×${a}`];
    digest.push(
      `Remix: mash up "${label(a)}" × "${label(b)}" — next round must show offspring of BOTH.` +
        (recipe ? ` Recipe (what to take from each): ${recipe}` : ''),
    );
  }

  if (response.ranking.length > 0) {
    digest.push(
      `Deck ranking (strongest pull first): ${response.ranking.map(label).join(' > ')} — top ranks lead the synthesis vector.`,
    );
  }
  const deckKeeps = Object.entries(response.deckVerdicts)
    .filter(([, v]) => v === 'keep')
    .map(([id]) => label(id));
  if (deckKeeps.length > 0) {
    digest.push(`Deck KEEP (flicked toward — these directions resonate): ${deckKeeps.join(', ')}.`);
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
      digest.push(`Mutation: "${label(id)}" revealed something under ${lenses.join(', ')} — lean the next round into those distortions.`);
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
  digest.push(...positionNarrative(response, label));
  for (const gap of response.gapNotes) {
    digest.push(
      `Gap between cluster ${gap.between[0] + 1} and ${gap.between[1] + 1}: "${gap.note}" — generate the hybrid living there (highest-value signal).`,
    );
  }

  // Fullscreen artifact verdicts (keep/kill on CAPTURES, distinct from board
  // triage) — standing judgements: a kept artifact's qualities carry forward,
  // a killed one's direction is never regenerated. The verdict note is the
  // user's own steering text; artifact notes ride along on keeps.
  for (const artifact of artifacts ?? []) {
    if (artifact.verdict === 'keep') {
      const extra = [artifact.verdictNote, artifact.notes].filter(Boolean).join(' — ');
      digest.push(
        `Artifact KEPT "${artifact.name}"${extra ? `: ${extra}` : ''} — this captured direction resonates; carry its qualities into the next round.`,
      );
    } else if (artifact.verdict === 'kill') {
      digest.push(
        `Artifact KILLED "${artifact.name}"${artifact.verdictNote ? `: "${artifact.verdictNote}"` : ''} — direction rejected at capture; never regenerate it` +
          (artifact.replacedBy
            ? ` (its slot is filled by "${artifact.replacedBy}").`
            : ' (its replacement is still pending — /replace-artifact owns that slot).'),
      );
    }
  }

  const triageGroups: Record<string, string[]> = { keep: [], kill: [], merge: [] };
  for (const [id, verdict] of Object.entries(response.triage)) triageGroups[verdict]?.push(label(id));
  if (triageGroups.keep.length) digest.push(`Triage KEEP (capture as artifacts): ${triageGroups.keep.join(', ')}.`);
  if (triageGroups.kill.length) digest.push(`Triage KILL (never regenerate this direction): ${triageGroups.kill.join(', ')}.`);
  if (triageGroups.merge.length) digest.push(`Triage MERGE (produce ONE synthesis of): ${triageGroups.merge.join(', ')}.`);

  if (response.uncertainties.length > 0) {
    digest.push(
      `UNSURE (the user can't judge these yet — NOT a kill): ${response.uncertainties.map(label).join(', ')}. ` +
        'Next round include a clarifying variant of each, or ask a Board.questions clarifier probing what makes it hard to judge.',
    );
  }

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
      digest.push(`RENAME: "${op.oldTopic || op.nodeId}" → "${op.topic}" — the new wording IS the intent; use it verbatim.`);
    } else if (op.op === 'move') {
      const dest = op.newParentTopic || op.newParentId;
      digest.push(
        `MOVE: "${op.topic || op.nodeId}" now lives under ${dest ? `"${dest}"` : 'a new parent'} — the user re-filed this idea; respect the new structure.`,
      );
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
    Object.keys(response.deckVerdicts).length > 0 ||
    response.duelResults.length > 0 ||
    response.ranking.length > 0 ||
    Boolean(response.requestedPhase) ||
    Boolean(response.editedTree) ||
    response.treeOps.length > 0;
  const nudges =
    dialLines.length > 0 ||
    Object.keys(response.perOptionNotes).length > 0 ||
    Object.keys(response.flaws).length > 0 ||
    Object.values(response.optionAnnotations).some((ann) => ann.items.length > 0) ||
    Object.values(response.mutations).some((lenses) => lenses.length > 0);
  if (response.action === 'iterate' && !structuralSignals && nudges) {
    const pad = String(board.round).padStart(2, '0');
    const sources = board.options
      .map((option) => `"${option.label}" → round-${pad}/option-${option.id}.svg`)
      .join(', ');
    digest.push(
      `TWEAK, not redirect — MUTATE, don't redraw: this response only adjusts what it saw, so ` +
        `the next round is a targeted MUTATION of THIS round's captured SVGs, never a ` +
        `from-scratch re-authoring. Sources (thread dir): ${sources}. Hand the artisan those ` +
        `files plus ONLY the deltas above; geometry the deltas don't touch is preserved ` +
        `verbatim. Permitted fresh options inside a mutation round: a clarifying variant an ` +
        `UNSURE line ordered, and the one variant "embracing" a flaw. Exception: if the ` +
        `elaboration or a question answer reads as a NEW direction, treat this as a redirect ` +
        `and author fresh.`,
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
    digest.push(
      `Command: run .claude/commands/${command === 'new-brainstorm' ? 'run-brainstorm' : command}.md NOW.` +
        (command === 'artifact-chat'
          ? ` This was a NON-DESTRUCTIVE detour — the board stayed live. After replying, resume the wait ` +
            `with present_board {rearmBoardId: "${response.boardId}"} (no options/tree; a submit that ` +
            `landed during the chat returns immediately).`
          : ''),
    );
  }

  return digest;
}

/**
 * Read the cluster field's raw drag GEOMETRY into instructions — distance IS
 * data (phase-funnel), so the digest must carry more than the discrete cluster
 * sets: how tight each cluster is, which cross-cluster options nearly touch,
 * and which options sit alone. Coordinates are field-percent (0–100).
 */
function positionNarrative(
  response: BoardResponse,
  label: (id: string) => string,
): string[] {
  const entries = Object.entries(response.positions);
  if (entries.length < 2) return [];
  const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.round(Math.hypot(a.x - b.x, a.y - b.y));
  const pos = new Map(entries);
  const clusterOf = new Map<string, number>();
  response.clusters.forEach((cluster, i) => cluster.forEach((id) => clusterOf.set(id, i)));
  const lines: string[] = [];

  // Per-cluster tightness — a welded cluster is ONE fused direction, a loose
  // one is "related but distinct".
  const tightness = response.clusters
    .map((cluster, i) => {
      const pts = cluster.map((id) => pos.get(id)).filter(Boolean) as { x: number; y: number }[];
      if (pts.length < 2) return null;
      let spread = 0;
      for (let a = 0; a < pts.length; a++)
        for (let b = a + 1; b < pts.length; b++) spread = Math.max(spread, dist(pts[a], pts[b]));
      const reading = spread < 14 ? 'welded — treat as ONE fused direction' : spread < 30 ? 'close' : 'loose — related but distinct ideas';
      return `cluster ${i + 1} is ${reading} (spread ${spread})`;
    })
    .filter(Boolean);
  if (tightness.length > 0) lines.push(`Cluster geometry: ${tightness.join('; ')}.`);

  // Closest CROSS-cluster pair — the near-join the discrete sets erase.
  let bridge: { a: string; b: string; d: number } | null = null;
  // Isolation — nearest neighbor per option.
  const isolates: string[] = [];
  for (const [id, p] of entries) {
    let nearest = Infinity;
    for (const [otherId, q] of entries) {
      if (otherId === id) continue;
      const d = dist(p, q);
      nearest = Math.min(nearest, d);
      const ca = clusterOf.get(id);
      const cb = clusterOf.get(otherId);
      if (ca !== undefined && cb !== undefined && ca !== cb && (!bridge || d < bridge.d) && id < otherId) {
        bridge = { a: id, b: otherId, d };
      }
    }
    if (nearest >= 35) isolates.push(`"${label(id)}" (nearest neighbor ${nearest} away)`);
  }
  if (bridge && bridge.d < 40) {
    lines.push(
      `Closest cross-cluster neighbors: "${label(bridge.a)}" ↔ "${label(bridge.b)}" (distance ${bridge.d}) — ` +
        'the user ALMOST joined these; a hybrid of the two is a low-risk bet.',
    );
  }
  if (isolates.length > 0) {
    lines.push(
      `Spatial outliers (parked far from everything): ${isolates.join(', ')} — either uniquely valued or ` +
        'unclassifiable; probe with a clarifying variant or question rather than dropping.',
    );
  }

  // Positions WITHOUT clusters: the user arranged but never grouped — surface
  // the near-pairs so the arrangement isn't silently lost.
  if (response.clusters.length === 0) {
    const pairs: string[] = [];
    for (let a = 0; a < entries.length; a++) {
      for (let b = a + 1; b < entries.length; b++) {
        const d = dist(entries[a][1], entries[b][1]);
        if (d < 22) pairs.push(`"${label(entries[a][0])}" ↔ "${label(entries[b][0])}" (${d})`);
      }
    }
    if (pairs.length > 0) {
      lines.push(
        `Spatial read (no clusters formed, but the arrangement speaks): near pairs ${pairs.join(', ')} — ` +
          'the user relates these; treat each pair as an implicit cluster.',
      );
    }
  }

  return lines;
}
