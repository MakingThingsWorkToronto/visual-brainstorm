import type { BoardOption, RoundRecord } from '@visual-brainstorm/protocol';

/**
 * Sudden-death finale: compose the shareable "contact sheet" poster — the
 * winner large, its lineage tree, and the notes that decided it — as ONE
 * self-contained SVG. Deterministic composition from thread state; no model
 * involvement, no raster, no external refs (rule 8 inputs are already-stored
 * board SVGs).
 */

const INK = '#1f2430';
const DIM = '#6b7280';
const LINE = '#d7dae0';
const ACCENT = '#A855F7';

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Embed a stored option SVG at a fixed slot by rewriting its root tag. */
function embed(svg: string, x: number, y: number, w: number, h: number): string {
  const cleaned = svg.replace(/<\?xml[^>]*\?>/, '').trim();
  return cleaned.replace(
    /<svg([^>]*?)(\s(?:width|height)="[^"]*")*([^>]*)>/,
    (_m, pre: string, _wh: string, post: string) =>
      `<svg x="${x}" y="${y}" width="${w}" height="${h}"${pre}${post}>`,
  );
}

interface LineageNode {
  option: BoardOption;
  round: number;
}

/** Find an option (and its round) by id — latest round wins. */
function findOption(rounds: RoundRecord[], id: string): LineageNode | null {
  for (let i = rounds.length - 1; i >= 0; i--) {
    const option = rounds[i].board.options.find((o) => o.id === id);
    if (option) return { option, round: rounds[i].board.round };
  }
  return null;
}

