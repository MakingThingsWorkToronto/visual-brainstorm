import type { MindNode, MindTree } from '@visual-brainstorm/protocol';

/**
 * Deterministic server-side snapshot of a mind tree as a self-contained SVG
 * (CLAUDE.md rule 7: every presented tree is captured, never regenerated). This
 * is the ARCHIVAL still — the live editing surface is mind-elixir in the browser.
 * Text is XML-escaped (rule 8): topics are data, never markup, so a topic like
 * `<script>` renders as literal text and can inject nothing.
 */

const NODE_H = 30;
const V_GAP = 12;
const COL_STRIDE = 210;
const NODE_W = 172;
const PAD = 24;
const CHAR_W = 7.1;

function escapeXml(text: string): string {
  return text.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

/** Trim a topic to what fits one node box, with an ellipsis when clipped. */
function fit(topic: string): string {
  const max = Math.floor((NODE_W - 16) / CHAR_W);
  const clean = topic.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

interface Placed {
  node: MindNode;
  depth: number;
  cy: number;
  children: Placed[];
}

/** Total vertical extent of a node's subtree (leaves are one row tall). */
function subtreeHeight(node: MindNode): number {
  const kids = node.children ?? [];
  if (kids.length === 0) return NODE_H;
  const stacked = kids.reduce((sum, k) => sum + subtreeHeight(k), 0) + V_GAP * (kids.length - 1);
  return Math.max(NODE_H, stacked);
}

/** Place every node: x by depth, y as the vertical center of its subtree band. */
function place(node: MindNode, depth: number, top: number): Placed {
  const height = subtreeHeight(node);
  const cy = top + height / 2;
  const children: Placed[] = [];
  let cursor = top;
  for (const kid of node.children ?? []) {
    const kh = subtreeHeight(kid);
    children.push(place(kid, depth + 1, cursor));
    cursor += kh + V_GAP;
  }
  return { node, depth, cy, children };
}

function maxDepth(node: MindNode): number {
  const kids = node.children ?? [];
  return kids.length === 0 ? 0 : 1 + Math.max(...kids.map(maxDepth));
}

/** Accent-tinted palette cycling across first-level branches, mind-elixir-like. */
const BRANCH_COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#a855f7'];

export function treeToSvg(tree: MindTree): string {
  const root = tree.nodeData;
  const placedRoot = place(root, 0, PAD);
  const width = PAD * 2 + maxDepth(root) * COL_STRIDE + NODE_W;
  const height = PAD * 2 + subtreeHeight(root);

  const nodes: string[] = [];
  const edges: string[] = [];

  const draw = (p: Placed, color: string): void => {
    const x = PAD + p.depth * COL_STRIDE;
    const y = p.cy - NODE_H / 2;
    const isRoot = p.depth === 0;
    const fill = isRoot ? '#1e293b' : '#ffffff';
    const stroke = isRoot ? '#1e293b' : color;
    const ink = isRoot ? '#f8fafc' : '#0f172a';
    nodes.push(
      `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="8" ` +
        `fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
        `<text x="${x + NODE_W / 2}" y="${p.cy + 4}" font-family="system-ui, sans-serif" ` +
        `font-size="13" font-weight="${isRoot ? 700 : 500}" text-anchor="middle" fill="${ink}">` +
        `${escapeXml(fit(p.node.topic))}</text>`,
    );
    for (const kid of p.children) {
      const branchColor = isRoot
        ? BRANCH_COLORS[p.children.indexOf(kid) % BRANCH_COLORS.length]
        : color;
      const x1 = x + NODE_W;
      const y1 = p.cy;
      const x2 = PAD + kid.depth * COL_STRIDE;
      const y2 = kid.cy;
      const mid = (x1 + x2) / 2;
      edges.push(
        `<path d="M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}" ` +
          `fill="none" stroke="${branchColor}" stroke-width="2"/>`,
      );
      draw(kid, branchColor);
    }
  };
  draw(placedRoot, BRANCH_COLORS[0]);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}" role="img">` +
    `<rect width="${width}" height="${height}" fill="#f8fafc"/>` +
    edges.join('') +
    nodes.join('') +
    `</svg>`
  );
}

/** Count nodes in a tree (used for provenance notes + history summaries). */
export function countNodes(node: MindNode): number {
  return 1 + (node.children ?? []).reduce((sum, k) => sum + countNodes(k), 0);
}
