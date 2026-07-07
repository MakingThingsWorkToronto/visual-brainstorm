/**
 * Headless smoke test (CLAUDE.md rule 10): full present → select → respond round-trip
 * against the built bridge, acting as the studio over WS + HTTP. Also covers the
 * discussion cache (list/reload), themes, and model routing. Exits 0 on pass.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { BUILTIN_THEMES } from '../apps/mcp/dist/themes.js';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-smoke-'));
const store = new SessionStore('Smoke test session', scratch);
const bridge = new Bridge(store, {
  discussionRoot: scratch,
  themes: BUILTIN_THEMES,
  theme: 'neon-purple',
  models: ['claude-fable-5', 'claude-haiku-4-5'],
  defaultModel: 'claude-fable-5',
  engine: 'claude',
  saveTheme: (theme) => {
    const dir = path.join(scratch, 'styles');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${theme.name}.json`), JSON.stringify(theme, null, 2));
    return [...BUILTIN_THEMES.filter((t) => t.name !== theme.name), theme];
  },
});
await bridge.start(0); // ephemeral port

const axes = [
  { id: 'tone', label: 'Tone', leftLabel: 'Playful', rightLabel: 'Serious', defaultValue: 50 },
  { id: 'cost', label: 'Cloud cost', leftLabel: 'Cheap', rightLabel: 'Expensive', defaultValue: 30 },
  { id: 'complexity', label: 'Complexity', leftLabel: 'Simple', rightLabel: 'Complex', defaultValue: 50 },
  { id: 'glow', label: 'Neon-ness', leftLabel: 'Flat', rightLabel: 'Full glow', defaultValue: 70 },
  { id: 'shape', label: 'Geometry', leftLabel: 'Geometric', rightLabel: 'Organic', defaultValue: 50 },
];

const board = {
  id: 'board-r1-smoke',
  sessionId: store.info.id,
  round: 1,
  kind: 'icon-grid',
  phase: 'diverge',
  title: 'Smoke board',
  prompt: 'Pick one.',
  options: [
    { id: 'a', label: 'A', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>', tags: [], parents: [] },
    { id: 'b', label: 'B', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8"/></svg>', tags: [], parents: [] },
  ],
  survey: {
    multiSelect: true,
    minSelect: 0,
    elaborationPrompt: 'x',
    allowPerOptionNotes: true,
    allowRemix: true,
    axes,
  },
  createdAt: new Date().toISOString(),
};

// Studio stand-in: connect WS, expect hello then board, respond via HTTP.
const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws`);
const seen = [];
ws.addEventListener('message', async (event) => {
  const msg = JSON.parse(event.data);
  seen.push(msg.type);
  if (msg.type === 'hello') {
    assert.ok(msg.state.themes.length >= 4, 'hello carries themes');
    assert.equal(msg.state.theme, 'neon-purple');
    assert.deepEqual(msg.state.models, ['claude-fable-5', 'claude-haiku-4-5']);
  }
  if (msg.type === 'board' && msg.board.id === 'board-r1-smoke') {
    assert.equal(msg.board.survey.axes.length, 5, 'axes delivered to studio');
    const res = await fetch(`http://127.0.0.1:${bridge.port}/api/respond`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        boardId: msg.board.id,
        selectedOptionIds: ['b'],
        elaboration: 'rounder please',
        perOptionNotes: { b: 'good bones' },
        axisValues: { tone: 20, cost: 10, complexity: 40, glow: 90, shape: 60 },
        remixPairs: [['a', 'b']],
        action: 'iterate',
        model: 'claude-haiku-4-5',
        triage: { b: 'keep' },
        mutations: { a: ['flip', 'xray'] },
        flaws: { a: 'too plain' },
        positions: { a: { x: 20, y: 30 }, b: { x: 24, y: 33 } },
        clusters: [['a', 'b']],
        gapNotes: [{ between: [0, 1], note: 'hybrid?' }],
        attachments: [
          { name: 'ref.png', dataUri: 'data:image/png;base64,iVBORw0KGgo=' },
          { name: 'bad.bin', dataUri: 'not-a-data-uri' },
        ],
        paletteColors: [{ name: 'Neon Purple accent', value: '#a855f7' }],
        respondedAt: new Date().toISOString(),
      }),
    });
    assert.equal(res.status, 200);
  }
});

await new Promise((resolve) => ws.addEventListener('open', resolve));

const response = await bridge.presentAndWait(board, 15_000, /* open browser */ false);
assert.ok(response, 'presentAndWait resolved with a response (not timeout)');
assert.deepEqual(response.selectedOptionIds, ['b']);
assert.equal(response.elaboration, 'rounder please');
assert.equal(response.action, 'iterate');
assert.equal(response.model, 'claude-haiku-4-5', 'model routing round-trips');
assert.deepEqual(response.remixPairs, [['a', 'b']]);
assert.equal(response.axisValues.glow, 90);
assert.deepEqual(response.mutations.a, ['flip', 'xray'], 'phase fields round-trip');
assert.equal(response.flaws.a, 'too plain');
assert.equal(response.triage.b, 'keep');
assert.deepEqual(response.clusters, [['a', 'b']]);

