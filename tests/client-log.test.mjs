import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { BUILTIN_THEMES } from '../apps/mcp/dist/themes.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-test-'));

// ---------- POST /api/client-log (real Bridge, ephemeral port, real log sink) ----------

async function startBridge() {
  const root = tmp();
  const store = new SessionStore('Client log test', root);
  const logLines = [];
  const bridge = new Bridge(store, {
    discussionRoot: root,
    themes: BUILTIN_THEMES,
    theme: 'neon-purple',
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    engine: 'claude',
    log: (line) => logLines.push(line),
  });
  await bridge.start(0); // ephemeral port
  return { bridge, logLines };
}

const post = async (bridge, body) => {
  const res = await fetch(`http://127.0.0.1:${bridge.port}/api/client-log`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

test('valid payload → 200 {ok:true} and one STUDIO CLIENT ERROR log line', async () => {
  const { bridge, logLines } = await startBridge();
  try {
    const stack =
      'Error: boom\n    at render (App.tsx:1:1)\n    at frame2\n    at frame3\n' +
      '    at frame4\n    at frame5\n    at frame6-cut-here\n    at frame7-dropped';
    const { status, body } = await post(bridge, {
      source: 'error-boundary',
      message: 'boom in render',
      stack,
    });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true });

    const line = logLines.find((l) => l.includes('STUDIO CLIENT ERROR'));
    assert.ok(line, `no STUDIO CLIENT ERROR line in log sink, got: ${JSON.stringify(logLines)}`);
    assert.ok(line.includes('STUDIO CLIENT ERROR [error-boundary]'), line);
    assert.ok(line.includes('boom in render'), line);
    assert.ok(line.includes('frame5'), 'first six stack frames included');
    assert.ok(!line.includes('frame7-dropped'), 'stack truncated to six frames');
  } finally {
    await bridge.stop();
  }
});

test('stack is optional: message-only payload still logs (no trailing frames)', async () => {
  const { bridge, logLines } = await startBridge();
  try {
    const { status, body } = await post(bridge, { source: 'window.onerror', message: 'lonely' });
    assert.equal(status, 200);
    assert.deepEqual(body, { ok: true });
    const line = logLines.find((l) => l.includes('STUDIO CLIENT ERROR'));
    assert.ok(line.includes('STUDIO CLIENT ERROR [window.onerror]: lonely'), line);
    assert.ok(!line.includes(' — '), 'no frame separator without a stack');
  } finally {
    await bridge.stop();
  }
});

test('invalid payloads → 400 {ok:false}, nothing logged (zod refuses)', async () => {
  const { bridge, logLines } = await startBridge();
  try {
    // Missing message.
    const missing = await post(bridge, { source: 'error-boundary' });
    assert.equal(missing.status, 400);
    assert.equal(missing.body.ok, false);
    assert.ok(missing.body.error, 'honest error text present');

    // Over-limit message (>4000 chars).
    const oversized = await post(bridge, { source: 's', message: 'x'.repeat(4001) });
    assert.equal(oversized.status, 400);
    assert.equal(oversized.body.ok, false);

    // Not JSON at all.
    const garbage = await post(bridge, 'not json {{{');
    assert.equal(garbage.status, 400);
    assert.equal(garbage.body.ok, false);

    assert.ok(
      !logLines.some((l) => l.includes('STUDIO CLIENT ERROR')),
      'rejected payloads must not reach the log sink',
    );
  } finally {
    await bridge.stop();
  }
});

test('bodies beyond the 32k cap are cut off (socket destroyed, nothing logged)', async () => {
  const { bridge, logLines } = await startBridge();
  try {
    await assert.rejects(
      fetch(`http://127.0.0.1:${bridge.port}/api/client-log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 's', message: 'm', stack: 'y'.repeat(40_000) }),
      }),
      'oversized body must not produce a normal response',
    );
    assert.ok(
      !logLines.some((l) => l.includes('STUDIO CLIENT ERROR')),
      'oversized payloads must not reach the log sink',
    );
  } finally {
    await bridge.stop();
  }
});
