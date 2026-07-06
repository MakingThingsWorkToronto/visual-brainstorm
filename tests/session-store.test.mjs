import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore, slugify } from '../apps/mcp/dist/session-store.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-test-'));

const board = (round, overrides = {}) => ({
  id: `b${round}`,
  sessionId: 's',
  round,
  kind: 'icon-grid',
  phase: 'diverge',
  title: 'T',
  prompt: 'P',
  options: [
    { id: 'a', label: 'Alpha', svg: '<svg viewBox="0 0 1 1"/>', tags: [], parents: [] },
    { id: 'b', label: 'Beta', svg: '<svg viewBox="0 0 1 1"/>', tags: ['x'], parents: ['a'] },
  ],
  survey: { multiSelect: true, minSelect: 0, elaborationPrompt: 'e', allowPerOptionNotes: true, allowRemix: true, axes: [] },
  createdAt: 'now',
  ...overrides,
});

const response = (boardId) => ({
  boardId,
  selectedOptionIds: ['b'],
  elaboration: 'more like Beta',
  perOptionNotes: {},
  axisValues: {},
  remixPairs: [],
  action: 'iterate',
  triage: {},
  mutations: {},
  flaws: {},
  positions: {},
  clusters: [],
  gapNotes: [],
  commands: [],
  respondedAt: 'now',
});

test('slugify produces safe kebab slugs', () => {
  assert.equal(slugify('Visualize 5 OPTIONS!! for search'), 'visualize-5-options-for-search');
  assert.equal(slugify('***'), 'session');
});

test('rule 7: every board, SVG, response, and brainstorm.md line is cached', () => {
  const root = tmp();
  const store = new SessionStore('Cache test', root);
  store.recordBoard(board(1));
  store.recordResponse(response('b1'));
  const roundDir = path.join(store.info.dir, 'round-01');
  for (const file of ['board.json', 'option-a.svg', 'option-b.svg', 'response.json']) {
    assert.ok(fs.existsSync(path.join(roundDir, file)), `missing ${file}`);
  }
  const md = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
  assert.ok(md.includes('## Round 1 — diverge'));
  assert.ok(md.includes('**Beta** (`b`)'));
  assert.ok(md.includes('[parents: a]'));
  assert.ok(md.includes('### User response'));
  assert.ok(md.includes('Beta'), 'digest uses labels');
});

test('open() reloads a thread and continues round numbering', () => {
  const root = tmp();
  const store = new SessionStore('Reload test', root);
  store.recordBoard(board(1));
  store.recordResponse(response('b1'));
  const reopened = SessionStore.open(store.info.dir);
  assert.equal(reopened.rounds.length, 1);
  assert.equal(reopened.rounds[0].response.elaboration, 'more like Beta');
  assert.equal(reopened.nextRound(), 2);
});

test('artifacts capture with provenance and slug dedupe', () => {
  const root = tmp();
  const store = new SessionStore('Artifact test', root);
  const first = store.captureArtifact('Winner', '<svg/>', 'n', { optionIds: ['a'] });
  const second = store.captureArtifact('Winner', '<svg/>', 'n', { optionIds: ['b'] });
  assert.equal(first.slug, 'winner');
  assert.equal(second.slug, 'winner-2');
  assert.ok(fs.existsSync(first.svgPath));
  assert.ok(fs.existsSync(path.join(store.info.dir, 'artifacts', 'winner-2.json')));
});

test('list() spans live + _completed with archived flags; resolveDir falls back', () => {
  const root = tmp();
  const live = new SessionStore('Live thread', root);
  const done = new SessionStore('Done thread', root);
  const completed = path.join(root, '_completed');
  fs.mkdirSync(completed, { recursive: true });
  fs.renameSync(done.info.dir, path.join(completed, path.basename(done.info.dir)));

  const list = SessionStore.list(root);
  assert.equal(list.length, 2);
  assert.equal(list.find((d) => d.title === 'Live thread').archived, false);
  assert.equal(list.find((d) => d.title === 'Done thread').archived, true);

  const archivedId = path.basename(done.info.dir);
  assert.ok(SessionStore.resolveDir(root, archivedId).includes('_completed'));
  assert.equal(SessionStore.resolveDir(root, path.basename(live.info.dir)), live.info.dir);
  // Plan folders (no session.json) are not threads.
  fs.mkdirSync(path.join(root, 'some-plan-2026-07-06'));
  assert.equal(SessionStore.list(root).length, 2);
});
