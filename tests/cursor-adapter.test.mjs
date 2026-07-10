import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { COPILOT_SERVER_SPECS } from '../scripts/check-copilot-parity.mjs';
import { globMatch } from '../scripts/check-agentic-surface.mjs';
import { initializeThenRequest } from './lib/mcp-stdio.mjs';

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

test('Cursor MCP manifest resolves both servers workspace-absolutely (no unsupported cwd key)', () => {
  const manifest = readJson(path.join(CURSOR_DIR, 'mcp.json'));
  for (const [name, spec] of Object.entries(COPILOT_SERVER_SPECS)) {
    const server = manifest.mcpServers?.[name];
    assert.ok(server, `.cursor/mcp.json declares ${name}`);
    assert.equal(server.type, 'stdio', `${name} is stdio`);
    assert.equal(server.command, 'node', `${name} uses node`);
    // Cursor's mcp.json supports command/args/env (+ ${workspaceFolder}
    // interpolation in values) but NOT a cwd key — entry paths must be
    // interpolated absolute, not workspace-relative-with-cwd.
    assert.deepEqual(server.args, [`\${workspaceFolder}/${spec.entry}`], `${name} entry is workspace-absolute`);
    assert.equal(server.cwd, undefined, `${name} does not rely on the unsupported cwd key`);
  }
  // Spawn cwd is unspecified in Cursor, and the product server resolves its
  // discussion root from cwd — VIBR_HOME pins it to the workspace.
  assert.equal(
    manifest.mcpServers['visual-brainstorm'].env?.VIBR_HOME,
    '${workspaceFolder}/discussion',
    'product server pins its discussion root independent of spawn cwd',
  );
});

test('Cursor hooks use Cursor-native events and matcher syntax', () => {
  const hooks = readText(path.join(CURSOR_DIR, 'hooks.json'));
  assert.doesNotMatch(hooks, /CLAUDE_PROJECT_DIR/);
  assert.match(hooks, /node scripts\/pipe-progress\.mjs/);
  assert.match(hooks, /node scripts\/check-agentic-surface\.mjs --hook/);
  // Cursor matcher syntax is MCP:<tool_name> — a spaced "MCP: <server>"
  // matcher never fires; the edit guard belongs on afterFileEdit (StrReplace
  // is not a Cursor tool type).
  assert.doesNotMatch(hooks, /MCP: /, 'no spaced MCP matcher (never matches in Cursor)');
  assert.doesNotMatch(hooks, /StrReplace/, 'StrReplace is not a Cursor tool type');
  const parsed = JSON.parse(hooks);
  assert.ok(Array.isArray(parsed.hooks.afterFileEdit) && parsed.hooks.afterFileEdit.length > 0, 'edit guard runs on afterFileEdit');
});

test('Cursor commands map to the authoritative registry', () => {
  const claudeRegistry = readJson(CLAUDE_REGISTRY_PATH);
  const cursorRegistry = readJson(CURSOR_REGISTRY_PATH);
  const expectedCommands = claudeRegistry.surfaces
    .filter((s) => s.kind === 'command')
    .map((s) => s.name)
    .filter((name) => !(claudeRegistry.exclusions?.cursor?.commands ?? []).some((p) => globMatch(p, name)))
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
    const result = await initializeThenRequest('node', [spec.entry], ROOT, { method: 'tools/list', params: {} }, {
      clientName: 'cursor-adapter-test',
    });
    const toolNames = result.tools.map((t) => t.name).sort();
    const expected = [...spec.tools].sort();
    assert.deepEqual(toolNames, expected, `${name} tool inventory`);
  }
});