// Attachments: valid one persisted to the thread dir (dataUri blanked), bad one honest-failed.
assert.equal(response.attachments.length, 2);
const [goodAtt, badAtt] = response.attachments;
assert.ok(goodAtt.savedPath, 'valid attachment got a savedPath');
assert.ok(fs.existsSync(goodAtt.savedPath), 'attachment file exists on disk');
assert.equal(goodAtt.dataUri, '', 'dataUri blanked after persisting');
assert.equal(badAtt.savedPath, undefined, 'bad data URI has no savedPath (honest failure)');
assert.deepEqual(
  response.paletteColors,
  [{ name: 'Neon Purple accent', value: '#a855f7' }],
  'palette picks round-trip',
);

// State endpoint reflects the completed round.
const state = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.equal(state.rounds.length, 1);
assert.ok(state.rounds[0].response, 'round has persisted response in state');

// Persistence on disk (rule 7) — the discussion-style thread cache.
const roundDir = path.join(store.info.dir, 'round-01');
for (const file of ['board.json', 'option-a.svg', 'option-b.svg', 'response.json']) {
  assert.ok(fs.existsSync(path.join(roundDir, file)), `missing ${file}`);
}

// brainstorm.md — the append-only text memory (re-synthesis source).
const md = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
assert.ok(md.includes('## Round 1 — diverge'), 'brainstorm.md records the round');
assert.ok(md.includes('**B** (`b`)'), 'brainstorm.md lists options with labels');
assert.ok(md.includes('### User response'), 'brainstorm.md records the response digest');
assert.ok(md.includes('mash up "A" × "B"'), 'digest lines use labels');

// Artifact capture.
const artifact = store.captureArtifact('winner', board.options[1].svg, 'final', {
  boardId: board.id,
  optionIds: ['b'],
});
assert.ok(fs.existsSync(artifact.svgPath));

// Artifact SVG endpoint (wayfinder drag-out): live-thread artifact serves as image/svg+xml…
const artifactRes = await fetch(
  `http://127.0.0.1:${bridge.port}/api/artifact-svg/${encodeURIComponent(artifact.slug)}.svg`,
);
assert.equal(artifactRes.status, 200);
assert.ok(artifactRes.headers.get('content-type').includes('image/svg+xml'));
assert.ok((await artifactRes.text()).includes('<svg'), 'artifact endpoint streams the stored SVG');
// …and an unknown slug is an honest 404.
const missingRes = await fetch(`http://127.0.0.1:${bridge.port}/api/artifact-svg/no-such-artifact.svg`);
assert.equal(missingRes.status, 404);

