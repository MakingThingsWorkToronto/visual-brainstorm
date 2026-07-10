// Proves scripts/check-agent-format.mjs — the agent-only GitHub PR/issue format (single
// source of truth: CANONICAL_PR_PREFIX / CANONICAL_ISSUE_PREFIX). The drift-guard test is
// load-bearing: if .github/pull_request_template.md or .github/ISSUE_TEMPLATE/agent-task.yml
// drift from the script's canonical constants, this test fails the build (per the script's
// own header comment). No mocks: real template files on disk, constructed bodies through the
// real validators.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  CANONICAL_ISSUE_PREFIX,
  CANONICAL_PR_PREFIX,
  extractPrompt,
  validateIssue,
  validatePr,
} from '../scripts/check-agent-format.mjs';

const ROOT = process.cwd();
const PR_TEMPLATE_PATH = path.join(ROOT, '.github', 'pull_request_template.md');
const ISSUE_TEMPLATE_PATH = path.join(ROOT, '.github', 'ISSUE_TEMPLATE', 'agent-task.yml');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// Strips exactly one level of the 8-space YAML block-scalar indent from every indented
// line, mirroring how a YAML `value: |` block scalar de-indents at render time.
function dedentEight(text) {
  return text
    .split('\n')
    .map((line) => (line.startsWith(' '.repeat(8)) ? line.slice(8) : line))
    .join('\n');
}

function fencePrompt(prefix, payload) {
  return ['```prompt', prefix, payload, '```'].join('\n');
}

const VALID_PR_PAYLOAD = `branch: feature/agent-format-guard
slug: agent-format-guard
discussion: discussion_pr/agent-format-guard/
intent: Add agent-only PR/issue format enforcement and its drift-guard tests.
changes:
  - scripts/check-agent-format.mjs: added CANONICAL_PR_PREFIX/CANONICAL_ISSUE_PREFIX validators
verify:
  - npm run build && npm test
risk: low — mechanical, additive only
breaking: none`;

const VALID_PR_TITLE = 'feat(agent-format): enforce agent PR/issue format';
const VALID_PR_CHANGED_FILES = [
  'discussion_pr/agent-format-guard/plan.md',
  'scripts/check-agent-format.mjs',
];

function validPrBody() {
  return fencePrompt(CANONICAL_PR_PREFIX, VALID_PR_PAYLOAD);
}

const VALID_ISSUE_PAYLOAD = `slug: agent-format-guard
intent: Ship the agent PR/issue format drift guard.
acceptance:
  - npm test passes including tests/agent-format.test.mjs
pointers:
  - scripts/check-agent-format.mjs`;

const VALID_ISSUE_TITLE = 'task: add agent format drift guard';

function validIssueBody() {
  return fencePrompt(CANONICAL_ISSUE_PREFIX, VALID_ISSUE_PAYLOAD);
}

// --- 1. Drift guard (load-bearing) -----------------------------------------------------

test('drift guard: .github/pull_request_template.md embeds CANONICAL_PR_PREFIX byte-for-byte', () => {
  const template = readText(PR_TEMPLATE_PATH);
  assert.ok(
    template.includes(CANONICAL_PR_PREFIX),
    'pull_request_template.md no longer contains the canonical PR prefix verbatim — template has drifted from scripts/check-agent-format.mjs',
  );
});

test('drift guard: .github/ISSUE_TEMPLATE/agent-task.yml embeds CANONICAL_ISSUE_PREFIX (after de-indenting the 8-space block scalar)', () => {
  const template = readText(ISSUE_TEMPLATE_PATH);
  const dedented = dedentEight(template);
  assert.ok(
    dedented.includes(CANONICAL_ISSUE_PREFIX),
    'agent-task.yml no longer contains the canonical issue prefix (after stripping its 8-space indent) — template has drifted from scripts/check-agent-format.mjs',
  );
});

// --- 2. validatePr accepts a fully-filled valid body ------------------------------------

test('validatePr accepts a fully-filled valid PR', () => {
  const errors = validatePr({
    title: VALID_PR_TITLE,
    body: validPrBody(),
    changedFiles: VALID_PR_CHANGED_FILES,
  });
  assert.deepEqual(errors, []);
});

// --- 3. validatePr rejects ---------------------------------------------------------------

test('validatePr rejects a body with no ```prompt fence', () => {
  const errors = validatePr({
    title: VALID_PR_TITLE,
    body: 'just a plain PR description, no prompt block at all',
    changedFiles: VALID_PR_CHANGED_FILES,
  });
  assert.ok(errors.some((e) => e.includes('no ```prompt fenced block')), errors.join('\n'));
});

test('validatePr rejects a body with two ```prompt fences', () => {
  const oneFence = validPrBody();
  const errors = validatePr({
    title: VALID_PR_TITLE,
    body: `${oneFence}\n\n${oneFence}`,
    changedFiles: VALID_PR_CHANGED_FILES,
  });
  assert.ok(errors.some((e) => e.includes('exactly one ```prompt block')), errors.join('\n'));
});

