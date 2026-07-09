// Artifact-chat detour + first-class rearm (present_board.rearmBoardId → bridge
// rearmAndWait). A REAL Bridge on an ephemeral port, canonical boards/responses —
// no mocks (rule 6). Contract under test (bridge-server.ts dispatchCommand +
// rearmAndWait):
//   the detour resolves the blocked wait with a park response carrying
//   commands:['artifact-chat'] WITHOUT clearing the live board or recording a
//   round; rearmAndWait re-arms the SAME board (no new round, no remount) and —
//   the strand fix — a submit that landed MID-detour (no resolver registered)
//   is returned immediately instead of blocking until timeout.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCanonical } from './canonical/load.mjs';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { BoardResponseSchema, BoardSchema, ThemeSchema } from '../packages/protocol/dist/index.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-test-'));

async function startBridge() {
  const root = tmp();
  const store = new SessionStore('Rearm test', root);
  const logLines = [];
  const bridge = new Bridge(store, {
    discussionRoot: root,
    themes: [loadCanonical('themes/theme.json', ThemeSchema)],
    theme: 'aurora',
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    log: (line) => logLines.push(line),
  });
  await bridge.start(0); // ephemeral port
  return { bridge, store, logLines };
}

const postRespond = async (bridge, response) => {
  const res = await fetch(`http://127.0.0.1:${bridge.port}/api/respond`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(response),
  });
  return { status: res.status, body: await res.json() };
};

const getHealth = async (bridge) =>
  (await fetch(`http://127.0.0.1:${bridge.port}/api/health`)).json();

/** presentAndWait registers its resolver async — wait until the bridge blocks. */
async function untilAwaiting(bridge) {
  for (let i = 0; i < 50; i++) {
    if ((await getHealth(bridge)).awaitingResponse) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('bridge never reached awaitingResponse');
}

test('detour then rearm: the board stays live, no duplicate round, the answer resolves the rearmed wait', async () => {
  const { bridge, store } = await startBridge();
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    const answer = loadCanonical('responses/iterate.json', BoardResponseSchema);
    assert.equal(answer.boardId, board.id, 'canonical answer targets the canonical board');

    const wait = bridge.presentAndWait(board, 8000, /* open browser */ false);
    await untilAwaiting(bridge);

    // Artifact-chat arrives while the wait blocks → non-destructive park.
    assert.equal(bridge.dispatchCommand('artifact-chat', 'why the glow?'), 'via-board-response');
    const park = await wait;
    assert.equal(park.action, 'park');
    assert.deepEqual(park.commands, ['artifact-chat']);

    const health = await getHealth(bridge);
    assert.equal(health.activeBoard?.id, board.id, 'the board STAYS live through the detour');
    assert.equal(health.awaitingResponse, false, 'but no resolver remains registered');
    assert.equal(store.rounds.length, 1, 'the detour records no extra round');

    // Orchestrator replies to the chat, then resumes via rearm — same board id.
    const rearmed = bridge.rearmAndWait(board.id, 8000);
    await untilAwaiting(bridge);
    assert.equal(store.rounds.length, 1, 'the rearm records no extra round either');

    assert.equal((await postRespond(bridge, answer)).status, 200);
    const resolved = await rearmed;
    assert.equal(resolved.boardId, board.id, 'the rearmed wait resolves with the real answer');
    assert.equal(resolved.action, answer.action);
  } finally {
    await bridge.stop();
  }
});

test('submit landing MID-detour: rearm returns the parked answer immediately (the strand fix)', async () => {
  const { bridge, store } = await startBridge();
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    const answer = loadCanonical('responses/iterate.json', BoardResponseSchema);

    const wait = bridge.presentAndWait(board, 8000, /* open browser */ false);
    await untilAwaiting(bridge);
    bridge.dispatchCommand('artifact-chat', 'question during the round');
    await wait; // orchestrator is off answering the chat — no resolver registered

    // The user submits DURING the chat: parked with no waiter (and recorded).
    assert.equal((await postRespond(bridge, answer)).status, 200);
    const onDisk = BoardResponseSchema.parse(
      JSON.parse(fs.readFileSync(path.join(store.info.dir, 'round-01', 'response.json'), 'utf8')),
    );
    assert.equal(onDisk.boardId, board.id, 'the mid-detour submit is recorded to disk');

    // The rearm must consume the parked answer, not block until timeout: give it
    // a bound far below the requested timeout to prove it never waited.
    const started = Date.now();
    const resolved = await bridge.rearmAndWait(board.id, 60_000);
    assert.ok(Date.now() - started < 2000, 'rearm returned without blocking on the answered board');
    assert.equal(resolved.boardId, board.id);
    assert.equal(resolved.action, answer.action, 'the parked response is handed to the orchestrator');
  } finally {
    await bridge.stop();
  }
});

test('rearm of an unknown board id resolves null (honest pending, never a fabricated answer)', async () => {
  const { bridge } = await startBridge();
  try {
    assert.equal(await bridge.rearmAndWait('board-never-presented', 500), null);
  } finally {
    await bridge.stop();
  }
});