// Discussion cache: list + full reload via HTTP (what the left nav uses)…
const list = await (await fetch(`http://127.0.0.1:${bridge.port}/api/discussions`)).json();
assert.equal(list.length, 1, 'thread listed');
assert.equal(list[0].rounds, 1);
assert.equal(list[0].artifacts, 1);
assert.equal(list[0].archived, false);
const thread = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/discussions/${encodeURIComponent(list[0].id)}`)
).json();
assert.equal(thread.rounds.length, 1);
assert.equal(thread.rounds[0].response.elaboration, 'rounder please');
assert.ok(thread.rounds[0].board.options[0].svg.includes('<svg'), 'SVGs reload from cache');
assert.equal(thread.artifacts.length, 1);

// …and via SessionStore.open (what present_board discussionId resume uses).
const reopened = SessionStore.open(store.info.dir);
assert.equal(reopened.nextRound(), 2, 'resumed thread continues round numbering');
assert.equal(reopened.rounds[0].response.model, 'claude-haiku-4-5');

// peek_response path.
assert.equal(bridge.peekResponse(board.id)?.boardId, board.id);

// UI command buttons: queued when no board is waiting…
let cmd = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'plan-closeout' }),
  })
).json();
assert.equal(cmd.delivered, 'queued');
assert.deepEqual(bridge.drainCommands().map((c) => c.command), ['plan-closeout']);
assert.deepEqual(bridge.peekCommands(), []);

// …and resolving the active wait when a board IS waiting.
const wait2 = bridge.presentAndWait({ ...board, id: 'board-r2-smoke', round: 2 }, 15_000, false);
await new Promise((r) => setTimeout(r, 100));
cmd = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'discover-skills' }),
  })
).json();
assert.equal(cmd.delivered, 'via-board-response');
const parked = await wait2;
assert.equal(parked.action, 'park');
assert.deepEqual(parked.commands, ['discover-skills']);

// Seed intake ("open with anything"): a sketch seed persists to <root>/.seeds/…
const seedSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><polyline points="0,0 10,10" fill="none" stroke="#333"/></svg>';
let seedCmd = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'new-brainstorm', prompt: 'riff on this', seed: { kind: 'sketch', svg: seedSvg } }),
  })
).json();
assert.equal(seedCmd.ok, true);
assert.equal(seedCmd.delivered, 'queued');
const seedFiles = fs.readdirSync(path.join(scratch, '.seeds')).filter((f) => /^seed-.*\.svg$/.test(f));
assert.equal(seedFiles.length, 1, 'sketch seed written to .seeds');
assert.equal(fs.readFileSync(path.join(scratch, '.seeds', seedFiles[0]), 'utf8'), seedSvg);
let [seedReq] = bridge.drainCommands();
assert.equal(seedReq.command, 'new-brainstorm');
assert.ok(seedReq.seedNote.includes(seedFiles[0]), 'digest note points at the persisted sketch');

// …and a bad image data URI yields an honest failure note, never a fake file.
seedCmd = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'new-brainstorm', seed: { kind: 'image', dataUri: 'data:text/plain;base64,AAAA', name: 'bad.txt' } }),
  })
).json();
assert.equal(seedCmd.ok, true, 'bad seed is not a transport error');
[seedReq] = bridge.drainCommands();
assert.ok(seedReq.seedNote.includes('could not be decoded'), 'honest failure note (no fake success)');
assert.equal(
  fs.readdirSync(path.join(scratch, '.seeds')).length, 1,
  'no file written for the rejected image',
);

// New Discussion composer extras: attachments/model/palette ride the command as seed notes.
seedCmd = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      command: 'new-brainstorm',
      prompt: 'logo ideas',
      attachments: [{ name: 'inspo.png', dataUri: 'data:image/png;base64,iVBORw0KGgo=' }],
      model: 'claude-haiku-4-5',
      palette: [{ name: 'Neon Purple accent', value: '#a855f7' }],
    }),
  })
).json();
assert.equal(seedCmd.ok, true);
[seedReq] = bridge.drainCommands();
assert.ok(seedReq.seedNote.includes('inspo'), 'attachment seed note names the file');
assert.ok(seedReq.seedNote.includes('claude-haiku-4-5'), 'model choice rides the command');
assert.ok(seedReq.seedNote.includes('Neon Purple accent (#a855f7)'), 'palette rides the command');

// open_studio landing flow: waitForCommand resolves when the panel submits.
const waiting = bridge.waitForCommand(5_000);
await fetch(`http://127.0.0.1:${bridge.port}/api/command`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ command: 'new-brainstorm', prompt: 'from the landing panel' }),
});
const landed = await waiting;
assert.equal(landed?.command, 'new-brainstorm');
assert.equal(landed?.prompt, 'from the landing panel');
assert.deepEqual(bridge.peekCommands(), [], 'waiter consumed the command, not the queue');

