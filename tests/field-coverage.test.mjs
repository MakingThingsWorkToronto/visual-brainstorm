/**
 * Field-coverage drift guard (handoff-fidelity plan, 2026-07-09). The
 * `positions` field shipped documented-but-undelivered for weeks because
 * nothing cross-checked BoardResponse's schema against the digest and the
 * skills. This guard makes that class of drift impossible to ship green:
 *
 *  1. Every BoardResponseSchema key is either FORMATTED by feedback.ts
 *     (the only channel the orchestrator reads) or explicitly exempted here
 *     WITH a reason.
 *  2. Every `response.<field>` the brainstorm-phases skill cites exists in
 *     the schema (the skill can't teach fields the wire doesn't carry).
 *  3. The present_board tool description names every funnel phase in the
 *     PHASES enum (the tool contract a model reads must match the schema).
 */
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BoardResponseSchema, PHASES } from '../packages/protocol/dist/index.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Fields legitimately absent from the digest text — each with the reason.
const DIGEST_EXEMPT = new Map([
  ['boardId', 'addressing, not content — the digest is already scoped to its board'],
  ['respondedAt', 'timestamp — brainstorm.md carries it in the response heading'],
]);

test('every BoardResponse field is formatted by the digest (or exempted with a reason)', () => {
  const feedbackSource = read('../apps/mcp/src/feedback.ts');
  const missing = Object.keys(BoardResponseSchema.shape).filter(
    (key) => !DIGEST_EXEMPT.has(key) && !feedbackSource.includes(`response.${key}`),
  );
  assert.deepEqual(
    missing,
    [],
    `BoardResponse field(s) captured but never surfaced to the model by feedback.ts: ${missing.join(', ')} — ` +
      'format them into the digest, or exempt them here with a written reason.',
  );
});

test('every response field the brainstorm-phases skill cites exists in the schema', () => {
  const skill = read('../.claude/skills/brainstorm-phases/SKILL.md');
  const cited = new Set([...skill.matchAll(/\bresponse\.(\w+)/g)].map((m) => m[1]));
  const keys = new Set(Object.keys(BoardResponseSchema.shape));
  const phantom = [...cited].filter((field) => !keys.has(field));
  assert.deepEqual(
    phantom,
    [],
    `brainstorm-phases cites response field(s) the schema does not carry: ${phantom.join(', ')}`,
  );
});

test('the present_board tool description names every funnel phase', () => {
  const toolSource = read('../apps/mcp/src/index.ts');
  const missing = PHASES.filter((phase) => !toolSource.includes(phase));
  assert.deepEqual(
    missing,
    [],
    `present_board's description omits funnel phase(s): ${missing.join(', ')} — the tool contract a model reads must match PhaseSchema.`,
  );
});
