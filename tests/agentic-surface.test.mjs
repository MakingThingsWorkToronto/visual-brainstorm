import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkAgenticSurface, evaluateSurface } from '../scripts/check-agentic-surface.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The real repo must be in sync: every durable .claude file registered, no dangling entries.
test('agentic-surface: real repo has no SSOT-registry drift', () => {
  const { errors } = checkAgenticSurface(root);
  assert.deepEqual(errors, [], `agentic-surface registry drift:\n${errors.join('\n')}`);
});

// Guard must FIRE on an unregistered durable file (proves the test isn't a false-green).
test('agentic-surface: an unregistered command is a blocking error', () => {
  const { errors } = evaluateSurface({
    surfaces: [{ kind: 'command', name: 'known', path: '.claude/commands/known.md' }],
    disk: {
      command: [
        { name: 'known', path: '.claude/commands/known.md' },
        { name: 'sneaky', path: '.claude/commands/sneaky.md' },
      ],
      skill: [],
      agent: [],
    },
    copilotMap: null,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Unregistered command "sneaky"/);
});

// Documented exclusion globs suppress the error (generated dispatch-* dispatchers).
test('agentic-surface: excluded glob is not flagged', () => {
  const { errors } = evaluateSurface({
    surfaces: [],
    exclusions: { commands: ['dispatch-*-next-phase'] },
    disk: {
      command: [{ name: 'dispatch-foo-next-phase', path: '.claude/commands/dispatch-foo-next-phase.md' }],
      skill: [],
      agent: [],
    },
    copilotMap: null,
  });
  assert.deepEqual(errors, []);
});

// A registry entry whose file is gone is a blocking (dangling) error.
test('agentic-surface: a dangling registry entry is a blocking error', () => {
  const { errors } = evaluateSurface({
    surfaces: [{ kind: 'agent', name: 'ghost', path: '.claude/agents/ghost.md' }],
    disk: { command: [], skill: [], agent: [] },
    copilotMap: null,
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /Dangling registry entry: agent "ghost"/);
});

// Missing Copilot adapter is a WARNING, never a blocking error.
test('agentic-surface: missing Copilot adapter warns but does not block', () => {
  const { errors, warnings } = evaluateSurface({
    surfaces: [{ kind: 'command', name: 'solo', path: '.claude/commands/solo.md' }],
    disk: { command: [{ name: 'solo', path: '.claude/commands/solo.md' }], skill: [], agent: [] },
    copilotMap: { commands: [], agents: [] },
  });
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Copilot gap: command "solo"/);
});
