#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function hookValue(payload, snakeCase, camelCase) {
  return payload[snakeCase] ?? payload[camelCase] ?? '';
}

function eventName(value) {
  const normalized = String(value).replace(/[-_]/g, '').toLowerCase();
  if (normalized === 'posttooluse') return 'PostToolUse';
  if (normalized === 'subagentstop') return 'SubagentStop';
  if (normalized === 'stop') return 'Stop';
  return String(value);
}

function normalizedToolName(toolName) {
  const name = String(toolName);
  const product = name.match(
    /^(?:mcp(?:__|_))?(?:visual[-_]brainstorm|visual[-_]brains)(?:__|_|[/.])([\w-]+)$/i,
  );
  return product ? `mcp__visual-brainstorm__${product[1]}` : name;
}

function isFileMutation(toolName) {
  return /write|edit|create|delete|rename|move|replace|insert|apply[_-]?patch/i.test(toolName);
}

function isProgressBoundary(toolName) {
  return (
    /agent|task|subagent/i.test(toolName) ||
    /^mcp__visual[-_]brainstorm__/.test(toolName) ||
    /^visual[-.]brainstorm[/.]/i.test(toolName)
  );
}

export function planHookActions(payload, fallbackEvent = '') {
  const event = eventName(hookValue(payload, 'hook_event_name', 'hookEventName') || fallbackEvent);
  const toolName = normalizedToolName(hookValue(payload, 'tool_name', 'toolName'));
  const postToolUse = event === 'PostToolUse';
  const fileMutation = postToolUse && isFileMutation(toolName);
  return {
    forwardProgress: event === 'SubagentStop' || event === 'Stop' || (postToolUse && isProgressBoundary(toolName)),
    checkAgenticSurface: fileMutation,
    checkCopilotParity: fileMutation,
    event,
    toolName,
  };
}

function childPayload(payload, actions) {
  return {
    ...payload,
    hook_event_name: hookValue(payload, 'hook_event_name', 'hookEventName') || actions.event,
    tool_name: actions.toolName,
  };
}

function run(script, args, payload) {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    input: JSON.stringify(payload),
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  const command = process.argv[2] ?? '';
  const raw = await readStdin();
  let payload = {};
  try {
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    payload = {};
  }
  const fallback = command === 'post-tool-use' ? 'PostToolUse' : command === 'pipe-progress' ? 'Stop' : '';
  const actions = planHookActions(payload, fallback);
  const preparedPayload = childPayload(payload, actions);
  const statuses = [];
  if (actions.forwardProgress) statuses.push(run('pipe-progress.mjs', [], preparedPayload));
  if (actions.checkAgenticSurface) statuses.push(run('check-agentic-surface.mjs', ['--hook'], preparedPayload));
  if (actions.checkCopilotParity) statuses.push(run('check-copilot-parity.mjs', ['--hook'], preparedPayload));
  if (statuses.includes(2)) process.exit(2);
  if (statuses.some((status) => status !== 0)) process.exit(1);
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/copilot-hook.mjs')) {
  await main();
}