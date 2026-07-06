import { test } from 'node:test';
import assert from 'node:assert';
import {
  AxisSchema,
  BoardResponseSchema,
  BoardSchema,
  DiscussionSummarySchema,
  PHASES,
  ResponseActionSchema,
  SurveyConfigSchema,
  ThemeSchema,
} from '../packages/protocol/dist/index.js';

const OPTION = { id: 'a', label: 'A', svg: '<svg viewBox="0 0 1 1"/>' };
const BOARD_BASE = {
  id: 'b1',
  sessionId: 's1',
  round: 1,
  kind: 'icon-grid',
  title: 't',
  prompt: 'p',
  options: [OPTION],
  survey: {},
  createdAt: 'now',
};

test('board defaults: phase diverge, option tags/parents empty', () => {
  const board = BoardSchema.parse(BOARD_BASE);
  assert.equal(board.phase, 'diverge');
  assert.deepEqual(board.options[0].tags, []);
  assert.deepEqual(board.options[0].parents, []);
});

test('funnel has the six phases in order', () => {
  assert.deepEqual([...PHASES], ['diverge', 'expand', 'mutate', 'wreck', 'cluster', 'converge']);
});

test('survey defaults enable the full feedback surface', () => {
  const survey = SurveyConfigSchema.parse({});
  assert.equal(survey.multiSelect, true);
  assert.equal(survey.allowPerOptionNotes, true);
  assert.equal(survey.allowRemix, true);
  assert.deepEqual(survey.axes, []);
});

test('axis is a range with a midpoint default', () => {
  const axis = AxisSchema.parse({ id: 'x', label: 'X', leftLabel: 'L', rightLabel: 'R' });
  assert.equal(axis.defaultValue, 50);
  assert.throws(() => AxisSchema.parse({ id: 'x', label: 'X', leftLabel: 'L', rightLabel: 'R', defaultValue: 101 }));
});

test('response actions include finalize and back; defaults are empty', () => {
  for (const action of ['iterate', 'accept', 'park', 'finalize', 'back']) {
    assert.equal(ResponseActionSchema.parse(action), action);
  }
  const response = BoardResponseSchema.parse({ boardId: 'b1', respondedAt: 'now' });
  assert.equal(response.action, 'iterate');
  assert.deepEqual(response.selectedOptionIds, []);
  assert.deepEqual(response.triage, {});
  assert.deepEqual(response.mutations, {});
  assert.deepEqual(response.flaws, {});
  assert.deepEqual(response.positions, {});
  assert.deepEqual(response.clusters, []);
  assert.deepEqual(response.gapNotes, []);
  assert.deepEqual(response.commands, []);
  assert.equal(response.finalOptionId, undefined);
  assert.equal(response.requestedPhase, undefined);
});

test('response rejects invalid triage verdicts and phases', () => {
  assert.throws(() => BoardResponseSchema.parse({ boardId: 'b', respondedAt: 'n', triage: { a: 'maybe' } }));
  assert.throws(() => BoardResponseSchema.parse({ boardId: 'b', respondedAt: 'n', requestedPhase: 'zigzag' }));
});

test('theme requires full light+dark variable sets', () => {
  const vars = { canvas: '#fff', surface: '#fff', surface2: '#eee', line: '#ddd', ink: '#000', inkDim: '#666', accent: '#a855f7' };
  assert.equal(ThemeSchema.parse({ name: 't', label: 'T', light: vars, dark: vars }).name, 't');
  assert.throws(() => ThemeSchema.parse({ name: 't', label: 'T', light: vars, dark: { ...vars, accent: undefined } }));
});

test('discussion summary defaults archived=false', () => {
  const summary = DiscussionSummarySchema.parse({
    id: 'x', title: 'T', startedAt: 'now', dir: '/d', rounds: 1, artifacts: 0,
  });
  assert.equal(summary.archived, false);
});
