import { test } from 'node:test';
import assert from 'node:assert';
import {
  AxisSchema,
  BoardResponseSchema,
  BoardSchema,
  DiscussionSummarySchema,
  PHASES,
  ResponseActionSchema,
  SeedIntakeSchema,
  SessionInfoSchema,
  SurveyConfigSchema,
  ThemeSchema,
} from '../packages/protocol/dist/index.js';
import { loadCanonical } from './canonical/load.mjs';

// Deliberately minimal literals below (OPTION, BOARD_BASE, rejection payloads) probe
// default application and schema refusal — they stay inline by design (canonical
// README rule 2 note: omit fields where testing default application matters).
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

test('judge-deck response fields default empty', () => {
  const response = BoardResponseSchema.parse({ boardId: 'b1', respondedAt: 'now' });
  assert.deepEqual(response.deckVerdicts, {});
  assert.deepEqual(response.duelResults, []);
  assert.deepEqual(response.ranking, []);
});

test('palette colors default empty, round-trip, and require name+value', () => {
  const empty = BoardResponseSchema.parse({ boardId: 'b1', respondedAt: 'now' });
  assert.deepEqual(empty.paletteColors, []);
  const response = BoardResponseSchema.parse({
    boardId: 'b1',
    respondedAt: 'now',
    paletteColors: [{ name: 'Neon Purple accent', value: '#a855f7' }],
  });
  assert.deepEqual(response.paletteColors, [{ name: 'Neon Purple accent', value: '#a855f7' }]);
  assert.throws(() =>
    BoardResponseSchema.parse({ boardId: 'b', respondedAt: 'n', paletteColors: [{ value: '#fff' }] }),
  );
});

test('attachments default empty and round-trip name/dataUri/savedPath', () => {
  const empty = BoardResponseSchema.parse({ boardId: 'b1', respondedAt: 'now' });
  assert.deepEqual(empty.attachments, []);
  const response = BoardResponseSchema.parse({
    boardId: 'b1',
    respondedAt: 'now',
    attachments: [
      { name: 'ref.png', dataUri: 'data:image/png;base64,AA==' },
      { name: 'saved.pdf', dataUri: '', savedPath: 'C:/threads/t/attachments/saved.pdf' },
      {},
    ],
  });
  assert.equal(response.attachments[0].dataUri, 'data:image/png;base64,AA==');
  assert.equal(response.attachments[1].savedPath, 'C:/threads/t/attachments/saved.pdf');
  assert.equal(response.attachments[2].name, '', 'name defaults empty');
  assert.equal(response.attachments[2].dataUri, '', 'dataUri defaults empty');
});

test('judge-deck response fields round-trip and reject bad verdicts', () => {
  const response = BoardResponseSchema.parse({
    boardId: 'b1',
    respondedAt: 'now',
    deckVerdicts: { a: 'keep', b: 'kill' },
    duelResults: [{ pair: ['a', 'b'], winner: 'a' }],
    ranking: ['a', 'c'],
  });
  assert.deepEqual(response.deckVerdicts, { a: 'keep', b: 'kill' });
  assert.deepEqual(response.duelResults, [{ pair: ['a', 'b'], winner: 'a' }]);
  assert.deepEqual(response.ranking, ['a', 'c']);
  assert.throws(() => BoardResponseSchema.parse({ boardId: 'b', respondedAt: 'n', deckVerdicts: { a: 'merge' } }));
  assert.throws(() =>
    BoardResponseSchema.parse({ boardId: 'b', respondedAt: 'n', duelResults: [{ pair: ['a'], winner: 'a' }] }),
  );
});

test('seed intake round-trips all four kinds', () => {
  assert.deepEqual(SeedIntakeSchema.parse({ kind: 'text', text: 'a logo' }), { kind: 'text', text: 'a logo' });
  assert.deepEqual(SeedIntakeSchema.parse({ kind: 'sketch', svg: '<svg viewBox="0 0 1 1"/>' }), {
    kind: 'sketch',
    svg: '<svg viewBox="0 0 1 1"/>',
  });
  const image = SeedIntakeSchema.parse({ kind: 'image', dataUri: 'data:image/png;base64,AA==' });
  assert.equal(image.dataUri, 'data:image/png;base64,AA==');
  assert.equal(image.name, '', 'image name defaults empty');
  assert.deepEqual(SeedIntakeSchema.parse({ kind: 'voice', transcript: 'make it neon' }), {
    kind: 'voice',
    transcript: 'make it neon',
  });
});

test('seed intake rejects unknown kinds and mismatched payloads', () => {
  assert.throws(() => SeedIntakeSchema.parse({ kind: 'telepathy', thought: 'a logo' }));
  assert.throws(() => SeedIntakeSchema.parse({ kind: 'sketch', text: 'not an svg field' }));
  assert.throws(() => SeedIntakeSchema.parse({ text: 'no kind at all' }));
});

test('response rejects invalid triage verdicts and phases', () => {
  assert.throws(() => BoardResponseSchema.parse({ boardId: 'b', respondedAt: 'n', triage: { a: 'maybe' } }));
  assert.throws(() => BoardResponseSchema.parse({ boardId: 'b', respondedAt: 'n', requestedPhase: 'zigzag' }));
});

test('theme requires full light+dark variable sets', () => {
  const theme = loadCanonical('themes/theme.json', ThemeSchema);
  assert.equal(theme.name, 'aurora');
  assert.throws(() => ThemeSchema.parse({ ...theme, dark: { ...theme.dark, accent: undefined } }));
});

test('theme palette is optional; when present its colors are named', () => {
  const theme = loadCanonical('themes/theme.json', ThemeSchema);
  const { palette, ...withoutPalette } = theme;
  const bare = ThemeSchema.parse(withoutPalette);
  assert.equal(bare.palette, undefined);
  assert.ok(theme.palette.length > 0, 'canonical theme carries a curated palette');
  for (const color of theme.palette) {
    assert.ok(color.name.length > 0, 'every palette color is named');
  }
  assert.throws(() => ThemeSchema.parse({ ...withoutPalette, palette: [{ value: '#fff' }] }));
});

test('session info: theme and targetRepo overrides are optional', () => {
  const base = { id: 'i', slug: 's', title: 'T', startedAt: 'now', dir: '/d' };
  const info = SessionInfoSchema.parse(base);
  assert.equal(info.theme, undefined);
  assert.equal(info.targetRepo, undefined);
  assert.equal(SessionInfoSchema.parse({ ...base, theme: 'ocean' }).theme, 'ocean');
});

test('discussion summary defaults archived=false', () => {
  const summary = DiscussionSummarySchema.parse({
    id: 'x', title: 'T', startedAt: 'now', dir: '/d', rounds: 1, artifacts: 0,
  });
  assert.equal(summary.archived, false);
});
