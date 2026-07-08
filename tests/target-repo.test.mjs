import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONFIG_FILENAME, loadConfig, saveTargetRepo } from '../apps/mcp/dist/config.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { BUILTIN_THEMES } from '../apps/mcp/dist/themes.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-test-'));

// ---------- saveTargetRepo (config file read-modify-write) ----------

test('saveTargetRepo sets the key and preserves every other key ($comment included)', () => {
  const dir = tmp();
  fs.writeFileSync(
    path.join(dir, CONFIG_FILENAME),
    JSON.stringify({ $comment: 'human-edited', theme: 'mono', extraUnknown: 42 }),
  );
  saveTargetRepo('X:/elsewhere', dir);
  const raw = JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILENAME), 'utf8'));
  assert.equal(raw.targetRepo, 'X:/elsewhere');
  assert.equal(raw.$comment, 'human-edited');
  assert.equal(raw.theme, 'mono');
  assert.equal(raw.extraUnknown, 42);
  assert.equal(loadConfig(dir).targetRepo, 'X:/elsewhere');
});

test('saveTargetRepo(null) deletes the key, preserving the rest', () => {
  const dir = tmp();
  fs.writeFileSync(
    path.join(dir, CONFIG_FILENAME),
    JSON.stringify({ targetRepo: 'X:/old', theme: 'mono' }),
  );
  saveTargetRepo(null, dir);
  const raw = JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILENAME), 'utf8'));
  assert.ok(!('targetRepo' in raw), 'targetRepo key removed');
  assert.equal(raw.theme, 'mono');
  assert.equal(loadConfig(dir).targetRepo, undefined);
});

test('saveTargetRepo creates the config file when absent', () => {
  const dir = tmp();
  saveTargetRepo('Y:/fresh', dir);
  const raw = JSON.parse(fs.readFileSync(path.join(dir, CONFIG_FILENAME), 'utf8'));
  assert.deepEqual(raw, { targetRepo: 'Y:/fresh' });
});

// ---------- SessionStore.setTargetRepo (per-thread persistence) ----------

test('setTargetRepo persists to session.json + brainstorm.md and survives open()', () => {
  const root = tmp();
  const store = new SessionStore('Target test', root);
  store.setTargetRepo('Z:/my-repo');
  assert.equal(store.info.targetRepo, 'Z:/my-repo');

  const onDisk = JSON.parse(fs.readFileSync(path.join(store.info.dir, 'session.json'), 'utf8'));
  assert.equal(onDisk.targetRepo, 'Z:/my-repo');
  const md = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
  assert.ok(md.includes('Target repo for this thread set to `Z:/my-repo`'));

  const reopened = SessionStore.open(store.info.dir);
  assert.equal(reopened.info.targetRepo, 'Z:/my-repo', 'resumed thread keeps its target repo');
});

test('setTargetRepo(undefined) clears the override on disk and after reload', () => {
  const root = tmp();
  const store = new SessionStore('Clear test', root);
  store.setTargetRepo('Z:/my-repo');
  store.setTargetRepo(undefined);
  assert.equal(store.info.targetRepo, undefined);

  const onDisk = JSON.parse(fs.readFileSync(path.join(store.info.dir, 'session.json'), 'utf8'));
  assert.ok(!('targetRepo' in onDisk), 'targetRepo removed from session.json');
  const md = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
  assert.ok(md.includes('Target repo for this thread cleared'));

  assert.equal(SessionStore.open(store.info.dir).info.targetRepo, undefined);
});

// ---------- POST /api/target-repo (real Bridge, ephemeral port) ----------

async function startBridge(extraOptions = {}) {
  const root = tmp();
  const store = new SessionStore('Bridge target test', root);
  const bridge = new Bridge(store, {
    discussionRoot: root,
    themes: BUILTIN_THEMES,
    theme: 'neon-purple',
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    log: () => {},
    ...extraOptions,
  });
  await bridge.start(0); // ephemeral port
  return { bridge, store, root };
}