export function composePoster(rounds: RoundRecord[], winnerOptionId: string, title: string): string {
  const winner = findOption(rounds, winnerOptionId);
  if (!winner) {
    throw new Error(
      `option "${winnerOptionId}" not found in any round — compose_poster needs an id from this thread`,
    );
  }

  // Lineage: parents, then grandparents (breadth-first, capped for layout).
  const parents = winner.option.parents
    .map((id) => findOption(rounds, id))
    .filter((n): n is LineageNode => n !== null)
    .slice(0, 3);
  const grandparents = parents
    .flatMap((p) => p.option.parents)
    .filter((id, i, all) => all.indexOf(id) === i)
    .map((id) => findOption(rounds, id))
    .filter((n): n is LineageNode => n !== null)
    .slice(0, 4);

  // The notes that decided it: per-option notes on the winner/ancestors + the
  // last few elaborations, straight from recorded responses.
  const lineageIds = new Set([winner.option.id, ...parents.map((p) => p.option.id)]);
  const notes: string[] = [];
  for (const round of rounds) {
    if (!round.response) continue;
    for (const [id, note] of Object.entries(round.response.perOptionNotes)) {
      if (lineageIds.has(id) && note.trim()) notes.push(note.trim());
    }
    if (round.response.elaboration.trim()) notes.push(round.response.elaboration.trim());
  }
  const noteLines = notes.slice(-5);

  const nodeBox = (node: LineageNode, x: number, y: number, w: number): string =>
    `<g><rect x="${x}" y="${y}" width="${w}" height="34" rx="6" fill="none" stroke="${LINE}" stroke-width="1.5"/>` +
    `<text x="${x + w / 2}" y="${y + 15}" font-size="11" font-weight="600" fill="${INK}" text-anchor="middle" font-family="system-ui,sans-serif">${esc(clip(node.option.label, 26))}</text>` +
    `<text x="${x + w / 2}" y="${y + 28}" font-size="9" fill="${DIM}" text-anchor="middle" font-family="system-ui,sans-serif">round ${node.round}</text></g>`;

  const treeX = 416;
  const treeW = 352;
  const parts: string[] = [];

  // Frame + header
  parts.push(`<rect x="1" y="1" width="798" height="558" rx="14" fill="#ffffff" stroke="${LINE}" stroke-width="2"/>`);
  parts.push(
    `<path d="M32 52 l4 -12 l6 8 l6 -10 l6 10 l6 -8 l4 12 z" fill="none" stroke="${ACCENT}" stroke-width="2.5" stroke-linejoin="round"/>`,
  );
  parts.push(
    `<text x="72" y="42" font-size="22" font-weight="700" fill="${INK}" font-family="system-ui,sans-serif">${esc(clip(title, 52))}</text>`,
  );
  parts.push(
    `<text x="72" y="60" font-size="11" fill="${DIM}" font-family="system-ui,sans-serif">Visual Brainstorm decision poster · ${rounds.length} round${rounds.length === 1 ? '' : 's'} · the winner and how it was found</text>`,
  );
  parts.push(`<line x1="32" y1="74" x2="768" y2="74" stroke="${LINE}" stroke-width="1.5"/>`);

  // Winner pane
  parts.push(`<rect x="32" y="90" width="352" height="296" rx="10" fill="none" stroke="${ACCENT}" stroke-width="2.5"/>`);
  parts.push(embed(winner.option.svg, 44, 100, 328, 260));
  parts.push(
    `<text x="208" y="378" font-size="14" font-weight="700" fill="${INK}" text-anchor="middle" font-family="system-ui,sans-serif">🏁 ${esc(clip(winner.option.label, 36))}</text>`,
  );
  if (winner.option.description) {
    parts.push(
      `<text x="208" y="404" font-size="10.5" fill="${DIM}" text-anchor="middle" font-family="system-ui,sans-serif">${esc(clip(winner.option.description, 66))}</text>`,
    );
  }

  // Lineage tree (winner → parents → grandparents)
  parts.push(
    `<text x="${treeX}" y="104" font-size="12" font-weight="700" fill="${INK}" font-family="system-ui,sans-serif">Lineage — where it came from</text>`,
  );
  const winnerNodeX = treeX + treeW / 2 - 70;
  parts.push(
    `<g><rect x="${winnerNodeX}" y="116" width="140" height="34" rx="6" fill="none" stroke="${ACCENT}" stroke-width="2"/>` +
      `<text x="${winnerNodeX + 70}" y="131" font-size="11" font-weight="600" fill="${INK}" text-anchor="middle" font-family="system-ui,sans-serif">${esc(clip(winner.option.label, 24))}</text>` +
      `<text x="${winnerNodeX + 70}" y="144" font-size="9" fill="${DIM}" text-anchor="middle" font-family="system-ui,sans-serif">round ${winner.round} · winner</text></g>`,
  );
  const pw = Math.min(150, (treeW - 16 * (parents.length - 1)) / Math.max(parents.length, 1));
  parents.forEach((parent, i) => {
    const x = treeX + i * (pw + 16);
    parts.push(`<line x1="${treeX + treeW / 2}" y1="150" x2="${x + pw / 2}" y2="176" stroke="${LINE}" stroke-width="1.5"/>`);
    parts.push(nodeBox(parent, x, 176, pw));
  });
  const gw = Math.min(120, (treeW - 12 * (grandparents.length - 1)) / Math.max(grandparents.length, 1));
  grandparents.forEach((gp, i) => {
    const x = treeX + i * (gw + 12);
    parts.push(`<line x1="${treeX + treeW / 2}" y1="210" x2="${x + gw / 2}" y2="236" stroke="${LINE}" stroke-width="1" stroke-dasharray="3 3"/>`);
    parts.push(nodeBox(gp, x, 236, gw));
  });
  if (parents.length === 0) {
    parts.push(
      `<text x="${treeX}" y="182" font-size="10.5" fill="${DIM}" font-family="system-ui,sans-serif">A round-one original — no ancestors.</text>`,
    );
  }

  // Notes that decided it
  const notesY = 306;
  parts.push(
    `<text x="${treeX}" y="${notesY}" font-size="12" font-weight="700" fill="${INK}" font-family="system-ui,sans-serif">The notes that decided it</text>`,
  );
  if (noteLines.length === 0) {
    parts.push(
      `<text x="${treeX}" y="${notesY + 20}" font-size="10.5" fill="${DIM}" font-family="system-ui,sans-serif">(no notes were recorded this thread)</text>`,
    );
  }
  noteLines.forEach((note, i) => {
    parts.push(
      `<g><circle cx="${treeX + 4}" cy="${notesY + 17 + i * 18}" r="2" fill="${ACCENT}"/>` +
        `<text x="${treeX + 14}" y="${notesY + 21 + i * 18}" font-size="10.5" fill="${INK}" font-family="system-ui,sans-serif">${esc(clip(note, 62))}</text></g>`,
    );
  });

  // Footer
  parts.push(`<line x1="32" y1="522" x2="768" y2="522" stroke="${LINE}" stroke-width="1.5"/>`);
  parts.push(
    `<text x="32" y="542" font-size="10" fill="${DIM}" font-family="system-ui,sans-serif">Every option and every response behind this poster is cached in the thread directory — nothing was regenerated.</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560">${parts.join('')}</svg>`;
}
