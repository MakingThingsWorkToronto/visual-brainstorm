// Mind-map MODEL-LEGIBILITY: the traversable markdown outline (tree-outline.js) and its
// persistence to round-NN/tree.md on present / response / draft, plus the outline in the
// feedback digest. A REAL SessionStore on a temp dir + canonical mindmap board — no mocks.
// This is what read-mindmap + the orchestrator read to understand the tree as intention.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCanonical } from './canonical/load.mjs';
import { treeToOutline } from '../apps/mcp/dist/tree-outline.js';
import { buildFeedbackDigest } from '../apps/mcp/dist/feedback.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { BoardResponseSchema, BoardSchema } from '../packages/protocol/dist/index.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-mm-'));
const loadBoard = () => loadCanonical('boards/mindmap-tree.json', BoardSchema);
const roundDir = (store, board) => path.join(store.info.dir, `round-${String(board.round).padStart(2, '0')}`);

const NOTED_TREE = {
  nodeData: {
    id: 'root',
    topic: 'Neon glyph',
    children: [
      { id: 'mark', topic: 'Mark', note: 'keep it geometric', children: [{ id: 'm1', topic: 'circle-M' }] },
      { id: 'motion', topic: 'Motion' }, // a thin branch — opened but not grown
    ],
  },
  direction: 2,
};

test('treeToOutline: header summary + indented traversable lines + ids + notes + thin flag', () => {
  const out = treeToOutline(NOTED_TREE, 'Edited tree');
  assert.ok(out.includes('### Edited tree'), 'carries the heading');
  assert.ok(/Root \*\*Neon glyph\*\* · 4 nodes · 2 top branches · depth 2\./.test(out), `header summary: ${out}`);
  // Indentation encodes depth (root 0, Mark 1, circle-M 2).
  assert.ok(out.includes('- Neon glyph  _(`root`'), 'root line with id');
  assert.ok(out.includes('  - Mark  _(`mark` · note: keep it geometric)_'), 'child line with id + note');
  assert.ok(out.includes('    - circle-M  _(`m1`)_'), 'grandchild indented two levels');
  // ONLY a top-level branch with no children is a gap; a DEEP leaf is content.
  assert.ok(out.includes('- Motion  _(`motion`)_  — thin'), 'empty top branch flagged thin');
  assert.ok(!out.includes('circle-M  _(`m1`)_  — thin'), 'a deep leaf is NOT flagged as a gap');
  // Notes appear ONCE, inline at their node (review-followups item 10): the header
  // counts them so steering stays discoverable; no trailing roll-up repeats them.
  assert.ok(out.includes('1 noted node'), 'header carries the noted-node count');
  assert.ok(!out.includes('**Mark** →'), 'no trailing notes roll-up (the note stays inline only)');
});

test('recordBoard(mindmap) writes round-NN/tree.md + folds the outline into brainstorm.md', () => {
  const store = new SessionStore('Mind map legibility', tmp());
  const board = loadBoard();
  store.recordBoard(board);

  const treeMd = fs.readFileSync(path.join(roundDir(store, board), 'tree.md'), 'utf8');
  assert.ok(treeMd.includes('### Presented tree — round 7'), 'tree.md is the presented outline');
  assert.ok(treeMd.includes(`- ${board.tree.nodeData.topic}`), 'tree.md lists the root topic');

  const md = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
  assert.ok(md.includes('Mind-map tree presented'), 'brainstorm.md carries the outline heading');
  assert.ok(md.includes(`- ${board.tree.nodeData.topic}`), 'brainstorm.md carries the traversable tree');
});

test('recordResponse(editedTree) refreshes tree.md to the submitted shape', () => {
  const store = new SessionStore('Mind map submit', tmp());
  const board = loadBoard();
  store.recordBoard(board);
  store.recordResponse(
    BoardResponseSchema.parse({
      boardId: board.id,
      action: 'iterate',
      editedTree: NOTED_TREE,
      respondedAt: '2026-07-09T12:00:00.000Z',
    }),
  );
  const treeMd = fs.readFileSync(path.join(roundDir(store, board), 'tree.md'), 'utf8');
  assert.ok(treeMd.includes('### Edited tree — round 7 (submitted)'), 'tree.md is now the edited outline');
  assert.ok(treeMd.includes('  - Mark  _(`mark` · note: keep it geometric)_'), 'edited notes present');
});

test('recordBoardDraft(editedTree) persists the LIVE tree + refreshes tree.md; reloads', () => {
  const root = tmp();
  const store = new SessionStore('Mind map live', root);
  const board = loadBoard();
  store.recordBoard(board);
  store.recordBoardDraft(
    BoardResponseSchema.parse({
      boardId: board.id,
      action: 'iterate',
      editedTree: NOTED_TREE,
      respondedAt: '2026-07-09T12:00:00.000Z',
    }),
  );
  const treeMd = fs.readFileSync(path.join(roundDir(store, board), 'tree.md'), 'utf8');
  assert.ok(treeMd.includes('### Live tree — round 7 (in progress)'), 'tree.md reflects the live in-progress tree');
  // The draft (with the live tree) reloads with the thread — recallable.
  const reopened = SessionStore.open(store.info.dir);
  assert.equal(reopened.drafts.length, 1, 'the mind-map draft reloads');
  assert.equal(reopened.drafts[0].editedTree.nodeData.topic, 'Neon glyph', 'the live tree reloads');
});

test('buildFeedbackDigest embeds the FULL outline for a mind-map response (not just a count)', () => {
  const board = loadBoard();
  const digest = buildFeedbackDigest(
    board,
    BoardResponseSchema.parse({
      boardId: board.id,
      action: 'iterate',
      editedTree: NOTED_TREE,
      respondedAt: '2026-07-09T12:00:00.000Z',
    }),
  );
  const joined = digest.join('\n');
  assert.ok(joined.includes('Mind-map edited'), 'digest flags the mind-map edit');
  assert.ok(joined.includes('- Neon glyph  _(`root`'), 'digest embeds the traversable outline');
  assert.ok(joined.includes('read-mindmap'), 'digest points at the read-mindmap command');
});
