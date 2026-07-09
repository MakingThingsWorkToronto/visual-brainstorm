#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const COPILOT_SERVER_SPECS = Object.freeze({
  'visual-brainstorm': {
    entry: 'apps/mcp/dist/index.js',
    tools: [
      'present_board',
      'open_studio',
      'ask_concierge',
      'present_gallery',
      'peek_response',
      'capture_artifact',
      'reply_artifact_chat',
      'compose_poster',
      'list_discussions',
      'load_discussion',
      'session_status',
    ],
  },
  'visual-brainstorm-wiki': {
    entry: 'apps/wiki-mcp/dist/index.js',
    tools: ['wiki_search', 'wiki_outline', 'wiki_read', 'wiki_list', 'wiki_toc', 'wiki_related', 'wiki_reload'],
  },
});

const AGENT_SERVER_REQUIREMENTS = {
  'brainstorm-orchestrator': ['visual-brainstorm', 'visual-brainstorm-wiki'],
  'devops-diagnostician': ['visual-brainstorm'],
  'wiki-librarian': ['visual-brainstorm-wiki'],
};

function readText(filePath, errors) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    errors.push(`Missing required file ${path.relative(ROOT, filePath)}: ${String(error)}`);
    return '';
  }
}

function readJson(filePath, errors) {
  const text = readText(filePath, errors);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`Invalid JSON in ${path.relative(ROOT, filePath)}: ${String(error)}`);
    return null;
  }
}

function sameValues(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length && actual.every((value) => expected.includes(value));
}

function checkServer(server, spec, label, errors, { requireCwd = false, requireTools = false } = {}) {
  if (!server || typeof server !== 'object') {
    errors.push(`${label} is missing its server definition.`);
    return;
  }
  if (server.type && server.type !== 'stdio') errors.push(`${label} must use stdio transport.`);
  if (server.command !== 'node') errors.push(`${label} must start with node.`);
  if (!sameValues(server.args, [spec.entry])) errors.push(`${label} must use ${spec.entry}.`);
  if (requireCwd && server.cwd !== '${workspaceFolder}') errors.push(`${label} must run from \${workspaceFolder}.`);
  if (requireTools && !sameValues(server.tools, spec.tools)) errors.push(`${label} must allowlist its exact MCP tools.`);
}

function checkAgentMcp(root, errors) {
  const agentsDir = path.join(root, '.github', 'agents');
  for (const [agentName, servers] of Object.entries(AGENT_SERVER_REQUIREMENTS)) {
    const agent = readText(path.join(agentsDir, `${agentName}.agent.md`), errors);
    if (!agent) continue;
    const normalizedAgent = agent.replace(/\r\n/g, '\n');
    if (!agent.includes('mcp-servers:')) errors.push(`${agentName} must declare GitHub Copilot MCP servers.`);
    for (const serverName of servers) {
      const spec = COPILOT_SERVER_SPECS[serverName];
      const declaration = `  ${serverName}:\n    type: stdio\n    command: node\n    args: [${spec.entry}]`;
      if (!normalizedAgent.includes(declaration)) {
        errors.push(`${agentName} must declare ${serverName} with its shared entry point.`);
      }
      if (!agent.includes(`${serverName}/*`)) errors.push(`${agentName} must allow its ${serverName} tools.`);
    }
  }
}

function checkHooks(root, errors) {
  const settings = readJson(path.join(root, '.vscode', 'settings.json'), errors);
  const locations = settings?.['chat.hookFilesLocations'];
  if (locations?.['.github/hooks'] !== true) errors.push('VS Code must load .github/hooks.');
  if (locations?.['.claude/settings.json'] !== false) {
    errors.push('VS Code must disable automatic .claude/settings.json loading to avoid duplicate hook execution.');
  }

  const hookFile = readJson(path.join(root, '.github', 'hooks', 'visual-brainstorm.json'), errors);
  const hooks = hookFile?.hooks;
  const hasCommand = (event, command) =>
    Array.isArray(hooks?.[event]) && hooks[event].some((hook) => hook.type === 'command' && hook.command === command);
  if (!hasCommand('PostToolUse', 'node scripts/copilot-hook.mjs post-tool-use')) {
    errors.push('GitHub Copilot PostToolUse hook must dispatch the native parity wrapper.');
  }
  if (!hasCommand('SubagentStop', 'node scripts/copilot-hook.mjs pipe-progress')) {
    errors.push('GitHub Copilot SubagentStop hook must forward progress.');
  }
  if (!hasCommand('Stop', 'node scripts/copilot-hook.mjs pipe-progress')) {
    errors.push('GitHub Copilot Stop hook must forward progress.');
  }
}

