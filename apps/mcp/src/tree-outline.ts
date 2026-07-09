import type { MindNode, MindTree } from '@visual-brainstorm/protocol';

/**
 * Deterministic MARKDOWN outline of a mind tree — the model-legible form of the
 * map (operator: "the data must persist in a way the model can fully read +
 * traverse + finds useful"). The SVG snapshot (tree-svg.ts) is for humans; this
 * is for the orchestrator: an indented list it reads at a glance and traverses,
 * with each node's id (for op cross-reference) and its steering note inline.
 *
 * A TOP-LEVEL branch marked `— thin` is a candidate GAP (a dimension the user
 * opened but never filled with ideas) — read-mindmap surfaces these as "where the
 * user wants more." Deeper leaves are content, not gaps, so they are NOT flagged
 * (flagging every leaf would drown the real signal).
 */

function countNodes(node: MindNode): number {
  return 1 + (node.children ?? []).reduce((sum, k) => sum + countNodes(k), 0);
}

function maxDepth(node: MindNode): number {
  const kids = node.children ?? [];
  return kids.length === 0 ? 0 : 1 + Math.max(...kids.map(maxDepth));
}

/** Collapse whitespace so a multi-line topic/note can't break the outline's
 *  line-per-node indentation (the model reads structure by indentation). */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function collectNotes(node: MindNode): { topic: string; id: string; note: string }[] {
  const here =
    node.note && node.note.trim() ? [{ topic: oneLine(node.topic), id: node.id, note: oneLine(node.note) }] : [];
  return [...here, ...(node.children ?? []).flatMap(collectNotes)];
}

/** Depth-first lines: `  - topic  ` + `_(id · note: …)_`. Root at depth 0. */
function lines(node: MindNode, depth: number, out: string[]): void {
  const indent = '  '.repeat(depth);
  const meta: string[] = [`\`${node.id}\``];
  if (node.note && node.note.trim()) meta.push(`note: ${oneLine(node.note)}`);
  // A candidate gap is a TOP-LEVEL branch (depth 1) the user opened but left
  // empty — a dimension with no ideas under it. Deeper leaves are content.
  const thin = depth === 1 && (node.children ?? []).length === 0;
  out.push(`${indent}- ${node.topic}  _(${meta.join(' · ')})_${thin ? '  — thin' : ''}`);
  for (const kid of node.children ?? []) lines(kid, depth + 1, out);
}

/**
 * The full outline block: a header summary line, the indented tree, and a notes
 * roll-up (the explicit steering the user attached). `heading` labels the block
 * (e.g. "Presented tree" / "Edited tree (round 2)").
 */
export function treeToOutline(tree: MindTree, heading = 'Mind map'): string {
  const root = tree.nodeData;
  const nodes = countNodes(root);
  const depth = maxDepth(root);
  const branches = (root.children ?? []).length;
  const noted = collectNotes(root);

  const body: string[] = [];
  lines(root, 0, body);

  const parts = [
    `### ${heading}`,
    `Root **${root.topic}** · ${nodes} node${nodes === 1 ? '' : 's'} · ${branches} top branch${
      branches === 1 ? '' : 'es'
    } · depth ${depth}.`,
    '',
    ...body,
  ];
  if (noted.length > 0) {
    parts.push('', '**Node notes (the user\'s steering — read as intent):**');
    for (const { topic, note } of noted) parts.push(`- **${topic}** → ${note}`);
  }
  return parts.join('\n');
}
