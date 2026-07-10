import { spawn } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { COPILOT_SERVER_SPECS } from '../scripts/check-copilot-parity.mjs';

const ROOT = process.cwd();
const CURSOR_DIR = path.join(ROOT, '.cursor');
const CLAUDE_REGISTRY_PATH = path.join(ROOT, '.claude', 'agentic-surface-registry.json');
const CURSOR_REGISTRY_PATH = path.join(CURSOR_DIR, 'agentic-surface-registry.json');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function initializeThenRequest(command, args, cwd, request) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const timer = setTimeout(() => finish(new Error(`MCP initialize timed out for ${args.join(' ')}`)), 15_000);
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(result);
    };

    child.once('error', (error) => finish(error));
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
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: request.method, params: request.params }) + '\n');
            continue;
          }
          if (message.id === 1 && message.error) return finish(new Error(JSON.stringify(message.error)));
          if (message.id === 2 && message.result) return finish(null, message.result);
          if (message.id === 2 && message.error) return finish(new Error(JSON.stringify(message.error)));
        } catch {
          finish(new Error(`Invalid MCP stdout from ${args.join(' ')}: ${line}\n${stderr}`));
        }
      }
    });
    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'cursor-adapter-test', version: '1.0.0' },
        },
      }) + '\n',
    );
  });
}

test('Cursor MCP manifest starts repo servers from the project root', () => {
  const manifest = readJson(path.join(CURSOR_DIR, 'mcp.json'));
  for (const [name, spec] of Object.entries(COPILOT_SERVER_SPECS)) {
    const server = manifest.mcpServers?.[name];
    assert.ok(server, `.cursor/mcp.json declares ${name}`);
    assert.equal(server.command, 'node', `${name} uses node`);
    assert.deepEqual(server.args, [spec.entry], `${name} uses ${spec.entry}`);
    assert.equal(server.cwd, '${workspaceFolder}', `${name} runs from workspace root`);
  }
});

test('Cursor hooks do not depend on Claude-specific environment variables', () => {
  const hooks = readText(path.join(CURSOR_DIR, 'hooks.json'));
  assert.doesNotMatch(hooks, /CLAUDE_PROJECT_DIR/);
  assert.match(hooks, /node scripts\/pipe-progress\.mjs/);
  assert.match(hooks, /node scripts\/check-agentic-surface\.mjs --hook/);
});

test('Cursor commands map to the authoritative registry', () => {
  const claudeRegistry = readJson(CLAUDE_REGISTRY_PATH);
  const cursorRegistry = readJson(CURSOR_REGISTRY_PATH);
  const expectedCommands = claudeRegistry.surfaces
    .filter((s) => s.kind === 'command')
    .map((s) => s.name)
    .filter((name) => !(claudeRegistry.exclusions?.copilot?.commands ?? []).some((p) => {
      if (p.includes('*')) return new RegExp(`^${p.replace(/\*/g, '.*')}$`).test(name);
      return p === name;
    }))
    .sort();
  const cursorCommands = cursorRegistry.commands.map((c) => c.name).sort();
  assert.deepEqual(cursorCommands, expectedCommands);
  for (const cmd of cursorRegistry.commands) {
    assert.ok(fs.existsSync(path.join(ROOT, cmd.cursorCommand)), `${cmd.name} has ${cmd.cursorCommand}`);
  }
});

test('Cursor agents mirror the authoritative agent roster', () => {
  const claudeRegistry = readJson(CLAUDE_REGISTRY_PATH);
  const cursorRegistry = readJson(CURSOR_REGISTRY_PATH);
  const expectedAgents = claudeRegistry.surfaces.filter((s) => s.kind === 'agent').map((s) => s.name).sort();
  const cursorAgents = cursorRegistry.agents.map((a) => a.name).sort();
  assert.deepEqual(cursorAgents, expectedAgents);
});

test('Cursor MCP servers initialize with expected tool inventories', async () => {
  for (const [name, spec] of Object.entries(COPILOT_SERVER_SPECS)) {
    const result = await initializeThenRequest('node', [spec.entry], ROOT, { method: 'tools/list', params: {} });
    const toolNames = result.tools.map((t) => t.name).sort();
    const expected = [...spec.tools].sort();
    assert.deepEqual(toolNames, expected, `${name} tool inventory`);
  }
});
