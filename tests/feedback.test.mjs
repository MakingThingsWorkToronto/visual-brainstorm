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

test('no per-round pick still routes EXPLICITLY to the best-SVG default (never by omission)', () => {
  const text = buildFeedbackDigest(board, respond({}), 'claude-fable-5').join('\n');
  assert.ok(text.includes('delegate next-round generation to the best-SVG default claude-fable-5'));
  assert.ok(text.includes('never route by omission'));
});

test('a nudge-only response is classified TWEAK — mutate this round, never redraw', () => {
  const text = digestText({ axisValues: { tone: 80 } });
  assert.ok(text.includes('TWEAK, not redirect'));
  assert.ok(
    text.includes(`"Alpha" → round-0${board.round}/option-a.svg`),
    'digest maps option labels to concrete source SVG paths (no <id> placeholder to resolve)',
  );
  assert.ok(text.includes(`"Gamma" → round-0${board.round}/option-c.svg`));
  assert.ok(text.includes('MUTATE'));
});

test('unsure-only is NOT a TWEAK — UNSURE orders clarifying variants (fresh), never a mutation', () => {
  const text = digestText({ uncertainties: ['b'] });
  assert.ok(text.includes('UNSURE'));
  assert.ok(!text.includes('TWEAK'), 'a probe request is not a re-tune');
});

test('any deck verdict is structural (aligned with triage) — keep-only deck + dial is no TWEAK', () => {
  const text = digestText({ deckVerdicts: { a: 'keep' }, axisValues: { tone: 80 } });
  assert.ok(!text.includes('TWEAK'), 'deck keep-only aligns with triage keep-only: structural');
});

test('the TWEAK escape hatch names question answers and the permitted fresh options', () => {
  const text = digestText({ axisValues: { tone: 80 } });
  assert.ok(text.includes('question answer'), 'a redirect can arrive via a question answer');
  assert.ok(text.includes('embracing'), 'the flaw-embracing variant is the one permitted fresh option');
});

test('notes and flaws alone are also a TWEAK', () => {
  const text = digestText({ perOptionNotes: { b: 'rounder' }, flaws: { a: 'too heavy' } });
  assert.ok(text.includes('TWEAK, not redirect'));
});

test('a structural signal makes it a redirect — no TWEAK claim', () => {
  const withSelection = digestText({ selectedOptionIds: ['a'], axisValues: { tone: 80 } });
  assert.ok(!withSelection.includes('TWEAK'), 'selections define a synthesis vector, not a tweak');
  const withPhase = digestText({ axisValues: { tone: 80 }, requestedPhase: 'wreck' });
  assert.ok(!withPhase.includes('TWEAK'), 'a phase steer is a redirect');
  const bare = digestText({});
  assert.ok(!bare.includes('TWEAK'), 'no nudges → nothing to mutate');
});

test('a per-round pick beats the best-SVG default', () => {
  const text = buildFeedbackDigest(board, respond({ model: 'claude-opus-4-8' }), 'claude-fable-5').join('\n');
  assert.ok(text.includes('delegate next-round generation to claude-opus-4-8'));
  assert.ok(!text.includes('best-SVG default'), 'the default line never doubles a real pick');
});

// ---------------------------------------------------------------------------
// Handoff-fidelity additions (2026-07-09): every captured gesture must reach
// the digest — positions geometry, deck keeps, mid-round question answers,
// unsure flags, remix recipes, on-option annotations, rename/move intents.
// ---------------------------------------------------------------------------

test('deck KEEPS surface alongside kills (a keep is signal, not silence)', () => {
  const text = digestText({ deckVerdicts: { a: 'keep', b: 'kill' } });
  assert.ok(text.includes('Deck KEEP'));
  assert.ok(text.includes('Alpha'));
  assert.ok(text.includes('Deck KILL'));
});

