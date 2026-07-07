/**
 * Unit coverage for the deterministic mind-tree SVG snapshot (apps/mcp/dist/tree-svg.js):
 * the archival still every presented tree is captured as (CLAUDE.md rule 7), XML-escaped
 * so a topic is never markup (rule 8), and self-contained (no external refs). Imports from
 * BUILT output — build first. Run: npm run test:unit.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { treeToSvg, countNodes } from '../apps/mcp/dist/tree-svg.js';
import { MindTreeSchema } from '../packages/protocol/dist/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// Short topics that survive fit()'s truncation, so every one appears verbatim.
const tree = {
  nodeData: {
    id: 'root',
    topic: 'Root',
    children: [
      { id: 'a', topic: 'Alpha' },
      { id: 'b', topic: 'Beta', children: [{ id: 'b1', topic: 'Beta-1' }] },
    ],
  },
  direction: 2,
};

test('treeToSvg emits a well-formed self-contained SVG root', () => {
  const svg = treeToSvg(tree);
  assert.equal(typeof svg, 'string');
  assert.ok(svg.startsWith('<svg'), 'starts with <svg');
  assert.ok(svg.includes('viewBox="0 0 '), 'carries a zero-origin viewBox');
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'declares the SVG namespace');
  assert.ok(svg.endsWith('</svg>'), 'closes the root element');
});

test('treeToSvg renders every node topic', () => {
  const svg = treeToSvg(tree);
  for (const topic of ['Root', 'Alpha', 'Beta', 'Beta-1']) {
    assert.ok(svg.includes(topic), `missing topic "${topic}"`);
  }
});

test('treeToSvg XML-escapes topics — markup cannot inject (rule 8)', () => {
  const svg = treeToSvg({
    nodeData: { id: 'root', topic: '<script>alert(1)</script>' },
    direction: 2,
  });
  assert.ok(svg.includes('&lt;script&gt;'), 'topic angle brackets escaped');
  assert.ok(!svg.includes('<script'), 'no raw <script substring in the output');
});

test('treeToSvg is self-contained — no external references', () => {
  const svg = treeToSvg(tree);
  assert.ok(!svg.includes('<image'), 'no embedded <image');
  assert.ok(!svg.includes('href='), 'no href / xlink:href external refs');
  assert.ok(!svg.includes('url('), 'no url() references');
  // The only legitimate absolute URI is the required SVG namespace declaration;
  // once it is removed, no other http(s) reference may remain (nothing to fetch).
  const withoutNs = svg.replaceAll('http://www.w3.org/2000/svg', '');
  assert.ok(!withoutNs.includes('http'), 'no absolute URLs beyond the SVG namespace');
});

test('countNodes totals the whole subtree', () => {
  // root + 2 children, one child has 1 grandchild → 4 nodes.
  const node = {
    id: 'root',
    topic: 'Root',
    children: [
      { id: 'a', topic: 'Alpha' },
      { id: 'b', topic: 'Beta', children: [{ id: 'b1', topic: 'Beta-1' }] },
    ],
  };
  assert.equal(countNodes(node), 4);
  assert.equal(countNodes({ id: 'x', topic: 'Lone' }), 1, 'a leaf counts as one');
});

test('canonical mindmap tree parses and snapshots (schema-proven, rule 7/8)', () => {
  // Canonical anchor: prove the shipped fixture through its schema at use, then
  // snapshot it — a canonical file that no longer parses is a failing test.
  const raw = JSON.parse(
    fs.readFileSync(path.join(here, 'canonical', 'boards', 'mindmap-tree.json'), 'utf8'),
  );
  const canonicalTree = MindTreeSchema.parse(raw.tree);
  const svg = treeToSvg(canonicalTree);
  assert.ok(svg.startsWith('<svg'), 'canonical tree renders an SVG');
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
  assert.ok(!svg.includes('<script'), 'canonical snapshot carries no raw markup');
  // countNodes over the canonical tree matches a hand count of its nodeData.
  assert.equal(countNodes(canonicalTree.nodeData), 10, 'canonical tree has 10 nodes');
});
