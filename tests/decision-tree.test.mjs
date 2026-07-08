/**
 * Unit coverage for the per-discussion decision tree (apps/mcp/dist/decision-tree.js):
 * the derived visualization of HOW a brainstorm decided (chosen ✓ / rejected ✕ /
 * action / mind-map explode·delete·note ops), rendered to a self-contained,
 * XML-escaped SVG (rule 8). Built deterministically from the round records —
 * imports from BUILT output, so build first. Run: npm run test:unit.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { buildDecisionTree, decisionTreeToSvg } from '../apps/mcp/dist/decision-tree.js';

/** A funnel round: two options, one chosen, iterated. */
function funnelRound() {
  return {
    board: {
      round: 1,
      phase: 'diverge',
      kind: 'icon-grid',
      options: [
        { id: 'r1-o1', label: 'Bold', svg: '', tags: [], parents: [] },
        { id: 'r1-o2', label: 'Quiet', svg: '', tags: [], parents: [] },
      ],
    },
    response: {
      action: 'iterate',
      selectedOptionIds: ['r1-o1'],
      elaboration: '',
      treeOps: [],
    },
  };
}

/** A mind-map round: an explode op steered by a note, plus a delete. */
function mindmapRound() {
  return {
    board: { round: 2, phase: 'diverge', kind: 'mindmap', options: [] },
    response: {
      action: 'iterate',
      selectedOptionIds: [],
      elaboration: '',
      editedTree: { nodeData: { id: 'root', topic: 'Onboarding' } },
      treeOps: [
        { op: 'explode', nodeId: 'n2', topic: 'Payments', note: 'focus on trust', at: '2026-07-07T00:00:00Z' },
        { op: 'delete', nodeId: 'n3', topic: 'Legacy import', note: '', at: '2026-07-07T00:00:01Z' },
      ],
    },
  };
}

test('buildDecisionTree roots on the title and one node per round', () => {
  const tree = buildDecisionTree('My brainstorm', [funnelRound(), mindmapRound()]);
  assert.equal(tree.nodeData.label, 'My brainstorm');
  assert.equal(tree.nodeData.kind, 'root');
  assert.equal(tree.nodeData.children.length, 2, 'two rounds → two round nodes');
  assert.equal(tree.nodeData.children[0].kind, 'round');
  assert.ok(tree.nodeData.children[0].label.includes('Round 1'));
  assert.ok(tree.nodeData.children[1].label.includes('Round 2'));
});

test('funnel round records chosen ✓ and rejected ✕ plus the action', () => {
  const tree = buildDecisionTree('t', [funnelRound()]);
  const kids = tree.nodeData.children[0].children;
  const kinds = kids.map((k) => k.kind);
  assert.ok(kinds.includes('action'), 'has an action node');
  assert.ok(kids.some((k) => k.kind === 'chosen' && k.label.includes('Bold')), 'Bold chosen');
  assert.ok(kids.some((k) => k.kind === 'rejected' && k.label.includes('Quiet')), 'Quiet rejected');
});

test('mind-map round records explode (with note), delete, and the edit', () => {
  const tree = buildDecisionTree('t', [mindmapRound()]);
  const kids = tree.nodeData.children[0].children;
  assert.ok(kids.some((k) => k.kind === 'explode' && k.label.includes('Payments') && k.label.includes('trust')),
    'explode node carries topic + steering note');
  assert.ok(kids.some((k) => k.kind === 'delete' && k.label.includes('Legacy import')), 'delete recorded');
  assert.ok(kids.some((k) => k.kind === 'edit' && k.label.includes('Onboarding')), 'edited tree recorded');
});

test('a round with no response shows a pending marker', () => {
  const tree = buildDecisionTree('t', [{ board: { round: 1, phase: 'diverge', kind: 'icon-grid', options: [] }, response: null }]);
  const kids = tree.nodeData.children[0].children;
  assert.equal(kids.length, 1);
  assert.equal(kids[0].kind, 'pending');
});

test('empty thread renders a "no rounds yet" placeholder', () => {
  const tree = buildDecisionTree('t', []);
  assert.equal(tree.nodeData.children.length, 1);
  assert.equal(tree.nodeData.children[0].kind, 'pending');
});

test('decisionTreeToSvg emits a well-formed self-contained SVG', () => {
  const svg = decisionTreeToSvg(buildDecisionTree('t', [funnelRound(), mindmapRound()]));
  assert.ok(svg.startsWith('<svg'), 'starts with <svg');
  assert.ok(svg.includes('viewBox="0 0 '), 'zero-origin viewBox');
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'declares the SVG namespace');
  assert.ok(svg.endsWith('</svg>'), 'closes the root element');
  assert.ok(!svg.includes('<image'), 'no embedded raster');
  const withoutNs = svg.replaceAll('http://www.w3.org/2000/svg', '');
  assert.ok(!withoutNs.includes('http'), 'no external URLs beyond the SVG namespace');
});

test('decisionTreeToSvg XML-escapes labels — markup cannot inject (rule 8)', () => {
  const tree = buildDecisionTree('<script>alert(1)</script>', [funnelRound()]);
  const svg = decisionTreeToSvg(tree);
  assert.ok(svg.includes('&lt;script&gt;'), 'title angle brackets escaped');
  assert.ok(!svg.includes('<script'), 'no raw <script substring in the output');
});
