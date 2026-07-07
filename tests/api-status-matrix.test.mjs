// API status matrix (comprehensive-human-testing phase 2): every bridge HTTP endpoint
// and WS message has a proof per REACHABLE status code, asserting the response BODY
// against tests/canonical/api/ expectations (see its README for the sentinel grammar).
// A REAL Bridge on an ephemeral port, real fetch, real WebSocket — no mocks (rule 6).
// The final test prints the endpoint × codes coverage table and fails on any censused
// pair without a proof, and on any canonical api expectation file that went unused.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CANONICAL_DIR, loadCanonical } from './canonical/load.mjs';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import {
  BoardResponseSchema,
  BoardSchema,
  DiscussionSummarySchema,
  ProgressEventSchema,
  ThemeSchema,
  optionChatSlug,
} from '../packages/protocol/dist/index.js';

// ---------------------------------------------------------------------------
// The census — the authoritative matrix. Every pair here MUST be proven below.
// ---------------------------------------------------------------------------
const CENSUS = [
  ['GET /api/health', [200]],
  ['GET /api/logs', [200]],
  ['GET /api/state', [200]],
  ['GET /api/discussions', [200]],
  ['POST /api/command', [200, 400]],
  ['POST /api/themes', [200, 400]],
  ['POST /api/session-theme', [200, 400]],
  ['POST /api/target-repo', [200, 400]],
  ['GET /api/artifact-svg/:slug.svg', [200, 404]],
  ['GET /api/discussions/:id', [200, 404]],
  ['POST /api/progress', [200, 400]],
  ['POST /api/client-log', [200, 400]],
  ['POST /api/artifact-chat', [200, 400, 404]],
  ['POST /api/artifact-notes', [200, 400, 404]],
  ['POST /api/respond', [200, 400]],
  ['GET /* (static studio)', [200, 503]],
  ['WS /ws', ['hello', 'responded', 'artifact', 'malformed-logged', 'unknown-type-ignored']],
];

const PROVEN = new Map();
function prove(endpoint, code) {
  if (!PROVEN.has(endpoint)) PROVEN.set(endpoint, new Set());
  PROVEN.get(endpoint).add(code);
}

// ---------------------------------------------------------------------------
// Canonical expectation loading + the sentinel matcher (grammar: api/README.md)
// ---------------------------------------------------------------------------
const SCHEMAS = { BoardResponseSchema, BoardSchema, ProgressEventSchema, ThemeSchema };
const usedExpectations = new Set();

function expectation(name) {
  usedExpectations.add(name);
  return JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, 'api', name), 'utf8'));
}

function resolveCanonicalRef(spec) {
  const [fileAndSchema, subPath] = spec.split('#');
  const [rel, schemaName] = fileAndSchema.split('@');
  let value = JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, rel), 'utf8'));
  if (schemaName) {
    const schema = SCHEMAS[schemaName];
    if (!schema) throw new Error(`unknown schema in canonical ref: ${schemaName}`);
    value = schema.parse(value);
  }
  if (subPath) {
    for (const seg of subPath.split('.')) value = value[/^\d+$/.test(seg) ? Number(seg) : seg];
  }
  return value;
}