// Palette editing: an edited theme persists as a drop-in JSON and refreshes state.
const neon = BUILTIN_THEMES.find((t) => t.name === 'neon-purple');
const edited = {
  ...neon,
  palette: [
    ...neon.palette.slice(0, 4),
    { name: 'Royal Violet', value: '#7c3aed' },
    { name: 'Fresh Mint', value: '#98f5e1' },
  ],
};
const themeSave = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/themes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ theme: edited }),
  })
).json();
assert.equal(themeSave.ok, true, 'theme save accepted');
assert.ok(fs.existsSync(path.join(scratch, 'styles', 'neon-purple.json')), 'edited theme written as drop-in JSON');
let themedState = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
const savedNeon = themedState.themes.find((t) => t.name === 'neon-purple');
assert.equal(savedNeon.palette.length, 6, 'added color present');
assert.ok(savedNeon.palette.some((c) => c.name === 'Royal Violet'), 'renamed color present by name');

// Discussion theme: set, persisted to session.json, unknown names rejected.
const setTheme = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/session-theme`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'ocean' }),
  })
).json();
assert.equal(setTheme.ok, true);
themedState = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.equal(themedState.session.theme, 'ocean', 'discussion theme in state');
assert.equal(
  JSON.parse(fs.readFileSync(path.join(store.info.dir, 'session.json'), 'utf8')).theme,
  'ocean',
  'discussion theme persisted to session.json',
);
const badTheme = await fetch(`http://127.0.0.1:${bridge.port}/api/session-theme`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'not-a-theme' }),
});
assert.equal(badTheme.status, 400, 'unknown theme rejected honestly');

// Session progress pipe: POST /api/progress persists, broadcasts, reloads…
const progressRes = await fetch(`http://127.0.0.1:${bridge.port}/api/progress`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ note: 'generating options', source: 'svg-artisan', tokens: { input: 100, output: 50 } }),
});
assert.equal(progressRes.status, 200, 'progress accepted');
assert.equal((await progressRes.json()).ok, true);
let progressState = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
const progEvent = (progressState.progress ?? []).find((e) => e.note === 'generating options');
assert.ok(progEvent, 'progress event carried by /api/state');
assert.equal(progEvent.source, 'svg-artisan', 'source intact');
assert.deepEqual(progEvent.tokens, { input: 100, output: 50 }, 'tokens intact');
assert.ok(progEvent.at, 'missing at was stamped server-side');
const progressFile = path.join(store.info.dir, 'progress.jsonl');
assert.ok(fs.existsSync(progressFile), 'progress.jsonl on disk');
assert.ok(fs.readFileSync(progressFile, 'utf8').includes('generating options'), 'event persisted to jsonl');
assert.ok(
  SessionStore.open(store.info.dir).progress.some((e) => e.note === 'generating options'),
  'progress reloads via SessionStore.open',
);
// …a note-less body is an honest 400…
const badProgress = await fetch(`http://127.0.0.1:${bridge.port}/api/progress`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({}),
});
assert.equal(badProgress.status, 400, 'progress without note rejected');
// …and the pipe-progress.mjs forwarder reaches a live bridge…
const pipeScript = fileURLToPath(new URL('./pipe-progress.mjs', import.meta.url));
let pipe = spawnSync(process.execPath, [pipeScript, '--note', 'smoke pipe', '--port', String(bridge.port)], {
  encoding: 'utf8',
});
assert.equal(pipe.status, 0, `pipe-progress exited ${pipe.status}: ${pipe.stderr}`);
let piped = null;
for (let i = 0; i < 20 && !piped; i++) {
  const s = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
  piped = (s.progress ?? []).find((e) => e.note === 'smoke pipe') ?? null;
  if (!piped) await new Promise((r) => setTimeout(r, 100));
}
assert.ok(piped, 'piped note reached /api/state');
// …but exits 0 silently when no bridge answers (hook safety).
pipe = spawnSync(process.execPath, [pipeScript, '--note', 'nobody home', '--port', '1'], { encoding: 'utf8' });
assert.equal(pipe.status, 0, `dead-port pipe must exit 0, got ${pipe.status}: ${pipe.stderr}`);

