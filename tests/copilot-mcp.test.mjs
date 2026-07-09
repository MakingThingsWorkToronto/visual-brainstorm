import { spawn } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  COPILOT_SERVER_SPECS,
  checkCopilotParity,
  shouldCheckHook,
} from '../scripts/check-copilot-parity.mjs';
import { planHookActions } from '../scripts/copilot-hook.mjs';

const ROOT = process.cwd();

function initialize(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    // 15s, not 5s: a cold node spawn + MCP handshake takes >5s under concurrent
    // sessions' load (observed 6.9s standalone) — 5s flaked in full-suite runs.
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
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const lines = stdout.split('\n');
      stdout = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          if (message.id === 1 && message.result) return finish(null, message.result);
          if (message.id === 1 && message.error) return finish(new Error(JSON.stringify(message.error)));
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
          clientInfo: { name: 'copilot-mcp-contract-test', version: '1.0.0' },
        },
      }) + '\n',
    );
  });
}

test('GitHub Copilot MCP manifests, agents, hooks, and authority mirror are in parity', () => {
  const { errors } = checkCopilotParity(ROOT);
  assert.deepEqual(errors, [], `Copilot parity drift:\n${errors.join('\n')}`);
});

test('VS Code manifest starts both configured MCP servers over real stdio', async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, '.vscode', 'mcp.json'), 'utf8'));
  for (const [name, spec] of Object.entries(COPILOT_SERVER_SPECS)) {
    const server = manifest.servers[name];
    assert.equal(server.command, 'node');
    assert.deepEqual(server.args, [spec.entry]);
    assert.equal(server.cwd, '${workspaceFolder}');
    const result = await initialize(server.command, server.args, ROOT);
    assert.equal(typeof result.protocolVersion, 'string', `${name} negotiated an MCP protocol version`);
    assert.equal(typeof result.serverInfo?.name, 'string', `${name} identified itself`);
  }
});

test('Copilot mirror guard only evaluates authority or adapter changes', () => {
  assert.equal(shouldCheckHook({ tool_input: { filePath: 'apps/mcp/src/index.ts' } }), false);
  assert.equal(shouldCheckHook({ tool_input: { filePath: 'CLAUDE.md' } }), true);
  assert.equal(shouldCheckHook({ tool_input: { filePath: 'C:\\Code\\svgbrainstorm\\AGENTS.md' } }), true);
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

  const stop = planHookActions({ hook_event_name: 'SubagentStop' });
  assert.equal(stop.forwardProgress, true);
});