// REVISIT flow (return-to-round): re-answering an ALREADY-answered board rewinds
// the funnel. A REAL Bridge on an ephemeral port, canonical boards/responses —
// no mocks (rule 6). Contract under test (bridge-server.ts acceptRevisit):
//   with a wait blocked on a LATER board → that wait resolves NOW with the revisit
//   response (its boardId names the rewound round), disk response.json is rewritten,
//   and the active board clears; with NO wait blocked → a revisit-round command is
//   queued whose seedNote says REWIND and names the rewritten response.json.
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
  const store = new SessionStore('Revisit test', root);
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

test('revisit while a later board waits: the wait resolves with the rewound response', async () => {
  const { bridge, store } = await startBridge();
  try {
    const boardA = loadCanonical('boards/diverge.json', BoardSchema);
    const boardB = loadCanonical('boards/expand.json', BoardSchema);
    const first = loadCanonical('responses/iterate.json', BoardResponseSchema);
    const revisit = loadCanonical('responses/revisit-iterate.json', BoardResponseSchema);
    assert.equal(revisit.boardId, boardA.id, 'canonical revisit re-answers board A');

    // Round 1 answered normally.
    const waitA = bridge.presentAndWait(boardA, 8000, /* open browser */ false);
    assert.equal((await postRespond(bridge, first)).status, 200);
    assert.equal((await waitA).boardId, boardA.id);

    // Round 2 presented, NOT answered — the orchestrator is blocked on it.
    const waitB = bridge.presentAndWait(boardB, 8000, /* open browser */ false);
    assert.equal((await getHealth(bridge)).activeBoard.id, boardB.id, 'board B is live');

    // The user returns to round 1 and re-answers it.
    assert.equal((await postRespond(bridge, revisit)).status, 200);
    const resolved = await waitB;
    assert.equal(resolved.boardId, boardA.id, "board B's wait resolves with the REVISIT response");
    assert.deepEqual(resolved, revisit, 'the full rewound response is handed to the orchestrator');

    // Round A's response.json on disk is REWRITTEN with the new answer.
    const onDisk = BoardResponseSchema.parse(
      JSON.parse(fs.readFileSync(path.join(store.info.dir, 'round-01', 'response.json'), 'utf8')),
    );
    assert.deepEqual(onDisk, revisit, 'round-01/response.json carries the revisit');

    // The active board cleared — nothing is presented while Claude rewinds.
    const health = await getHealth(bridge);
    assert.equal(health.activeBoard, null, 'activeBoard clears after the rewind');
    assert.equal(health.awaitingResponse, false, 'no wait remains pending');
  } finally {
    await bridge.stop();
  }
});

test('revisit with no pending wait: a revisit-round command queues with a REWIND seedNote', async () => {
  const { bridge, store } = await startBridge();
  try {
    const boardA = loadCanonical('boards/diverge.json', BoardSchema);
    const first = loadCanonical('responses/iterate.json', BoardResponseSchema);
    const revisit = loadCanonical('responses/revisit-iterate.json', BoardResponseSchema);

    const waitA = bridge.presentAndWait(boardA, 8000, /* open browser */ false);
    assert.equal((await postRespond(bridge, first)).status, 200);
    await waitA; // round 1 settled; nothing is waiting now

    assert.equal((await postRespond(bridge, revisit)).status, 200);

    const commands = bridge.peekCommands();
    assert.equal(commands.length, 1, 'exactly one command queued');
    assert.equal(commands[0].command, 'revisit-round');
    assert.ok(commands[0].seedNote.includes('REWIND'), 'seedNote announces the rewind');
    assert.ok(
      commands[0].seedNote.includes(path.join(store.info.dir, 'round-01', 'response.json')),
      `seedNote names the rewritten response.json, got: ${commands[0].seedNote}`,
    );

    const onDisk = BoardResponseSchema.parse(
      JSON.parse(fs.readFileSync(path.join(store.info.dir, 'round-01', 'response.json'), 'utf8')),
    );
    assert.deepEqual(onDisk, revisit, 'round-01/response.json rewritten even without a wait');
  } finally {
    await bridge.stop();
  }
});
