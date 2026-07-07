import { test } from 'node:test';
import assert from 'node:assert';
import { composePoster } from '../apps/mcp/dist/poster.js';
import { BoardResponseSchema, BoardSchema } from '../packages/protocol/dist/index.js';

const svg = (shape) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${shape}</svg>`;

const board1 = BoardSchema.parse({
  id: 'b1',
  sessionId: 's',
  round: 1,
  kind: 'icon-grid',
  phase: 'diverge',
  title: 'Round one',
  prompt: 'p',
  options: [
    { id: 'r1a', label: 'Bulb Classic', svg: svg('<circle cx="5" cy="5" r="4"/>') },
    { id: 'r1b', label: 'Bubble Ray', svg: svg('<rect x="1" y="1" width="8" height="8"/>') },
    { id: 'r1c', label: 'Spark', svg: svg('<path d="M1 9L5 1L9 9Z"/>') },
  ],
  survey: {},
  createdAt: 'now',
});

const board2 = BoardSchema.parse({
  id: 'b2',
  sessionId: 's',
  round: 2,
  kind: 'icon-grid',
  phase: 'converge',
  title: 'Round two',
  prompt: 'p',
  options: [
    {
      id: 'r2w',
      label: 'Bulb <Bubble> Fusion',
      description: 'the mashup',
      svg: svg('<circle cx="5" cy="5" r="3"/>'),
      parents: ['r1a', 'r1b'],
    },
    { id: 'r2x', label: 'Also-ran', svg: svg('<rect x="2" y="2" width="6" height="6"/>') },
  ],
  survey: {},
  createdAt: 'now',
});

const response2 = BoardResponseSchema.parse({
  boardId: 'b2',
  respondedAt: 'now',
  perOptionNotes: { r2w: 'keep the <glow> subtle' },
  elaboration: 'fusion wins on warmth',
});

const rounds = [
  { board: board1, response: null },
  { board: board2, response: response2 },
];

test('poster shows the winner label, XML-escaped', () => {
  const poster = composePoster(rounds, 'r2w', 'Logo hunt');
  assert.ok(poster.startsWith('<svg'), 'returns a self-contained SVG');
  assert.ok(poster.includes('Logo hunt'), 'title on the poster');
  assert.ok(poster.includes('Bulb &lt;Bubble&gt; Fusion'), 'winner label escaped');
  assert.ok(!poster.includes('<Bubble>'), 'raw < from the label never appears');
});

test('poster draws round-1 lineage nodes from parents', () => {
  const poster = composePoster(rounds, 'r2w', 'Logo hunt');
  assert.ok(poster.includes('round 1'), 'parent nodes carry their round');
  assert.ok(poster.includes('Bulb Classic'), 'parent label present');
  assert.ok(poster.includes('Bubble Ray'), 'second parent label present');
  assert.ok(poster.includes('round 2 · winner'), 'winner node marks its round');
});

test('poster carries the notes that decided it, escaped', () => {
  const poster = composePoster(rounds, 'r2w', 'Logo hunt');
  assert.ok(poster.includes('keep the &lt;glow&gt; subtle'), 'per-option note escaped');
  assert.ok(!poster.includes('<glow>'), 'raw < from the note never appears');
  assert.ok(poster.includes('fusion wins on warmth'), 'elaboration is a note line');
});

test('poster throws honestly for an id in no round', () => {
  assert.throws(() => composePoster(rounds, 'ghost', 'Logo hunt'), /ghost.*not found/);
});
