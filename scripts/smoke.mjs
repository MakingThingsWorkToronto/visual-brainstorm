/**
 * Headless smoke test (CLAUDE.md rule 10): full present → select → respond round-trip
 * against the built bridge, acting as the studio over WS + HTTP. Also covers the
 * discussion cache (list/reload), themes, and model routing. Exits 0 on pass.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

// State endpoint reflects the completed round.
const state = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.equal(state.rounds.length, 1);
assert.ok(state.rounds[0].response, 'round has persisted response in state');

// Persistence on disk (rule 7) — the .docs/discussion-style thread cache.
const roundDir = path.join(store.info.dir, 'round-01');
for (const file of ['board.json', 'option-a.svg', 'option-b.svg', 'response.json']) {
  assert.ok(fs.existsSync(path.join(roundDir, file)), `missing ${file}`);
}

// Artifact capture.
const artifact = store.captureArtifact('winner', board.options[1].svg, 'final', {
  boardId: board.id,
  optionIds: ['b'],
});
assert.ok(fs.existsSync(artifact.svgPath));

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
assert.deepEqual(bridge.drainCommands(), ['plan-closeout']);
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

assert.ok(seen.includes('hello') && seen.includes('board'), `ws saw: ${seen}`);

ws.close();
await bridge.stop();
fs.rmSync(scratch, { recursive: true, force: true });
console.log(
  'SMOKE PASS — round-trip, phase fields, disk cache, thread list/reload/resume, themes, model routing, UI commands, artifact capture',
);
