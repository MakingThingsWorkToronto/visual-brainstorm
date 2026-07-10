import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CLAUDE_REGISTRY_PATH = path.join(ROOT, '.claude', 'agentic-surface-registry.json');
const CODEX_DIR = path.join(ROOT, '.codex');
const CODEX_AGENTS_DIR = path.join(CODEX_DIR, 'agents');
const CLAUDE_SKILLS_DIR = path.join(ROOT, '.claude', 'skills');
const CODEX_SKILLS_DIR = path.join(ROOT, '.agents', 'skills');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function skillFiles(dir) {
  const files = [];
  for (const skill of fs.readdirSync(dir)) {
    const skillDir = path.join(dir, skill);
    if (!fs.statSync(skillDir).isDirectory()) continue;
    for (const file of fs.readdirSync(skillDir)) {
      if (file.endsWith('.md')) files.push(path.join(skill, file).replaceAll('\\', '/'));
    }
  }
  return files.sort();
}

test('Codex adapter config starts repo MCP servers from the project root', () => {
  const config = readText(path.join(CODEX_DIR, 'config.toml'));

  for (const server of ['visual-brainstorm', 'visual-brainstorm-wiki']) {
    const table = config.match(new RegExp(`\\[mcp_servers\\.${server}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
    assert.ok(table, `config declares ${server}`);
    assert.match(table[1], /command = "node"/, `${server} uses node`);
    assert.match(table[1], /cwd = "\.\."/);
    assert.match(table[1], /args = \["apps\//, `${server} uses project-root relative app path`);
  }

  assert.match(config, /\[agents\]/, 'config enables Codex subagent concurrency settings');
});

test('Codex hooks do not depend on Claude-specific environment variables', () => {
  const hooks = readText(path.join(CODEX_DIR, 'hooks.json'));

  assert.doesNotMatch(hooks, /CLAUDE_PROJECT_DIR/);
  assert.match(hooks, /node scripts\/pipe-progress\.mjs/);
  assert.match(hooks, /node scripts\/check-agentic-surface\.mjs --hook/);
  assert.match(hooks, /node scripts\/check-codex-parity\.mjs --hook/);
});

test('Codex agents wrap the authoritative Claude agents without dead .Codex paths', () => {
  const registry = readJson(CLAUDE_REGISTRY_PATH);
  const expectedAgents = registry.surfaces.filter((s) => s.kind === 'agent').map((s) => s.name).sort();
  const codexAgents = fs
    .readdirSync(CODEX_AGENTS_DIR)
    .filter((file) => file.endsWith('.toml'))
    .map((file) => file.replace(/\.toml$/, ''))
    .sort();

  assert.deepEqual(codexAgents, expectedAgents);

  for (const agent of codexAgents) {
    const text = readText(path.join(CODEX_AGENTS_DIR, `${agent}.toml`));
    assert.doesNotMatch(text, /\.Codex\//, `${agent} must not reference nonexistent .Codex paths`);
    assert.match(text, new RegExp(`name = "${agent}"`), `${agent} declares its stable name`);
    assert.ok(
      text.includes(`.claude/agents/${agent}.md`),
      `${agent} points back to its authoritative .claude/agents file (thin pointer wrapper, not a copied body)`,
    );
  }
});

test('Codex parity guard reports a clean adapter', async () => {
  const { checkCodexParity } = await import('../scripts/check-codex-parity.mjs');
  assert.deepEqual(checkCodexParity(ROOT).errors, []);
});

test('Codex skills mirror the authoritative Claude skills exactly', () => {
  const claudeFiles = skillFiles(CLAUDE_SKILLS_DIR);
  const codexFiles = skillFiles(CODEX_SKILLS_DIR);

  assert.deepEqual(codexFiles, claudeFiles);
  for (const file of claudeFiles) {
    assert.equal(
      readText(path.join(CODEX_SKILLS_DIR, file)),
      readText(path.join(CLAUDE_SKILLS_DIR, file)),
      `${file} mirrors .claude skill source`,
    );
  }
});