// Token meter: live totals in state, per-thread totals in summaries + thread reload.
// The only token-bearing event this smoke posted is 'generating options' (100/50) —
// the pipe notes above carried none — so the totals are exact, not just lower bounds.
let tokenState = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.ok(
  tokenState.tokens.input >= 100 && tokenState.tokens.output >= 50,
  `live totals reflect posted tokens, got ${JSON.stringify(tokenState.tokens)}`,
);
assert.deepEqual(tokenState.tokens, { input: 100, output: 50 }, 'live totals are exactly the posted sum');
const tokenList = await (await fetch(`http://127.0.0.1:${bridge.port}/api/discussions`)).json();
assert.equal(tokenList[0].tokens, 150, 'summary tokens = input+output combined');
const tokenThread = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/discussions/${encodeURIComponent(tokenList[0].id)}`)
).json();
assert.deepEqual(tokenThread.tokens, { input: 100, output: 50 }, 'thread reload carries token totals');

// Transcript-delta hook mode: pipe-progress reads assistant usage from a Claude Code
// transcript and posts the DELTA since its last run (cursor in os.tmpdir()).
const transcriptPath = path.join(scratch, 'transcript.jsonl');
fs.writeFileSync(
  transcriptPath,
  [
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 100, output_tokens: 20 } } }),
    // Non-assistant line WITH usage — must be filtered out, or the delta below breaks.
    JSON.stringify({ type: 'user', message: { usage: { input_tokens: 999, output_tokens: 999 } } }),
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 30, output_tokens: 5 } } }),
  ].join('\n') + '\n',
);
// Unique per run — a stale tmpdir cursor from an earlier smoke can never skew the delta.
const cursorSession = `smoke-cursor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const runTranscriptHook = () =>
  spawnSync(process.execPath, [pipeScript, '--port', String(bridge.port)], {
    encoding: 'utf8',
    input: JSON.stringify({
      hook_event_name: 'Stop',
      session_id: cursorSession,
      transcript_path: transcriptPath,
    }),
  });
const expectTokens = async (expected, label) => {
  let got = null;
  for (let i = 0; i < 30; i++) {
    got = (await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json()).tokens;
    if (got.input === expected.input && got.output === expected.output) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.deepEqual(got, expected, label);
};
let hookPipe = runTranscriptHook();
assert.equal(hookPipe.status, 0, `transcript hook exited ${hookPipe.status}: ${hookPipe.stderr}`);
await expectTokens(
  { input: 230, output: 75 },
  'first hook run grew totals by exactly 130/25 (assistant usage only; user line filtered)',
);
fs.appendFileSync(
  transcriptPath,
  JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 7, output_tokens: 3 } } }) + '\n',
);
hookPipe = runTranscriptHook();
assert.equal(hookPipe.status, 0, `second transcript hook exited ${hookPipe.status}: ${hookPipe.stderr}`);
await expectTokens(
  { input: 237, output: 78 },
  'second hook run posted only the delta (7/3) via the cursor, not a re-total',
);

// WS broadcast delivery is async — give it a beat before asserting.
for (let i = 0; i < 20 && !seen.includes('progress'); i++) await new Promise((r) => setTimeout(r, 50));
assert.ok(
  seen.includes('hello') && seen.includes('board') && seen.includes('progress'),
  `ws saw: ${seen}`,
);

ws.close();
await bridge.stop();
fs.rmSync(scratch, { recursive: true, force: true });
console.log(
  'SMOKE PASS — round-trip, phase fields, disk cache, thread list/reload/resume, themes, model routing, UI commands, artifact capture + serving, seed intake, composer extras, landing wait, palette editing, discussion theme, session progress pipe, token meter (live totals, summaries, transcript-delta hook)',
);
