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

test('bridge serves only models usable on the live harness', async () => {
  const root = tmp();
  const store = new SessionStore('Harness scoping', root);
  const bridge = new Bridge(store, {
    discussionRoot: root,
    runtime: { id: 'claude', label: 'Claude Code', provider: 'Anthropic' },
    themes: [BUILTIN_THEMES[0]],
    theme: BUILTIN_THEMES[0].name,
    // A Claude model, a cross-harness Copilot-only model, and a legacy string
    // (which normalizes to the live runtime). Only Claude-usable ones should show.
    models: [
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', provider: 'Anthropic', engineIds: ['claude'] },
      { id: 'copilot-gpt-5', label: 'Copilot GPT-5', provider: 'GitHub', engineIds: ['copilot'] },
      'claude-sonnet-5',
    ],
    defaultModel: 'claude-opus-4-8',
  });
  await bridge.start(0);
  try {
    const res = await fetch(`http://127.0.0.1:${bridge.port}/api/state`);
    const body = await res.json();
    assert.deepEqual(
      body.models.map((m) => m.id),
      ['claude-opus-4-8', 'claude-sonnet-5'],
      'Copilot-only model must not be offered in a Claude session',
    );
  } finally {
    await bridge.stop();
  }
});