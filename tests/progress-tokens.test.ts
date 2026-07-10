// Client-side token reduction (token-economy follow-ups phase 2c): the studio's
// live per-sink increment (useBridge 'progress' branch) was unproven — only the
// server reduction (SessionStore.tokensBySink) had tests. The reducer is pure
// (apps/studio/src/lib/progressTokens.ts) and must mirror the server rule:
// tokens add to the meter and to their sink bucket; uncategorized tokens fold
// into `orchestration`; token-less events change nothing.
import { test } from 'node:test';
import assert from 'node:assert';
import { reduceProgressTokens } from '../apps/studio/src/lib/progressTokens.ts';
import { ProgressEventSchema, type ProgressEvent } from '../packages/protocol/dist/index.js';

// Through the schema, like every production path — defaults stay in sync (rule 5).
const event = (overrides: Record<string, unknown> = {}): ProgressEvent =>
  ProgressEventSchema.parse({ at: '2026-07-09T10:00:00.000Z', note: 'n', ...overrides });

const zero = { tokens: { input: 0, output: 0 }, tokensBySink: {} };

test('a token-less event leaves both meters untouched (same references)', () => {
  const next = reduceProgressTokens(zero, event());
  assert.equal(next.tokens, zero.tokens);
  assert.equal(next.tokensBySink, zero.tokensBySink);
});

test('uncategorized tokens fold into orchestration, mirroring the server rule', () => {
  const next = reduceProgressTokens(zero, event({ tokens: { input: 100, output: 10 } }));
  assert.deepEqual(next.tokens, { input: 100, output: 10 });
  assert.deepEqual(next.tokensBySink, { orchestration: 110 });
});

test('categorized tokens land in their own sink bucket (input+output combined)', () => {
  const next = reduceProgressTokens(zero, event({ tokens: { input: 200, output: 20 }, category: 'generation' }));
  assert.deepEqual(next.tokens, { input: 200, output: 20 });
  assert.deepEqual(next.tokensBySink, { generation: 220 });
});

test('increments accumulate across events without disturbing other sinks', () => {
  let state: Parameters<typeof reduceProgressTokens>[0] = zero;
  state = reduceProgressTokens(state, event({ tokens: { input: 100, output: 10 }, category: 'generation' }));
  state = reduceProgressTokens(state, event({ tokens: { input: 50, output: 5 }, category: 'tweak' }));
  state = reduceProgressTokens(state, event({ tokens: { input: 30, output: 3 }, category: 'generation' }));
  state = reduceProgressTokens(state, event({ tokens: { input: 7, output: 2 } }));
  assert.deepEqual(state.tokens, { input: 187, output: 20 });
  assert.deepEqual(state.tokensBySink, { generation: 143, tweak: 55, orchestration: 9 });
});
