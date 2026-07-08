import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { createEngineAdapter } from '../apps/mcp/dist/engine-adapter.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { BUILTIN_THEMES } from '../apps/mcp/dist/themes.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-test-'));

test('engine adapter owns runtime-specific status copy', () => {
  const adapter = createEngineAdapter({ id: 'codex', label: 'Codex CLI', provider: 'OpenAI' });
  assert.equal(adapter.processingSelectionNote(), 'Codex CLI is processing your selection…');
  assert.equal(adapter.rewindNote(3), 'Codex CLI is rewinding to round 3…');
});

test('bridge normalizes legacy string models against the configured runtime', async () => {
  const root = tmp();
  const store = new SessionStore('Adapter bridge', root);
  const bridge = new Bridge(store, {
    discussionRoot: root,
    runtime: { id: 'codex', label: 'Codex CLI', provider: 'OpenAI' },
    themes: [BUILTIN_THEMES[0]],
    theme: BUILTIN_THEMES[0].name,
    models: ['codex-mini'],
    defaultModel: 'codex-mini',
  });
  await bridge.start(0);
  try {
    const res = await fetch(`http://127.0.0.1:${bridge.port}/api/state`);
    const body = await res.json();
    assert.equal(body.runtime.id, 'codex');
    assert.equal(body.runtime.label, 'Codex CLI');
    assert.deepEqual(body.models, [
      {
        id: 'codex-mini',
        label: 'Codex Mini',
        provider: 'OpenAI',
        engineIds: ['codex'],
        capabilities: { orchestrate: false, delegate: true },
      },
    ]);
  } finally {
    await bridge.stop();
  }
});