test('positions geometry: cluster tightness + spatial outliers reach the digest', () => {
  const text = digestText({
    clusters: [['a', 'b'], ['c']],
    positions: { a: { x: 10, y: 10 }, b: { x: 14, y: 12 }, c: { x: 80, y: 80 } },
  });
  assert.ok(text.includes('Cluster geometry'), 'tightness line present');
  assert.ok(text.includes('welded'), 'a 4-unit spread reads as welded');
  assert.ok(text.includes('Spatial outliers'), 'far-from-everything option is called out');
  assert.ok(text.includes('Gamma'), 'the outlier is named by label');
});

test('positions geometry: a near cross-cluster pair is a hybrid invitation', () => {
  const text = digestText({
    clusters: [['a'], ['b']],
    positions: { a: { x: 10, y: 10 }, b: { x: 30, y: 10 } },
  });
  assert.ok(text.includes('Closest cross-cluster neighbors'));
  assert.ok(text.includes('"Alpha"') && text.includes('"Beta"'));
  assert.ok(text.includes('hybrid'));
});

test('positions WITHOUT clusters still speak: near pairs are implicit clusters', () => {
  const text = digestText({
    positions: { a: { x: 10, y: 10 }, b: { x: 20, y: 10 }, c: { x: 90, y: 90 } },
  });
  assert.ok(text.includes('no clusters formed'), 'the arrangement is not silently lost');
  assert.ok(text.includes('"Alpha"') && text.includes('"Beta"'));
});

test('mid-round question answers resolve to the question TEXT, not the id', () => {
  const asked = {
    ...board,
    questions: [{ id: 'q-temp', question: 'Warmer or cooler palette?', options: ['warmer', 'cooler'] }],
  };
  const response = BoardResponseSchema.parse({
    boardId: board.id,
    respondedAt: 'now',
    questionAnswers: { 'q-temp': ['warmer', 'slightly amber'] },
  });
  const text = buildFeedbackDigest(asked, response).join('\n');
  assert.ok(text.includes('Answer — "Warmer or cooler palette?"'));
  assert.ok(text.includes('warmer · slightly amber'));
});

test('unsure flags demand a clarifying variant, never a silent kill', () => {
  const text = digestText({ uncertainties: ['b'] });
  assert.ok(text.includes('UNSURE'));
  assert.ok(text.includes('Beta'));
  assert.ok(text.includes('NOT a kill'));
  assert.ok(text.includes('clarifying'));
});

test('remix recipes ride the remix line (what to take from each side)', () => {
  const text = digestText({
    remixPairs: [['a', 'c']],
    remixNotes: { 'a×c': 'layout from the first, palette from the second' },
  });
  assert.ok(text.includes('mash up "Alpha" × "Gamma"'));
  assert.ok(text.includes('Recipe (what to take from each): layout from the first, palette from the second'));
});

test('on-option annotations: mark summary + note text + VIEW the composite', () => {
  const text = digestText({
    optionAnnotations: {
      a: {
        viewBox: { w: 400, h: 300 },
        background: { present: true },
        palette: [],
        items: [
          { type: 'arrow', colorName: 'crimson', colorValue: '#f00', from: { x: 1, y: 2 }, to: { x: 3, y: 4 } },
          { type: 'note', colorName: 'teal', colorValue: '#088', at: { x: 5, y: 6 }, text: 'make this bigger' },
        ],
      },
    },
    attachments: [{ name: 'annotated-a.png', dataUri: '', savedPath: 'C:/t/attachments/annotated-a.png' }],
  });
  assert.ok(text.includes('Annotated ON "Alpha"'));
  assert.ok(text.includes('1 arrow'));
  assert.ok(text.includes('"make this bigger"'));
  assert.ok(text.includes('VIEW C:/t/attachments/annotated-a.png'));
});

test('rename carries the old topic; move names the new parent', () => {
  const text = digestText({
    treeOps: [
      { op: 'rename', nodeId: 'n1', topic: 'Bold neon', oldTopic: 'Neon', note: '', at: 't' },
      { op: 'move', nodeId: 'n2', topic: 'Sub-idea', newParentId: 'p2', newParentTopic: 'Second pillar', note: '', at: 't' },
    ],
  });
  assert.ok(text.includes('RENAME: "Neon" → "Bold neon"'));
  assert.ok(text.includes('MOVE: "Sub-idea" now lives under "Second pillar"'));
});

