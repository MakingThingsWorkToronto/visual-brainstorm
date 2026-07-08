import type { RoundRecord } from '@visual-brainstorm/protocol';

/**
 * The decision tree: a derived, per-discussion visualization of HOW the
 * brainstorm decided (CLAUDE.md — "so users can see decision making visually").
 * Built deterministically from the append-only round records, so it reloads
 * with the thread and never fabricates. Rendered to a self-contained,
 * XML-escaped SVG (rule 8: labels are data, never markup).
 *
 * Shape: root (the discussion) → one node per round → the round's decisions
 * (chosen ✓ / rejected / the action taken / mind-map explode·delete·note ops).
 * Colour encodes the KIND of decision so the path the user took reads at a
 * glance.
 */

export type DecisionKind =
  | 'root'
  | 'round'
  | 'chosen'
  | 'rejected'
  | 'action'
  | 'explode'
  | 'delete'
  | 'note'
  | 'edit'
  | 'pending';

export interface DecisionNode {
  label: string;
  kind: DecisionKind;
  children?: DecisionNode[];
}

export interface DecisionTree {
  nodeData: DecisionNode;
}

const ACTION_VERB: Record<string, string> = {
  iterate: 'Iterated',
  accept: 'Accepted',
  park: 'Parked',
  finalize: 'Finalized',
  back: 'Went back',
};

/** Turn a thread's rounds into the decision tree. Pure — no I/O, deterministic. */
export function buildDecisionTree(title: string, rounds: RoundRecord[]): DecisionTree {
  const roundNodes: DecisionNode[] = rounds.map((round) => {
    const { board, response } = round;
    const optionLabel = (id: string) => board.options.find((o) => o.id === id)?.label ?? id;
    const children: DecisionNode[] = [];

    if (!response) {
      children.push({ label: 'awaiting answer', kind: 'pending' });
    } else {
      children.push({ label: ACTION_VERB[response.action] ?? response.action, kind: 'action' });

      // Funnel rounds: chosen ✓ vs rejected options.
      const chosen = new Set(response.selectedOptionIds);
      for (const id of response.selectedOptionIds) {
        children.push({ label: `✓ ${optionLabel(id)}`, kind: 'chosen' });
      }
      for (const option of board.options) {
        if (!chosen.has(option.id)) {
          children.push({ label: `✕ ${option.label}`, kind: 'rejected' });
        }
      }

      // Mind-map rounds: the tree edit + the node ops.
      if (response.editedTree) {
        children.push({ label: `edited: ${response.editedTree.nodeData.topic}`, kind: 'edit' });
      }
      for (const op of response.treeOps) {
        const target = op.topic || op.nodeId;
        if (op.op === 'explode') {
          children.push({ label: `⨁ explode: ${target}${op.note ? ` (${op.note})` : ''}`, kind: 'explode' });
        } else if (op.op === 'delete') {
          children.push({ label: `⌫ deleted: ${target}`, kind: 'delete' });
        } else if (op.op === 'add') {
          children.push({ label: `+${op.count ?? 5} under: ${target}`, kind: 'explode' });
        } else if (op.op === 'note') {
          children.push({ label: `✎ note: ${target}`, kind: 'note' });
        } else if (op.op === 'rename') {
          children.push({ label: `✎ rename → ${op.topic}`, kind: 'note' });
        } else if (op.op === 'move') {
          children.push({ label: `↕ moved: ${target}`, kind: 'edit' });
        }
      }

      if (response.elaboration.trim()) {
        children.push({ label: `“${response.elaboration.trim().slice(0, 48)}”`, kind: 'note' });
      }
    }

    return {
      label: `Round ${board.round} · ${board.phase}`,
      kind: 'round',
      children,
    };
  });

  return {
    nodeData: {
      label: title,
      kind: 'root',
      children: roundNodes.length ? roundNodes : [{ label: 'no rounds yet', kind: 'pending' }],
    },
  };
}

// ---------------------------------------------------------------------------
// Deterministic SVG render (mirrors tree-svg.ts layout; coloured by DecisionKind)
// ---------------------------------------------------------------------------

