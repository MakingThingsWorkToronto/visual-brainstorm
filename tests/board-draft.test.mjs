// Board DRAFT persistence + the NON-DESTRUCTIVE artifact-chat detour (dials persist
// through chat). A REAL Bridge on an ephemeral port + real SessionStore, canonical
// board/response — no mocks (rule 6). Contracts under test:
//   - SessionStore.recordBoardDraft → round-NN/draft.json (last-write-wins), reloads
//     via SessionStore.open into `drafts`, kept SEPARATE from a submitted response.
//   - POST /api/board-draft → 200 records + broadcasts `draft` + lands in /api/state;
//     404 unknown board; 400 bad payload.
//   - Chatting on a LIVE board (an option) resolves the blocked present_board with an
//     artifact-chat park response WITHOUT clearing the board or recording a park
//     response — so the user's dials/draft survive (they never unmount).
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCanonical } from './canonical/load.mjs';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { BoardResponseSchema, BoardSchema, ThemeSchema, optionChatSlug } from '../packages/protocol/dist/index.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-test-'));

async function startBridge() {
  const root = tmp();
  const store = new SessionStore('Draft test', root);
  const logLines = [];
  const bridge = new Bridge(store, {
    discussionRoot: root,
    themes: [loadCanonical('themes/theme.json', ThemeSchema)],
    theme: 'aurora',
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    log: (line) => logLines.push(line),
  });
  await bridge.start(0);
  return { bridge, store, root, logLines };
}

const postJson = async (bridge, p, body) => {
  const res = await fetch(`http://127.0.0.1:${bridge.port}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};
const getState = async (bridge) => (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();
const getHealth = async (bridge) => (await fetch(`http://127.0.0.1:${bridge.port}/api/health`)).json();

// A draft is a BoardResponse-shaped snapshot; build one with the given dials.
function draftFor(boardId, axisValues) {
  return BoardResponseSchema.parse({
    ...loadCanonical('responses/iterate.json', BoardResponseSchema),
    boardId,
    axisValues,
    respondedAt: '2026-07-09T12:00:00.000Z',
  });
}

test('SessionStore.recordBoardDraft persists round-NN/draft.json and reloads (separate from response)', () => {
  const root = tmp();
  const store = new SessionStore('Draft store', root);
  const board = loadCanonical('boards/diverge.json', BoardSchema);
  store.recordBoard(board);

  store.recordBoardDraft(draftFor(board.id, { glow: 40 }));
  store.recordBoardDraft(draftFor(board.id, { glow: 85 })); // last-write-wins
  assert.equal(store.drafts.length, 1, 'one draft per board');
  assert.equal(store.drafts[0].axisValues.glow, 85, 'the latest dials win in memory');

  const roundDir = path.join(store.info.dir, 'round-01');
  assert.ok(fs.existsSync(path.join(roundDir, 'draft.json')), 'draft.json written to the round folder');
  assert.ok(!fs.existsSync(path.join(roundDir, 'response.json')), 'a draft is NOT a submitted response');

  const reopened = SessionStore.open(store.info.dir);
  assert.equal(reopened.drafts.length, 1, 'draft reloads with the thread (recall)');
  assert.equal(reopened.drafts[0].axisValues.glow, 85, 'the persisted dials reload');
});

// (The old "recordBoard is idempotent by id" contract is gone: the detour resume
// is now a first-class rearm that never re-records — tests/bridge-rearm.test.mjs
// proves no duplicate round end to end.)

test('drafts restore dials, not file bytes: attachment payloads are blanked on the draft path only', async () => {
  const { bridge, store } = await startBridge();
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws`);
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    store.recordBoard(board);
    const messages = [];
    ws.addEventListener('message', (e) => messages.push(JSON.parse(String(e.data))));
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    });

    const photo = 'data:image/png;base64,' + 'A'.repeat(4096); // stand-in for a multi-MB upload
    const draft = { ...draftFor(board.id, { glow: 55 }), attachments: [{ name: 'kitchen.png', dataUri: photo }] };
    assert.equal((await postJson(bridge, '/api/board-draft', draft)).status, 200);

    // Memory, disk, /api/state, and the WS echo all hold the blanked form.
    assert.equal(store.drafts[0].attachments[0].dataUri, '', 'in-memory draft holds no bytes');
    assert.equal(store.drafts[0].attachments[0].name, 'kitchen.png', 'the name survives for recall');
    const onDisk = JSON.parse(fs.readFileSync(path.join(store.info.dir, 'round-01', 'draft.json'), 'utf8'));
    assert.equal(onDisk.attachments[0].dataUri, '', 'draft.json holds no bytes');
    const state = await getState(bridge);
    assert.equal(state.drafts[0].attachments[0].dataUri, '', 'the hello/state snapshot holds no bytes');
    for (let i = 0; i < 40 && !messages.some((m) => m.type === 'draft'); i++)
      await new Promise((r) => setTimeout(r, 25));
    const envelope = messages.find((m) => m.type === 'draft');
    assert.ok(envelope, 'a draft WS envelope was broadcast');
    assert.equal(envelope.draft.attachments[0].dataUri, '', 'the broadcast echoes the STORED (blanked) draft');
    assert.equal(envelope.draft.axisValues.glow, 55, 'dials ride the echo untouched');
  } finally {
    ws.close();
    await bridge.stop();
  }
});

test('recordBoardDraft returns the stored draft (null when no round matches)', () => {
  const root = tmp();
  const store = new SessionStore('Draft return', root);
  const board = loadCanonical('boards/diverge.json', BoardSchema);
  store.recordBoard(board);
  const stored = store.recordBoardDraft({
    ...draftFor(board.id, { glow: 10 }),
    attachments: [{ name: 'a.png', dataUri: 'data:image/png;base64,AAAA' }],
  });
  assert.equal(stored.attachments[0].dataUri, '', 'the returned draft is the sanitized one');
  assert.equal(store.recordBoardDraft(draftFor('board-ghost', {})), null, 'no round → null, nothing stored');
  assert.equal(store.drafts.length, 1);
});

test('POST /api/board-draft → 200 records + broadcasts + lands in /api/state', async () => {
  const { bridge, store } = await startBridge();
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws`);
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    store.recordBoard(board);
    const messages = [];
    ws.addEventListener('message', (e) => messages.push(JSON.parse(String(e.data))));
    await new Promise((res, rej) => {
      ws.addEventListener('open', res);
      ws.addEventListener('error', rej);
    });

    const { status, body } = await postJson(bridge, '/api/board-draft', draftFor(board.id, { glow: 72 }));
    assert.equal(status, 200);
    assert.equal(body.ok, true);

    // Persisted + in the live state the studio reloads from.
    const state = await getState(bridge);
    assert.equal(state.drafts.length, 1, '/api/state carries the draft');
    assert.equal(state.drafts[0].axisValues.glow, 72);

    // Broadcast so a re-presented board / other client restores it.
    for (let i = 0; i < 40 && !messages.some((m) => m.type === 'draft'); i++)
      await new Promise((r) => setTimeout(r, 25));
    const envelope = messages.find((m) => m.type === 'draft');
    assert.ok(envelope, 'a draft WS envelope was broadcast');
    assert.equal(envelope.draft.axisValues.glow, 72);
  } finally {
    ws.close();
    await bridge.stop();
  }
});

