#!/usr/bin/env node
/**
 * Deterministic Codex adapter parity guard (no model — rule 11 keeps harness code dumb).
 *
 * The Codex layer (`.codex/` + `.agents/skills/`) is a thin adapter over the authoritative
 * `.claude/` workflow layer (wiki/System/harness-codex.md). This guard rejects a drifted
 * adapter: MCP config not starting from the project root, Claude-specific hook environment
 * variables, agent TOMLs that redeclare workflow logic instead of pointing back to their
 * authoritative `.claude/agents` file, and a `.agents/skills` mirror that is not byte-exact
 * with `.claude/skills`.
 *
 * Mirrors scripts/check-copilot-parity.mjs: CLI run reports OK/errors; `--hook` mode reads
 * the hook payload from stdin and only checks when an edited path is Codex-relevant.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hookPaths, workspaceRelativePath } from './check-copilot-parity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CODEX_MCP_SERVERS = Object.freeze({
  'visual-brainstorm': 'apps/mcp/dist/index.js',
  'visual-brainstorm-wiki': 'apps/wiki-mcp/dist/index.js',
});

const CODEX_HOOK_COMMANDS = Object.freeze([
  'node scripts/pipe-progress.mjs',
  'node scripts/check-agentic-surface.mjs --hook',
  'node scripts/check-copilot-parity.mjs --hook',
  'node scripts/check-codex-parity.mjs --hook',
]);

function readText(filePath, errors) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    errors.push(`Missing required file ${path.relative(ROOT, filePath)}: ${String(error)}`);
    return '';
  }
}

function checkConfig(root, errors) {
  const config = readText(path.join(root, '.codex', 'config.toml'), errors);
  if (!config) return;
  for (const [server, entry] of Object.entries(CODEX_MCP_SERVERS)) {
    const table = config.match(new RegExp(`\\[mcp_servers\\.${server}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
    if (!table) {
      errors.push(`.codex/config.toml must declare [mcp_servers.${server}].`);
      continue;
    }
    if (!/command = "node"/.test(table[1])) errors.push(`.codex/config.toml:${server} must start with node.`);
    if (!/cwd = "\.\."/.test(table[1])) errors.push(`.codex/config.toml:${server} must run from the project root (cwd = "..").`);
    if (!table[1].includes(`"${entry}"`)) errors.push(`.codex/config.toml:${server} must use ${entry}.`);
  }
}

function checkHooks(root, errors) {
  const hooks = readText(path.join(root, '.codex', 'hooks.json'), errors);
  if (!hooks) return;
  try {
    JSON.parse(hooks);
  } catch (error) {
    errors.push(`Invalid JSON in .codex/hooks.json: ${String(error)}`);
    return;
  }
  if (/CLAUDE_/.test(hooks)) {
    errors.push('.codex/hooks.json must not depend on Claude-specific environment variables (CLAUDE_*).');
  }
  for (const command of CODEX_HOOK_COMMANDS) {
    if (!hooks.includes(command)) errors.push(`.codex/hooks.json must run "${command}".`);
  }
}

function checkAgents(root, errors) {
  const registry = JSON.parse(readText(path.join(root, '.claude', 'agentic-surface-registry.json'), errors) || '{"surfaces":[]}');
  const expected = registry.surfaces.filter((s) => s.kind === 'agent').map((s) => s.name).sort();
  const agentsDir = path.join(root, '.codex', 'agents');
  const onDisk = fs.existsSync(agentsDir)
    ? fs.readdirSync(agentsDir).filter((f) => f.endsWith('.toml')).map((f) => f.replace(/\.toml$/, '')).sort()
    : [];
  if (JSON.stringify(onDisk) !== JSON.stringify(expected)) {
    errors.push(`.codex/agents must adapt exactly the registry agent roster (expected ${expected.join(', ')}; found ${onDisk.join(', ') || 'none'}).`);
  }
  for (const agent of onDisk) {
    const text = readText(path.join(agentsDir, `${agent}.toml`), errors);
    if (!text) continue;
    if (/\.Codex\//.test(text)) errors.push(`.codex/agents/${agent}.toml references a nonexistent .Codex path.`);
    if (!text.includes(`name = "${agent}"`)) errors.push(`.codex/agents/${agent}.toml must declare name = "${agent}".`);
    if (!text.includes(`.claude/agents/${agent}.md`)) {
      errors.push(
        `.codex/agents/${agent}.toml must point back to its authoritative .claude/agents/${agent}.md ` +
          '(thin pointer wrapper — never a copied body).',
      );
    }
  }
}

function checkSkillsMirror(root, errors) {
  const claudeDir = path.join(root, '.claude', 'skills');
  const codexDir = path.join(root, '.agents', 'skills');
  const listSkillFiles = (dir) => {
    if (!fs.existsSync(dir)) return [];
    const files = [];
    for (const skill of fs.readdirSync(dir)) {
      const skillDir = path.join(dir, skill);
      if (!fs.statSync(skillDir).isDirectory()) continue;
      for (const file of fs.readdirSync(skillDir)) {
        if (file.endsWith('.md')) files.push(`${skill}/${file}`);
      }
    }
    return files.sort();
  };
  const claudeFiles = listSkillFiles(claudeDir);
  const codexFiles = listSkillFiles(codexDir);
  if (JSON.stringify(claudeFiles) !== JSON.stringify(codexFiles)) {
    errors.push(
      `.agents/skills must mirror .claude/skills file-for-file (authoritative: ${claudeFiles.join(', ')}; mirror: ${codexFiles.join(', ') || 'none'}).`,
    );
    return;
  }
  for (const file of claudeFiles) {
    if (readText(path.join(claudeDir, file), errors) !== readText(path.join(codexDir, file), errors)) {
      errors.push(`.agents/skills/${file} has drifted from .claude/skills/${file} — re-sync the mirror byte-for-byte.`);
    }
  }
}

function checkDocs(root, errors) {
  const agentsMd = readText(path.join(root, 'AGENTS.md'), errors);
  for (const required of ['Codex Parity', '.codex/config.toml', '.agents/skills/', 'tests/codex-adapter.test.mjs']) {
    if (!agentsMd.includes(required)) errors.push(`AGENTS.md must document Codex parity (missing "${required}").`);
  }
  const wiki = readText(path.join(root, 'wiki', 'System', 'harness-codex.md'), errors);
  for (const required of ['tests/codex-adapter.test.mjs', 'check-codex-parity']) {
    if (wiki && !wiki.includes(required)) errors.push(`wiki/System/harness-codex.md must mention ${required}.`);
  }
}

export function checkCodexParity(root = ROOT) {
  const errors = [];
  checkConfig(root, errors);
  checkHooks(root, errors);
  checkAgents(root, errors);
  checkSkillsMirror(root, errors);
  checkDocs(root, errors);
  return { errors };
}

export function isCodexRelevantPath(filePath, root = ROOT) {
  const normalized = workspaceRelativePath(filePath, root);
  if (!normalized) return false;
  return (
    normalized === 'agents.md' ||
    normalized === '.claude/agentic-surface-registry.json' ||
    normalized === 'wiki/system/harness-codex.md' ||
    normalized.startsWith('.codex/') ||
    normalized.startsWith('.agents/skills/') ||
    normalized.startsWith('.claude/skills/') ||
    normalized.startsWith('.claude/agents/')
  );
}

export function shouldCheckHook(payload, root = ROOT) {
  return hookPaths(payload).some((filePath) => isCodexRelevantPath(filePath, root));
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
  const { errors } = checkCodexParity();
  for (const error of errors) console.error(`✖ ${error}`);
  if (errors.length) {
    console.error(`codex parity guard: ${errors.length} error(s).`);
    process.exit(2);
  }
  if (!process.argv.includes('--hook')) console.error('codex parity guard: OK.');
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/check-codex-parity.mjs')) {
  await main();
}
