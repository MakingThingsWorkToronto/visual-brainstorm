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
const { ArtifactChatMessageSchema, ArtifactSchema, BoardResponseSchema, BoardSchema, ConciergeExchangeSchema, LivingGallerySchema, ProgressEventSchema, DiscussionSummarySchema } =
  await import('@visual-brainstorm/protocol');
const { loadCanonical } = await import('../tests/canonical/load.mjs');
const { BoardSurvey } = await import('../apps/studio/src/components/BoardSurvey.js');

const EXPECT: Record<string, string[]> = {
  // 'text-[10px] tabular-nums leading-none' is the axis-value tag's own class list —
  // unique to the new bordered-tag markup (the old postfix span had no border/padding
  // classes), so it proves the tag exists without over-fitting to exact colors.
  diverge: ['remix', 'Send &amp; iterate', 'Playful', 'Back', 'judge deck', 'More Tools', 'Voice', 'Target Folder', 'text-[10px] tabular-nums leading-none',
    // The wayfinding pulse (GuidePulse) drives itself off these tags: the phase
    // mechanic is a `step` (skipped once answered) and the composer is the `input`.
    'data-guide="step"', 'data-guide="input"'],
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

// Wayfinding-pulse tags on the REAL BoardSurvey render:
//  - a normal board emits both a `step` mechanic and an `input` composer;
//  - guide={false} (the live board during a revisit) emits NEITHER, so two
//    mounted BoardSurveys can't double up the pulse's guide boxes;
//  - a fresh, untouched board is NOT marked done — green only appears once the
//    send gate is satisfied, never on mere interaction.
{
  const gboard = BoardSchema.parse({
    id: 'b-guide',
    sessionId: 's',
    round: 1,
    kind: 'icon-grid',
    phase: 'diverge',
    title: 't',
    prompt: 'p',
    options: [{ id: 'a', label: 'A', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>' }],
    survey: {
      axes: [
        { id: 'x1', label: 'Tone', leftLabel: 'a', rightLabel: 'b' },
        { id: 'x2', label: 'Density', leftLabel: 'a', rightLabel: 'b' },
        { id: 'x3', label: 'Glow', leftLabel: 'a', rightLabel: 'b' },
        { id: 'x4', label: 'Shape', leftLabel: 'a', rightLabel: 'b' },
        { id: 'x5', label: 'Read', leftLabel: 'a', rightLabel: 'b' },
      ],
    },
    createdAt: 'now',
  });
  const base = { board: gboard, models: ['claude-fable-5'], defaultModel: 'claude-fable-5', onRespond: async () => {} };
  const on = renderToString(createElement(BoardSurvey, base));
  assert.ok(on.includes('data-guide="step"') && on.includes('data-guide="input"'), 'guide on: step + input tags present');
  assert.ok(!on.includes('data-guide-done'), 'fresh untouched board is NOT done — green only after the send gate opens');
  const off = renderToString(createElement(BoardSurvey, { ...base, guide: false }));
  assert.ok(!off.includes('data-guide='), 'guide=false suppresses ALL pulse tags (revisit dedup)');
  console.log('UI guide-pulse tags ✓ (step+input on; none when guide=false; fresh board not done)');
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

// --- Unified fullscreen viewer (ArtifactFullscreen — replaces PreviewModal +
// ArtifactChat, item 5). One component, four call-site variants:
//   (i)   round-history option  — inline svg, READ-ONLY note, chat dock (composer shown)
//   (ii)  captured artifact     — fetched svg (fetchSlug), EDITABLE note (draft+Save), pin toggle, chat
//   (iii) live-board option     — inline svg, LIVE note (onChange), NO chat dock at all
//   (iv)  read-only replay      — chat present but onSend absent (archived thread): no composer, no Save
const { ArtifactFullscreen } = await import('../apps/studio/src/components/ArtifactFullscreen.js');
const fsChatMessages = [
  ArtifactChatMessageSchema.parse({
    artifactSlug: 'winner',
    role: 'user',
    text: 'why this glow?',
    at: '2026-07-07T10:01:00.000Z',
  }),
  ArtifactChatMessageSchema.parse({
    artifactSlug: 'winner',
    role: 'claude',
    text: 'tightened the glow radius',
    at: '2026-07-07T10:02:00.000Z',
    revisedSlug: 'winner-2',
  }),
];

// (i) round-history option: inline svg + tags, read-only note, chat composer live.
const fsOption = renderToString(
  createElement(ArtifactFullscreen, {
    title: 'Alpha',
    tags: ['organic', 'bold'],
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>',
    notes: { value: 'liked the strata' },
    chat: { messages: fsChatMessages, onSend: () => {} },
    onClose: () => {},
  }),
);
for (const marker of [
  'Alpha',
  'organic',
  'bold',
  'liked the strata',
  '>Notes<',
  'tabular-nums', // the zoom % control
  '⟲',
  'why this glow?',
  'tightened the glow radius',
  'revised', // Claude reply carries revisedSlug → "revised → winner-2" trace
  'Ask or ask for a change…', // composer present (onSend given)
]) {
  assert.ok(fsOption.includes(marker), `[fullscreen option] missing marker "${marker}"`);
}
assert.ok(!fsOption.includes('<textarea'), '[fullscreen option] read-only note has no editor (no onChange/onSave)');
assert.ok(!fsOption.includes('📌'), '[fullscreen option] no pin toggle without the pin prop');
assert.ok(!fsOption.includes('Claude is thinking…'), '[fullscreen option] busy note absent when not busy');
const fsOptionBusy = renderToString(
  createElement(ArtifactFullscreen, {
    title: 'Alpha',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
    notes: { value: '' },
    chat: { messages: [], busy: true, onSend: () => {} },
    onClose: () => {},
  }),
);
assert.ok(fsOptionBusy.includes('Claude is thinking…'), '[fullscreen option] busy note shown when busy');
console.log('UI fullscreen viewer (round-history option) renders ✓ (inline svg, read-only note, chat dock, busy/idle)');

// (ii) captured artifact: fetchSlug (not inline svg), editable note (draft+Save), pin toggle, chat.
const fsArtifactPinned = renderToString(
  createElement(ArtifactFullscreen, {
    title: 'Winner',
    fetchSlug: 'winner',
    revised: true,
    notes: { value: 'ship this one', onSave: () => {} },
    chat: { messages: fsChatMessages, onSend: () => {} },
    pin: { pinned: true, onToggle: () => {} },
    onClose: () => {},
  }),
);
for (const marker of ['Winner', 'ship this one', '<textarea', 'revised', '📌 Pinned']) {
  assert.ok(fsArtifactPinned.includes(marker), `[fullscreen artifact] missing marker "${marker}"`);
}
const fsArtifactUnpinned = renderToString(
  createElement(ArtifactFullscreen, {
    title: 'Winner',
    fetchSlug: 'winner',
    notes: { value: 'ship this one', onSave: () => {} },
    chat: { messages: [], onSend: () => {} },
    pin: { pinned: false, onToggle: () => {} },
    onClose: () => {},
  }),
);
assert.ok(fsArtifactUnpinned.includes('📌 Pin'), '[fullscreen artifact] unpinned toggle label');
assert.ok(!fsArtifactUnpinned.includes('📌 Pinned'), '[fullscreen artifact] not showing the pinned label when unpinned');
assert.ok(!fsArtifactUnpinned.includes('unsaved'), '[fullscreen artifact] no "unsaved" badge when the draft matches the saved note');
console.log('UI fullscreen viewer (artifact) renders ✓ (fetched svg, editable notes, pin toggle, revised badge, chat)');

// (iii) live-board option (BoardSurvey usage): inline svg, LIVE onChange note, NO chat dock at all.
const fsLiveOption = renderToString(
  createElement(ArtifactFullscreen, {
    title: 'Beta',
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
    notes: { value: 'rounder please', onChange: () => {} },
    onClose: () => {},
  }),
);
assert.ok(fsLiveOption.includes('<textarea'), '[fullscreen live-option] editable note (onChange)');
assert.ok(fsLiveOption.includes('rounder please'), '[fullscreen live-option] live note value');
assert.ok(!fsLiveOption.includes('Ask or ask for a change'), '[fullscreen live-option] no chat dock without the chat prop');
assert.ok(!fsLiveOption.includes('Save notes'), '[fullscreen live-option] onChange note has no Save button (that is onSave)');
console.log('UI fullscreen viewer (live-board option) renders ✓ (onChange note, no chat dock)');

// (iv) read-only replay (archived thread): chat present but onSend absent → no
// composer, no Save notes; persisted messages and read-only note text still render.
const fsReadOnly = renderToString(
  createElement(ArtifactFullscreen, {
    title: 'Winner',
    fetchSlug: 'winner',
    notes: { value: 'ship this one' },
    chat: { messages: fsChatMessages },
    onClose: () => {},
  }),
);
assert.ok(fsReadOnly.includes('why this glow?'), '[fullscreen read-only] persisted messages still render');
assert.ok(fsReadOnly.includes('ship this one'), '[fullscreen read-only] notes shown as read-only text');
assert.ok(!fsReadOnly.includes('<input'), '[fullscreen read-only] no composer input without onSend');
assert.ok(!fsReadOnly.includes('Ask or ask for a change'), '[fullscreen read-only] no composer placeholder without onSend');
assert.ok(!fsReadOnly.includes('<textarea'), '[fullscreen read-only] no note editor without onChange/onSave');
assert.ok(!fsReadOnly.includes('Save notes'), '[fullscreen read-only] no Save notes button');
assert.ok(!fsReadOnly.includes('📌'), '[fullscreen read-only] no pin toggle without the pin prop');
console.log('UI fullscreen viewer (read-only replay) renders ✓ (no composer, no Save, persisted content shown)');

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

// --- Pure helpers: token-meter compact formatting ---
const { compactCount } = await import('../apps/studio/src/lib/format.js');
assert.equal(compactCount(0), '0');
assert.equal(compactCount(999), '999');
assert.equal(compactCount(1000), '1k', 'trailing .0 trimmed');
assert.equal(compactCount(12300), '12.3k');
assert.equal(compactCount(3400000), '3.4M');
console.log('LIB compactCount ✓ (0, 999, 1k, 12.3k, 3.4M)');

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

// Pinned row (item 5): a dedicated "📌 pinned" strip below the rounds, hidden when empty.
// Fixture goes through the schema like every production path (defaults stay in sync).
const pinnedArtifact = ArtifactSchema.parse({
  slug: 'glow-mark',
  name: 'Glow Mark',
  svgPath: 'threads/x/artifacts/glow-mark.svg',
  provenance: { optionIds: ['a'] },
  capturedAt: '2026-07-07T10:00:00.000Z',
});
const stripPinned = renderToString(
  createElement(WayfinderStrip, {
    rounds: wfRounds,
    artifacts: [pinnedArtifact],
    pinned: [pinnedArtifact],
    activeBoard: null,
    proposal: null,
    onJump: () => {},
    onAdvance: () => {},
    onOpenArtifact: () => {},
  }),
);
assert.ok(stripPinned.includes('📌 pinned'), '[wayfinder] pinned row label');
assert.ok(stripPinned.includes('Glow Mark'), '[wayfinder] pinned artifact name shown');
assert.ok(!stripIdle.includes('📌 pinned'), '[wayfinder] pinned row absent without the pinned prop');
console.log('UI wayfinder strip renders ✓ (pill hidden idle, shown live, pinned row)');

// --- New Discussion panel ("open with anything" as a chat panel) — must render without window ---
const { NewDiscussionPanel } = await import('../apps/studio/src/components/NewDiscussionPanel.js');
const vars = { canvas: '#fff', surface: '#fff', surface2: '#eee', line: '#ddd', ink: '#000', inkDim: '#666', accent: '#a855f7' };
const open = renderToString(
  createElement(NewDiscussionPanel, {
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
  'data-testid="survey-field"',
  'What are you making?',
  'Who is it for?',
  'How far should it push convention?',
  'Any hard constraints?',
  'or your own',
  'a logo',
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
console.log('UI new-discussion panel renders ✓ (survey questions + colors + full composer)');

// --- Claude-Code handoff: open_studio(SeedBrief) — brief + summary + BESPOKE questions + picks ---
// On a real run-brainstorm the orchestrator hands off a survey it AUTHORED for
// this brief (not the generic preset), pre-answered with recommendations. The
// panel: pre-fills the composer, shows the summary in the bubble (not the
// generic prompt), renders the bespoke questions IN PLACE OF the default set,
// and pre-selects the picks (checked pills) — all visible under renderToString.
const handoff = renderToString(
  createElement(NewDiscussionPanel, {
    themes: [{ name: 'neon-purple', label: 'Neon Purple', light: vars, dark: vars }],
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    targetRepo: null,
    seedBrief: {
      brief: 'app icons for a note-taking tool',
      summary: 'Exploring a set of playful app icons for your note-taking tool.',
      questions: [
        { id: 'metaphor', question: 'Which metaphor for the icon?', options: ['a folded note', 'a pencil', 'a spark'], recommended: 'a spark' },
        { id: 'motion', question: 'Any motion feel?', options: ['static', 'subtle pulse', 'bouncy'], multi: true },
      ],
      picks: { metaphor: ['a spark'], motion: ['subtle pulse'] },
    },
    onCancel: () => {},
    onStart: () => {},
  }),
);
assert.ok(
  handoff.includes('app icons for a note-taking tool'),
  '[new-discussion handoff] brief must pre-fill the textarea',
);
assert.ok(
  handoff.includes('Exploring a set of playful app icons for your note-taking tool.'),
  '[new-discussion handoff] summary must replace the generic bubble prompt on a run-brainstorm',
);
assert.ok(
  !handoff.includes('What do you want to explore?'),
  '[new-discussion handoff] the generic prompt must NOT show once a summary is handed off',
);
// The bespoke questions render; the generic preset does NOT (they replace it).
assert.ok(
  handoff.includes('Which metaphor for the icon?') && handoff.includes('a folded note'),
  '[new-discussion handoff] bespoke handoff questions must render',
);
assert.ok(
  !handoff.includes('What are you making?'),
  '[new-discussion handoff] handoff questions must REPLACE the generic preset, not append to it',
);
// Pre-selected answers render as checked pills (aria-checked="true"); a bare
// panel has none — so their presence here (and absence above) proves the picks
// were seeded, not merely that the option labels rendered.
assert.ok(
  handoff.includes('aria-checked="true"'),
  '[new-discussion handoff] picks must pre-select survey answers (checked pills)',
);
assert.ok(
  !open.includes('aria-checked="true"'),
  '[new-discussion handoff] a bare New Discussion must have no pre-selected answers',
);
console.log(
  'UI new-discussion handoff ✓ (brief prefill + summary bubble + bespoke questions replace preset + pre-selected picks)',
);

// --- Scribble-a-seed photo annotation: composeSeedSvg + toScribbleAnnotations ---
// Pure functions (no DOM). composeSeedSvg is the editable composite markup; the
// composite PNG (renderCompositePng) needs a real browser and is proven in human-sim.
const { composeSeedSvg, toScribbleAnnotations } = await import('../apps/studio/src/components/PhotoScribble.js');
const PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
const CONTENT = {
  photo: PHOTO,
  viewW: 400,
  viewH: 240,
  annotations: [
    { type: 'pen', color: '#00ff00', points: [{ x: 10, y: 10 }, { x: 40, y: 40 }] },
    { type: 'highlighter', color: '#ffff00', points: [{ x: 5, y: 5 }, { x: 60, y: 8 }] },
    { type: 'arrow', color: '#ff0000', from: { x: 100, y: 100 }, to: { x: 200, y: 120 } },
    { type: 'box', color: '#00aaff', from: { x: 20, y: 20 }, to: { x: 90, y: 70 } },
    { type: 'note', color: '#0000ff', at: { x: 50, y: 60 }, text: 'make this bigger' },
  ],
};
const annotated = composeSeedSvg(CONTENT);
assert.ok(annotated, '[scribble] annotated composite must not be null');
for (const marker of [
  `<image href="${PHOTO}"`, // photo embedded as background
  'stroke="#00ff00"', // pen stroke keeps its per-tool color
  'stroke-opacity="0.35"', // highlighter is translucent
  'stroke-width="14"', // highlighter is thick
  '<polygon', // arrowhead
  'fill="#ff0000"', // arrow color
  '<rect', // box + note card both use <rect>
  'stroke="#00aaff"', // box color
  'fill-opacity="0.12"', // box translucent fill
  '>make this bigger</text>', // note text rendered
]) {
  assert.ok(annotated!.includes(marker), `[scribble] annotated seed missing "${marker}"`);
}

// toScribbleAnnotations: the structured, model-legible export the model traverses.
const palette = [
  { name: 'Ion Teal', value: '#00ff00' },
  { name: 'Alarm Red', value: '#ff0000' },
];
const structured = toScribbleAnnotations(CONTENT, palette);
assert.equal(structured.viewBox.w, 400, '[scribble] structured viewBox width');
assert.equal(structured.background.present, true, '[scribble] structured background present');
assert.deepEqual(structured.items.map((i: { type: string }) => i.type), ['pen', 'highlighter', 'arrow', 'box', 'note'], '[scribble] structured item types in draw order');
assert.equal(structured.items[0].colorName, 'Ion Teal', '[scribble] pen ink resolves to its palette color NAME');
assert.equal(structured.items[2].colorName, 'Alarm Red', '[scribble] arrow ink resolves to its palette color NAME');
assert.equal(structured.items[4].colorName, 'accent', '[scribble] a color not in the palette falls back to "accent"');
assert.equal(structured.items[4].text, 'make this bigger', '[scribble] note text carried verbatim in the structured export');

// No marks → null (a bare photo is already carried as an attachment).
assert.strictEqual(
  composeSeedSvg({ photo: PHOTO, viewW: 400, viewH: 240, annotations: [] }),
  null,
  '[scribble] a bare photo (no marks) must not become a seed',
);
// Plain scribble (no photo) still works — the original behavior is subsumed.
const plain = composeSeedSvg({
  photo: null,
  viewW: 400,
  viewH: 240,
  annotations: [{ type: 'pen', color: '#123456', points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }],
});
assert.ok(plain && plain.includes('<polyline') && !plain.includes('<image'), '[scribble] plain scribble seed');
// Note text is escaped, not injected as markup.
const escaped = composeSeedSvg({
  photo: null,
  viewW: 400,
  viewH: 240,
  annotations: [{ type: 'note', color: '#000', at: { x: 0, y: 0 }, text: '<script>x</script>' }],
});
assert.ok(escaped && !escaped.includes('<script>'), '[scribble] note text must be escaped');
// The composite must be WELL-FORMED SVG or the browser's <img>→canvas rasterization
// (renderCompositePng) fails and no vision-readable composite.png is produced. Two guards:
// (1) no inner double-quote inside the note font-family (a quoted family name like
// "Segoe UI" would close the attribute and malform the SVG); (2) it parses clean.
assert.ok(annotated!.includes('font-family="ui-sans-serif'), '[scribble] note uses the app font stack');
assert.ok(!annotated!.includes('"Segoe UI"'), '[scribble] no quoted family name inside font-family (an inner " closes the attribute → malformed SVG → composite render fails)');
const fontAttr = annotated!.match(/font-family="([^"]*)"/);
assert.ok(fontAttr && !fontAttr[1].includes('"'), '[scribble] the font-family value has no inner double-quote');
const parsed = new DOMParser().parseFromString(annotated!, 'image/svg+xml');
assert.ok(!parsed.querySelector('parsererror'), '[scribble] the composite SVG parses clean (rasterizable to composite.png)');
assert.equal(parsed.documentElement.nodeName.toLowerCase(), 'svg', '[scribble] composite root is <svg>');
// Explicit width/height alongside the viewBox: Firefox/Safari mis-rasterize an
// intrinsically-unsized SVG through canvas drawImage (blank or a 300x150 default),
// silently losing the vision composite off Chromium.
assert.ok(annotated!.includes('width="400" height="240"'), '[scribble] composite root carries explicit width/height matching the viewBox');
console.log('UI scribble-a-seed composeSeedSvg + toScribbleAnnotations ✓ (photo embed, pen/highlighter/arrow/box/note, palette color names, well-formed SVG, escaped)');

// --- Annotate-on-option rasterize guards (svgDims + withExplicitSize) ---
// Board options carry a viewBox but NO width/height (svg-authoring craft);
// Firefox/Safari mis-rasterize an intrinsically-unsized SVG through canvas
// drawImage (blank or 300x150) — the fullscreen annotate path must inject
// explicit dims (same guard composeSeedSvg carries) and read the aspect from
// either quote style, else the pad background is blank/distorted and every
// stored mark coordinate lands in the wrong space.
const { svgDims, withExplicitSize } = await import('../apps/studio/src/components/ArtifactFullscreen.js');
assert.deepEqual(svgDims('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 500"><rect/></svg>'), { w: 300, h: 500 }, '[annotate] double-quoted viewBox parses (portrait aspect preserved, not squared)');
assert.deepEqual(svgDims("<svg viewBox='0 0 640 360'/>"), { w: 640, h: 360 }, '[annotate] single-quoted viewBox parses');
assert.deepEqual(svgDims('<svg width="320" height="200"><rect/></svg>'), { w: 320, h: 200 }, '[annotate] width/height-only SVG falls back to the root attrs, not 400x400');
assert.deepEqual(svgDims('<div>not svg</div>'), { w: 400, h: 400 }, '[annotate] garbage input falls back square');
const sized = withExplicitSize('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 500"><rect/></svg>', 300, 500);
assert.ok(sized.includes('width="300"') && sized.includes('height="500"'), '[annotate] intrinsically-unsized option gains explicit width/height before rasterize');
assert.ok(new DOMParser().parseFromString(sized, 'image/svg+xml').documentElement.nodeName.toLowerCase() === 'svg', '[annotate] sized markup still parses as SVG');
const already = '<svg width="10" height="20" viewBox="0 0 10 20"/>';
assert.strictEqual(withExplicitSize(already, 10, 20), already, '[annotate] an already-sized SVG is left byte-identical');
console.log('UI annotate-on-option rasterize guards ✓ (svgDims quote styles + attr fallback, withExplicitSize injects dims)');

// --- Concierge intake surface (adaptive clarifying question) ---
// Fixture goes through the schema like every production path (defaults stay in sync).
const { ConciergeIntake } = await import('../apps/studio/src/components/ConciergeIntake.js');
const conciergeExchange = ConciergeExchangeSchema.parse({
  id: 'c1',
  question: 'Who is the audience?',
  suggestions: ['my team', 'customers'],
});
const conciergeHtml = renderToString(
  createElement(ConciergeIntake, { exchange: conciergeExchange, onAnswer: async () => {} }),
);
// Markers live inside single text/attribute nodes — never spanning adjacent JSX expressions.
for (const marker of [
  'data-testid="concierge-intake"',
  'Concierge',
  'Who is the audience?',
  'data-testid="concierge-chips"',
  'my team',
  'customers',
  'Answer in your own words',
  'Send answer',
]) {
  assert.ok(conciergeHtml.includes(marker), `[concierge-intake] missing marker "${marker}"`);
}
console.log('UI concierge intake renders ✓');

// --- Living Gallery surface (concierge's final response: four method minis) ---
// Fixture goes through the schema like every production path (defaults stay in sync).
const { LivingGallery } = await import('../apps/studio/src/components/LivingGallery.js');
const livingGallery = LivingGallerySchema.parse({
  ...(loadCanonical('gallery/gallery.json', LivingGallerySchema) as Record<string, unknown>),
  id: 'g1',
});
const galleryHtml = renderToString(
  createElement(LivingGallery, { gallery: livingGallery, onPick: async () => {} }),
);
// Markers live inside single text/attribute nodes — never spanning adjacent JSX expressions.
for (const marker of [
  'data-testid="living-gallery"',
  'Living Gallery',
  'here are ways to explore it', // a substring of gallery.prompt
  'data-testid="method-card-mindmap"',
  'data-testid="method-card-funnel"',
  'data-testid="method-card-wreck"',
  'data-testid="method-card-cluster"',
  'Mind map',
  'Funnel',
  'data-testid="recommended-ribbon"',
  'Recommended',
  'data-testid="reason-chip"',
  'co-edited map fits', // a substring of the mindmap card's reason
]) {
  assert.ok(galleryHtml.includes(marker), `[living-gallery] missing marker "${marker}"`);
}
// Only the recommended (mindmap) card is ribboned — exactly one ribbon on the surface.
assert.equal(
  galleryHtml.split('data-testid="recommended-ribbon"').length - 1,
  1,
  '[living-gallery] exactly one recommended ribbon (only mindmap recommended)',
);
console.log('UI living gallery renders ✓');

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
assert.ok(gate.includes('Keep') && gate.includes('Kill') && gate.includes('Merge') && gate.includes('Final'), '[triage-gate] per-card verdict buttons');
assert.ok(!gate.includes('<textarea'), '[triage-gate] no note textarea without onNote');

// Card grid with per-option notes: onNote adds a textarea per card, prefilled from notes.
const gateNoted = renderToString(
  createElement(TriageGate, {
    board: gateBoard,
    triage: {},
    finalId: null,
    notes: { 'o5-0': 'strongest silhouette' },
    onNote: () => {},
    onTriage: () => {},
    onFinal: () => {},
    onPreview: () => {},
  }),
);
assert.ok(gateNoted.includes('<textarea'), '[triage-gate] per-card note textarea with onNote');
assert.ok(gateNoted.includes('strongest silhouette'), '[triage-gate] note value prefilled from notes prop');
assert.ok(gateNoted.includes('Why this verdict on'), '[triage-gate] note placeholder');
console.log('UI triage gate renders ✓ (sudden-death offer, per-card notes with onNote only)');

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

// Token badge: the contract puts 'Σ <compact> tok' in ONE text node (renderToString
// comment nodes — see learnings 2026-07-06), so the full string is safe to assert…
const activityTokens = renderToString(
  createElement(SessionActivity, {
    events: progressEvents,
    tokens: { input: 12000, output: 300 },
  }),
);
assert.ok(activityTokens.includes('Σ 12.3k tok'), '[session-activity] token badge missing');
// …and without the tokens prop there is no badge at all.
assert.ok(!activity.includes('Σ '), '[session-activity] badge must not render without tokens prop');
console.log('UI session activity token badge ✓ (Σ 12.3k tok, absent without prop)');

// Per-sink accounting: the economy view — visible without expanding — labels each
// sink with a bar + compact count; sinks with zero tokens are omitted.
const activitySinks = renderToString(
  createElement(SessionActivity, {
    events: progressEvents,
    tokens: { input: 12000, output: 300 },
    tokensBySink: { generation: 9000, orchestration: 3000, tweak: 300 },
  }),
);
assert.ok(activitySinks.includes('Where the tokens went'), '[session-activity] sink panel header missing');
for (const [label, count] of [['Board generation', '9k'], ['Orchestration', '3k'], ['Tweak rounds', '300']]) {
  assert.ok(activitySinks.includes(label), `[session-activity] sink label "${label}" missing`);
  assert.ok(activitySinks.includes(count), `[session-activity] sink count "${count}" missing`);
}
assert.ok(!activitySinks.includes('Poster'), '[session-activity] zero-token sink must be omitted');
// No breakdown at all without the tokensBySink prop.
assert.ok(!activityTokens.includes('Where the tokens went'), '[session-activity] no sink panel without tokensBySink');
console.log('UI session activity per-sink accounting ✓ (labeled bars, zero sinks omitted)');

// --- Sidebar rows: compact token count when summary.tokens > 0, hidden at 0 ---
// Fixtures go through the schema like every production path (defaults stay in sync).
const { Sidebar } = await import('../apps/studio/src/components/Sidebar.js');
const summaryCounted = DiscussionSummarySchema.parse({
  id: 'thread-counted',
  title: 'Counted thread',
  startedAt: '2026-07-06T10:00:00.000Z',
  dir: 'x',
  rounds: 2,
  artifacts: 1,
  tokens: 12300,
});
const summaryQuiet = DiscussionSummarySchema.parse({
  id: 'thread-quiet',
  title: 'Quiet thread',
  startedAt: '2026-07-06T10:00:00.000Z',
  dir: 'y',
  rounds: 1,
  artifacts: 0,
});
const sidebarProps = { archive: [], liveId: null, selectedId: null, onSelect: () => {} };
const sidebarCounted = renderToString(
  createElement(Sidebar, { ...sidebarProps, discussions: [summaryCounted] }),
);
// '12.3k' and 'tok' asserted separately — the row may join count and unit across
// adjacent JSX expressions, where a spanning marker never matches (learnings 2026-07-06).
assert.ok(sidebarCounted.includes('12.3k'), '[sidebar] compact token count missing');
assert.ok(sidebarCounted.includes('tok'), '[sidebar] token unit missing');
const sidebarQuiet = renderToString(
  createElement(Sidebar, { ...sidebarProps, discussions: [summaryQuiet] }),
);
assert.ok(!sidebarQuiet.includes('tok'), '[sidebar] zero-token row must not show a token count');
// Nav label: the collapsible section is "Completed (n)", not the old "Archive (n)".
// "Completed (" and {archive.length} are adjacent JSX expressions — renderToString
// emits a comment node between them, so 'Completed (0)' never matches (markers must
// live in a single text/JSX node, learnings 2026-07-06); assert the text-node half.
assert.ok(sidebarCounted.includes('Completed ('), '[sidebar] Completed section toggle');
assert.ok(!sidebarCounted.includes('Archive'), '[sidebar] the old "Archive" label must be gone');
console.log('UI sidebar renders ✓ (token count at >0, hidden at 0, Completed section label)');

// --- Revisit mode: BoardSurvey prefilled from a recorded response (initial prop) ---
// Fixtures go through the schema like every production path (defaults stay in sync).
const revisitBoard = mkRound('diverge', 7, 3).board;
const revisitInitial = BoardResponseSchema.parse({
  boardId: revisitBoard.id,
  selectedOptionIds: ['o7-0', 'o7-1'],
  elaboration: 'vibr-prefill: chase the warm arc',
  action: 'iterate',
  respondedAt: '2026-07-07T10:00:00.000Z',
});
const revisit = renderToString(
  createElement(BoardSurvey, {
    board: revisitBoard,
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    onRespond: async () => {},
    onPreview: () => {},
    initial: revisitInitial,
  }),
);
assert.ok(revisit.includes('vibr-prefill: chase the warm arc'), '[revisit] elaboration prefilled from initial');
// '2 selected' lives in ONE template literal (a single text node) — safe to assert.
assert.ok(revisit.includes('2 selected'), '[revisit] selection count prefilled from initial');
const fresh = renderToString(
  createElement(BoardSurvey, {
    board: revisitBoard,
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    onRespond: async () => {},
    onPreview: () => {},
  }),
);
assert.ok(fresh.includes('0 selected'), '[revisit] without initial the survey starts from zero');
console.log('UI board survey revisit ✓ (initial prefills elaboration + selections, absent → zero)');

// --- Mind-map canvas surface: a `mindmap`-kind board with a `tree` renders the live
// co-edit canvas (mind-elixir is a dynamic import inside an effect, so it never runs
// under renderToString — only the static wrapper does) and suppresses the option grid. ---
// Fixture goes through the schema like every production path (defaults stay in sync).
const mmSurfaceBoard = BoardSchema.parse({
  id: 'b-mindmap',
  sessionId: 's',
  round: 1,
  kind: 'mindmap',
  phase: 'diverge',
  title: 't-mindmap',
  prompt: 'edit the tree',
  options: [],
  tree: {
    nodeData: {
      id: 'root',
      topic: 'Glow mark',
      children: [
        { id: 'c1', topic: 'Warmth' },
        { id: 'c2', topic: 'Motion' },
      ],
    },
    direction: 2,
  },
  survey: { axes: [] },
  createdAt: 'now',
});
const mmHtml = renderToString(
  createElement(BoardSurvey, {
    board: mmSurfaceBoard,
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    onRespond: async () => {},
    onPreview: () => {},
  }),
);
// Markers live inside single text/attribute nodes — never spanning adjacent JSX expressions.
for (const marker of [
  'data-testid="mindmap-canvas"',
  'Mind map — one living structure',
  'double-click to rename',
  'data-testid="mindmap-engine"',
  // The per-node action bar + its four controls render statically (bound to the
  // selected node, so they exist even before the engine mounts).
  'data-testid="node-actions"',
  'data-testid="node-explode"',
  'data-testid="node-add"',
  'data-testid="node-note"',
  'data-testid="node-delete"',
  'Send &amp; iterate', // the composer still renders under the canvas
]) {
  assert.ok(mmHtml.includes(marker), `[mindmap-canvas] missing marker "${marker}"`);
}
// The option grid + phase mechanics are suppressed for a mindmap board.
assert.ok(!mmHtml.includes('judge deck'), '[mindmap-canvas] option-grid mechanic must be suppressed');
console.log('UI mindmap canvas renders ✓ (canvas + engine + node action bar + composer, option grid suppressed)');

// --- Decision-tree toggle: the WayfinderStrip exposes the per-discussion decision
// tree once there is at least one round. Render the strip with onDecisionTree set. ---
const wfRound = {
  board: BoardSchema.parse({
    id: 'b-wf', sessionId: 's', round: 1, kind: 'icon-grid', phase: 'diverge',
    title: 't', prompt: 'p',
    options: [{ id: 'o1', label: 'One', svg: '<svg/>', tags: [], parents: [] }],
    survey: { axes: [] }, createdAt: 'now',
  }),
  response: null,
};
const wfHtml = renderToString(
  createElement(WayfinderStrip, {
    rounds: [wfRound],
    artifacts: [],
    activeBoard: null,
    proposal: null,
    onJump: () => {},
    onAdvance: () => {},
    onDecisionTree: () => {},
  }),
);
assert.ok(wfHtml.includes('data-testid="decision-tree-toggle"'), '[wayfinder] decision-tree toggle missing');
assert.ok(wfHtml.includes('decision tree'), '[wayfinder] decision-tree label missing');
console.log('UI decision-tree toggle renders ✓ (wayfinder exposes the per-discussion decision tree)');

// --- Crash boundary (blank-page skew, 2026-07-07) ---
// renderToString never invokes error boundaries (client-runtime only), so the
// fallback branch is exercised directly: a tiny subclass whose constructor seeds
// the caught-error state renders the crash panel instead of its children.
const { CrashBoundary } = await import('../apps/studio/src/components/CrashPanel.js');
const healthy = renderToString(
  createElement(CrashBoundary, null, createElement('div', null, 'healthy child content')),
);
assert.ok(healthy.includes('healthy child content'), '[crash-boundary] children must pass through');
assert.ok(
  !healthy.includes('The studio crashed while rendering'),
  '[crash-boundary] fallback must not render without an error',
);

class CrashedBoundary extends CrashBoundary {
  constructor(props: ConstructorParameters<typeof CrashBoundary>[0]) {
    super(props);
    this.state = { error: new Error('vibr-crash-marker: render exploded') };
  }
}
const crashed = renderToString(
  createElement(CrashedBoundary, null, createElement('div', null, 'healthy child content')),
);
// Markers live inside single text nodes — never spanning adjacent JSX expressions.
for (const marker of ['The studio crashed while rendering', 'Reload the studio', 'vibr-crash-marker']) {
  assert.ok(crashed.includes(marker), `[crash-boundary] missing marker "${marker}"`);
}
assert.ok(crashed.includes('<pre'), '[crash-boundary] error stack must render in a <pre>');
assert.ok(
  !crashed.includes('healthy child content'),
  '[crash-boundary] children must not render alongside the fallback',
);
console.log('UI crash boundary renders ✓ (pass-through healthy, fallback with stack)');

console.log(`UI SMOKE PASS — all ${Object.keys(EXPECT).length} phase surfaces render with their mechanics`);
