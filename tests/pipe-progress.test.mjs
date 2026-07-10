// pipe-progress structured emission (in-progress-feedback phase 1): a REAL child
// process (scripts/pipe-progress.mjs) POSTing to a REAL http server on an ephemeral
// port — no mocks (rule 6). Covers CLI structured flags (--stage/--artifact/--option/
// --board/--step/--of), an unknown --stage being silently stripped, and hook-mode
// PreToolUse svg-artisan delegation (generating/generation, MUTATE → revising/tweak).
import { test } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProgressEventSchema } from '../packages/protocol/dist/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PIPE = path.join(ROOT, 'scripts', 'pipe-progress.mjs');

/** A real http server capturing every POST body it receives. */
function startCaptureServer() {
  return new Promise((resolve) => {
    const bodies = [];
    const server = http.createServer((req, res) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => {
        try {
          bodies.push(JSON.parse(data));
        } catch {
          bodies.push({ __unparsed: data });
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, bodies, port: server.address().port }));
  });
}

/** Spawn the real pipe-progress CLI/hook script; it always exits 0 (hook safety). */
function runPipe(args, stdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [PIPE, ...args], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code, stderr }));
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });
}

test('pipe-progress CLI: structured fields arrive on the wire with exact literals', async () => {
  const { server, bodies, port } = await startCaptureServer();
  try {
    const { code, stderr } = await runPipe([
      '--port', String(port),
      '--note', 'drawing option',
      '--stage', 'generating',
      '--artifact', 'art-1',
      '--option', 'o3',
      '--board', 'b7',
      '--step', '3',
      '--of', '6',
    ]);
    assert.equal(code, 0, `pipe always exits 0, stderr: ${stderr}`);
    assert.equal(bodies.length, 1, 'exactly one POST arrived');
    const body = bodies[0];
    assert.equal(body.note, 'drawing option');
    assert.equal(body.stage, 'generating');
    assert.equal(body.artifactSlug, 'art-1');
    assert.equal(body.optionId, 'o3');
    assert.equal(body.boardId, 'b7');
    assert.deepEqual(body.sequence, { current: 3, total: 6 });
    // The posted body is exactly a valid ProgressEvent (the bridge's own contract).
    assert.doesNotThrow(() => ProgressEventSchema.parse(body));
  } finally {
    server.close();
  }
});

test('pipe-progress CLI: an unknown --stage is silently stripped', async () => {
  const { server, bodies, port } = await startCaptureServer();
  try {
    const { code } = await runPipe([
      '--port', String(port),
      '--note', 'drawing option',
      '--stage', 'bogus',
    ]);
    assert.equal(code, 0);
    assert.equal(bodies.length, 1);
    assert.ok(!('stage' in bodies[0]), `stage should be stripped, got: ${JSON.stringify(bodies[0])}`);
  } finally {
    server.close();
  }
});

test('pipe-progress hook mode: PreToolUse svg-artisan delegation emits stage generating + category generation', async () => {
  const { server, bodies, port } = await startCaptureServer();
  try {
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      tool_input: { subagent_type: 'svg-artisan', prompt: 'Draw a bold, glowing filament mark.' },
    });
    const { code } = await runPipe(['--port', String(port)], payload);
    assert.equal(code, 0);
    assert.equal(bodies.length, 1);
    const body = bodies[0];
    assert.equal(body.stage, 'generating');
    assert.equal(body.category, 'generation');
    assert.equal(body.note, 'delegating a board round to svg-artisan');
  } finally {
    server.close();
  }
});

test('pipe-progress hook mode: a MUTATE-marked prompt emits stage revising + category tweak', async () => {
  const { server, bodies, port } = await startCaptureServer();
  try {
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      tool_name: 'Agent',
      tool_input: { subagent_type: 'svg-artisan', prompt: 'MUTATE option a: warmer glow, same silhouette.' },
    });
    const { code } = await runPipe(['--port', String(port)], payload);
    assert.equal(code, 0);
    assert.equal(bodies.length, 1);
    const body = bodies[0];
    assert.equal(body.stage, 'revising');
    assert.equal(body.category, 'tweak');
    assert.equal(body.note, 'delegating a mutation round to svg-artisan');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// Cursor idempotency (token-economy follow-ups phase 1): REAL pipe processes
// posting REAL transcript deltas to a REAL Bridge over a REAL SessionStore —
// the store ledger must clamp the two double-count mechanisms the fresh-eyes
// review found: a concurrent-hook cursor race and a slow-accept re-post.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import os from 'node:os';
import { startBridge, postJson } from './lib/bridge-harness.mjs';

/** A Claude Code transcript JSONL with the given assistant usage entries. */
function writeTranscript(file, usages) {
  fs.writeFileSync(
    file,
    usages
      .map((u) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: u.input, output_tokens: u.output } } }))
      .join('\n') + '\n',
  );
}

/** The pipe's cursor file for a session id (same derivation as the script). */
const cursorFile = (sessionId) =>
  path.join(os.tmpdir(), `vibr-token-cursor-${String(sessionId).replace(/[^\w.-]+/g, '_')}.json`);

const stopPayload = (sessionId, transcriptPath) =>
  JSON.stringify({ hook_event_name: 'Stop', session_id: sessionId, transcript_path: transcriptPath });

