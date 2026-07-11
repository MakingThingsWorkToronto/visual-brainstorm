/**
 * Intake chat history (operator report 2026-07-11: "user messages shall not
 * disappear"). Everything the user says during intake — the New Discussion
 * brief, each answered concierge exchange, the gallery pick — must persist as
 * STRUCTURED chat history: appended to the thread's intake-log.json, carried in
 * StudioState.intakeLog, broadcast live as {type:'intake'} envelopes, and
 * replayed by GET /api/discussions/:id. Timeouts are NOT logged (no user
 * message to preserve — no fake entries, rule 6). Proven on a REAL bridge over
 * a REAL store, driven through the same HTTP endpoints the studio uses.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { BoardSchema, LivingGallerySchema } from '../packages/protocol/dist/index.js';
import { loadCanonical } from './canonical/load.mjs';
import { startBridge, postJson, getState, wsCollect } from './lib/bridge-harness.mjs';

test('concierge answer → intake-log entry: state + WS broadcast + disk reload', async () => {
  const { bridge, store } = await startBridge('Intake log concierge');
  const { ws, messages } = await wsCollect(bridge);
  try {
    const wait = bridge.askConcierge('What mood should the marks carry?', ['warm', 'cool'], 10_000);
    const pending = (await getState(bridge)).concierge;
    assert.ok(pending, 'the concierge question is live');
    const res = await postJson(bridge, '/api/concierge', {
      id: pending.id,
      answer: 'warm · hand-drawn',
      picked: ['warm'],
      typed: 'hand-drawn',
    });
    assert.equal(res.status, 200);
    assert.equal((await wait)?.answer, 'warm · hand-drawn', 'askConcierge resolved with the answer');

    // Live state carries the answered exchange as chat history.
    const state = await getState(bridge);
    assert.equal(state.intakeLog.length, 1, 'one intake entry logged');
    assert.deepEqual(
      { kind: state.intakeLog[0].kind, question: state.intakeLog[0].question, answer: state.intakeLog[0].answer, picked: state.intakeLog[0].picked, typed: state.intakeLog[0].typed },
      { kind: 'concierge', question: 'What mood should the marks carry?', answer: 'warm · hand-drawn', picked: ['warm'], typed: 'hand-drawn' },
    );

    // Broadcast live so the open studio appends the bubble without a reload.
    const envelope = messages.find((m) => m.type === 'intake');
    assert.ok(envelope, 'an {type:"intake"} envelope was broadcast');
    assert.equal(envelope.entry.kind, 'concierge');
    assert.equal(envelope.entry.answer, 'warm · hand-drawn');

    // Durable: intake-log.json reloads with the thread.
    assert.ok(fs.existsSync(path.join(store.info.dir, 'intake-log.json')), 'intake-log.json persisted');
    const reopened = SessionStore.open(store.info.dir);
    assert.equal(reopened.intakeLog.length, 1, 'the entry survives a disk reload');
    assert.equal(reopened.intakeLog[0].answer, 'warm · hand-drawn');
  } finally {
    ws.close();
    await bridge.stop();
  }
});

test('concierge timeout → NO intake-log entry (no user message, no fake history)', async () => {
  const { bridge } = await startBridge('Intake log timeout');
  try {
    const result = await bridge.askConcierge('Unanswered question?', [], 50);
    assert.equal(result, null, 'the ask timed out');
    assert.equal((await getState(bridge)).intakeLog.length, 0, 'nothing logged for a timeout');
  } finally {
    await bridge.stop();
  }
});

test('gallery pick → intake-log entry with the offered roster', async () => {
  const { bridge, store } = await startBridge('Intake log gallery');
  try {
    const gallery = { ...loadCanonical('gallery/gallery.json', LivingGallerySchema), id: 'intake-log-gallery' };
    const wait = bridge.presentGallery(gallery, 10_000);
    const res = await postJson(bridge, '/api/gallery-pick', { id: 'intake-log-gallery', method: 'mindmap' });
    assert.equal(res.status, 200);
    assert.equal((await wait)?.method, 'mindmap');

    const entry = (await getState(bridge)).intakeLog.find((e) => e.kind === 'gallery-pick');
    assert.ok(entry, 'the pick is logged');
    assert.equal(entry.method, 'mindmap');
    assert.deepEqual(entry.offered, gallery.cards.map((c) => c.method), 'the offered roster travels');
    assert.equal(SessionStore.open(store.info.dir).intakeLog.length, 1, 'reloads from disk');
  } finally {
    await bridge.stop();
  }
});

test('new-brainstorm brief on an empty thread → brief entry (rawBrief + survey ids) + archived replay', async () => {
  const { bridge, store } = await startBridge('Intake log brief');
  try {
    const res = await postJson(bridge, '/api/command', {
      command: 'new-brainstorm',
      prompt: 'logo ideas (warm · hand-drawn)',
      rawBrief: 'logo ideas',
      model: 'claude-fable-5',
      intakeAnswers: [{ id: 'medium', question: 'What are we making?', answers: ['logo'] }],
    });
    assert.equal(res.status, 200);

    const state = await getState(bridge);
    assert.equal(state.intakeLog.length, 1);
    const entry = state.intakeLog[0];
    assert.equal(entry.kind, 'brief');
    assert.equal(entry.prompt, 'logo ideas (warm · hand-drawn)');
    assert.equal(entry.rawBrief, 'logo ideas', 'the raw typed brief travels (revise prefill)');
    assert.deepEqual(entry.answers, [{ id: 'medium', question: 'What are we making?', answers: ['logo'] }]);
    assert.equal(entry.model, 'claude-fable-5');

    // The archived-thread endpoint replays the same history.
    const archived = await (
      await fetch(`http://127.0.0.1:${bridge.port}/api/discussions/${encodeURIComponent(store.info.id)}`)
    ).json();
    assert.equal(archived.intakeLog.length, 1, '/api/discussions/:id carries the intake log');
    assert.equal(archived.intakeLog[0].kind, 'brief');
  } finally {
    await bridge.stop();
  }
});

test('new-brainstorm brief over a thread WITH rounds → NOT logged locally (travels with the command)', async () => {
  const { bridge, store, logLines } = await startBridge('Intake log busy thread');
  try {
    // The current thread has a round: the brief belongs to the FRESH brainstorm
    // the command starts (whose own landing loop records it) — logging it here
    // would misattribute it to this thread's history.
    store.recordBoard(loadCanonical('boards/expand.json', BoardSchema));
    const res = await postJson(bridge, '/api/command', {
      command: 'new-brainstorm',
      prompt: 'poster concepts',
      rawBrief: 'poster concepts',
    });
    assert.equal(res.status, 200, 'the command itself is accepted (it reaches the orchestrator)');
    assert.equal(store.intakeLog.length, 0, 'the busy thread does NOT absorb the brief');
    assert.ok(
      logLines.some((l) => l.includes('brief not logged on this thread')),
      'the skip is logged honestly, never silent',
    );
  } finally {
    await bridge.stop();
  }
});

test('a corrupt intake-log entry skips ALONE — the tail of the history survives the reload', async () => {
  const { bridge, store } = await startBridge('Intake log corrupt entry');
  try {
    const wait = bridge.askConcierge('First question?', [], 10_000);
    const pending = (await getState(bridge)).concierge;
    await postJson(bridge, '/api/concierge', { id: pending.id, answer: 'first' });
    await wait;
    const wait2 = bridge.askConcierge('Second question?', [], 10_000);
    const pending2 = (await getState(bridge)).concierge;
    await postJson(bridge, '/api/concierge', { id: pending2.id, answer: 'second' });
    await wait2;

    // Corrupt the MIDDLE of the on-disk log (a foreign editor / schema drift).
    const file = path.join(store.info.dir, 'intake-log.json');
    const entries = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(entries.length, 2);
    fs.writeFileSync(file, JSON.stringify([entries[0], { kind: 'garbage' }, entries[1]]));

    // Per-entry validation: the garbage skips, BOTH real answers survive —
    // a whole-loop catch used to discard everything after the corrupt entry
    // (and the next whole-array rewrite made that loss permanent).
    const reopened = SessionStore.open(store.info.dir);
    assert.deepEqual(
      reopened.intakeLog.map((e) => e.answer),
      ['first', 'second'],
      'the entries before AND after the corrupt one reload',
    );
  } finally {
    await bridge.stop();
  }
});
