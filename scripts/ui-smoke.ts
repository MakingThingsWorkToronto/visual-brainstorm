/**
 * Per-surface render test: every phase mechanic (Diverge grid, Mutation Lab,
 * Wreck Yard, Proximity Field + Scaffold, Triage Gate) must server-render
 * without crashing and contain its signature UI text. Run: npm run smoke:ui
 */
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
(globalThis as Record<string, unknown>).DOMParser = dom.window.DOMParser;
(globalThis as Record<string, unknown>).XMLSerializer = dom.window.XMLSerializer;

const { createElement } = await import('react');
const { renderToString } = await import('react-dom/server');
const { BoardSchema, ProgressEventSchema } = await import('@visual-brainstorm/protocol');
const { BoardSurvey } = await import('../apps/studio/src/components/BoardSurvey.js');

const EXPECT: Record<string, string[]> = {
  diverge: ['remix', 'Send &amp; iterate', 'Playful', 'Back', 'judge deck', 'More Tools', 'Voice', 'Target Folder'],
  expand: ['remix', 'Amplify what resonates', 'select at least one option to expand from'],
  mutate: ['X-ray', 'the rest is hidden on purpose'],
  wreck: ['Wreckage mode', 'What breaks first'],
  cluster: ['Scaffold', 'cursor-grab'],
  converge: ['The gate', 'Keep', 'Kill', 'Merge', 'Final'],
};

