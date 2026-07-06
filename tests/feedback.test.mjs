import { test } from 'node:test';
import assert from 'node:assert';
import { buildFeedbackDigest } from '../apps/mcp/dist/feedback.js';
import { BoardResponseSchema, BoardSchema } from '../packages/protocol/dist/index.js';

const board = BoardSchema.parse({
  id: 'b1',
  sessionId: 's',
  round: 2,
  kind: 'icon-grid',
  phase: 'diverge',
  title: 'T',
  prompt: 'P',
  options: [
    { id: 'a', label: 'Alpha', svg: '<svg/>' },
    { id: 'b', label: 'Beta', svg: '<svg/>' },
    { id: 'c', label: 'Gamma', svg: '<svg/>' },
  ],
  survey: {
    axes: [
      { id: 'tone', label: 'Tone', leftLabel: 'Playful', rightLabel: 'Serious', defaultValue: 40 },
      { id: 'glow', label: 'Glow', leftLabel: 'Flat', rightLabel: 'Neon', defaultValue: 50 },
    ],
  },
  createdAt: 'now',
});

const respond = (extra) =>
  BoardResponseSchema.parse({ boardId: 'b1', respondedAt: 'now', ...extra });

const digestText = (extra) => buildFeedbackDigest(board, respond(extra)).join('\n');

test('the digest speaks in labels, never bare ids', () => {
  const text = digestText({
    selectedOptionIds: ['a', 'b'],
    perOptionNotes: { b: 'rounder' },
    remixPairs: [['a', 'c']],
  });
  assert.ok(text.includes('Alpha, Beta'));
  assert.ok(text.includes('Note on "Beta": rounder'));
  assert.ok(text.includes('mash up "Alpha" × "Gamma"'));
});

test('dial deltas carry direction and are declared a complete instruction', () => {
  const text = digestText({ axisValues: { tone: 80, glow: 50 } });
  assert.ok(text.includes('Tone: 40→80 (toward "Serious")'));
  assert.ok(!text.includes('Glow: 50'), 'unmoved dials are not noise');
  assert.ok(text.includes('complete instruction'));
});

test('phase fields translate to imperatives', () => {
  const text = digestText({
    mutations: { a: ['flip', 'xray'] },
    flaws: { b: 'too heavy' },
    triage: { a: 'keep', b: 'kill', c: 'merge' },
    clusters: [['a'], ['b', 'c']],
    gapNotes: [{ between: [0, 1], note: 'a hybrid?' }],
  });
  assert.ok(text.includes('"Alpha" revealed something under flip, xray'));
  assert.ok(text.includes('Flaw in "Beta": too heavy'));
  assert.ok(text.includes('KEEP (capture as artifacts): Alpha'));
  assert.ok(text.includes('KILL (never regenerate this direction): Beta'));
  assert.ok(text.includes('MERGE (produce ONE synthesis of): Gamma'));
  assert.ok(text.includes('cluster 2: [Beta, Gamma]'));
  assert.ok(text.includes('"a hybrid?"'));
});

test('finalize names THE one and orders plan-closeout', () => {
  const text = digestText({ action: 'finalize', finalOptionId: 'b' });
  assert.ok(text.includes('FINAL: "Beta"'));
  assert.ok(text.includes('plan-closeout'));
});

test('back short-circuits: re-present previous board, ignore other signals', () => {
  const lines = buildFeedbackDigest(board, respond({ action: 'back', selectedOptionIds: ['a'], axisValues: { tone: 99 } }));
  assert.ok(lines.some((l) => l.includes('BACK')));
  assert.ok(!lines.join('\n').includes('Tone: 40→99'), 'steering after back is ignored');
});

test('model routing and UI commands are surfaced', () => {
  const text = digestText({ model: 'claude-opus-4-8', commands: ['new-brainstorm'] });
  assert.ok(text.includes('delegate next-round generation to claude-opus-4-8'));
  assert.ok(text.includes('run-brainstorm.md'));
});