test('validatePr rejects prefix drift (one word changed in the cache-stable prefix)', () => {
  const driftedPrefix = CANONICAL_PR_PREFIX.replace('Ground first', 'Ground second');
  assert.notEqual(driftedPrefix, CANONICAL_PR_PREFIX, 'sanity: replace must actually change the prefix');
  const errors = validatePr({
    title: VALID_PR_TITLE,
    body: fencePrompt(driftedPrefix, VALID_PR_PAYLOAD),
    changedFiles: VALID_PR_CHANGED_FILES,
  });
  assert.ok(
    errors.some((e) => e.includes('canonical prefix')),
    errors.join('\n'),
  );
});

test('validatePr rejects the raw template body itself (unfilled <placeholder> payload values)', () => {
  const rawTemplate = readText(PR_TEMPLATE_PATH);
  const errors = validatePr({
    title: VALID_PR_TITLE,
    body: rawTemplate,
    changedFiles: [],
  });
  assert.ok(errors.length > 0, 'the unfilled template must not validate as a real PR');
});

test('validatePr rejects a discussion path that does not match the declared slug', () => {
  const payload = VALID_PR_PAYLOAD.replace(
    'discussion: discussion_pr/agent-format-guard/',
    'discussion: discussion_pr/some-other-slug/',
  );
  const errors = validatePr({
    title: VALID_PR_TITLE,
    body: fencePrompt(CANONICAL_PR_PREFIX, payload),
    changedFiles: VALID_PR_CHANGED_FILES,
  });
  assert.ok(errors.some((e) => e.includes('discussion must be exactly')), errors.join('\n'));
});

test('validatePr rejects changedFiles with no path under discussion_pr/<slug>/', () => {
  const errors = validatePr({
    title: VALID_PR_TITLE,
    body: validPrBody(),
    changedFiles: ['scripts/check-agent-format.mjs', 'wiki/System/agentic-pr-loop.md'],
  });
  assert.ok(
    errors.some((e) => e.includes('diff must include the PR')),
    errors.join('\n'),
  );
});

test('validatePr rejects a bad title', () => {
  const errors = validatePr({
    title: 'this is not a conventional-commit style title',
    body: validPrBody(),
    changedFiles: VALID_PR_CHANGED_FILES,
  });
  assert.ok(errors.some((e) => e.includes('PR title must match')), errors.join('\n'));
});

test('validatePr rejects a non-kebab-case slug', () => {
  const payload = VALID_PR_PAYLOAD
    .replace('slug: agent-format-guard', 'slug: Agent_Format_Guard')
    .replace('discussion: discussion_pr/agent-format-guard/', 'discussion: discussion_pr/Agent_Format_Guard/');
  const errors = validatePr({
    title: VALID_PR_TITLE,
    body: fencePrompt(CANONICAL_PR_PREFIX, payload),
    changedFiles: VALID_PR_CHANGED_FILES,
  });
  assert.ok(errors.some((e) => e.includes('is not kebab-case')), errors.join('\n'));
});

// --- 4. validateIssue accept/reject ------------------------------------------------------

test('validateIssue accepts a fully-filled valid issue', () => {
  const errors = validateIssue({ title: VALID_ISSUE_TITLE, body: validIssueBody() });
  assert.deepEqual(errors, []);
});

test('validateIssue rejects a missing acceptance list', () => {
  const payload = VALID_ISSUE_PAYLOAD.replace(
    'acceptance:\n  - npm test passes including tests/agent-format.test.mjs',
    'acceptance:\n  - <observable check that proves the task is done>',
  );
  const errors = validateIssue({
    title: VALID_ISSUE_TITLE,
    body: fencePrompt(CANONICAL_ISSUE_PREFIX, payload),
  });
  assert.ok(errors.some((e) => e.includes('non-empty list "acceptance:"')), errors.join('\n'));
});

test('validateIssue rejects a bad title', () => {
  const errors = validateIssue({
    title: 'feature: add agent format drift guard',
    body: validIssueBody(),
  });
  assert.ok(errors.some((e) => e.includes('issue title must match')), errors.join('\n'));
});

// --- 5. CRLF tolerance ---------------------------------------------------------------------

test('validatePr tolerates CRLF line endings in the body', () => {
  const crlfBody = validPrBody().replace(/\n/g, '\r\n');
  const errors = validatePr({
    title: VALID_PR_TITLE,
    body: crlfBody,
    changedFiles: VALID_PR_CHANGED_FILES,
  });
  assert.deepEqual(errors, []);
});

// Sanity: extractPrompt itself round-trips the valid body (used by validatePr/validateIssue
// internally, exercised directly here so a future refactor of validatePr can't hide a break).
test('extractPrompt round-trips the canonical PR prefix out of a fenced body', () => {
  const { prefix, payload, error } = extractPrompt(validPrBody());
  assert.equal(error, undefined);
  assert.equal(prefix, CANONICAL_PR_PREFIX);
  assert.ok(payload.includes('slug: agent-format-guard'));
});
