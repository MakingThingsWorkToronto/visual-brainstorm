#!/usr/bin/env node
/**
 * Quick Cursor harness demo — proves both MCP servers start and the bridge is live.
 * Run after `npm run build`. Does not fake a brainstorm; just verifies connectivity.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeThenRequest } from '../tests/lib/mcp-stdio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mcpCall(entry, toolName, args = {}) {
  return initializeThenRequest(
    'node',
    [entry],
    ROOT,
    { method: 'tools/call', params: { name: toolName, arguments: args } },
    { timeoutMs: 30_000, clientName: 'cursor-demo' },
  );
}

function parseToolContent(result) {
  const text = result?.content?.find((c) => c.type === 'text')?.text ?? '{}';
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

console.log('Visual Brainstorm — Cursor harness demo\n');

const wikiTools = await mcpCall('apps/wiki-mcp/dist/index.js', 'wiki_search', { query: 'brainstorm phases', limit: 3 });
const wikiParsed = parseToolContent(wikiTools);
// wiki_search returns { results, count } — and this query MUST hit the wiki's
// own phase docs; zero results means the server can't see wiki/ (honest fail,
// rule 6, not a ✓ with 0).
const wikiCount = wikiParsed.count ?? wikiParsed.results?.length ?? 0;
if (!wikiCount) {
  console.error('✗ visual-brainstorm-wiki: wiki_search returned 0 results for a query that must match — is wiki/ visible to the server?');
  process.exit(1);
}
console.log('✓ visual-brainstorm-wiki: wiki_search returned', wikiCount, 'results');

const status = await mcpCall('apps/mcp/dist/index.js', 'session_status', {});
const statusParsed = parseToolContent(status);
console.log('✓ visual-brainstorm: session_status');
console.log('  studio URL:', statusParsed.studioUrl ?? statusParsed.url ?? '(starts on first tool call)');
console.log('  awaiting response:', statusParsed.awaitingResponse ?? false);

const discussions = await mcpCall('apps/mcp/dist/index.js', 'list_discussions', {});
const listParsed = parseToolContent(discussions);
const count = listParsed.discussions?.length ?? listParsed.length ?? 0;
console.log('✓ visual-brainstorm: list_discussions →', count, 'thread(s)');

console.log('\nDemo complete. In Cursor: reload window, verify MCP servers, then type /run-brainstorm.');