function checkInstructions(root, errors) {
  const instructions = readText(path.join(root, '.github', 'copilot-instructions.md'), errors);
  for (const required of [
    '[CLAUDE.md](../CLAUDE.md)',
    '[AGENTS.md](../AGENTS.md)',
    '## Authority Mirror',
    '.vscode/mcp.json',
    '.github/mcp.json',
    'GitHub-hosted Copilot',
  ]) {
    if (!instructions.includes(required)) errors.push(`Copilot instructions must include ${required}.`);
  }
}

function checkWorkflow(root, errors) {
  const workflow = readText(path.join(root, '.github', 'workflows', 'copilot-setup-steps.yml'), errors);
  for (const required of ['copilot-setup-steps:', 'actions/setup-node@v4', 'node-version: "20"', 'npm ci', 'npm run build']) {
    if (!workflow.includes(required)) errors.push(`Copilot setup workflow must include ${required}.`);
  }
}

export function checkCopilotParity(root = ROOT) {
  const errors = [];
  const rootManifest = readJson(path.join(root, '.mcp.json'), errors);
  const vscodeManifest = readJson(path.join(root, '.vscode', 'mcp.json'), errors);
  const githubManifest = readJson(path.join(root, '.github', 'mcp.json'), errors);

  for (const [name, spec] of Object.entries(COPILOT_SERVER_SPECS)) {
    checkServer(rootManifest?.mcpServers?.[name], spec, `.mcp.json:${name}`, errors);
    checkServer(vscodeManifest?.servers?.[name], spec, `.vscode/mcp.json:${name}`, errors, { requireCwd: true });
    checkServer(githubManifest?.mcpServers?.[name], spec, `.github/mcp.json:${name}`, errors, { requireTools: true });
  }

  checkAgentMcp(root, errors);
  checkHooks(root, errors);
  checkInstructions(root, errors);
  checkWorkflow(root, errors);
  return { errors };
}

export function hookPaths(payload) {
  const paths = new Set();
  const addPatchPaths = (text) => {
    for (const match of text.matchAll(/^\*\*\* (?:Update|Add|Delete) File:\s*(.+?)\s*$/gm)) {
      paths.add(match[1]);
    }
  };
  const visit = (value, key = '') => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item, key);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) visit(childValue, childKey);
      return;
    }
    if (typeof value !== 'string') return;
    if (/(?:paths?|files?|uris?|targets?|sources?)$/i.test(key)) paths.add(value);
    if (/(?:input|patch|diff)$/i.test(key)) addPatchPaths(value);
  };
  visit(payload);
  return [...paths];
}

export function isCopilotRelevantPath(filePath) {
  const normalized = String(filePath).replace(/^file:\/+/i, '').replace(/\\/g, '/');
  return (
    normalized === 'CLAUDE.md' ||
    normalized === 'AGENTS.md' ||
    normalized.endsWith('/CLAUDE.md') ||
    normalized.endsWith('/AGENTS.md') ||
    normalized.startsWith('.github/') ||
    normalized.startsWith('.vscode/') ||
    normalized.includes('/.github/') ||
    normalized.includes('/.vscode/')
  );
}

export function shouldCheckHook(payload) {
  const paths = hookPaths(payload);
  return paths.some(isCopilotRelevantPath);
}

async function readStdin() {
  if (process.stdin.isTTY) return '';
  let data = '';
  for await (const chunk of process.stdin) data += chunk;
  return data;
}

async function main() {
  if (process.argv.includes('--hook')) {
    const raw = await readStdin();
    if (raw.trim()) {
      try {
        if (!shouldCheckHook(JSON.parse(raw))) return;
      } catch {
        // An unknown hook payload is conservatively checked rather than silently skipped.
      }
    }
  }
  const { errors } = checkCopilotParity();
  for (const error of errors) console.error(`✖ ${error}`);
  if (errors.length) {
    console.error(`copilot parity guard: ${errors.length} error(s).`);
    process.exit(2);
  }
  if (!process.argv.includes('--hook')) console.error('copilot parity guard: OK.');
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/check-copilot-parity.mjs')) {
  await main();
}