// ---------------------------------------------------------------------------
// TWEAK classifier matrix (token-economy follow-ups 2026-07-09, phase 3): the
// full action / structural-signal / nudge cross, table-driven — one row per
// path not already covered above (action suppression, each structural signal
// alone, each nudge alone).
// ---------------------------------------------------------------------------

const minimalTree = { nodeData: { id: 'root', topic: 'Root' } };

const tweakMatrix = [
  // 1. A non-iterate action suppresses TWEAK even with nudges present.
  {
    name: 'action=park with nudges present',
    extra: { action: 'park', axisValues: { tone: 80 }, perOptionNotes: { b: 'rounder' } },
    expectTweak: false,
  },
  {
    name: 'action=accept with nudges present',
    extra: { action: 'accept', axisValues: { tone: 80 }, perOptionNotes: { b: 'rounder' } },
    expectTweak: false,
  },
  {
    name: 'action=finalize with nudges present',
    extra: {
      action: 'finalize',
      finalOptionId: 'a',
      axisValues: { tone: 80 },
      perOptionNotes: { b: 'rounder' },
    },
    expectTweak: false,
  },

  // 2. Each structural signal ALONE (plus a nudge) defeats TWEAK.
  {
    name: 'remixPairs alone',
    extra: { action: 'iterate', axisValues: { tone: 80 }, remixPairs: [['a', 'c']] },
    expectTweak: false,
  },
  {
    name: 'ranking alone',
    extra: { action: 'iterate', axisValues: { tone: 80 }, ranking: ['a'] },
    expectTweak: false,
  },
  {
    name: 'duelResults alone',
    extra: {
      action: 'iterate',
      axisValues: { tone: 80 },
      duelResults: [{ pair: ['a', 'b'], winner: 'a' }],
    },
    expectTweak: false,
  },
  {
    name: 'clusters alone',
    extra: { action: 'iterate', axisValues: { tone: 80 }, clusters: [['a', 'b']] },
    expectTweak: false,
  },
  {
    name: 'gapNotes alone',
    extra: { action: 'iterate', axisValues: { tone: 80 }, gapNotes: [{ between: [0, 1], note: 'x' }] },
    expectTweak: false,
  },
  {
    name: 'editedTree alone',
    extra: { action: 'iterate', axisValues: { tone: 80 }, editedTree: minimalTree },
    expectTweak: false,
  },
  {
    name: 'treeOps alone',
    extra: {
      action: 'iterate',
      axisValues: { tone: 80 },
      treeOps: [{ op: 'delete', nodeId: 'n1', topic: 'X', note: '', at: 't' }],
    },
    expectTweak: false,
  },

  // 3. Each nudge ALONE (no structural signal) IS a TWEAK.
  {
    name: 'optionAnnotations alone',
    extra: {
      action: 'iterate',
      optionAnnotations: {
        a: {
          viewBox: { w: 400, h: 300 },
          background: { present: true },
          palette: [],
          items: [
            { type: 'note', colorName: 'teal', colorValue: '#088', at: { x: 5, y: 6 }, text: 'make this bigger' },
          ],
        },
      },
    },
    expectTweak: true,
  },
  {
    name: 'mutations alone',
    extra: { action: 'iterate', mutations: { a: ['flip'] } },
    expectTweak: true,
  },
];

for (const { name, extra, expectTweak } of tweakMatrix) {
  test(`TWEAK classifier matrix: ${name} → ${expectTweak ? 'TWEAK' : 'not TWEAK'}`, () => {
    const text = digestText(extra);
    if (expectTweak) {
      assert.ok(text.includes('TWEAK, not redirect'), `expected a TWEAK digest line for: ${name}`);
    } else {
      assert.ok(!text.includes('TWEAK'), `expected NO TWEAK claim for: ${name}`);
    }
  });
}
