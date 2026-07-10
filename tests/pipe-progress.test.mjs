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
