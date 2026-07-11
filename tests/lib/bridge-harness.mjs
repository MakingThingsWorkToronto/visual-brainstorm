// ONE bridge-boot spelling for the unit layer — tests/board-draft, api-status-matrix,
// bridge-rearm, bridge-revisit had diverging copies (review-followups-2026-07-09 item 7).
// A REAL Bridge on an ephemeral port over a REAL SessionStore in a temp dir — no mocks
// (rule 6). Tests import these instead of re-spelling the boot.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadCanonical } from '../canonical/load.mjs';
import { SessionStore } from '../../apps/mcp/dist/session-store.js';
import { Bridge } from '../../apps/mcp/dist/bridge-server.js';
import { ThemeSchema } from '../../packages/protocol/dist/index.js';

/** Fresh temp dir per use — the discussion root / scratch space. */
export const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-test-'));

/**
 * Boot a REAL Bridge on an ephemeral port over a fresh SessionStore titled `title`.
 *
 * opts: `{ distDir?, ...bridgeOptions }` — bridgeOptions spread OVER the defaults
 * (so tests can attach saveTheme / setDefaultTargetRepo / recentLogs / logFile /
 * defaultTargetRepo, or override models/theme); `distDir` scopes VIBR_STUDIO_DIST
 * to start() for the static-studio proofs (api-status-matrix).
 *
 * @returns {{ bridge, store, root, logLines }}
 */
export async function startBridge(title, opts = {}) {
  const { distDir, ...extra } = opts;
  const root = tmp();
  const store = new SessionStore(title, root);
  const logLines = [];
  const bridge = new Bridge(store, {
    discussionRoot: root,
    themes: [loadCanonical('themes/theme.json', ThemeSchema)],
    theme: 'aurora',
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    log: (line) => logLines.push(line),
    ...extra,
  });
  // studioDist() reads VIBR_STUDIO_DIST inside start() — scope the override to it.
  const prevDist = process.env.VIBR_STUDIO_DIST;
  if (distDir !== undefined) process.env.VIBR_STUDIO_DIST = distDir;
  try {
    await bridge.start(0); // ephemeral port
  } finally {
    if (distDir !== undefined) {
      if (prevDist === undefined) delete process.env.VIBR_STUDIO_DIST;
      else process.env.VIBR_STUDIO_DIST = prevDist;
    }
  }
  return { bridge, store, root, logLines };
}

/** POST JSON (or a raw string, for malformed-payload proofs) → { status, body }. */
export const postJson = async (bridge, p, body) => {
  const res = await fetch(`http://127.0.0.1:${bridge.port}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

export const getState = async (bridge) => (await fetch(`http://127.0.0.1:${bridge.port}/api/state`)).json();

/** Open a WS client on the bridge and collect every parsed envelope into `messages`. */
export async function wsCollect(bridge) {
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws`);
  const messages = [];
  ws.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data))));
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  return { ws, messages };
}

export const getHealth = async (bridge) => (await fetch(`http://127.0.0.1:${bridge.port}/api/health`)).json();