const NODE_H = 30;
const V_GAP = 10;
const COL_STRIDE = 240;
const NODE_W = 210;
const PAD = 24;
const CHAR_W = 6.6;

/** Fill / stroke / ink per decision kind — the visual legend. */
const KIND_STYLE: Record<DecisionKind, { fill: string; stroke: string; ink: string }> = {
  root: { fill: '#1e293b', stroke: '#1e293b', ink: '#f8fafc' },
  round: { fill: '#0f172a', stroke: '#6366f1', ink: '#f8fafc' },
  chosen: { fill: '#dcfce7', stroke: '#10b981', ink: '#065f46' },
  rejected: { fill: '#f1f5f9', stroke: '#cbd5e1', ink: '#94a3b8' },
  action: { fill: '#eef2ff', stroke: '#6366f1', ink: '#3730a3' },
  explode: { fill: '#fef3c7', stroke: '#f59e0b', ink: '#92400e' },
  delete: { fill: '#fee2e2', stroke: '#ef4444', ink: '#991b1b' },
  note: { fill: '#f3e8ff', stroke: '#a855f7', ink: '#6b21a8' },
  edit: { fill: '#e0f2fe', stroke: '#0ea5e9', ink: '#075985' },
  pending: { fill: '#ffffff', stroke: '#cbd5e1', ink: '#64748b' },
};

function escapeXml(text: string): string {
  return text.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

function fit(label: string): string {
  const max = Math.floor((NODE_W - 16) / CHAR_W);
  const clean = label.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

interface Placed {
  node: DecisionNode;
  depth: number;
  cy: number;
  children: Placed[];
}

function subtreeHeight(node: DecisionNode): number {
  const kids = node.children ?? [];
  if (kids.length === 0) return NODE_H;
  const stacked = kids.reduce((sum, k) => sum + subtreeHeight(k), 0) + V_GAP * (kids.length - 1);
  return Math.max(NODE_H, stacked);
}

function place(node: DecisionNode, depth: number, top: number): Placed {
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

function maxDepth(node: DecisionNode): number {
  const kids = node.children ?? [];
  return kids.length === 0 ? 0 : 1 + Math.max(...kids.map(maxDepth));
}

export function decisionTreeToSvg(tree: DecisionTree): string {
  const root = tree.nodeData;
  const placedRoot = place(root, 0, PAD);
  const width = PAD * 2 + maxDepth(root) * COL_STRIDE + NODE_W;
  const height = PAD * 2 + subtreeHeight(root);

  const nodes: string[] = [];
  const edges: string[] = [];

  const draw = (p: Placed): void => {
    const x = PAD + p.depth * COL_STRIDE;
    const y = p.cy - NODE_H / 2;
    const s = KIND_STYLE[p.node.kind];
    const isBold = p.node.kind === 'root' || p.node.kind === 'round';
    nodes.push(
      `<rect x="${x}" y="${y}" width="${NODE_W}" height="${NODE_H}" rx="8" ` +
        `fill="${s.fill}" stroke="${s.stroke}" stroke-width="2"/>` +
        `<text x="${x + 10}" y="${p.cy + 4}" font-family="system-ui, sans-serif" ` +
        `font-size="12" font-weight="${isBold ? 700 : 500}" fill="${s.ink}">` +
        `${escapeXml(fit(p.node.label))}</text>`,
    );
    for (const kid of p.children) {
      const x1 = x + NODE_W;
      const y1 = p.cy;
      const x2 = PAD + kid.depth * COL_STRIDE;
      const y2 = kid.cy;
      const mid = (x1 + x2) / 2;
      edges.push(
        `<path d="M${x1} ${y1} C${mid} ${y1} ${mid} ${y2} ${x2} ${y2}" ` +
          `fill="none" stroke="${KIND_STYLE[kid.node.kind].stroke}" stroke-width="1.5"/>`,
      );
      draw(kid);
    }
  };
  draw(placedRoot);

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="${width}" height="${height}" role="img">` +
    `<rect width="${width}" height="${height}" fill="#f8fafc"/>` +
    edges.join('') +
    nodes.join('') +
    `</svg>`
  );
}
