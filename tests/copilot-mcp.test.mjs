import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  COPILOT_SERVER_SPECS,
  checkCopilotParity,
  shouldCheckHook,
} from '../scripts/check-copilot-parity.mjs';
import { parseHookPayload, planHookActions } from '../scripts/copilot-hook.mjs';
import { initializeThenRequest } from './lib/mcp-stdio.mjs';

const ROOT = process.cwd();

function initializeAndListTools(command, args, cwd, env) {
  return initializeThenRequest(command, args, cwd, { method: 'tools/list', params: {} }, {
    env,
    clientName: 'copilot-mcp-contract-test',
  }).then((result) => result.tools);
}

test('GitHub Copilot MCP manifests, agents, hooks, and authority mirror are in parity', () => {
  const { errors } = checkCopilotParity(ROOT);
  assert.deepEqual(errors, [], `Copilot parity drift:\n${errors.join('\n')}`);
});

test('Both Copilot MCP manifests start their exact tool inventories over real stdio', async () => {
  const manifests = [
    { label: 'VS Code', servers: JSON.parse(fs.readFileSync(path.join(ROOT, '.vscode', 'mcp.json'), 'utf8')).servers },
    { label: 'GitHub', servers: JSON.parse(fs.readFileSync(path.join(ROOT, '.github', 'mcp.json'), 'utf8')).mcpServers },
  ];
  for (const manifest of manifests) {
    for (const [name, spec] of Object.entries(COPILOT_SERVER_SPECS)) {
      const server = manifest.servers[name];
      assert.equal(server.command, 'node');
      assert.deepEqual(server.args, [spec.entry]);
      if (manifest.label === 'VS Code') assert.equal(server.cwd, '${workspaceFolder}');
      const tools = await initializeAndListTools(server.command, server.args, ROOT, server.env);
      assert.deepEqual(
        tools.map((tool) => tool.name).sort(),
        [...spec.tools].sort(),
        `${manifest.label} ${name} exposes its declared tools`,
      );
    }
  }
});

test('GitHub-hosted product MCP refuses every runner-local interactive studio tool', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.github', 'mcp.json'), 'utf8'));
  const server = manifest.mcpServers['visual-brainstorm'];
  assert.deepEqual(server.env, { VIBR_COPILOT_HOSTED: '1' });
  const interactiveCalls = [
    { name: 'open_studio', arguments: { timeoutSeconds: 10 } },
    { name: 'ask_concierge', arguments: { question: 'Who is this for?', timeoutSeconds: 10 } },
    {
      name: 'present_gallery',
      arguments: {
        cards: [
          { method: 'mindmap', label: 'Mind map', svg: '<svg viewBox="0 0 1 1" />' },
          { method: 'funnel', label: 'Funnel', svg: '<svg viewBox="0 0 1 1" />' },
        ],
        timeoutSeconds: 10,
      },
    },
    { name: 'present_board', arguments: { title: 'Hosted board', prompt: 'Not reachable', timeoutSeconds: 10 } },
  ];

  for (const call of interactiveCalls) {
    const result = await initializeThenRequest(
      server.command,
      server.args,
      ROOT,
      { method: 'tools/call', params: call },
      { env: server.env, clientName: 'copilot-mcp-contract-test' },
    );
    const response = JSON.parse(result.content[0].text);
    assert.equal(response.status, 'unsupported-host', `${call.name} is refused before bridge startup`);
    assert.match(response.hint, /local VS Code Copilot Chat/);
  }
});

test('Copilot mirror guard only evaluates authority or adapter changes', () => {
  assert.equal(shouldCheckHook({ tool_input: { filePath: 'apps/mcp/src/index.ts' } }), false);
  assert.equal(shouldCheckHook({ tool_input: { filePath: 'CLAUDE.md' } }), true);
  assert.equal(shouldCheckHook({ tool_input: { filePath: 'claude.md' } }), true);
  // Absolute paths derive from the ACTUAL checkout root — a literal
  // C:\Code\svgbrainstorm coupling failed on any other machine, including the
  // ubuntu runner this same repo's copilot-setup-steps workflow uses. On POSIX
  // this also covers the drive-letter guard fix (a rooted /… in-workspace path
  // must still be relevant).
  assert.equal(shouldCheckHook({ tool_input: { filePath: path.join(ROOT, 'AGENTS.md') } }), true);
  assert.equal(shouldCheckHook({ tool_input: { filePath: path.resolve(ROOT, '..', 'vibr-outside', 'AGENTS.md') } }), false);
  assert.equal(shouldCheckHook({ tool_input: { filePath: 'C:\\outside\\AGENTS.md' } }), false);
  assert.equal(shouldCheckHook({ tool_input: { filePath: 'apps/wiki-mcp/CLAUDE.md' } }), false);
  assert.equal(shouldCheckHook({ tool_input: { filePaths: ['.vscode/mcp.json'] } }), true);
  assert.equal(shouldCheckHook({ tool_input: { input: '*** Update File: .github/mcp.json\n' } }), true);
  assert.equal(shouldCheckHook({ tool_input: { filePath: '.github/copilot-instructions.md' } }), true);
});

test('Copilot native hook dispatcher preserves the Claude hook outcomes', () => {
  const productMcp = planHookActions({ hook_event_name: 'PostToolUse', tool_name: 'visual-brainstorm/present_board' });
  assert.equal(productMcp.forwardProgress, true);
  assert.equal(productMcp.checkAgenticSurface, false);

  const vscodeMcp = planHookActions({ hookEventName: 'PostToolUse', toolName: 'mcp_visual_brainstorm_present_board' });
  assert.equal(vscodeMcp.forwardProgress, true);
  assert.equal(vscodeMcp.toolName, 'mcp__visual-brainstorm__present_board');

  const sourceEdit = planHookActions({ hook_event_name: 'PostToolUse', tool_name: 'replace_string_in_file' });
  assert.equal(sourceEdit.forwardProgress, false);
  assert.equal(sourceEdit.checkAgenticSurface, true);
  assert.equal(sourceEdit.checkCopilotParity, true);

  const malformedPayload = planHookActions({}, 'PostToolUse', { conservative: true });
  assert.equal(malformedPayload.checkAgenticSurface, true);
  assert.equal(malformedPayload.checkCopilotParity, true);
  assert.equal(malformedPayload.forceFullParity, true);

  for (const raw of ['', '{}', 'null', '{not json}', '{"tool_name":"replace_string_in_file"}']) {
    const parsed = parseHookPayload(raw, 'post-tool-use');
    assert.equal(parsed.conservative, raw !== '{"tool_name":"replace_string_in_file"}');
  }

  const stop = planHookActions({ hook_event_name: 'SubagentStop' });
  assert.equal(stop.forwardProgress, true);
});

test('Copilot hook wrapper runs safely for malformed and normal PostToolUse payloads', () => {
  for (const raw of ['{}', 'null', '{not json}', '{"tool_name":"replace_string_in_file"}']) {
    const result = spawnSync(process.execPath, ['scripts/copilot-hook.mjs', 'post-tool-use'], {
      cwd: ROOT,
      input: raw,
      encoding: 'utf8',
      timeout: 15_000,
      windowsHide: true,
    });
    assert.equal(result.status, 0, `${raw} should not bypass or crash the hook wrapper: ${result.stderr}`);
  }
});