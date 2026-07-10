#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const COPILOT_SERVER_SPECS = Object.freeze({
  'visual-brainstorm': {
    entry: 'apps/mcp/dist/index.js',
    hostedEnv: { VIBR_COPILOT_HOSTED: '1' },
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
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    new Set(actual).size === expected.length &&
    expected.every((value) => actual.includes(value))
  );
}

function checkServer(
  server,
  spec,
  label,
  errors,
  { requireCwd = false, requireTools = false, requireType = false, requireHostedEnv = false, forbidHostedEnv = false } = {},
) {
  if (!server || typeof server !== 'object') {
    errors.push(`${label} is missing its server definition.`);
    return;
  }
  if ((requireType && server.type !== 'stdio') || (!requireType && server.type && server.type !== 'stdio')) {
    errors.push(`${label} must use stdio transport.`);
  }
  if (server.command !== 'node') errors.push(`${label} must start with node.`);
  if (!sameValues(server.args, [spec.entry])) errors.push(`${label} must use ${spec.entry}.`);
  if (requireCwd && server.cwd !== '${workspaceFolder}') errors.push(`${label} must run from \${workspaceFolder}.`);
  if (requireTools && !sameValues(server.tools, spec.tools)) errors.push(`${label} must allowlist its exact MCP tools.`);
  if (requireHostedEnv && server.env?.VIBR_COPILOT_HOSTED !== '1') {
    errors.push(`${label} must enable the hosted interactive-tool guard.`);
  }
  if (forbidHostedEnv && server.env?.VIBR_COPILOT_HOSTED !== undefined) {
    errors.push(`${label} must leave the local interactive route enabled.`);
  }
}

function checkAgentMcp(root, errors) {
  const agentsDir = path.join(root, '.github', 'agents');
  for (const [agentName, servers] of Object.entries(AGENT_SERVER_REQUIREMENTS)) {
    const agent = readText(path.join(agentsDir, `${agentName}.agent.md`), errors);
    if (!agent) continue;
    const normalizedAgent = agent.replace(/\r\n/g, '\n');
    const frontmatter = normalizedAgent.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatter) {
      errors.push(`${agentName} must have YAML frontmatter.`);
      continue;
    }
    if (frontmatter[1].includes('\t')) errors.push(`${agentName} frontmatter must not contain tab indentation.`);
    if (!agent.includes('mcp-servers:')) errors.push(`${agentName} must declare GitHub Copilot MCP servers.`);
    const topLevelTools = (frontmatter[1].match(/^tools:\s*\[([^\]]*)\]$/m)?.[1] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    for (const serverName of servers) {
      const spec = COPILOT_SERVER_SPECS[serverName];
      const lines = frontmatter[1].split('\n');
      const start = lines.findIndex((line) => line === `  ${serverName}:`);
      const block = [];
      for (let index = start; index >= 0 && index < lines.length; index++) {
        if (index > start && /^  \S.*:$/.test(lines[index])) break;
        block.push(lines[index]);
      }
      const declaration = [`  ${serverName}:`, '    type: stdio', '    command: node', `    args: [${spec.entry}]`];
      if (spec.hostedEnv) declaration.push('    env:', '      VIBR_COPILOT_HOSTED: "1"');
      if (!declaration.every((line) => block.includes(line))) {
        errors.push(`${agentName} must declare ${serverName} with its shared entry point.`);
      }
      const toolNames = block
        .map((line) => line.match(/^      - (.+)$/)?.[1])
        .filter(Boolean);
      if (!sameValues(toolNames, spec.tools)) errors.push(`${agentName} must allow exactly its ${serverName} tools.`);
      if (!topLevelTools.includes(`${serverName}/*`)) {
        errors.push(`${agentName} must expose ${serverName} tools to Copilot.`);
      }
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
  for (const required of [
    'copilot-setup-steps:',
    'actions/setup-node@v4',
    'node-version: "20"',
    'npm ci',
    'npm run build',
    'npm run check:copilot-parity',
    'node --test tests/copilot-mcp.test.mjs',
    'node --test tests/copilot-adapter.test.mjs',
    'tests/copilot-adapter.test.mjs',
  ]) {
    if (!workflow.includes(required)) errors.push(`Copilot setup workflow must include ${required}.`);
  }
}

export function checkCopilotParity(root = ROOT) {
  const errors = [];
  const rootManifest = readJson(path.join(root, '.mcp.json'), errors);
  const vscodeManifest = readJson(path.join(root, '.vscode', 'mcp.json'), errors);
  const githubManifest = readJson(path.join(root, '.github', 'mcp.json'), errors);

  for (const [name, spec] of Object.entries(COPILOT_SERVER_SPECS)) {
    checkServer(rootManifest?.mcpServers?.[name], spec, `.mcp.json:${name}`, errors, {
      forbidHostedEnv: Boolean(spec.hostedEnv),
    });
    checkServer(vscodeManifest?.servers?.[name], spec, `.vscode/mcp.json:${name}`, errors, {
      requireCwd: true,
      requireType: true,
      forbidHostedEnv: Boolean(spec.hostedEnv),
    });
    checkServer(githubManifest?.mcpServers?.[name], spec, `.github/mcp.json:${name}`, errors, {
      requireTools: true,
      requireType: true,
      requireHostedEnv: Boolean(spec.hostedEnv),
    });
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

export function workspaceRelativePath(filePath, root = ROOT) {
  let candidate = String(filePath).trim();
  if (!candidate) return null;
  if (/^file:/i.test(candidate)) {
    try {
      candidate = fileURLToPath(candidate);
    } catch {
      return null;
    }
  }
  if (path.win32.isAbsolute(candidate) && process.platform !== 'win32') return null;
  const absolute = path.isAbsolute(candidate) || path.win32.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(root, candidate);
  const relative = path.relative(path.resolve(root), absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return relative.replace(/\\/g, '/').toLowerCase();
}

export function isCopilotRelevantPath(filePath, root = ROOT) {
  const normalized = workspaceRelativePath(filePath, root);
  if (!normalized) return false;
  return (
    normalized === 'claude.md' ||
    normalized === 'agents.md' ||
    normalized.startsWith('.github/') ||
    normalized.startsWith('.vscode/')
  );
}

export function shouldCheckHook(payload, root = ROOT) {
  const paths = hookPaths(payload);
  return paths.some((filePath) => isCopilotRelevantPath(filePath, root));
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