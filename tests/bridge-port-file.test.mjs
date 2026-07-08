// Port discovery for scripts/pipe-progress.mjs: Bridge.start() writes
// <discussionRoot>/.logs/bridge-port.json with the ACTUAL bound port + pid, so a
// port-conflict fallback never silently orphans posted progress events (the
// lost-token-meter incident, 2026-07-07). Last-started bridge wins the file.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCanonical } from './canonical/load.mjs';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { ThemeSchema } from '../packages/protocol/dist/index.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-test-'));

function makeBridge(root, title) {
  const store = new SessionStore(title, root);
  const bridge = new Bridge(store, {
    discussionRoot: root,
    themes: [loadCanonical('themes/theme.json', ThemeSchema)],
    theme: 'aurora',
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    log: () => {},
  });
  return { bridge, store };
}

test('start() writes .logs/bridge-port.json with the actual bound port, pid, session', async () => {
  const root = tmp();
  const { bridge, store } = makeBridge(root, 'Port file test');
  try {
    await bridge.start(0); // ephemeral — the file must carry the RESOLVED port
    assert.ok(bridge.port > 0, 'ephemeral port resolved to a real one');

    const portFile = path.join(root, '.logs', 'bridge-port.json');
    assert.ok(fs.existsSync(portFile), `port file exists at ${portFile}`);
    const data = JSON.parse(fs.readFileSync(portFile, 'utf8'));
    assert.equal(data.port, bridge.port, 'file reports the ACTUAL bound port');
    assert.equal(data.pid, process.pid, 'file reports this process');
    assert.equal(data.session, store.info.id, 'file names the attached thread');
    assert.ok(!Number.isNaN(Date.parse(data.startedAt)), 'startedAt is a parseable timestamp');
  } finally {
    await bridge.stop();
  }
});

test('last-started bridge wins the port file (two bridges, one discussion root)', async () => {
  const root = tmp();
  const first = makeBridge(root, 'First bridge');
  const second = makeBridge(root, 'Second bridge');
  try {
    await first.bridge.start(0);
    await second.bridge.start(0);
    assert.notEqual(first.bridge.port, second.bridge.port, 'two live bridges, two ports');
    const data = JSON.parse(fs.readFileSync(path.join(root, '.logs', 'bridge-port.json'), 'utf8'));
    assert.equal(data.port, second.bridge.port, 'the file points at the LAST-started bridge');
    assert.equal(data.session, second.store.info.id);
  } finally {
    await first.bridge.stop();
    await second.bridge.stop();
  }
});