test('concurrent-pipe cursor race: two pipes reading one base never double-count', async () => {
  const { bridge, store, root } = await startBridge('Race test');
  const sessionId = `vibr-race-${process.pid}-${Date.now()}`;
  const transcript = path.join(root, 'transcript.jsonl');
  try {
    fs.rmSync(cursorFile(sessionId), { force: true });
    writeTranscript(transcript, [{ input: 250, output: 25 }]);
    // Pipe A reads base 0, posts 250/25, commits its cursor.
    await runPipe(['--port', String(bridge.port)], stopPayload(sessionId, transcript));
    // The race: pipe B read base 0 BEFORE A committed. Reproduce that exact
    // interleaving by rewinding the cursor to its pre-A state, then let the
    // transcript grow before B fires — B posts the overlapping 300/30 window.
    fs.rmSync(cursorFile(sessionId), { force: true });
    writeTranscript(transcript, [{ input: 250, output: 25 }, { input: 50, output: 5 }]);
    await runPipe(['--port', String(bridge.port)], stopPayload(sessionId, transcript));
    assert.deepEqual(
      store.tokenTotals(),
      { input: 300, output: 30 },
      'the meter equals the transcript — the 250/25 overlap was clamped, not double-counted',
    );
    assert.ok(
      store.progress.some((e) => e.tokenCursor),
      'the tokenCursor claim survived the bridge inbound whitelist onto the recorded event',
    );
  } finally {
    fs.rmSync(cursorFile(sessionId), { force: true });
    await bridge.stop();
  }
});

test('slow-accept re-post: a delta the bridge accepted after the pipe aborted is never re-counted', async () => {
  const { bridge, store, root } = await startBridge('Slow accept test');
  const sessionId = `vibr-slow-${process.pid}-${Date.now()}`;
  const transcript = path.join(root, 'transcript.jsonl');
  // A listener slower than the pipe's 1.5s abort: it records the body (the
  // event IS delivered) but answers too late for the pipe to commit its cursor.
  const slow = await new Promise((resolve) => {
    const bodies = [];
    const server = http.createServer((req, res) => {
      let data = '';
      req.on('data', (chunk) => (data += chunk));
      req.on('end', () => {
        bodies.push(JSON.parse(data));
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        }, 1700);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, bodies, port: server.address().port }));
  });
  try {
    fs.rmSync(cursorFile(sessionId), { force: true });
    writeTranscript(transcript, [{ input: 250, output: 25 }]);
    // The pipe posts, aborts at 1.5s, exits 0 WITHOUT committing the cursor.
    const { code } = await runPipe(['--port', String(slow.port)], stopPayload(sessionId, transcript));
    assert.equal(code, 0, 'hook safety: a slow accept never fails the hook');
    assert.equal(fs.existsSync(cursorFile(sessionId)), false, 'the aborted POST did not commit');
    assert.equal(slow.bodies.length, 1, 'the slow listener still RECEIVED the delta');
    // ...and the bridge accepted that very body (the slow leg, delivered).
    const accepted = await postJson(bridge, '/api/progress', slow.bodies[0]);
    assert.equal(accepted.status, 200);
    // Next turn-end: the cursor never committed, so the pipe re-covers the
    // same window plus new growth. The ledger must count the overlap once.
    writeTranscript(transcript, [{ input: 250, output: 25 }, { input: 50, output: 5 }]);
    await runPipe(['--port', String(bridge.port)], stopPayload(sessionId, transcript));
    assert.deepEqual(
      store.tokenTotals(),
      { input: 300, output: 30 },
      'the re-posted 250/25 window counts once — the meter equals the transcript',
    );
  } finally {
    fs.rmSync(cursorFile(sessionId), { force: true });
    slow.server.close();
    await bridge.stop();
  }
});

test('compaction: a shrunk transcript bumps the cursor generation and later usage still counts', async () => {
  const { bridge, store, root } = await startBridge('Compaction test');
  const sessionId = `vibr-gen-${process.pid}-${Date.now()}`;
  const transcript = path.join(root, 'transcript.jsonl');
  try {
    fs.rmSync(cursorFile(sessionId), { force: true });
    writeTranscript(transcript, [{ input: 250, output: 25 }]);
    await runPipe(['--port', String(bridge.port)], stopPayload(sessionId, transcript));
    // Compaction: the transcript shrinks. Zero delta — the pipe re-bases and
    // bumps its generation instead of posting.
    writeTranscript(transcript, [{ input: 10, output: 1 }]);
    await runPipe(['--port', String(bridge.port)], stopPayload(sessionId, transcript));
    assert.equal(JSON.parse(fs.readFileSync(cursorFile(sessionId), 'utf8')).gen, 1, 'shrink bumped gen');
    // Post-compaction growth sits BELOW the gen-0 high-water mark — the new
    // generation must still count it (never eat real usage).
    writeTranscript(transcript, [{ input: 10, output: 1 }, { input: 40, output: 4 }]);
    await runPipe(['--port', String(bridge.port)], stopPayload(sessionId, transcript));
    assert.deepEqual(store.tokenTotals(), { input: 290, output: 29 });
  } finally {
    fs.rmSync(cursorFile(sessionId), { force: true });
    await bridge.stop();
  }
});