function assertMatches(actual, expected, ctx = '$') {
  if (typeof expected === 'string') {
    const m = expected.match(/^<<(.+)>>$/s);
    if (m) {
      const token = m[1];
      if (token === 'string') return assert.equal(typeof actual, 'string', `${ctx}: string`);
      if (token === 'nonempty-string') {
        assert.equal(typeof actual, 'string', `${ctx}: string`);
        return assert.ok(actual.length > 0, `${ctx}: nonempty`);
      }
      if (token === 'number') return assert.equal(typeof actual, 'number', `${ctx}: number`);
      if (token === 'boolean') return assert.equal(typeof actual, 'boolean', `${ctx}: boolean`);
      if (token === 'iso-date') {
        assert.equal(typeof actual, 'string', `${ctx}: string`);
        return assert.ok(
          /^\d{4}-\d{2}-\d{2}T/.test(actual) && !Number.isNaN(Date.parse(actual)),
          `${ctx}: "${actual}" is an ISO date`,
        );
      }
      if (token === 'abs-path') {
        assert.equal(typeof actual, 'string', `${ctx}: string`);
        return assert.ok(path.isAbsolute(actual), `${ctx}: "${actual}" is absolute`);
      }
      if (token.startsWith('contains:')) {
        const needle = token.slice('contains:'.length);
        assert.equal(typeof actual, 'string', `${ctx}: string`);
        return assert.ok(
          actual.includes(needle),
          `${ctx}: "${String(actual).slice(0, 300)}" contains "${needle}"`,
        );
      }
      if (token.startsWith('file:')) {
        const want = fs.readFileSync(path.join(CANONICAL_DIR, token.slice('file:'.length)), 'utf8');
        return assert.equal(actual, want, `${ctx}: matches canonical file ${token.slice(5)}`);
      }
      if (token.startsWith('canonical:')) {
        return assertMatches(actual, resolveCanonicalRef(token.slice('canonical:'.length)), ctx);
      }
      throw new Error(`unknown sentinel ${expected} at ${ctx}`);
    }
    return assert.equal(actual, expected, `${ctx}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${ctx}: array`);
    assert.equal(actual.length, expected.length, `${ctx}: array length`);
    expected.forEach((item, i) => assertMatches(actual[i], item, `${ctx}[${i}]`));
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object' && !Array.isArray(actual), `${ctx}: object`);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), `${ctx}: key set`);
    for (const key of Object.keys(expected)) assertMatches(actual[key], expected[key], `${ctx}.${key}`);
    return;
  }
  assert.deepEqual(actual, expected, ctx);
}

// ---------------------------------------------------------------------------
// Real-bridge bootstrap (pattern: client-log.test.mjs / target-repo.test.mjs)
// ---------------------------------------------------------------------------
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-test-'));
const AURORA = loadCanonical('themes/theme.json', ThemeSchema);
const readCanonicalRaw = (rel) =>
  JSON.parse(fs.readFileSync(path.join(CANONICAL_DIR, rel), 'utf8'));