for (const [phase, markers] of Object.entries(EXPECT)) {
  const board = BoardSchema.parse({
    id: `b-${phase}`,
    sessionId: 's',
    round: 1,
    kind: 'icon-grid',
    phase,
    title: `t-${phase}`,
    prompt: 'p',
    options: [
      { id: 'a', label: 'Alpha', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>' },
      { id: 'b', label: 'Beta', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8"/></svg>' },
      { id: 'c', label: 'Gamma', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 9L5 1L9 9Z"/></svg>' },
    ],
    survey: {
      axes: [
        { id: 'x1', label: 'Tone', leftLabel: 'Playful', rightLabel: 'Serious' },
        { id: 'x2', label: 'Density', leftLabel: 'Minimal', rightLabel: 'Detailed' },
        { id: 'x3', label: 'Glow', leftLabel: 'Flat', rightLabel: 'Neon' },
        { id: 'x4', label: 'Shape', leftLabel: 'Geometric', rightLabel: 'Organic' },
        { id: 'x5', label: 'Read', leftLabel: 'Literal', rightLabel: 'Abstract' },
      ],
    },
    createdAt: 'now',
  });

  const html = renderToString(
    createElement(BoardSurvey, {
      board,
      models: ['claude-fable-5'],
      defaultModel: 'claude-fable-5',
      onRespond: async () => {},
      onPreview: () => {},
    }),
  );
  for (const marker of markers) {
    assert.ok(html.includes(marker), `[${phase}] missing marker "${marker}"`);
  }
  // The steerable PhaseBar must be present on every surface.
  assert.ok(html.includes('Converge'), `[${phase}] PhaseBar missing`);
  console.log(`UI ${phase.padEnd(8)} renders ✓ (${markers.length} markers)`);
}

// Target repo picker — composer control for the target repo/folder feature.
const { TargetRepoPicker } = await import('../apps/studio/src/components/TargetRepoPicker.js');
const pickerUnset = renderToString(createElement(TargetRepoPicker, { targetRepo: null }));
for (const marker of ['Target Folder', 'Connect a target repo/folder']) {
  assert.ok(pickerUnset.includes(marker), `[target-repo unset] missing marker "${marker}"`);
}
const pickerSet = renderToString(
  createElement(TargetRepoPicker, { targetRepo: 'C:\\repos\\my-app' }),
);
for (const marker of ['my-app', 'copied here on closeout']) {
  assert.ok(pickerSet.includes(marker), `[target-repo set] missing marker "${marker}"`);
}
console.log('UI target-repo picker renders ✓ (unset + set)');

// Fullscreen preview — tags in the header, editable note when onNoteChange is given.
const { PreviewModal } = await import('../apps/studio/src/components/PreviewModal.js');
const preview = renderToString(
  createElement(PreviewModal, {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
    label: 'Alpha',
    tags: ['organic', 'bold'],
    note: 'good bones',
    onNoteChange: () => {},
    onClose: () => {},
  }),
);
for (const marker of ['Alpha', 'organic', 'bold', 'good bones', 'Notes on', '⟲']) {
  assert.ok(preview.includes(marker), `[preview] missing marker "${marker}"`);
}
const previewReadOnly = renderToString(
  createElement(PreviewModal, {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
    label: 'Beta',
    onClose: () => {},
  }),
);
assert.ok(!previewReadOnly.includes('<textarea'), '[preview] note editor hidden without onNoteChange');
console.log('UI preview modal renders ✓ (tags + note, read-only variant)');

// --- Pure helpers: judge-deck ranking mechanics ---
const { applyDuel, adjacentDuels } = await import('../apps/studio/src/lib/deck.js');
assert.deepEqual(applyDuel(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b'], 'winner moves above loser');
assert.deepEqual(applyDuel(['a', 'b', 'c'], 'a', 'b'), ['a', 'b', 'c'], 'no-op when already above');
assert.deepEqual(applyDuel(['a', 'b'], 'x', 'a'), ['a', 'b'], 'no-op for ids outside the ranking');
assert.deepEqual(adjacentDuels(['a', 'b', 'c']), [['a', 'b'], ['b', 'c']], 'adjacent pairs, one pass');
assert.deepEqual(adjacentDuels(['a']), [], 'no duels for a lone keep');
console.log('LIB deck helpers ✓ (applyDuel + adjacentDuels)');

// --- Pure helpers: wayfinder phase-autopilot heuristics ---
const { proposeNextPhase } = await import('../apps/studio/src/lib/wayfinder.js');
const mkRound = (phase: string, round: number, count: number) => ({
  board: BoardSchema.parse({
    id: `wf-${round}`,
    sessionId: 's',
    round,
    kind: 'icon-grid',
    phase,
    title: 't',
    prompt: 'p',
    options: Array.from({ length: count }, (_, i) => ({
      id: `o${round}-${i}`,
      label: `O${round}-${i}`,
      svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
    })),
    survey: {},
    createdAt: 'now',
  }),
  response: null,
});
assert.equal(proposeNextPhase([], null), null, 'no rounds → no proposal');
assert.equal(proposeNextPhase([mkRound('converge', 1, 3)], null), null, 'converge → finalize is human');
assert.equal(proposeNextPhase([mkRound('cluster', 1, 3)], null)?.phase, 'converge', 'cluster → converge');
assert.equal(proposeNextPhase([mkRound('diverge', 1, 8)], null)?.phase, 'cluster', 'full pool in diverge → cluster');
console.log('LIB wayfinder proposeNextPhase ✓ (empty, converge, cluster, full-pool diverge)');

// --- Judge deck surface (flick triage + duels) ---
const { JudgeDeck } = await import('../apps/studio/src/components/phases/JudgeDeck.js');
const deckBoard = mkRound('diverge', 9, 3).board;
const deck = renderToString(
  createElement(JudgeDeck, {
    board: deckBoard,
    verdicts: {},
    ranking: [],
    onVerdict: () => {},
    onRanking: () => {},
    onDuel: () => {},
    onRestart: () => {},
    onPreview: () => {},
  }),
);
for (const marker of ['Judge deck', 'kill', 'keep']) {
  assert.ok(deck.includes(marker), `[judge-deck] missing marker "${marker}"`);
}
console.log('UI judge deck renders ✓ (flick controls)');

// --- Wayfinder strip (rounds + proposal pill) ---
const { WayfinderStrip } = await import('../apps/studio/src/components/WayfinderStrip.js');
const wfRounds = [mkRound('diverge', 1, 3), mkRound('expand', 2, 3)];
const stripIdle = renderToString(
  createElement(WayfinderStrip, {
    rounds: wfRounds,
    artifacts: [],
    activeBoard: null,
    proposal: { phase: 'cluster', reason: 'pool is full' },
    onJump: () => {},
    onAdvance: () => {},
  }),
);
assert.ok(stripIdle.includes('rounds'), '[wayfinder] round thumbnails label');
assert.ok(!stripIdle.includes('next:'), '[wayfinder] proposal pill hidden without an active board');
const stripLive = renderToString(
  createElement(WayfinderStrip, {
    rounds: wfRounds,
    artifacts: [],
    activeBoard: wfRounds[1].board,
    proposal: { phase: 'cluster', reason: 'pool is full' },
    onJump: () => {},
    onAdvance: () => {},
  }),
);
assert.ok(stripLive.includes('next:'), '[wayfinder] proposal pill missing with active board + proposal');
assert.ok(stripLive.includes('cluster'), '[wayfinder] proposed phase named');
console.log('UI wayfinder strip renders ✓ (pill hidden idle, shown live)');

// --- New Discussion panel ("open with anything" as a chat panel) — must render without window ---
const { NewDiscussionPanel } = await import('../apps/studio/src/components/NewDiscussionPanel.js');
const vars = { canvas: '#fff', surface: '#fff', surface2: '#eee', line: '#ddd', ink: '#000', inkDim: '#666', accent: '#a855f7' };
const open = renderToString(
  createElement(NewDiscussionPanel, {
    enginePreview: false,
    themes: [{ name: 'neon-purple', label: 'Neon Purple', light: vars, dark: vars }],
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    targetRepo: null,
    onCancel: () => {},
    onStart: () => {},
  }),
);
for (const marker of [
  'New Discussion',
  'Scribble a seed',
  'audience',
  'constraints',
  'other',
  'Colors',
  'Neon Purple',
  'Add a color',
  'Send &amp; iterate',
  'Voice',
  'Target Folder',
  'More Tools',
]) {
  assert.ok(open.includes(marker), `[new-discussion] missing marker "${marker}"`);
}
console.log('UI new-discussion panel renders ✓ (chips + colors + full composer)');

// --- Triage gate with all keeps: sudden-death bracket offered ---
const { TriageGate } = await import('../apps/studio/src/components/phases/TriageGate.js');
const gateBoard = mkRound('converge', 5, 3).board;
const gate = renderToString(
  createElement(TriageGate, {
    board: gateBoard,
    triage: Object.fromEntries(gateBoard.options.map((o: { id: string }) => [o.id, 'keep'])),
    finalId: null,
    onTriage: () => {},
    onFinal: () => {},
    onDuel: () => {},
    onPreview: () => {},
  }),
);
assert.ok(gate.includes('Sudden death'), '[triage-gate] sudden-death button missing with 3 keeps');
assert.ok(gate.includes('The gate'), '[triage-gate] header missing');
console.log('UI triage gate renders ✓ (sudden-death offer at full keeps)');

// --- Session activity feed (progress pipe events) — null when empty, feed otherwise ---
const { SessionActivity } = await import('../apps/studio/src/components/SessionActivity.js');
// Fixtures go through the schema like every production path (defaults stay in sync).
const progressEvents = [
  ProgressEventSchema.parse({ at: '2026-07-06T10:00:00.000Z', note: 'reading the brief' }),
  ProgressEventSchema.parse({
    at: '2026-07-06T10:01:00.000Z',
    source: 'svg-artisan',
    note: 'sketching option pool',
    tokens: { input: 100, output: 50 },
  }),
];
const activity = renderToString(createElement(SessionActivity, { events: progressEvents }));
// Markers live inside single text nodes — never spanning adjacent JSX expressions.
for (const marker of ['Session activity', 'sketching option pool']) {
  assert.ok(activity.includes(marker), `[session-activity] missing marker "${marker}"`);
}
const activityEmpty = renderToString(createElement(SessionActivity, { events: [] }));
assert.ok(
  !activityEmpty.includes('Session activity'),
  '[session-activity] must render null for empty events',
);
console.log('UI session activity renders ✓ (feed with latest note, empty → null)');

console.log(`UI SMOKE PASS — all ${Object.keys(EXPECT).length} phase surfaces render with their mechanics`);