const post = async (bridge, body) => {
  const res = await fetch(`http://127.0.0.1:${bridge.port}/api/target-repo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

const getState = async (bridge) =>
  (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();

test('POST /api/target-repo rejects a non-existent folder with an honest 400', async () => {
  const { bridge } = await startBridge();
  try {
    const missing = path.join(tmp(), 'does-not-exist');
    const { status, body } = await post(bridge, { path: missing, scope: 'thread' });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('not a folder'), `honest error, got: ${body.error}`);

    // A file (not a directory) is rejected too.
    const file = path.join(tmp(), 'a-file.txt');
    fs.writeFileSync(file, 'x');
    const fileAttempt = await post(bridge, { path: file, scope: 'thread' });
    assert.equal(fileAttempt.status, 400);
    assert.equal(fileAttempt.body.ok, false);
  } finally {
    await bridge.stop();
  }
});

test('thread scope sets session.json and state; clearing removes it', async () => {
  const { bridge, store } = await startBridge();
  try {
    const target = tmp();
    const { status, body } = await post(bridge, { path: target, scope: 'thread' });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.targetRepo, path.resolve(target));

    const onDisk = JSON.parse(fs.readFileSync(path.join(store.info.dir, 'session.json'), 'utf8'));
    assert.equal(onDisk.targetRepo, path.resolve(target));
    assert.equal((await getState(bridge)).targetRepo, path.resolve(target));

    // Clearing (null path) removes the override everywhere.
    const cleared = await post(bridge, { path: null, scope: 'thread' });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.targetRepo, null);
    const afterClear = JSON.parse(fs.readFileSync(path.join(store.info.dir, 'session.json'), 'utf8'));
    assert.ok(!('targetRepo' in afterClear));
    assert.equal((await getState(bridge)).targetRepo, null);
  } finally {
    await bridge.stop();
  }
});

test('default scope invokes the setDefaultTargetRepo callback (set and clear)', async () => {
  const calls = [];
  let current = null;
  const { bridge } = await startBridge({
    defaultTargetRepo: () => current,
    setDefaultTargetRepo: (value) => {
      calls.push(value);
      current = value;
    },
  });
  try {
    const target = tmp();
    const { status, body } = await post(bridge, { path: target, scope: 'default' });
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(calls, [path.resolve(target)]);
    assert.equal(body.targetRepo, path.resolve(target), 'state reflects the new default');

    // Empty string clears just like null.
    const cleared = await post(bridge, { path: '', scope: 'default' });
    assert.equal(cleared.status, 200);
    assert.deepEqual(calls, [path.resolve(target), null]);
    assert.equal(cleared.body.targetRepo, null);
  } finally {
    await bridge.stop();
  }
});

test('default scope without a persistence callback is an honest 400 (preview harness)', async () => {
  const { bridge, store } = await startBridge(); // no setDefaultTargetRepo
  try {
    const target = tmp();
    const { status, body } = await post(bridge, { path: target, scope: 'default' });
    assert.equal(status, 400);
    assert.equal(body.ok, false);
    assert.ok(body.error.includes('cannot persist a default target repo'), body.error);
    assert.equal(store.info.targetRepo, undefined, 'thread override untouched');
  } finally {
    await bridge.stop();
  }
});

test('state precedence: thread override wins over config default; clearing falls back', async () => {
  const defaultDir = path.resolve(tmp());
  const { bridge } = await startBridge({ defaultTargetRepo: () => defaultDir });
  try {
    assert.equal((await getState(bridge)).targetRepo, defaultDir, 'default shows when no override');

    const threadDir = tmp();
    await post(bridge, { path: threadDir, scope: 'thread' });
    assert.equal((await getState(bridge)).targetRepo, path.resolve(threadDir), 'thread override wins');

    await post(bridge, { path: null, scope: 'thread' });
    assert.equal((await getState(bridge)).targetRepo, defaultDir, 'clearing falls back to default');
  } finally {
    await bridge.stop();
  }
});

test('/api/target-repo rejects malformed bodies via zod (400)', async () => {
  const { bridge } = await startBridge();
  try {
    const badScope = await post(bridge, { path: tmp(), scope: 'global' });
    assert.equal(badScope.status, 400);
    assert.equal(badScope.body.ok, false);
    const missingPath = await post(bridge, { scope: 'thread' });
    assert.equal(missingPath.status, 400);
  } finally {
    await bridge.stop();
  }
});
