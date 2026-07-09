/**
 * Headless smoke test (CLAUDE.md rule 10): full present → select → respond round-trip
 * against the built bridge, acting as the studio over WS + HTTP. Also covers the
 * discussion cache (list/reload), themes, and model routing. Exits 0 on pass.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { BUILTIN_THEMES } from '../apps/mcp/dist/themes.js';
import { ArtifactChatMessageSchema, LivingGallerySchema } from '../packages/protocol/dist/index.js';
import { loadCanonical } from '../tests/canonical/load.mjs';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-smoke-'));
const store = new SessionStore('Smoke test session', scratch);
const bridge = new Bridge(store, {
  discussionRoot: scratch,
  themes: BUILTIN_THEMES,
  theme: 'neon-purple',
  models: ['claude-fable-5', 'claude-haiku-4-5'],
  defaultModel: 'claude-fable-5',
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
    assert.equal(msg.state.runtime.label, 'Claude Code');
    assert.deepEqual(
      msg.state.models.map((model) => model.id),
      ['claude-fable-5', 'claude-haiku-4-5'],
    );
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

// Pins (item 5, filmstrip): toggle on, then off — disk-backed on session.json.
const pinOn = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/pinned`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug: artifact.slug }),
  })
).json();
assert.deepEqual(pinOn, { ok: true, pinned: true }, 'pin toggles on');
let pinnedState = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.deepEqual(pinnedState.session.pinnedSlugs, [artifact.slug], 'state.session.pinnedSlugs reflects the pin');

const pinOff = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/pinned`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug: artifact.slug }),
  })
).json();
assert.deepEqual(pinOff, { ok: true, pinned: false }, 'pin toggles off');
pinnedState = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.deepEqual(pinnedState.session.pinnedSlugs, [], 'state.session.pinnedSlugs reflects the unpin');

// …an unknown slug is an honest 404, nothing pinned.
const pinMissing = await fetch(`http://127.0.0.1:${bridge.port}/api/pinned`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ slug: 'no-such-artifact' }),
});
assert.equal(pinMissing.status, 404, 'pinning an unknown slug is rejected honestly');

// re-pin so the reload assertions below prove pins survive a disk reload.
await fetch(`http://127.0.0.1:${bridge.port}/api/pinned`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ slug: artifact.slug }),
});

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
assert.deepEqual(thread.session.pinnedSlugs, [artifact.slug], 'pins survive a GET /api/discussions/:id disk reload');

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

// UI command: reopen a completed thread — queued when no board is waiting; the
// seed note names the discussionId, the round, and points at reopen.md so the
// drained digest (index.ts) can run .claude/commands/reopen.md without guessing.
let reopenCmd = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'reopen', discussionId: store.info.id, round: 2 }),
  })
).json();
assert.equal(reopenCmd.ok, true);
assert.equal(reopenCmd.delivered, 'queued');
const [reopenReq] = bridge.drainCommands();
assert.equal(reopenReq.command, 'reopen');
assert.ok(reopenReq.seedNote.includes(store.info.id), 'seed note names the discussionId');
assert.ok(reopenReq.seedNote.includes('round 2'), 'seed note names the round');
assert.ok(reopenReq.seedNote.includes('.claude/commands/reopen.md'), 'seed note points at reopen.md');

// …and resolves the active wait when a board IS waiting (mirrors discover-skills above).
const wait3 = bridge.presentAndWait({ ...board, id: 'board-r3-smoke', round: 3 }, 15_000, false);
await new Promise((r) => setTimeout(r, 100));
reopenCmd = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'reopen', discussionId: store.info.id, round: 1 }),
  })
).json();
assert.equal(reopenCmd.delivered, 'via-board-response');
const parkedReopen = await wait3;
assert.equal(parkedReopen.action, 'park');
assert.deepEqual(parkedReopen.commands, ['reopen']);
assert.ok(parkedReopen.elaboration.includes(store.info.id), 'via-board seed note (elaboration) names the discussionId');
assert.ok(parkedReopen.elaboration.includes('.claude/commands/reopen.md'), 'via-board seed note points at reopen.md');

// Bare-body reopen (no discussionId) still returns ok honestly — no crash, and the
// seed note reports the missing id instead of guessing or faking one.
const bareReopen = await (
  await fetch(`http://127.0.0.1:${bridge.port}/api/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: 'reopen' }),
  })
).json();
assert.equal(bareReopen.ok, true, 'a bare reopen is not a transport error');
assert.equal(bareReopen.delivered, 'queued');
const [bareReopenReq] = bridge.drainCommands();
assert.equal(bareReopenReq.command, 'reopen');
assert.ok(
  bareReopenReq.seedNote.includes('no discussionId was supplied'),
  'honest missing-id note, never a fake target',
);

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

// Artifact chat: an unknown slug is an honest 404…
const badChat = await fetch(`http://127.0.0.1:${bridge.port}/api/artifact-chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ artifactSlug: 'no-such', text: 'hi' }),
});
assert.equal(badChat.status, 404, 'unknown artifact slug rejected honestly');

// …a real slug persists a user message, broadcasts it, and rides the command plumbing
// (no board is waiting here — the landing waiter above consumed the last command).
const chatRes = await fetch(`http://127.0.0.1:${bridge.port}/api/artifact-chat`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ artifactSlug: artifact.slug, text: 'why this glow?' }),
});
assert.equal(chatRes.status, 200);
const chatBody = await chatRes.json();
assert.equal(chatBody.ok, true);
assert.equal(chatBody.delivered, 'queued', 'no board waiting → chat request queued');
const [chatReq] = bridge.drainCommands();
assert.equal(chatReq.command, 'artifact-chat', 'chat rides the UI-command plumbing');
assert.ok(chatReq.prompt.includes('why this glow?'), 'prompt carries the chat text');
assert.ok(chatReq.seedNote.includes(artifact.slug), 'seed note names the artifact');
const chatFile = path.join(store.info.dir, 'artifacts', 'chat.jsonl');
assert.ok(fs.existsSync(chatFile), 'artifacts/chat.jsonl on disk');
assert.ok(fs.readFileSync(chatFile, 'utf8').includes('why this glow?'), 'user line persisted');
let chatState = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.ok((chatState.artifactChat ?? []).length >= 1, '/api/state carries artifactChat');
assert.equal(chatState.artifactChat[0].role, 'user');
// WS broadcast delivery is async — give it a beat before asserting.
for (let i = 0; i < 20 && !seen.includes('artifact-chat'); i++) await new Promise((r) => setTimeout(r, 50));
assert.ok(seen.includes('artifact-chat'), `ws saw artifact-chat envelope, saw: ${seen}`);

// Claude reply path: a revision artifact (provenance.revises) + announceArtifactChat —
// the reply lands in state, chat.jsonl, and reloads via SessionStore.open.
const revised = store.captureArtifact('winner revised', board.options[0].svg, 'tightened glow', {
  boardId: board.id,
  optionIds: ['a'],
  revises: artifact.slug,
});
assert.equal(revised.provenance.revises, artifact.slug, 'capture carries provenance.revises');
bridge.announceArtifactChat(
  ArtifactChatMessageSchema.parse({
    artifactSlug: artifact.slug,
    role: 'claude',
    text: 'tightened the glow — see the revision',
    at: new Date().toISOString(),
    revisedSlug: revised.slug,
  }),
);
chatState = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.deepEqual(
  chatState.artifactChat.map((m) => m.role),
  ['user', 'claude'],
  'both roles in state after announce',
);
assert.equal(chatState.artifactChat[1].revisedSlug, revised.slug, 'claude reply names the revision');
assert.equal(
  fs.readFileSync(chatFile, 'utf8').split('\n').filter((l) => l.trim()).length,
  2,
  'chat.jsonl has one line per message',
);
assert.equal(SessionStore.open(store.info.dir).artifactChat.length, 2, 'chat reloads via SessionStore.open');

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
// ASYNC spawn, not spawnSync: the bridge lives in THIS process, and spawnSync
// blocks the event loop — the bridge could never answer the child's POST, the
// child's fetch would abort, and the pipe would (rightly) refuse to commit its
// token cursor because delivery was never confirmed.
const runTranscriptHook = (port = bridge.port) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [pipeScript, '--port', String(port)], {
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (status) => resolve({ status, stderr }));
    child.stdin.end(
      JSON.stringify({
        hook_event_name: 'Stop',
        session_id: cursorSession,
        transcript_path: transcriptPath,
      }),
    );
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
let hookPipe = await runTranscriptHook();
assert.equal(hookPipe.status, 0, `transcript hook exited ${hookPipe.status}: ${hookPipe.stderr}`);
await expectTokens(
  { input: 230, output: 75 },
  'first hook run grew totals by exactly 130/25 (assistant usage only; user line filtered)',
);
fs.appendFileSync(
  transcriptPath,
  JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 7, output_tokens: 3 } } }) + '\n',
);
hookPipe = await runTranscriptHook();
assert.equal(hookPipe.status, 0, `second transcript hook exited ${hookPipe.status}: ${hookPipe.stderr}`);
await expectTokens(
  { input: 237, output: 78 },
  'second hook run posted only the delta (7/3) via the cursor, not a re-total',
);
// A delta the bridge never confirmed is NOT lost: the cursor only commits on
// delivery, so a failed post (dead port) rides along on the next event.
fs.appendFileSync(
  transcriptPath,
  JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 11, output_tokens: 4 } } }) + '\n',
);
hookPipe = await runTranscriptHook(1); // nobody home — silent no-op, cursor untouched
assert.equal(hookPipe.status, 0, `dead-port transcript hook exited ${hookPipe.status}: ${hookPipe.stderr}`);
fs.appendFileSync(
  transcriptPath,
  JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 2, output_tokens: 1 } } }) + '\n',
);
hookPipe = await runTranscriptHook();
assert.equal(hookPipe.status, 0, `recovery transcript hook exited ${hookPipe.status}: ${hookPipe.stderr}`);
await expectTokens(
  { input: 250, output: 83 },
  'the undelivered delta (11/4) rode along with the next one (2/1) — nothing lost',
);

// WS broadcast delivery is async — give it a beat before asserting.
for (let i = 0; i < 20 && !seen.includes('progress'); i++) await new Promise((r) => setTimeout(r, 50));
assert.ok(
  seen.includes('hello') && seen.includes('board') && seen.includes('progress'),
  `ws saw: ${seen}`,
);

// --- Mind-map tree board: present a `tree`, receive an `editedTree`, and prove the
// snapshot + persistence span the process boundary (rules 7/8). Placed last so it never
// perturbs the round/artifact counts the discussion-cache section asserts above. Uses a
// board id the WS handler ignores; the response is driven here with the wait/park pattern. ---
const mmTree = {
  nodeData: {
    id: 'root',
    topic: 'Glow mark',
    children: [
      { id: 'c1', topic: 'Warmth' },
      { id: 'c2', topic: 'Motion', children: [{ id: 'c3', topic: 'Arc' }] },
    ],
  },
  direction: 2,
};
const mmBoard = {
  id: 'board-mm-smoke',
  sessionId: store.info.id,
  round: 3, // unique + past the last presented round so nextRound bookkeeping stays sane
  kind: 'mindmap',
  phase: 'diverge',
  title: 'Mind map smoke',
  prompt: 'edit the tree',
  options: [],
  tree: mmTree,
  survey: { multiSelect: true, minSelect: 0, elaborationPrompt: 'x', allowPerOptionNotes: true, allowRemix: true, axes: [] },
  createdAt: new Date().toISOString(),
};
const mmWait = bridge.presentAndWait(mmBoard, 15_000, false);
await new Promise((r) => setTimeout(r, 100));
const mmRespRes = await fetch(`http://127.0.0.1:${bridge.port}/api/respond`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    boardId: 'board-mm-smoke',
    action: 'iterate',
    editedTree: {
      nodeData: {
        id: 'root',
        topic: 'Glow mark',
        children: [
          { id: 'c1', topic: 'Warmth — ember', note: 'lean cozy, hearth energy' },
          { id: 'c2', topic: 'Motion', children: [{ id: 'c3', topic: 'Arc' }] },
          { id: 'c4', topic: 'Halo' },
        ],
      },
      direction: 2,
    },
    // Mind-map node decisions: an explode target (steered by a note) + a delete.
    treeOps: [
      { op: 'explode', nodeId: 'c1', topic: 'Warmth — ember', note: 'lean cozy, hearth energy', at: new Date().toISOString() },
      { op: 'delete', nodeId: 'zombie', topic: 'Cold mark', note: '', at: new Date().toISOString() },
    ],
    respondedAt: new Date().toISOString(),
  }),
});
assert.equal(mmRespRes.status, 200, 'mindmap respond accepted');
const mmResp = await mmWait;
assert.ok(mmResp.editedTree, 'response carries editedTree');
assert.equal(mmResp.editedTree.nodeData.children.length, 3, 'edited tree grew to three children');
const editedC1 = mmResp.editedTree.nodeData.children.find((c) => c.id === 'c1');
assert.equal(editedC1.topic, 'Warmth — ember', 'renamed child topic round-trips');
const editedC4 = mmResp.editedTree.nodeData.children.find((c) => c.id === 'c4');
assert.ok(editedC4 && editedC4.topic === 'Halo', 'added child round-trips');

// tree.json persisted beside the round, byte-for-byte the presented tree.
const mmTreeFile = path.join(store.info.dir, 'round-03', 'tree.json');
assert.ok(fs.existsSync(mmTreeFile), 'round-03/tree.json on disk');
assert.deepEqual(JSON.parse(fs.readFileSync(mmTreeFile, 'utf8')), mmTree, 'tree.json is the presented tree');

// Tree snapshot artifact (rule 7): a .json whose provenance names this board with no
// options, and its .svg sibling holds a real self-contained SVG on disk.
const mmArtDir = path.join(store.info.dir, 'artifacts');
const mmArtJson = fs
  .readdirSync(mmArtDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ f, meta: JSON.parse(fs.readFileSync(path.join(mmArtDir, f), 'utf8')) }))
  .find((a) => a.meta.provenance?.boardId === 'board-mm-smoke');
assert.ok(mmArtJson, 'tree snapshot artifact captured with board provenance');
assert.equal(mmArtJson.meta.provenance.optionIds.length, 0, 'tree snapshot has no option provenance');
const mmArtSvg = path.join(mmArtDir, mmArtJson.f.replace(/\.json$/, '.svg'));
assert.ok(fs.existsSync(mmArtSvg), 'tree snapshot .svg sibling on disk');
assert.ok(fs.readFileSync(mmArtSvg, 'utf8').includes('<svg'), 'tree snapshot holds an SVG');

// Reload via SessionStore.open: the round reloads with both the presented tree and
// the edited tree — the whole mindmap round survives a process boundary.
const mmReopened = SessionStore.open(store.info.dir);
const mmRound = mmReopened.rounds.find((r) => r.board.id === 'board-mm-smoke');
assert.ok(mmRound, 'mindmap round reloads');
assert.ok(mmRound.board.tree, 'reloaded board carries its tree');
assert.deepEqual(mmRound.board.tree.nodeData, mmTree.nodeData, 'reloaded tree matches the presented nodeData');
assert.ok(mmRound.response?.editedTree, 'reloaded response carries editedTree');
assert.equal(mmRound.response.editedTree.nodeData.children.length, 3, 'reloaded editedTree keeps three children');

// brainstorm.md records the tree presentation (append-only text memory).
const mmMd = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
assert.ok(mmMd.includes('Mind-map tree presented'), 'brainstorm.md notes the presented tree');

// --- Mind-map node ops persist as structured decisions (jsonl) + reach synthesis ---
// tree-ops.jsonl: every node op appended, append-only.
const mmOpsFile = path.join(store.info.dir, 'round-03', 'tree-ops.jsonl');
assert.ok(fs.existsSync(mmOpsFile), 'round-03/tree-ops.jsonl on disk');
const mmOps = fs.readFileSync(mmOpsFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
assert.equal(mmOps.length, 2, 'both node ops persisted');
assert.ok(mmOps.some((o) => o.op === 'explode' && o.nodeId === 'c1' && o.note.includes('cozy')), 'explode op with steering note persisted');
assert.ok(mmOps.some((o) => o.op === 'delete' && o.topic === 'Cold mark'), 'delete op persisted');

// edited-tree.json: the final shape (with folded note) written beside the response.
const mmEditedFile = path.join(store.info.dir, 'round-03', 'edited-tree.json');
assert.ok(fs.existsSync(mmEditedFile), 'round-03/edited-tree.json on disk');
const mmEdited = JSON.parse(fs.readFileSync(mmEditedFile, 'utf8'));
assert.equal(mmEdited.nodeData.children.find((c) => c.id === 'c1').note, 'lean cozy, hearth energy', 'node note persisted on the edited tree');

// The digest (brainstorm.md) makes mind-map decisions synthesizable — EXPLODE +
// note + delete all appear (they were invisible before this feature).
assert.ok(mmMd.includes('EXPLODE'), 'digest carries the EXPLODE instruction');
assert.ok(mmMd.includes('DELETE'), 'digest carries the DELETE instruction');
assert.ok(mmMd.includes('lean cozy'), 'digest surfaces the steering note');
assert.ok(mmMd.includes('Mind-map edited'), 'digest summarizes the edited tree');

// Decision tree: a derived index written on each response (json + svg), reloadable.
const mmDtJson = path.join(store.info.dir, 'decision-tree.json');
const mmDtSvg = path.join(store.info.dir, 'decision-tree.svg');
assert.ok(fs.existsSync(mmDtJson), 'decision-tree.json written on response');
assert.ok(fs.existsSync(mmDtSvg), 'decision-tree.svg written on response');
const mmDt = JSON.parse(fs.readFileSync(mmDtJson, 'utf8'));
assert.equal(mmDt.nodeData.kind, 'root', 'decision tree roots on the discussion');
assert.ok(fs.readFileSync(mmDtSvg, 'utf8').startsWith('<svg'), 'decision-tree.svg is a real SVG');

// Chain-of-thought persistence: bridge.think() appends to thinking.jsonl.
bridge.think('smoke: drawing the next round');
const mmThinkFile = path.join(store.info.dir, 'thinking.jsonl');
assert.ok(fs.existsSync(mmThinkFile), 'thinking.jsonl on disk after think()');
assert.ok(fs.readFileSync(mmThinkFile, 'utf8').includes('drawing the next round'), 'chain of thought persisted');

// GET /api/decision-tree/:id builds the tree from the reloaded thread.
const mmDtRes = await fetch(`http://127.0.0.1:${bridge.port}/api/decision-tree/${encodeURIComponent(store.info.id)}`);
assert.equal(mmDtRes.status, 200, 'decision-tree endpoint responds');
const mmDtBody = await mmDtRes.json();
assert.ok(mmDtBody.svg.startsWith('<svg'), 'decision-tree endpoint returns an SVG');
assert.ok(mmDtBody.tree.nodeData.children.length >= 1, 'decision tree has at least one round');

// --- Claude-Code handoff + adaptive concierge round-trip (concierge-intake phase). ---
// The WS handler above keys only on 'board-r1-smoke'/'board-r2-smoke' and ignores the
// rest, so the concierge broadcast rides past it harmlessly; we drive HTTP directly here.

// Handoff: openStudio(SeedBrief) seeds the brief + summary bubble + a BESPOKE
// intake survey (the orchestrator's own questions) + pre-selected picks
// (open=false → no browser launched).
const handoffQuestions = [
  { id: 'metaphor', question: 'Which metaphor?', options: ['a spark', 'a pencil'], recommended: 'a spark' },
  { id: 'motion', question: 'Any motion feel?', options: ['static', 'subtle pulse'], multi: true },
];
await bridge.openStudio(
  {
    brief: 'app icons for a note-taking tool',
    summary: 'Exploring playful app icons for your note-taking tool.',
    questions: handoffQuestions,
    picks: { metaphor: ['a spark'], motion: ['subtle pulse'] },
  },
  false,
);
let handoffState = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.equal(
  handoffState.seedBrief?.brief,
  'app icons for a note-taking tool',
  'openStudio pre-fills the brief for the Claude-Code handoff',
);
assert.equal(
  handoffState.seedBrief?.summary,
  'Exploring playful app icons for your note-taking tool.',
  'openStudio carries the run-brainstorm summary for the panel bubble',
);
assert.deepEqual(
  handoffState.seedBrief?.questions,
  handoffQuestions,
  'openStudio carries the bespoke, brainstorm-anchored intake survey',
);
assert.deepEqual(
  handoffState.seedBrief?.picks,
  { metaphor: ['a spark'], motion: ['subtle pulse'] },
  'openStudio carries pre-selected survey picks keyed by the handoff questions',
);

// Concierge round-trip: ask (non-blocking), read the pending id, answer, resolve.
const cWait = bridge.askConcierge('Who is the audience?', ['my team', 'customers'], 15_000);
await new Promise((r) => setTimeout(r, 100));
const s1 = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.ok(s1.concierge, '/api/state carries the pending concierge exchange');
assert.equal(s1.concierge.question, 'Who is the audience?', 'question round-trips to state');
assert.deepEqual(s1.concierge.suggestions, ['my team', 'customers'], 'suggestion chips round-trip');
const cid = s1.concierge.id;
const cPost = await fetch(`http://127.0.0.1:${bridge.port}/api/concierge`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: cid, answer: 'customers · founders' }),
});
assert.equal(cPost.status, 200, 'answering the pending concierge question is accepted');
assert.deepEqual(await cPost.json(), { ok: true }, 'concierge POST body is {ok:true}');
const cAnswer = await cWait;
assert.equal(cAnswer, 'customers · founders', 'askConcierge resolves with the posted answer');
const s2 = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.equal(s2.concierge, null, 'concierge surface clears after the answer');
const conciergeMd = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
assert.ok(conciergeMd.includes('Concierge Q: Who is the audience?'), 'brainstorm.md records the question');
assert.ok(conciergeMd.includes('Concierge A: customers · founders'), 'brainstorm.md records the answer');

// 404 path: answering when nothing is pending is an honest 404.
const cNone = await fetch(`http://127.0.0.1:${bridge.port}/api/concierge`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: 'concierge-nope', answer: 'x' }),
});
assert.equal(cNone.status, 404, 'no pending concierge question → 404');

// --- Living Gallery round-trip (living-gallery phase): present the four method minis,
// block on the user's pick, resolve with the chosen method, clear the surface, and
// record the choice to brainstorm.md. The WS handler above keys only on the two smoke
// board ids, so the 'gallery' broadcast rides past it harmlessly. ---
const gal = { ...loadCanonical('gallery/gallery.json', LivingGallerySchema), id: 'gallery-smoke' };
const gWait = bridge.presentGallery(gal, 15_000);
await new Promise((r) => setTimeout(r, 100));
let gState = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.ok(gState.gallery, '/api/state carries the pending living gallery');
assert.equal(gState.gallery.id, 'gallery-smoke', 'gallery id round-trips to state');
assert.equal(gState.gallery.cards.length, 4, 'all four method cards delivered to the studio');
const gPick = await fetch(`http://127.0.0.1:${bridge.port}/api/gallery-pick`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: 'gallery-smoke', method: 'mindmap' }),
});
assert.equal(gPick.status, 200, 'picking a real method resolves the gallery');
assert.deepEqual(await gPick.json(), { ok: true }, 'gallery-pick body is {ok:true}');
const gPicked = await gWait;
assert.equal(gPicked, 'mindmap', 'presentGallery resolves with the picked method');
gState = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
assert.equal(gState.gallery, null, 'living gallery surface clears after the pick');
const galleryMd = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
assert.ok(
  galleryMd.includes('Living Gallery — offered [mindmap, funnel, wreck, cluster]; user picked: mindmap'),
  'brainstorm.md records the offered methods and the pick',
);

// 404 path: with nothing pending, a pick is an honest 404.
const gNone = await fetch(`http://127.0.0.1:${bridge.port}/api/gallery-pick`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: 'nope', method: 'mindmap' }),
});
assert.equal(gNone.status, 404, 'no pending living gallery → 404');

// 400 path: with a gallery pending, a method that is not one of its cards is a 400.
const gWait2 = bridge.presentGallery({ ...gal, id: 'gallery-smoke-2' }, 15_000);
await new Promise((r) => setTimeout(r, 100));
const g2State = await (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
const g2Id = g2State.gallery.id;
const gBad = await fetch(`http://127.0.0.1:${bridge.port}/api/gallery-pick`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: g2Id, method: 'not-a-method' }),
});
assert.equal(gBad.status, 400, 'a method not on the gallery is rejected 400');
// Resolve the pending gallery with a real pick so no timer leaks.
const gFix = await fetch(`http://127.0.0.1:${bridge.port}/api/gallery-pick`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: g2Id, method: 'funnel' }),
});
assert.equal(gFix.status, 200, 'a valid follow-up pick resolves the second gallery');
assert.equal(await gWait2, 'funnel', 'the second gallery resolves with the real pick');

ws.close();
await bridge.stop();
fs.rmSync(scratch, { recursive: true, force: true });
console.log(
  'SMOKE PASS — round-trip, phase fields, disk cache, thread list/reload/resume, themes, model routing, UI commands (incl. reopen: queued, via-board-response, honest missing-id note), artifact capture + serving, pins (toggle on/off, state reflects it, honest 404, survives disk reload), artifact chat (404, queue, persist, broadcast, claude reply + revises, reload), seed intake, composer extras, landing wait, palette editing, discussion theme, session progress pipe, token meter (live totals, summaries, transcript-delta hook), mindmap tree round-trip (editedTree, tree.json, SVG snapshot artifact, reload, brainstorm.md), mindmap node ops (tree-ops.jsonl, edited-tree.json note fold, digest EXPLODE/DELETE + steering note, decision-tree.json/svg, thinking.jsonl, /api/decision-tree endpoint), Claude-Code handoff (openStudio seedBrief) + concierge round-trip (ask, pending state, answer, resolve, brainstorm.md, 404), Living Gallery round-trip (present four minis, pending state, pick, resolve, clear, brainstorm.md, 404, 400 bad-method)',
);
