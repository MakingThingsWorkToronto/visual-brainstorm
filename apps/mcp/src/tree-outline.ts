import type { MindNode, MindTree } from '@visual-brainstorm/protocol';
import { countNodes } from './tree-svg.js';

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

function maxDepth(node: MindNode): number {
  const kids = node.children ?? [];
  return kids.length === 0 ? 0 : 1 + Math.max(...kids.map(maxDepth));
}

/** Collapse whitespace so a multi-line topic/note can't break the outline's
 *  line-per-node indentation (the model reads structure by indentation). */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function countNoted(node: MindNode): number {
  return (node.note && node.note.trim() ? 1 : 0) + (node.children ?? []).reduce((n, kid) => n + countNoted(kid), 0);
}

/** Depth-first lines: `  - topic  ` + `_(id · note: …)_`. Root at depth 0. */
function lines(node: MindNode, depth: number, out: string[]): void {
  const indent = '  '.repeat(depth);
  const meta: string[] = [`\`${node.id}\``];
  if (node.note && node.note.trim()) meta.push(`note: ${oneLine(node.note)}`);
  // A candidate gap is a TOP-LEVEL branch (depth 1) the user opened but left
  // empty — a dimension with no ideas under it. Deeper leaves are content.
  const thin = depth === 1 && (node.children ?? []).length === 0;
  out.push(`${indent}- ${oneLine(node.topic)}  _(${meta.join(' · ')})_${thin ? '  — thin' : ''}`);
  for (const kid of node.children ?? []) lines(kid, depth + 1, out);
}

/**
 * The full outline block: a header summary line + the indented tree. Each
 * steering note appears ONCE, inline at its node (`note: …`) — position is
 * meaning; a trailing roll-up would repeat every note verbatim and double the
 * steering text in model context every round (review-followups-2026-07-09
 * item 10). The header carries a noted-node count so steering stays
 * discoverable at a glance. `heading` labels the block (e.g. "Presented tree"
 * / "Edited tree (round 2)").
 */
export function treeToOutline(tree: MindTree, heading = 'Mind map'): string {
  const root = tree.nodeData;
  const nodes = countNodes(root);
  const depth = maxDepth(root);
  const branches = (root.children ?? []).length;
  const noted = countNoted(root);

  const body: string[] = [];
  lines(root, 0, body);

  const parts = [
    `### ${heading}`,
    `Root **${oneLine(root.topic)}** · ${nodes} node${nodes === 1 ? '' : 's'} · ${branches} top branch${
      branches === 1 ? '' : 'es'
    } · depth ${depth}.` +
      (noted > 0
        ? ` ${noted} noted node${noted === 1 ? '' : 's'} — inline \`note:\` markers are the user's steering; read them as intent.`
        : ''),
    '',
    ...body,
  ];
  return parts.join('\n');
}