async function startBridge(extra = {}, distDir) {
  const root = tmp();
  const store = new SessionStore('API matrix', root);
  const logLines = [];
  const bridge = new Bridge(store, {
    discussionRoot: root,
    themes: [AURORA],
    theme: 'aurora',
    models: ['claude-fable-5'],
    defaultModel: 'claude-fable-5',
    engine: 'claude',
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

const getJson = async (bridge, p) => {
  const res = await fetch(`http://127.0.0.1:${bridge.port}${p}`);
  return { status: res.status, contentType: res.headers.get('content-type'), body: await res.json() };
};
const getText = async (bridge, p) => {
  const res = await fetch(`http://127.0.0.1:${bridge.port}${p}`);
  return { status: res.status, contentType: res.headers.get('content-type'), body: await res.text() };
};
const postJson = async (bridge, p, body) => {
  const res = await fetch(`http://127.0.0.1:${bridge.port}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

async function waitFor(predicate, what, timeoutMs = 5000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

// ---------------------------------------------------------------------------
// GET endpoints — 200
// ---------------------------------------------------------------------------
test('GET /api/health → 200 canonical body', async () => {
  const { bridge } = await startBridge();
  try {
    const { status, body } = await getJson(bridge, '/api/health');
    assert.equal(status, 200);
    assertMatches(body, expectation('health-200.json'));
    assert.equal(body.port, bridge.port, 'health reports the real listening port');
    prove('GET /api/health', 200);
  } finally {
    await bridge.stop();
  }
});

test('GET /api/logs → 200 canonical body (attached file + ring)', async () => {
  const logFile = path.join(tmp(), 'bridge.log');
  const { bridge } = await startBridge({
    recentLogs: () => ['line-1', 'line-2'],
    logFile: () => logFile,
  });
  try {
    const { status, body } = await getJson(bridge, '/api/logs');
    assert.equal(status, 200);
    assertMatches(body, expectation('logs-200.json'));
    assert.equal(body.file, logFile);
    prove('GET /api/logs', 200);
  } finally {
    await bridge.stop();
  }
});

test('GET /api/state → 200 canonical StudioState for a fresh thread', async () => {
  const { bridge } = await startBridge();
  try {
    const { status, body } = await getJson(bridge, '/api/state');
    assert.equal(status, 200);
    assertMatches(body, expectation('state-200.json'));
    prove('GET /api/state', 200);
  } finally {
    await bridge.stop();
  }
});

test('GET /api/discussions → 200 canonical summary list (schema-proven elements)', async () => {
  const { bridge } = await startBridge();
  try {
    const { status, body } = await getJson(bridge, '/api/discussions');
    assert.equal(status, 200);
    assertMatches(body, expectation('discussions-200.json'));
    for (const summary of body) DiscussionSummarySchema.parse(summary); // protocol-proven
    prove('GET /api/discussions', 200);
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// POST /api/command — 200 (queued + via-board-response), 400
// ---------------------------------------------------------------------------
test('POST /api/command → 200 queued when no board is waiting', async () => {
  const { bridge } = await startBridge();
  try {
    const { status, body } = await postJson(bridge, '/api/command', {
      command: 'new-brainstorm',
      prompt: 'A glowing mark',
    });
    assert.equal(status, 200);
    assertMatches(body, expectation('command-200-queued.json'));
    assert.deepEqual(bridge.peekCommands(), [
      { command: 'new-brainstorm', prompt: 'A glowing mark', seedNote: undefined },
    ]);
    prove('POST /api/command', 200);
  } finally {
    await bridge.stop();
  }
});

test('POST /api/command → 200 via-board-response when a board awaits (park carries it)', async () => {
  const { bridge } = await startBridge();
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    const wait = bridge.presentAndWait(board, 8000, /* open browser */ false);
    const { status, body } = await postJson(bridge, '/api/command', { command: 'plan-closeout' });
    assert.equal(status, 200);
    assertMatches(body, expectation('command-200-via-board.json'));
    const response = await wait;
    assert.equal(response.boardId, board.id);
    assert.equal(response.action, 'park');
    assert.deepEqual(response.commands, ['plan-closeout']);
    prove('POST /api/command', 200);
  } finally {
    await bridge.stop();
  }
});

test('POST /api/command → 400 on an unknown command (zod refuses)', async () => {
  const { bridge } = await startBridge();
  try {
    const { status, body } = await postJson(bridge, '/api/command', { command: 'rm-rf' });
    assert.equal(status, 400);
    assertMatches(body, expectation('command-400.json'));
    prove('POST /api/command', 400);
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// POST /api/themes — 200, 400 (no writer + invalid)
// ---------------------------------------------------------------------------
test('POST /api/themes → 200 canonical body when a styles writer is attached', async () => {
  const saved = [];
  const { bridge } = await startBridge({
    saveTheme: (theme) => {
      saved.push(theme);
      return [theme];
    },
  });
  try {
    const { status, body } = await postJson(bridge, '/api/themes', {
      theme: readCanonicalRaw('themes/theme.json'),
    });
    assert.equal(status, 200);
    assertMatches(body, expectation('themes-200.json'));
    assert.equal(saved[0].name, 'aurora', 'the writer received the parsed theme');
    prove('POST /api/themes', 200);
  } finally {
    await bridge.stop();
  }
});

test('POST /api/themes → 400 honest no-writer + 400 zod-invalid', async () => {
  const { bridge } = await startBridge(); // no saveTheme attached
  try {
    const noWriter = await postJson(bridge, '/api/themes', {
      theme: readCanonicalRaw('themes/theme.json'),
    });
    assert.equal(noWriter.status, 400);
    assertMatches(noWriter.body, expectation('themes-400-no-writer.json'));

    const invalid = await postJson(bridge, '/api/themes', { theme: { name: 'broken' } });
    assert.equal(invalid.status, 400);
    assertMatches(invalid.body, expectation('themes-400-invalid.json'));
    prove('POST /api/themes', 400);
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// POST /api/session-theme — 200 (set + cleared), 400 (unknown + invalid)
// ---------------------------------------------------------------------------
test('POST /api/session-theme → 200 set and cleared, persisted on the thread', async () => {
  const { bridge, store } = await startBridge();
  try {
    const set = await postJson(bridge, '/api/session-theme', { name: 'aurora' });
    assert.equal(set.status, 200);
    assertMatches(set.body, expectation('session-theme-200-set.json'));
    assert.equal(store.info.theme, 'aurora');

    const cleared = await postJson(bridge, '/api/session-theme', { name: null });
    assert.equal(cleared.status, 200);
    assertMatches(cleared.body, expectation('session-theme-200-cleared.json'));
    assert.equal(store.info.theme, undefined);
    prove('POST /api/session-theme', 200);
  } finally {
    await bridge.stop();
  }
});

test('POST /api/session-theme → 400 unknown theme + 400 zod-invalid', async () => {
  const { bridge } = await startBridge();
  try {
    const unknown = await postJson(bridge, '/api/session-theme', { name: 'nope' });
    assert.equal(unknown.status, 400);
    assertMatches(unknown.body, expectation('session-theme-400-unknown.json'));

    const invalid = await postJson(bridge, '/api/session-theme', { name: 42 });
    assert.equal(invalid.status, 400);
    assertMatches(invalid.body, expectation('session-theme-400-invalid.json'));
    prove('POST /api/session-theme', 400);
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// POST /api/target-repo — 200 (set + cleared), 400 (×3 paths)
// ---------------------------------------------------------------------------
test('POST /api/target-repo → 200 set and cleared (thread scope)', async () => {
  const { bridge, store } = await startBridge();
  try {
    const target = tmp();
    const set = await postJson(bridge, '/api/target-repo', { path: target, scope: 'thread' });
    assert.equal(set.status, 200);
    assertMatches(set.body, expectation('target-repo-200-set.json'));
    assert.equal(set.body.targetRepo, path.resolve(target));
    assert.equal(store.info.targetRepo, path.resolve(target));

    const cleared = await postJson(bridge, '/api/target-repo', { path: null, scope: 'thread' });
    assert.equal(cleared.status, 200);
    assertMatches(cleared.body, expectation('target-repo-200-cleared.json'));
    prove('POST /api/target-repo', 200);
  } finally {
    await bridge.stop();
  }
});

test('POST /api/target-repo → 400: not-a-folder, no default writer, zod-invalid', async () => {
  const { bridge } = await startBridge(); // no setDefaultTargetRepo attached
  try {
    const notFolder = await postJson(bridge, '/api/target-repo', {
      path: path.join(tmp(), 'does-not-exist'),
      scope: 'thread',
    });
    assert.equal(notFolder.status, 400);
    assertMatches(notFolder.body, expectation('target-repo-400-not-a-folder.json'));

    const noWriter = await postJson(bridge, '/api/target-repo', { path: tmp(), scope: 'default' });
    assert.equal(noWriter.status, 400);
    assertMatches(noWriter.body, expectation('target-repo-400-no-default-writer.json'));

    const invalid = await postJson(bridge, '/api/target-repo', { path: tmp(), scope: 'global' });
    assert.equal(invalid.status, 400);
    assertMatches(invalid.body, expectation('target-repo-400-invalid.json'));
    prove('POST /api/target-repo', 400);
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// GET /api/artifact-svg/:slug.svg — 200, 404
// ---------------------------------------------------------------------------
test('GET /api/artifact-svg → 200 serves the captured SVG bytes', async () => {
  const { bridge, store } = await startBridge();
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    store.captureArtifact('Glow Mark', board.options[0].svg, 'canonical capture', {
      boardId: board.id,
      optionIds: [board.options[0].id],
    });
    const { status, contentType, body } = await getText(bridge, '/api/artifact-svg/glow-mark.svg');
    assert.equal(status, 200);
    assertMatches({ contentType, body }, expectation('artifact-svg-200.json'));
    prove('GET /api/artifact-svg/:slug.svg', 200);
  } finally {
    await bridge.stop();
  }
});

test('GET /api/artifact-svg → 404 for an unknown slug', async () => {
  const { bridge } = await startBridge();
  try {
    const { status, body } = await getJson(bridge, '/api/artifact-svg/nope.svg');
    assert.equal(status, 404);
    assertMatches(body, expectation('artifact-svg-404.json'));
    prove('GET /api/artifact-svg/:slug.svg', 404);
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// GET /api/discussions/:id — 200, 404
// ---------------------------------------------------------------------------
test('GET /api/discussions/:id → 200 reloads the live thread from disk', async () => {
  const { bridge, store } = await startBridge();
  try {
    const { status, body } = await getJson(bridge, `/api/discussions/${store.info.id}`);
    assert.equal(status, 200);
    assertMatches(body, expectation('discussion-by-id-200.json'));
    assert.equal(body.session.id, store.info.id);
    prove('GET /api/discussions/:id', 200);
  } finally {
    await bridge.stop();
  }
});

test('GET /api/discussions/:id → 200 artifactChat survives the disk reload (chat.jsonl)', async () => {
  const { bridge, store } = await startBridge();
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    store.captureArtifact('Glow Mark', board.options[0].svg, 'canonical capture', {
      boardId: board.id,
      optionIds: ['a'],
    });
    // Record the chat through the REAL endpoint (persists to artifacts/chat.jsonl)…
    const posted = await postJson(bridge, '/api/artifact-chat', {
      artifactSlug: 'glow-mark',
      text: 'What does the filament symbolize?',
    });
    assert.equal(posted.status, 200);
    // …then reload the thread from disk through the endpoint: the dialog rides along.
    const { status, body } = await getJson(bridge, `/api/discussions/${store.info.id}`);
    assert.equal(status, 200);
    assertMatches(body, expectation('discussion-by-id-200-with-chat.json'));
    prove('GET /api/discussions/:id', 200);
  } finally {
    await bridge.stop();
  }
});

test('GET /api/discussions/:id → 404 for an unknown thread id', async () => {
  const { bridge } = await startBridge();
  try {
    const { status, body } = await getJson(bridge, '/api/discussions/no-such-thread');
    assert.equal(status, 404);
    assertMatches(body, expectation('discussion-by-id-404.json'));
    prove('GET /api/discussions/:id', 404);
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// POST /api/progress — 200, 400
// ---------------------------------------------------------------------------
test('POST /api/progress → 200 records the canonical event on the thread', async () => {
  const { bridge, store } = await startBridge();
  try {
    const event = readCanonicalRaw('threads/progress.json');
    const { status, body } = await postJson(bridge, '/api/progress', event);
    assert.equal(status, 200);
    assertMatches(body, expectation('progress-200.json'));
    assert.deepEqual(store.progress, [ProgressEventSchema.parse(event)]);
    assert.deepEqual(store.tokenTotals(), { input: 1200, output: 900 });
    prove('POST /api/progress', 200);
  } finally {
    await bridge.stop();
  }
});

test('POST /api/progress → 400 when the note is missing (zod refuses)', async () => {
  const { bridge, store } = await startBridge();
  try {
    const { status, body } = await postJson(bridge, '/api/progress', { source: 'orphan' });
    assert.equal(status, 400);
    assertMatches(body, expectation('progress-400.json'));
    assert.deepEqual(store.progress, [], 'nothing recorded');
    prove('POST /api/progress', 400);
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// POST /api/client-log — 200, 400
// ---------------------------------------------------------------------------
test('POST /api/client-log → 200 and the error lands in the bridge log ring', async () => {
  const { bridge, logLines } = await startBridge();
  try {
    const { status, body } = await postJson(bridge, '/api/client-log', {
      source: 'error-boundary',
      message: 'matrix probe',
    });
    assert.equal(status, 200);
    assertMatches(body, expectation('client-log-200.json'));
    assert.ok(
      logLines.some((l) => l.includes('STUDIO CLIENT ERROR [error-boundary]: matrix probe')),
      `log ring carries the client error, got: ${JSON.stringify(logLines)}`,
    );
    prove('POST /api/client-log', 200);
  } finally {
    await bridge.stop();
  }
});

test('POST /api/client-log → 400 when message is missing (zod refuses)', async () => {
  const { bridge } = await startBridge();
  try {
    const { status, body } = await postJson(bridge, '/api/client-log', { source: 's' });
    assert.equal(status, 400);
    assertMatches(body, expectation('client-log-400.json'));
    prove('POST /api/client-log', 400);
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// POST /api/artifact-chat — 200, 400, 404
// ---------------------------------------------------------------------------
test('POST /api/artifact-chat → 200 queued: user message recorded + command queued', async () => {
  const { bridge, store } = await startBridge();
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    store.captureArtifact('Glow Mark', board.options[0].svg, 'canonical capture', {
      boardId: board.id,
      optionIds: ['a'],
    });
    const { status, body } = await postJson(bridge, '/api/artifact-chat', {
      artifactSlug: 'glow-mark',
      text: 'What does the filament symbolize?',
    });
    assert.equal(status, 200);
    assertMatches(body, expectation('artifact-chat-200-queued.json'));
    assert.equal(store.artifactChat.length, 1);
    assert.equal(store.artifactChat[0].role, 'user');
    assert.equal(store.artifactChat[0].artifactSlug, 'glow-mark');
    assert.equal(bridge.peekCommands()[0].command, 'artifact-chat');
    prove('POST /api/artifact-chat', 200);
  } finally {
    await bridge.stop();
  }
});

test('POST /api/artifact-chat → 400 empty text (zod too_small)', async () => {
  const { bridge } = await startBridge();
  try {
    const { status, body } = await postJson(bridge, '/api/artifact-chat', {
      artifactSlug: 'glow-mark',
      text: '',
    });
    assert.equal(status, 400);
    assertMatches(body, expectation('artifact-chat-400.json'));
    prove('POST /api/artifact-chat', 400);
  } finally {
    await bridge.stop();
  }
});

test('POST /api/artifact-chat → 404 for an unknown artifact slug', async () => {
  const { bridge, store } = await startBridge();
  try {
    const { status, body } = await postJson(bridge, '/api/artifact-chat', {
      artifactSlug: 'missing',
      text: 'hello?',
    });
    assert.equal(status, 404);
    assertMatches(body, expectation('artifact-chat-404.json'));
    assert.deepEqual(store.artifactChat, [], 'no message recorded for a missing artifact');
    prove('POST /api/artifact-chat', 404);
  } finally {
    await bridge.stop();
  }
});

test('POST /api/artifact-chat → 200 for an option chat slug (previous-round option)', async () => {
  const { bridge, store } = await startBridge();
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    store.recordBoard(board); // round-01 on disk, incl. option-a.svg
    const slug = optionChatSlug(board.id, 'a');
    const { status, body } = await postJson(bridge, '/api/artifact-chat', {
      artifactSlug: slug,
      text: 'Could the filament read as a spark instead?',
    });
    assert.equal(status, 200);
    assertMatches(body, expectation('artifact-chat-200-queued.json'));
    assert.equal(store.artifactChat.length, 1, 'user message recorded');
    assert.equal(store.artifactChat[0].artifactSlug, slug, 'recorded under the option slug');
    const command = bridge.peekCommands()[0];
    assert.equal(command.command, 'artifact-chat');
    assert.ok(
      command.seedNote.includes(path.join(store.info.dir, 'round-01', 'option-a.svg')),
      `seedNote names the round option SVG path, got: ${command.seedNote}`,
    );
    assert.ok(
      command.seedNote.includes(`artifactSlug "${slug}"`),
      'seedNote pins the reply to the option slug exactly',
    );
    prove('POST /api/artifact-chat', 200);
  } finally {
    await bridge.stop();
  }
});

test('POST /api/artifact-chat → 404 for option slugs with a bad board or bad option id', async () => {
  const { bridge, store } = await startBridge();
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    store.recordBoard(board);
    const badBoard = await postJson(bridge, '/api/artifact-chat', {
      artifactSlug: optionChatSlug('board-nope', 'a'),
      text: 'hello?',
    });
    assert.equal(badBoard.status, 404);
    assertMatches(badBoard.body, expectation('artifact-chat-404-option.json'));
    assert.ok(badBoard.body.error.includes('option:board-nope:a'), 'error names the slug');

    const badOption = await postJson(bridge, '/api/artifact-chat', {
      artifactSlug: optionChatSlug(board.id, 'zzz'),
      text: 'hello?',
    });
    assert.equal(badOption.status, 404);
    assertMatches(badOption.body, expectation('artifact-chat-404-option.json'));

    assert.deepEqual(store.artifactChat, [], 'no message recorded for unknown options');
    prove('POST /api/artifact-chat', 404);
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// POST /api/artifact-notes — 200 (+ WS artifact envelope), 400, 404
// ---------------------------------------------------------------------------
test('POST /api/artifact-notes → 200 rewrites the .json sidecar and broadcasts artifact', async () => {
  const { bridge, store } = await startBridge();
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws`);
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    store.captureArtifact('Glow Mark', board.options[0].svg, 'canonical capture', {
      boardId: board.id,
      optionIds: ['a'],
    });
    const messages = [];
    ws.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data))));
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });
    await waitFor(() => messages.some((m) => m.type === 'hello'), 'ws hello');

    const notes = 'warm filament — keep for the poster';
    const { status, body } = await postJson(bridge, '/api/artifact-notes', {
      artifactSlug: 'glow-mark',
      notes,
    });
    assert.equal(status, 200);
    assertMatches(body, expectation('artifact-notes-200.json'));
    prove('POST /api/artifact-notes', 200);

    // Sidecar rewritten in place on disk (the SVG artwork untouched — rule 7).
    const sidecar = JSON.parse(
      fs.readFileSync(path.join(store.info.dir, 'artifacts', 'glow-mark.json'), 'utf8'),
    );
    assert.equal(sidecar.notes, notes, 'artifacts/glow-mark.json carries the new notes');

    await waitFor(() => messages.some((m) => m.type === 'artifact'), 'artifact broadcast');
    assertMatches(messages.find((m) => m.type === 'artifact'), expectation('ws-artifact.json'));
    prove('WS /ws', 'artifact');
  } finally {
    ws.close();
    await bridge.stop();
  }
});

