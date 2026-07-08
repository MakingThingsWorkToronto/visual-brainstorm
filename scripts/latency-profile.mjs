/**
 * Real-path response-latency profiler (NOT the preview harness — real Bridge,
 * real WS + HTTP, the exact transport the studio uses). Drives a generic
 * brainstorm of present_board → respond round-trips and reports where the
 * milliseconds go, so "make the responses faster" is data, not a guess.
 *
 * Hops measured per round (performance.now(), same process so the shared event
 * loop is the real one the bridge flushes WS frames on):
 *   present→wire : presentAndWait() called  →  studio WS client receives `board`
 *                  (this hop includes store.recordBoard()'s SYNCHRONOUS disk I/O,
 *                   which blocks the loop before the queued frame can flush)
 *   wire→ack     : client receives `board`  →  POST /api/respond returns 200
 *   ack→resolve  : POST acked               →  presentAndWait() promise resolves
 *
 * Run: node scripts/latency-profile.mjs [iterations] [optionsPerBoard]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { BUILTIN_THEMES } from '../apps/mcp/dist/themes.js';

const ITER = Number(process.argv[2] ?? 40);
const OPTS = Number(process.argv[3] ?? 6);

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const stat = (arr) => ({
  p50: +pct(arr, 50).toFixed(2),
  p95: +pct(arr, 95).toFixed(2),
  max: +Math.max(...arr).toFixed(2),
  mean: +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2),
});
const svg = (n) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="${8 + (n % 12)}"/></svg>`;

const makeBoard = (round, kind = 'icon-grid') => {
  const base = {
    id: `board-r${round}-${round}x`,
    sessionId: store.info.id,
    round,
    kind,
    phase: 'diverge',
    title: `Round ${round}`,
    prompt: 'Pick one.',
    survey: { multiSelect: true, minSelect: 0, elaborationPrompt: 'x', allowPerOptionNotes: true, allowRemix: true, axes: [] },
    createdAt: new Date().toISOString(),
  };
  if (kind === 'mindmap') {
    return {
      ...base,
      options: [],
      tree: {
        nodeData: {
          id: 'root',
          topic: 'Root',
          children: Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, topic: `Idea ${i}` })),
        },
        direction: 2,
      },
    };
  }
  return {
    ...base,
    options: Array.from({ length: OPTS }, (_, i) => ({
      id: `o${i}`,
      label: `Opt ${i}`,
      svg: svg(i),
      tags: [],
      parents: [],
    })),
  };
};

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-latency-'));
const store = new SessionStore('Latency profile session', scratch);
const bridge = new Bridge(store, {
  discussionRoot: scratch,
  themes: BUILTIN_THEMES,
  theme: 'neon-purple',
  models: ['claude-fable-5'],
  defaultModel: 'claude-fable-5',
  log: () => {},
  recentLogs: () => [],
});
await bridge.start(0);
const base = `http://127.0.0.1:${bridge.port}`;

// Causal instrumentation: stamp WHEN store.recordBoard() actually runs, so we can
// prove (noise-immune) whether the disk I/O happens before or after the studio
// receives the board frame. Positive gap = recordBoard ran AFTER the client saw
// the board = persistence is off the present→wire critical path.
const recordAt = new Map();
const _origRecord = store.recordBoard.bind(store);
store.recordBoard = (b) => {
  recordAt.set(b.id, performance.now());
  return _origRecord(b);
};

// Studio stand-in: one persistent WS client, exactly like useBridge.ts.
const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws`);
await new Promise((r) => ws.addEventListener('open', r));

let onBoard = null;
ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'board' && onBoard) onBoard(msg.board);
});

const respond = (boardId) =>
  fetch(`${base}/api/respond`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ boardId, selectedOptionIds: [], action: 'iterate', respondedAt: new Date().toISOString() }),
  });

async function runRound(round, kind) {
  const board = makeBoard(round, kind);
  const t0 = performance.now();
  let tWire = 0;
  let tAck = 0;
  const wireSeen = new Promise((resolve) => {
    onBoard = (b) => {
      if (b.id !== board.id) return;
      tWire = performance.now();
      respond(board.id).then((res) => {
        tAck = performance.now();
        if (res.status !== 200) throw new Error(`respond ${res.status}`);
        resolve();
      });
    };
  });
  const resp = await bridge.presentAndWait(board, 15_000, false);
  const tResolve = performance.now();
  await wireSeen;
  if (!resp) throw new Error('presentAndWait timed out');
  const tRecord = recordAt.get(board.id) ?? tWire;
  return {
    present_wire: tWire - t0,
    wire_ack: tAck - tWire,
    ack_resolve: tResolve - tAck,
    total: tResolve - t0,
    record_after_wire: tRecord - tWire, // >0 ⇒ disk I/O ran AFTER the studio got the board
  };
}

// Also time store.recordBoard() in isolation (the suspected blocker).
function timeRecordBoard(kind) {
  const samples = [];
  for (let i = 0; i < ITER; i++) {
    const b = makeBoard(10_000 + i, kind);
    const t = performance.now();
    store.recordBoard(b);
    samples.push(performance.now() - t);
  }
  return stat(samples);
}

const report = (label, rows) => {
  const cols = ['present_wire', 'wire_ack', 'ack_resolve', 'total'];
  console.log(`\n${label}  (n=${rows.length})`);
  for (const c of cols) {
    const s = stat(rows.map((r) => r[c]));
    console.log(`  ${c.padEnd(13)} p50=${String(s.p50).padStart(7)}ms  p95=${String(s.p95).padStart(7)}ms  max=${String(s.max).padStart(7)}ms  mean=${String(s.mean).padStart(7)}ms`);
  }
  const gaps = rows.map((r) => r.record_after_wire);
  const after = gaps.filter((g) => g > 0).length;
  const s = stat(gaps);
  console.log(
    `  recordBoard ran AFTER the studio got the board in ${after}/${rows.length} rounds ` +
      `(gap p50=${s.p50}ms, mean=${s.mean}ms) — >0 ⇒ disk I/O off the critical path`,
  );
};

try {
  // Warm up (first round pays lazy JIT / socket costs).
  await runRound(1, 'icon-grid');

  const iconRows = [];
  for (let i = 0; i < ITER; i++) iconRows.push(await runRound(100 + i, 'icon-grid'));
  const mindRows = [];
  for (let i = 0; i < ITER; i++) mindRows.push(await runRound(500 + i, 'mindmap'));

  console.log(`\n=== REAL-PATH RESPONSE LATENCY (${ITER} iters, ${OPTS} options/board) ===`);
  report(`icon-grid board (${OPTS} option SVGs)`, iconRows);
  report('mindmap board (tree snapshot + artifact capture)', mindRows);
  console.log('\nstore.recordBoard() in isolation (synchronous disk I/O before broadcast):');
  console.log('  icon-grid:', JSON.stringify(timeRecordBoard('icon-grid')));
  console.log('  mindmap:  ', JSON.stringify(timeRecordBoard('mindmap')));
  console.log('\nLATENCY PROFILE DONE');
} catch (err) {
  process.exitCode = 1;
  console.error('LATENCY PROFILE FAIL:', err?.stack ?? err);
} finally {
  ws.close();
  await bridge.stop();
  try {
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    /* temp */
  }
}
