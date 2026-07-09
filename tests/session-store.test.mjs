import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SessionStore, slugify } from '../apps/mcp/dist/session-store.js';
import {
  ArtifactChatMessageSchema,
  ArtifactSchema,
  BoardResponseSchema,
  ProgressEventSchema,
  SessionInfoSchema,
} from '../packages/protocol/dist/index.js';

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

// Through the schema, like every production path — defaults stay in sync (rule 5).
const response = (boardId) =>
  BoardResponseSchema.parse({
    boardId,
    selectedOptionIds: ['b'],
    elaboration: 'more like Beta',
    action: 'iterate',
    respondedAt: 'now',
  });

// Through the schema, like every production path — defaults stay in sync (rule 5).
const progressEvent = (note, overrides = {}) =>
  ProgressEventSchema.parse({ at: '2026-07-06T10:00:00.000Z', note, ...overrides });

// Through the schema, like every production path — defaults stay in sync (rule 5).
const chatMessage = (overrides = {}) =>
  ArtifactChatMessageSchema.parse({
    artifactSlug: 'glow-mark',
    role: 'user',
    text: 'why this glow?',
    at: '2026-07-07T10:00:00.000Z',
    ...overrides,
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

test('recordProgress persists one JSON line per event; open() reloads in order', () => {
  const root = tmp();
  const store = new SessionStore('Progress test', root);
  store.recordProgress(progressEvent('reading the brief'));
  store.recordProgress(
    progressEvent('generating options', { source: 'svg-artisan', tokens: { input: 100, output: 50 } }),
  );

  const file = path.join(store.info.dir, 'progress.jsonl');
  assert.ok(fs.existsSync(file), 'progress.jsonl written');
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  assert.equal(lines.length, 2, 'one JSON line per event');
  assert.equal(JSON.parse(lines[0]).note, 'reading the brief');
  assert.equal(JSON.parse(lines[1]).source, 'svg-artisan');
  assert.equal(store.progress.length, 2, 'in-memory progress tracks records');

  const reopened = SessionStore.open(store.info.dir);
  assert.equal(reopened.progress.length, 2, 'progress reloads');
  assert.equal(reopened.progress[0].note, 'reading the brief');
  assert.equal(reopened.progress[0].source, 'orchestrator', 'schema default survives reload');
  assert.equal(reopened.progress[1].note, 'generating options');
  assert.deepEqual(reopened.progress[1].tokens, { input: 100, output: 50 }, 'tokens survive reload');
});

test('a corrupted progress.jsonl line is skipped on reload, valid events still load', () => {
  const root = tmp();
  const store = new SessionStore('Corrupt progress test', root);
  store.recordProgress(progressEvent('before the corruption'));
  const file = path.join(store.info.dir, 'progress.jsonl');
  fs.appendFileSync(file, 'this is { not json\n');
  store.recordProgress(progressEvent('after the corruption'));

  let reopened;
  assert.doesNotThrow(() => {
    reopened = SessionStore.open(store.info.dir);
  }, 'malformed line never throws');
  assert.equal(reopened.progress.length, 2, 'corrupt line skipped, valid events kept');
  assert.deepEqual(
    reopened.progress.map((e) => e.note),
    ['before the corruption', 'after the corruption'],
    'order preserved around the skipped line',
  );
});

test('tokenTotals sums progress events; events without tokens count zero', () => {
  const root = tmp();
  const store = new SessionStore('Token totals test', root);
  store.recordProgress(progressEvent('first', { tokens: { input: 100, output: 50 } }));
  store.recordProgress(progressEvent('no tokens on this one'));
  store.recordProgress(progressEvent('third', { tokens: { input: 10, output: 5 } }));
  assert.deepEqual(store.tokenTotals(), { input: 110, output: 55 });

  const reopened = SessionStore.open(store.info.dir);
  assert.deepEqual(reopened.tokenTotals(), { input: 110, output: 55 }, 'totals survive reload');
});

test('tokensBySink attributes a turn-end delta to the boundary sink, consume-once', () => {
  const root = tmp();
  const store = new SessionStore('Sink attribution test', root);
  // Boundary label (no tokens) declares the sink; the NEXT token event inherits it.
  store.recordProgress(progressEvent('presented a board', { category: 'generation' }));
  store.recordProgress(progressEvent('turn end', { source: 'hook:Stop', tokens: { input: 200, output: 800 } }));
  // No new boundary → the label is consumed; this uncategorized turn folds into orchestration.
  store.recordProgress(progressEvent('turn end', { source: 'hook:Stop', tokens: { input: 50, output: 50 } }));
  // A poster boundary then its delta.
  store.recordProgress(progressEvent('composed the poster', { category: 'poster' }));
  store.recordProgress(progressEvent('turn end', { source: 'hook:Stop', tokens: { input: 10, output: 40 } }));

  assert.deepEqual(store.tokensBySink(), { generation: 1000, orchestration: 100, poster: 50 });
  // The stamped category is persisted, so the attribution survives reload.
  const reopened = SessionStore.open(store.info.dir);
  assert.deepEqual(reopened.tokensBySink(), { generation: 1000, orchestration: 100, poster: 50 });
});

test('a token event with its OWN category is attributed directly, not to the boundary', () => {
  const root = tmp();
  const store = new SessionStore('Explicit sink test', root);
  store.recordProgress(
    progressEvent('tweak round', { source: 'svg-artisan', tokens: { input: 30, output: 70 }, category: 'tweak' }),
  );
  assert.deepEqual(store.tokensBySink(), { tweak: 100 });
});

test('list() summaries carry per-thread token totals; 0 without a progress file', () => {
  const root = tmp();
  const counting = new SessionStore('Counting thread', root);
  counting.recordProgress(progressEvent('first', { tokens: { input: 100, output: 50 } }));
  counting.recordProgress(progressEvent('no tokens on this one'));
  counting.recordProgress(progressEvent('third', { tokens: { input: 10, output: 5 } }));
  new SessionStore('Quiet thread', root); // never records progress → no progress.jsonl

  const list = SessionStore.list(root);
  assert.equal(list.find((d) => d.title === 'Counting thread').tokens, 165, 'input+output combined');
  assert.equal(list.find((d) => d.title === 'Quiet thread').tokens, 0, 'no progress file → 0');
});

test('recordArtifactChat persists to artifacts/chat.jsonl and reloads in order', () => {
  const root = tmp();
  const store = new SessionStore('Artifact chat test', root);
  const userMsg = chatMessage();
  const claudeMsg = chatMessage({
    role: 'claude',
    text: 'tightened the glow — see the revision',
    at: '2026-07-07T10:01:00.000Z',
    revisedSlug: 'glow-mark-2',
  });
  store.recordArtifactChat(userMsg);
  store.recordArtifactChat(claudeMsg);

  const file = path.join(store.info.dir, 'artifacts', 'chat.jsonl');
  assert.ok(fs.existsSync(file), 'artifacts/chat.jsonl written');
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  assert.equal(lines.length, 2, 'one JSON line per message');
  assert.equal(JSON.parse(lines[0]).role, 'user');
  assert.equal(JSON.parse(lines[1]).revisedSlug, 'glow-mark-2');
  assert.deepEqual(store.artifactChat, [userMsg, claudeMsg], 'in-memory chat tracks records');

  const md = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
  assert.ok(
    md.includes('glow-mark') || md.includes('why this glow?'),
    'brainstorm.md gets a line referencing the chat',
  );

  const reopened = SessionStore.open(store.info.dir);
  assert.deepEqual(reopened.artifactChat, [userMsg, claudeMsg], 'chat reloads in order with all fields');
});

test('a corrupted chat.jsonl line is skipped on reload', () => {
  const root = tmp();
  const store = new SessionStore('Corrupt chat test', root);
  store.recordArtifactChat(chatMessage({ text: 'before the corruption' }));
  const file = path.join(store.info.dir, 'artifacts', 'chat.jsonl');
  fs.appendFileSync(file, 'this is { not json\n');
  store.recordArtifactChat(chatMessage({ text: 'after the corruption' }));

  let reopened;
  assert.doesNotThrow(() => {
    reopened = SessionStore.open(store.info.dir);
  }, 'malformed line never throws');
  assert.equal(reopened.artifactChat.length, 2, 'corrupt line skipped, valid messages kept');
  assert.deepEqual(
    reopened.artifactChat.map((m) => m.text),
    ['before the corruption', 'after the corruption'],
    'order preserved around the skipped line',
  );
});

test('captureArtifact records provenance.revises', () => {
  const root = tmp();
  const store = new SessionStore('Revises test', root);
  const first = store.captureArtifact('Winner', '<svg/>', 'n', { optionIds: ['a'] });
  const second = store.captureArtifact('Winner revised', '<svg/>', 'n', {
    boardId: 'b1',
    optionIds: ['b'],
    revises: first.slug,
  });
  assert.equal(second.provenance.revises, first.slug, 'returned artifact carries revises');
  // The sidecar on disk must round-trip through the schema (rule 5), revises intact.
  const sidecar = ArtifactSchema.parse(
    JSON.parse(fs.readFileSync(path.join(store.info.dir, 'artifacts', `${second.slug}.json`), 'utf8')),
  );
  assert.equal(sidecar.provenance.revises, first.slug, 'sidecar parses with provenance.revises');
  const firstSidecar = ArtifactSchema.parse(
    JSON.parse(fs.readFileSync(path.join(store.info.dir, 'artifacts', `${first.slug}.json`), 'utf8')),
  );
  assert.equal(firstSidecar.provenance.revises, undefined, 'revises stays absent when not passed');
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

test('togglePinned adds then removes a slug, persists to session.json, and survives open()', () => {
  const root = tmp();
  const store = new SessionStore('Pin test', root);
  const artifact = store.captureArtifact('Winner', '<svg/>', 'n', { optionIds: ['a'] });
  assert.deepEqual(store.info.pinnedSlugs, [], 'fresh thread starts unpinned');

  const pinnedOn = store.togglePinned(artifact.slug);
  assert.equal(pinnedOn, true, 'toggle returns the new pinned state');
  assert.deepEqual(store.info.pinnedSlugs, [artifact.slug]);
  const sidecarOn = SessionInfoSchema.parse(
    JSON.parse(fs.readFileSync(path.join(store.info.dir, 'session.json'), 'utf8')),
  );
  assert.deepEqual(sidecarOn.pinnedSlugs, [artifact.slug], 'session.json persists the pin');
  assert.deepEqual(SessionStore.open(store.info.dir).info.pinnedSlugs, [artifact.slug], 'reload reflects the pin');

  const pinnedOff = store.togglePinned(artifact.slug);
  assert.equal(pinnedOff, false, 'toggling again unpins');
  assert.deepEqual(store.info.pinnedSlugs, []);
  const sidecarOff = SessionInfoSchema.parse(
    JSON.parse(fs.readFileSync(path.join(store.info.dir, 'session.json'), 'utf8')),
  );
  assert.deepEqual(sidecarOff.pinnedSlugs, [], 'session.json persists the unpin');
  assert.deepEqual(SessionStore.open(store.info.dir).info.pinnedSlugs, [], 'reload reflects the unpin');
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
