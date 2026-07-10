#!/usr/bin/env node
/**
 * Quick Cursor harness demo — proves both MCP servers start and the bridge is live.
 * Run after `npm run build`. Does not fake a brainstorm; just verifies connectivity.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function mcpCall(entry, toolName, args = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [entry], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const timer = setTimeout(() => finish(new Error('MCP demo timed out')), 30_000);
    let stdout = '';
    let stderr = '';
    let settled = false;
    let step = 0;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(result);
    };

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const lines = stdout.split('\n');
      stdout = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.id === 1 && message.result) {
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
            child.stdin.write(JSON.stringify({
              jsonrpc: '2.0',
              id: 2,
              method: 'tools/call',
              params: { name: toolName, arguments: args },
            }) + '\n');
            continue;
          }
          if (message.id === 2 && message.result) return finish(null, message.result);
          if (message.id === 2 && message.error) return finish(new Error(JSON.stringify(message.error)));
        } catch {
          finish(new Error(`Invalid MCP stdout: ${line}\n${stderr}`));
        }
      }
    });

    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'cursor-demo', version: '1.0.0' },
      },
    }) + '\n');
  });
}

function parseToolContent(result) {
  const text = result?.content?.find((c) => c.type === 'text')?.text ?? '{}';
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

console.log('Visual Brainstorm — Cursor harness demo\n');

const wikiTools = await mcpCall('apps/wiki-mcp/dist/index.js', 'wiki_search', { query: 'brainstorm phases', limit: 3 });
const wikiParsed = parseToolContent(wikiTools);
console.log('✓ visual-brainstorm-wiki: wiki_search returned', wikiParsed.hits?.length ?? 0, 'hits');

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