test('POST /api/board-draft → 404 unknown board, 400 malformed', async () => {
  const { bridge, store } = await startBridge();
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    store.recordBoard(board);
    const missing = await postJson(bridge, '/api/board-draft', draftFor('board-nope', {}));
    assert.equal(missing.status, 404);
    assert.ok(String(missing.body.error).includes('board-nope'));

    const bad = await postJson(bridge, '/api/board-draft', '{ not json');
    assert.equal(bad.status, 400);
  } finally {
    await bridge.stop();
  }
});

test('chatting on a LIVE board option is NON-DESTRUCTIVE: board stays, no park recorded, draft survives', async () => {
  const { bridge, store } = await startBridge();
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    // The board is live and the orchestrator is BLOCKED in present_board.
    const wait = bridge.presentAndWait(board, 8000, /* open browser */ false);
    assert.equal((await getHealth(bridge)).activeBoard.id, board.id, 'board is live');

    // The user has set some dials — persist the draft (as the studio does).
    assert.equal((await postJson(bridge, '/api/board-draft', draftFor(board.id, { glow: 90 }))).status, 200);

    // The user asks a question about a LIVE option.
    const slug = optionChatSlug(board.id, board.options[0].id);
    const chat = await postJson(bridge, '/api/artifact-chat', {
      artifactSlug: slug,
      text: 'Could this option lean warmer?',
    });
    assert.equal(chat.status, 200);

    // present_board resolves so the orchestrator can answer — with an artifact-chat park.
    const resolved = await wait;
    assert.equal(resolved.action, 'park');
    assert.deepEqual(resolved.commands, ['artifact-chat']);

    // …but the board STAYS LIVE (not cleared) so the user's dials never unmount,
    const health = await getHealth(bridge);
    assert.equal(health.activeBoard.id, board.id, 'the board stays live through the chat');
    // …NO park response was recorded to the round,
    assert.ok(
      !fs.existsSync(path.join(store.info.dir, 'round-01', 'response.json')),
      'no park response persisted — the round was not answered',
    );
    assert.equal(store.rounds[0].response, null, 'the round has no response in memory either');
    // …the draft (dials) survives on disk + in state,
    assert.equal(store.drafts[0].axisValues.glow, 90, 'the dials persist through the chat');
    // …and the user chat message recorded.
    assert.equal(store.artifactChat.at(-1).text, 'Could this option lean warmer?');
  } finally {
    await bridge.stop();
  }
});
