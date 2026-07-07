import { test } from 'node:test';
import assert from 'node:assert';
import { buildFeedbackDigest } from '../apps/mcp/dist/feedback.js';
import { BoardResponseSchema, BoardSchema } from '../packages/protocol/dist/index.js';
import { loadCanonical } from './canonical/load.mjs';

// The canonical diverge board (Alpha/Beta/Gamma; tone 40, glow 50 axes) anchors
// every digest here. Per-test responses stay inline where they probe ONE mechanic.
const board = loadCanonical('boards/diverge.json', BoardSchema);
const iterateResponse = loadCanonical('responses/iterate.json', BoardResponseSchema);

const respond = (extra) =>
  BoardResponseSchema.parse({ boardId: board.id, respondedAt: 'now', ...extra });

const digestText = (extra) => buildFeedbackDigest(board, respond(extra)).join('\n');

test('the digest speaks in labels, never bare ids', () => {
  const text = buildFeedbackDigest(board, iterateResponse).join('\n');
  assert.ok(text.includes('Alpha, Beta'));
  assert.ok(text.includes('Note on "Beta": rounder'));
  assert.ok(text.includes('mash up "Alpha" × "Gamma"'));
});

test('palette picks become an only-these-colors instruction', () => {
  const text = digestText({
    paletteColors: [
      { name: 'Neon Purple accent', value: '#a855f7' },
      { name: 'Ember ink', value: '#1c1726' },
    ],
  });
  assert.ok(text.includes('ONLY these colors'));
  assert.ok(text.includes('Neon Purple accent (#a855f7)'));
  assert.ok(text.includes('Ember ink (#1c1726)'));
});

test('attachments surface as Read instructions; failures are honest', () => {
  const text = digestText({
    attachments: [
      { name: 'ref.png', dataUri: '', savedPath: 'C:/t/attachments/ref.png' },
      { name: 'broken.bin', dataUri: '' },
    ],
  });
  assert.ok(text.includes('Attachment "ref.png" saved at C:/t/attachments/ref.png'));
  assert.ok(text.includes('Read it'));
  assert.ok(text.includes('Attachment "broken.bin" FAILED to persist'));
});

test('dial deltas carry direction and are declared a complete instruction', () => {
  // Canonical iterate.json moves tone 40→80 and leaves glow at its 50 default.
  const text = buildFeedbackDigest(board, iterateResponse).join('\n');
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
  assert.ok(text.includes('compose_poster'), 'finalize orders the decision poster');
  assert.ok(!text.includes('sudden-death bracket'), 'no bracket claim without duels');
});

test('deck ranking speaks in labels, strongest first', () => {
  const text = digestText({ ranking: ['c', 'a'] });
  assert.ok(text.includes('Deck ranking (strongest pull first): Gamma > Alpha'));
  assert.ok(text.includes('top ranks lead the synthesis vector'));
});

test('deck kills are dropped for good; keeps are not listed as kills', () => {
  const text = digestText({ deckVerdicts: { a: 'keep', b: 'kill', c: 'kill' } });
  assert.ok(text.includes('Deck KILL (flicked away — drop these directions for good): Beta, Gamma.'));
  assert.ok(!text.includes('Deck KILL (flicked away — drop these directions for good): Alpha'));
});

test('duels are direct preferences, winner named against the loser', () => {
  const text = digestText({ duelResults: [{ pair: ['a', 'b'], winner: 'b' }] });
  assert.ok(text.includes('Duel: "Beta" beat "Alpha" head-to-head — a direct preference.'));
});

test('finalize after duels credits the sudden-death bracket', () => {
  const text = digestText({
    action: 'finalize',
    finalOptionId: 'a',
    duelResults: [{ pair: ['a', 'b'], winner: 'a' }],
  });
  assert.ok(text.includes('FINAL: "Alpha"'));
  assert.ok(text.includes('It won the sudden-death bracket.'));
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
