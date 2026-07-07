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
const { ArtifactChatMessageSchema, ArtifactSchema, BoardResponseSchema, BoardSchema, ProgressEventSchema, DiscussionSummarySchema } =
  await import('@visual-brainstorm/protocol');
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
for (const marker of ['Alpha', 'organic', 'bold', 'good bones', 'Notes on', '⟲', '>Notes<']) {
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
assert.ok(!previewReadOnly.includes('>Notes<'), '[preview] notes side panel hidden without onNoteChange/note/chat');
assert.ok(!previewReadOnly.includes('>Chat<'), '[preview] chat section hidden without the chat prop');

// Read-only note (previous rounds): the dock renders the persisted note text, no editor.
const previewNoteOnly = renderToString(
  createElement(PreviewModal, {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
    label: 'Gamma',
    note: 'liked the strata',
    onClose: () => {},
  }),
);
assert.ok(previewNoteOnly.includes('>Notes<'), '[preview read-only note] dock renders with a bare note');
assert.ok(previewNoteOnly.includes('liked the strata'), '[preview read-only note] note text shown');
assert.ok(!previewNoteOnly.includes('<textarea'), '[preview read-only note] no editor without onNoteChange');

// Chat dock: the chat prop renders a Chat section under Notes with the dialog.
// Fixtures go through the schema like every production path (defaults stay in sync).
const previewChatMessages = [
  ArtifactChatMessageSchema.parse({
    artifactSlug: 'option:b-preview:a',
    role: 'user',
    text: 'why the arc?',
    at: '2026-07-07T10:00:00.000Z',
  }),
];
const previewWithChat = renderToString(
  createElement(PreviewModal, {
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"/>',
    label: 'Alpha',
    note: 'good bones',
    chat: { messages: previewChatMessages, onSend: () => {} },
    onClose: () => {},
  }),
);
for (const marker of ['>Chat<', 'why the arc?', 'ask about this option']) {
  assert.ok(previewWithChat.includes(marker), `[preview chat] missing marker "${marker}"`);
}
console.log('UI preview modal renders ✓ (editable note, read-only note, chat dock, bare variants)');

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
console.log('UI sidebar renders ✓ (token count at >0, hidden at 0)');

// --- Artifact chat panel (per-artifact conversation + revision marker) ---
// Fixtures go through the schema like every production path (defaults stay in sync).
const { ArtifactChat } = await import('../apps/studio/src/components/ArtifactChat.js');
const chatArtifact = ArtifactSchema.parse({
  slug: 'winner',
  name: 'Winner',
  svgPath: 'threads/x/artifacts/winner.svg', // fake path — SVG fetch may placeholder, markers only
  provenance: { optionIds: ['b'] },
  capturedAt: '2026-07-07T10:00:00.000Z',
});
const chatMessages = [
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
const chatIdle = renderToString(
  createElement(ArtifactChat, { artifact: chatArtifact, messages: chatMessages, onSend: () => {} }),
);
// Markers live inside single text nodes — never spanning adjacent JSX expressions.
for (const marker of [
  'Artifact chat',
  'Ask or ask for a change…',
  'Send',
  'revised',
  'why this glow?',
  'tightened the glow radius',
]) {
  assert.ok(chatIdle.includes(marker), `[artifact-chat] missing marker "${marker}"`);
}
assert.ok(
  !chatIdle.includes('Claude is thinking…'),
  '[artifact-chat] busy note must not render when not busy',
);
const chatBusy = renderToString(
  createElement(ArtifactChat, { artifact: chatArtifact, messages: chatMessages, onSend: () => {}, busy: true }),
);
assert.ok(chatBusy.includes('Claude is thinking…'), '[artifact-chat] busy note missing when busy');

// Notes dock above the chat: read-only text without onSaveNotes, editor + Save with it.
assert.ok(chatIdle.includes('>Notes<'), '[artifact-chat] notes section header');
assert.ok(chatIdle.includes('No notes on this artifact.'), '[artifact-chat] read-only fallback without onSaveNotes');
assert.ok(!chatIdle.includes('Save notes'), '[artifact-chat] no save button without onSaveNotes');
const chatNotesArtifact = ArtifactSchema.parse({
  slug: 'winner',
  name: 'Winner',
  svgPath: 'threads/x/artifacts/winner.svg',
  notes: 'ship this one',
  provenance: { optionIds: ['b'] },
  capturedAt: '2026-07-07T10:00:00.000Z',
});
const chatSavable = renderToString(
  createElement(ArtifactChat, {
    artifact: chatNotesArtifact,
    messages: chatMessages,
    onSend: () => {},
    onSaveNotes: () => {},
  }),
);
assert.ok(chatSavable.includes('Save notes'), '[artifact-chat] Save notes button with onSaveNotes');
assert.ok(chatSavable.includes('<textarea'), '[artifact-chat] notes editor with onSaveNotes');
assert.ok(chatSavable.includes('ship this one'), '[artifact-chat] persisted notes prefill the editor');
console.log('UI artifact chat renders ✓ (messages, revision marker, busy/idle, notes dock save/read-only)');

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
  'double-click a node to rename',
  'data-testid="mindmap-engine"',
  'Send &amp; iterate', // the composer still renders under the canvas
]) {
  assert.ok(mmHtml.includes(marker), `[mindmap-canvas] missing marker "${marker}"`);
}
// The option grid + phase mechanics are suppressed for a mindmap board.
assert.ok(!mmHtml.includes('judge deck'), '[mindmap-canvas] option-grid mechanic must be suppressed');
console.log('UI mindmap canvas renders ✓ (canvas + engine + composer, option grid suppressed)');

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
