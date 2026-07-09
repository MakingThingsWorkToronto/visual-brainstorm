import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const REGISTRY_PATH = path.join(ROOT, '.claude', 'agentic-surface-registry.json');
const COPILOT_REGISTRY_PATH = path.join(ROOT, '.github', 'agentic-surface-registry.json');
const PROMPTS_DIR = path.join(ROOT, '.github', 'prompts');
const AGENTS_DIR = path.join(ROOT, '.github', 'agents');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function promptAgent(filePath) {
  const match = readText(filePath).match(/^agent:\s*"([^"]+)"$/m);
  assert.ok(match, `${path.basename(filePath)} declares an agent in frontmatter`);
  return match[1];
}

test('Copilot adapter registry stays aligned with the authoritative registry and wrapper files', () => {
  const registry = readJson(REGISTRY_PATH);
  const copilotRegistry = readJson(COPILOT_REGISTRY_PATH);
  const registryCommands = new Map(registry.surfaces.filter((s) => s.kind === 'command').map((s) => [s.name, s]));
  const registryAgents = new Map(registry.surfaces.filter((s) => s.kind === 'agent').map((s) => [s.name, s]));
  const promptFiles = new Set(fs.readdirSync(PROMPTS_DIR).filter((name) => name.endsWith('.prompt.md')));
  const agentFiles = new Set(fs.readdirSync(AGENTS_DIR).filter((name) => name.endsWith('.agent.md')));

  const mappedPromptFiles = new Set();
  const mappedCopilotAgents = new Set();

  for (const entry of copilotRegistry.commands) {
    const surface = registryCommands.get(entry.name);
    assert.ok(surface, `registry contains command ${entry.name}`);

    const promptPath = path.join(ROOT, entry.copilotPrompt);
    const promptFile = path.basename(promptPath);
    assert.ok(fs.existsSync(promptPath), `prompt exists for ${entry.name}`);
    assert.equal(promptFile, `${entry.name}.prompt.md`, `${entry.name} prompt filename stays discoverable`);
    assert.equal(promptAgent(promptPath), entry.copilotAgent, `${entry.name} prompt points at mapped Copilot agent`);

    const promptText = readText(promptPath);
    assert.ok(
      promptText.includes('../../.claude/agentic-surface-registry.json'),
      `${entry.name} prompt reads the authoritative registry`,
    );
    assert.ok(promptText.includes(surface.path), `${entry.name} prompt references its authoritative .claude workflow`);

    mappedPromptFiles.add(promptFile);
    mappedCopilotAgents.add(`${entry.copilotAgent}.agent.md`);
  }

  for (const entry of copilotRegistry.agents) {
    assert.ok(registryAgents.has(entry.name), `registry contains agent ${entry.name}`);
    const agentFile = `${entry.copilotAgent}.agent.md`;
    const agentPath = path.join(AGENTS_DIR, agentFile);
    assert.ok(fs.existsSync(agentPath), `Copilot agent wrapper exists for ${entry.name}`);

    const agentText = readText(agentPath);
    assert.ok(
      agentText.includes('../../.claude/agentic-surface-registry.json'),
      `${entry.copilotAgent} reads the authoritative registry`,
    );
    assert.ok(agentText.includes('../agentic-surface-registry.json'), `${entry.copilotAgent} reads the adapter registry`);

    mappedCopilotAgents.add(agentFile);
  }

  assert.deepEqual(promptFiles, mappedPromptFiles, 'no stray or unmapped Copilot prompt files exist');
  assert.deepEqual(agentFiles, mappedCopilotAgents, 'no stray or unmapped Copilot agent files exist');
});