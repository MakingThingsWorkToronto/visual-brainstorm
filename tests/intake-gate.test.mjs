/**
 * Structural intake lock (run-brainstorm.md step 0): the concierge→gallery
 * methodology is the mandatory front door. The bridge exposes `intakeComplete`,
 * which the `present_board` MCP tool gates the FIRST board of a fresh thread on —
 * so the crowned methodology cannot be skipped à la carte. This proves the gate
 * mechanism: false on a fresh thread, true only after a real Living Gallery pick,
 * and reset when a new thread is attached.
 */
import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { BUILTIN_THEMES } from '../apps/mcp/dist/themes.js';
import { LivingGallerySchema } from '../packages/protocol/dist/index.js';
import { loadCanonical } from './canonical/load.mjs';

test('intake gate: false on a fresh thread, true only after a real gallery pick, reset on new thread', async () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-intake-gate-'));
  const store = new SessionStore('Intake gate test', scratch);
  const bridge = new Bridge(store, {
    discussionRoot: scratch,
    themes: BUILTIN_THEMES,
    theme: 'neon-purple',
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    log: () => {},
  });
  try {
    await bridge.start(0);
    // A fresh thread has NOT walked the intake front door — the tool would refuse
    // a first board here (that assertion lives in the present_board handler).
    assert.equal(bridge.intakeComplete, false, 'fresh thread is not intake-complete');

    // Present a Living Gallery and pick a method via the REAL POST endpoint (the
    // exact path the studio uses) — a fake/direct flag would prove nothing.
    const gallery = { ...loadCanonical('gallery/gallery.json', LivingGallerySchema), id: 'intake-gate-gallery' };
    const wait = bridge.presentGallery(gallery, 10_000);
    const res = await fetch(`http://127.0.0.1:${bridge.port}/api/gallery-pick`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'intake-gate-gallery', method: 'mindmap' }),
    });
    assert.equal(res.status, 200, 'gallery pick accepted');
    assert.equal(await wait, 'mindmap', 'presentGallery resolved with the pick');

    // The gate is now satisfied — boards may present.
    assert.equal(bridge.intakeComplete, true, 'a real gallery pick satisfies the intake gate');

    // Attaching a fresh thread re-arms the gate (the new thread must walk intake again).
    const store2 = new SessionStore('Second thread', scratch);
    bridge.attachStore(store2);
    assert.equal(bridge.intakeComplete, false, 'a new thread re-arms the intake gate');
  } finally {
    await bridge.stop();
    try {
      fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
    } catch {
      /* temp */
    }
  }
});
