/**
 * Durability contract (handoff-fidelity plan, 2026-07-09): the two-way
 * Claude ⇄ studio exchange survives an MCP crash/restart. Each test simulates
 * the crash by building a SECOND Bridge over the same reopened store — the
 * exact shape of a restarted MCP process.
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { BUILTIN_THEMES } from '../apps/mcp/dist/themes.js';
import { BoardSchema, LivingGallerySchema } from '../packages/protocol/dist/index.js';
import { loadCanonical } from './canonical/load.mjs';

const options = (scratch) => ({
  discussionRoot: scratch,
  themes: BUILTIN_THEMES,
  theme: 'neon-purple',
  models: ['claude-fable-5'],
  defaultModel: 'claude-fable-5',
  log: () => {},
});

const scratchDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-durability-'));
const cleanup = (dir) => {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* temp */
  }
};

test('a concierge answer posted after a "crash" is stored and returned by the next ask_concierge', async () => {
  const scratch = scratchDir();
  const store = new SessionStore('Durability concierge', scratch);
  const bridge1 = new Bridge(store, options(scratch));
  try {
    await bridge1.start(0);
    // Ask, then let the wait TIME OUT (the pending question stays on disk).
    const timedOut = await bridge1.askConcierge('Warm or cool?', ['warm', 'cool'], 60);
    assert.equal(timedOut, null, 'the ask timed out (question still pending on disk)');
    await bridge1.stop();

    // "Restart": a fresh bridge over the reopened store rehydrates the question.
    const bridge2 = new Bridge(SessionStore.open(store.info.dir), options(scratch));
    try {
      await bridge2.start(0);
      const state = await (await fetch(`http://127.0.0.1:${bridge2.port}/api/state`)).json();
      assert.ok(state.concierge, 'the pending question re-shows after restart');
      assert.equal(state.concierge.question, 'Warm or cool?');

      // The user answers with NO tool call blocked — must be stored durably.
      const res = await fetch(`http://127.0.0.1:${bridge2.port}/api/concierge`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: state.concierge.id, answer: 'warm · like ember', picked: ['warm'], typed: 'like ember' }),
      });
      assert.equal(res.status, 200, 'the answer is accepted with no live waiter');

      // The orchestrator re-asks the SAME question: it collects the stored answer.
      const collected = await bridge2.askConcierge('Warm or cool?', ['warm', 'cool'], 5000);
      assert.deepEqual(collected, { answer: 'warm · like ember', picked: ['warm'], typed: 'like ember' });
      assert.ok(
        !fs.existsSync(path.join(store.info.dir, 'intake-pending.json')),
        'the pending file clears once the answer is collected',
      );
    } finally {
      await bridge2.stop();
    }
  } finally {
    await bridge1.stop().catch(() => {});
    cleanup(scratch);
  }
});

test('a gallery pick after a "crash" opens the intake gate durably and returns from the next present_gallery', async () => {
  const scratch = scratchDir();
  const store = new SessionStore('Durability gallery', scratch);
  const gallery = { ...loadCanonical('gallery/gallery.json', LivingGallerySchema), id: 'durability-gallery' };
  const bridge1 = new Bridge(store, options(scratch));
  try {
    await bridge1.start(0);
    const timedOut = await bridge1.presentGallery(gallery, 60);
    assert.equal(timedOut, null, 'the present timed out (gallery still pending on disk)');
    await bridge1.stop();

    const bridge2 = new Bridge(SessionStore.open(store.info.dir), options(scratch));
    try {
      await bridge2.start(0);
      const state = await (await fetch(`http://127.0.0.1:${bridge2.port}/api/state`)).json();
      assert.ok(state.gallery, 'the pending gallery re-shows after restart');

      const res = await fetch(`http://127.0.0.1:${bridge2.port}/api/gallery-pick`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'durability-gallery', method: 'mindmap' }),
      });
      assert.equal(res.status, 200, 'the pick is accepted with no live waiter');
      assert.equal(bridge2.intakeComplete, true, 'the gate opens immediately');

      const pick = await bridge2.presentGallery(gallery, 5000);
      assert.equal(pick?.method, 'mindmap', 'the next present_gallery returns the stored pick');

      // The gate is durable BEYOND the bridge: a third bridge reads session.json.
      const bridge3 = new Bridge(SessionStore.open(store.info.dir), options(scratch));
      assert.equal(bridge3.intakeComplete, true, 'the intake gate survives via session.json');
    } finally {
      await bridge2.stop();
    }
  } finally {
    await bridge1.stop().catch(() => {});
    cleanup(scratch);
  }
});

test('queued UI commands survive a restart via the pending-commands journal', () => {
  const scratch = scratchDir();
  try {
    const store = new SessionStore('Durability commands', scratch);
    const bridge1 = new Bridge(store, options(scratch));
    const delivered = bridge1.dispatchCommand('plan-closeout', 'wrap it up', 'SEED NOTE full text');
    assert.equal(delivered, 'queued');

    // "Restart" with the queue never drained: the journal reloads it in full.
    const bridge2 = new Bridge(SessionStore.open(store.info.dir), options(scratch));
    const reloaded = bridge2.peekCommands();
    assert.equal(reloaded.length, 1, 'the undrained command reloads');
    assert.equal(reloaded[0].command, 'plan-closeout');
    assert.equal(reloaded[0].prompt, 'wrap it up');
    assert.equal(reloaded[0].seedNote, 'SEED NOTE full text', 'the FULL seed note survives, not a truncated log line');

    // Draining marks the journal; a third bridge sees an empty queue.
    bridge2.drainCommands();
    const bridge3 = new Bridge(SessionStore.open(store.info.dir), options(scratch));
    assert.deepEqual(bridge3.peekCommands(), [], 'drained commands do not resurrect');
  } finally {
    cleanup(scratch);
  }
});

test('a corrupt round file no longer bricks the thread reload', () => {
  const scratch = scratchDir();
  try {
    const store = new SessionStore('Durability corrupt round', scratch);
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    store.recordBoard({ ...board, id: 'board-r1-x', round: 1, sessionId: store.info.id });
    store.recordBoard({ ...board, id: 'board-r2-x', round: 2, sessionId: store.info.id });
    // Simulate a truncated pre-atomic write.
    fs.writeFileSync(path.join(store.info.dir, 'round-01', 'board.json'), '{"id": "board-r1-x", "ro');

    const reopened = SessionStore.open(store.info.dir);
    assert.equal(reopened.rounds.length, 1, 'the corrupt round is skipped, the healthy one survives');
    assert.equal(reopened.rounds[0].board.id, 'board-r2-x');
  } finally {
    cleanup(scratch);
  }
});

test('SessionStore.unarchive moves a thread out of _completed/ (and is idempotent)', () => {
  const scratch = scratchDir();
  try {
    const store = new SessionStore('Durability reopen', scratch);
    const id = store.info.id;
    const archivedDir = path.join(scratch, '_completed', id);
    fs.mkdirSync(path.join(scratch, '_completed'), { recursive: true });
    fs.renameSync(store.info.dir, archivedDir);

    const live = SessionStore.unarchive(scratch, id);
    assert.equal(live, path.join(scratch, id));
    assert.ok(fs.existsSync(path.join(live, 'session.json')), 'the thread is live again');
    assert.ok(!fs.existsSync(archivedDir), 'the archive copy is gone (moved, not copied)');
    assert.equal(SessionStore.unarchive(scratch, id), live, 'idempotent for an already-live thread');
    assert.throws(() => SessionStore.unarchive(scratch, 'no-such-thread'), /no thread/);
  } finally {
    cleanup(scratch);
  }
});