test('POST /api/artifact-notes → 404 unknown slug, 400 missing notes (zod refuses)', async () => {
  const { bridge, store } = await startBridge();
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    store.captureArtifact('Glow Mark', board.options[0].svg, 'canonical capture', {
      boardId: board.id,
      optionIds: ['a'],
    });
    const missing = await postJson(bridge, '/api/artifact-notes', {
      artifactSlug: 'missing',
      notes: 'orphan',
    });
    assert.equal(missing.status, 404);
    assertMatches(missing.body, expectation('artifact-notes-404.json'));
    prove('POST /api/artifact-notes', 404);

    const invalid = await postJson(bridge, '/api/artifact-notes', { artifactSlug: 'glow-mark' });
    assert.equal(invalid.status, 400);
    assertMatches(invalid.body, expectation('artifact-notes-400.json'));
    prove('POST /api/artifact-notes', 400);

    assert.equal(store.artifacts[0].notes, 'canonical capture', 'rejected posts change nothing');
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// POST /api/respond — 200, 400
// ---------------------------------------------------------------------------
test('POST /api/respond → 200: canonical response resolves the waiting board', async () => {
  const { bridge, store } = await startBridge();
  try {
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    const wait = bridge.presentAndWait(board, 8000, /* open browser */ false);
    const raw = readCanonicalRaw('responses/iterate.json');
    const { status, body } = await postJson(bridge, '/api/respond', raw);
    assert.equal(status, 200);
    assertMatches(body, expectation('respond-200.json'));
    const resolved = await wait;
    assert.deepEqual(resolved, BoardResponseSchema.parse(raw), 'defaults applied, response echoed');
    const onDisk = path.join(store.info.dir, 'round-01', 'response.json');
    assert.ok(fs.existsSync(onDisk), 'response persisted to the thread (rule 7)');
    prove('POST /api/respond', 200);
  } finally {
    await bridge.stop();
  }
});

test('POST /api/respond → 400: zod-invalid shape and non-JSON body', async () => {
  const { bridge } = await startBridge();
  try {
    const invalid = await postJson(bridge, '/api/respond', { notABoardResponse: true });
    assert.equal(invalid.status, 400);
    assertMatches(invalid.body, expectation('respond-400-invalid.json'));

    const garbage = await postJson(bridge, '/api/respond', 'not json {{{');
    assert.equal(garbage.status, 400);
    assertMatches(garbage.body, expectation('respond-400-not-json.json'));
    prove('POST /api/respond', 400);
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// Static studio serving — 200 (file + SPA fallback), 503 (dist missing)
// ---------------------------------------------------------------------------
test('GET / and SPA fallback → 200 canonical index.html from the studio dist', async () => {
  const dist = tmp();
  fs.copyFileSync(path.join(CANONICAL_DIR, 'api', 'studio-index.html'), path.join(dist, 'index.html'));
  const { bridge } = await startBridge({}, dist);
  try {
    const index = await getText(bridge, '/');
    assert.equal(index.status, 200);
    assertMatches({ contentType: index.contentType, body: index.body }, expectation('static-200.json'));

    const fallback = await getText(bridge, '/some/deep/client-route');
    assert.equal(fallback.status, 200);
    assertMatches(
      { contentType: fallback.contentType, body: fallback.body },
      expectation('spa-fallback-200.json'),
    );
    prove('GET /* (static studio)', 200);
  } finally {
    await bridge.stop();
  }
});

test('GET / → 503 honest plain-text when the studio dist is missing', async () => {
  const { bridge } = await startBridge({}, path.join(tmp(), 'missing-dist'));
  try {
    const { status, contentType, body } = await getText(bridge, '/');
    assert.equal(status, 503);
    assertMatches({ contentType, body }, expectation('static-503.json'));
    prove('GET /* (static studio)', 503);
  } finally {
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// WS /ws — hello, responded, malformed (logged), unknown type (ignored)
// ---------------------------------------------------------------------------
test('WS /ws: hello carries canonical state; response resolves + broadcasts responded', async () => {
  const { bridge } = await startBridge();
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws`);
  try {
    const messages = [];
    ws.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data))));
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });
    await waitFor(() => messages.some((m) => m.type === 'hello'), 'ws hello');
    assertMatches(messages.find((m) => m.type === 'hello'), expectation('ws-hello.json'));
    prove('WS /ws', 'hello');

    const board = loadCanonical('boards/diverge.json', BoardSchema);
    const wait = bridge.presentAndWait(board, 8000, /* open browser */ false);
    await waitFor(() => messages.some((m) => m.type === 'board'), 'board broadcast');
    ws.send(JSON.stringify({ type: 'response', response: readCanonicalRaw('responses/iterate.json') }));
    const resolved = await wait;
    assert.equal(resolved?.boardId, board.id, 'the ws response resolved the waiting board');
    await waitFor(() => messages.some((m) => m.type === 'responded'), 'responded broadcast');
    assertMatches(messages.find((m) => m.type === 'responded'), expectation('ws-responded.json'));
    prove('WS /ws', 'responded');
  } finally {
    ws.close();
    await bridge.stop();
  }
});

test('WS /ws: malformed messages are logged, unknown types silently ignored, server survives', async () => {
  const { bridge, logLines } = await startBridge();
  const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}/ws`);
  try {
    const messages = [];
    ws.addEventListener('message', (event) => messages.push(JSON.parse(String(event.data))));
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', reject);
    });
    const badCount = () => logLines.filter((l) => l.includes('bad ws message')).length;

    ws.send('not json {{{');
    await waitFor(() => badCount() === 1, 'garbage logged');
    ws.send(JSON.stringify({ type: 'response', response: {} }));
    await waitFor(() => badCount() === 2, 'invalid response logged');
    prove('WS /ws', 'malformed-logged');

    // Unknown type: processed in order BEFORE the next garbage — when the third
    // "bad ws message" appears, 'bogus' has been consumed without log or broadcast.
    ws.send(JSON.stringify({ type: 'bogus', payload: 1 }));
    ws.send('more garbage }}}');
    await waitFor(() => badCount() === 3, 'trailing garbage logged');
    assert.equal(badCount(), 3, 'unknown type produced no bad-message log');
    assert.ok(!messages.some((m) => m.type === 'responded'), 'nothing was accepted as a response');

    const health = await getJson(bridge, '/api/health');
    assert.equal(health.status, 200, 'the bridge survived the malformed traffic');
    prove('WS /ws', 'unknown-type-ignored');
  } finally {
    ws.close();
    await bridge.stop();
  }
});

// ---------------------------------------------------------------------------
// The gate: coverage table + ZERO UNPROVEN + every canonical expectation used.
// Declared last — node:test runs a file's tests in declaration order.
// ---------------------------------------------------------------------------
test('coverage: endpoint × codes table — ZERO UNPROVEN', () => {
  const missing = [];
  const width = Math.max(...CENSUS.map(([e]) => e.length)) + 2;
  const rows = ['', 'API status matrix — endpoint × proven codes'];
  for (const [endpoint, codes] of CENSUS) {
    const proven = PROVEN.get(endpoint) ?? new Set();
    for (const code of codes) if (!proven.has(code)) missing.push(`${endpoint} → ${code}`);
    for (const code of proven) {
      assert.ok(codes.includes(code), `${endpoint} proved un-censused code ${code} — extend the census`);
    }
    rows.push(`${endpoint.padEnd(width)} ${codes.map((c) => (proven.has(c) ? String(c) : `${c}(UNPROVEN)`)).join(', ')}`);
  }
  console.log(rows.join('\n'));
  assert.deepEqual(missing, [], `unproven endpoint × code pairs: ${missing.join('; ')}`);
  console.log('ZERO UNPROVEN');

  // Stray-expectation guard for tests/canonical/api/: everything on disk was consumed.
  const onDisk = fs
    .readdirSync(path.join(CANONICAL_DIR, 'api'))
    .filter((f) => f.endsWith('.json'))
    .sort();
  assert.deepEqual(
    [...usedExpectations].sort(),
    onDisk,
    'every tests/canonical/api/*.json expectation is consumed by this matrix',
  );
});
