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
  PendingReplacementSchema,
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

test('cacheIntakeGallery persists the gallery cards for reuse (intake content economy)', () => {
  const root = tmp();
  const store = new SessionStore('Gallery cache test', root);
  const gallery = {
    id: 'gallery-1',
    prompt: 'Pick a method',
    cards: [
      { method: 'funnel', label: 'Funnel', blurb: '', svg: '<svg viewBox="0 0 100 100"/>', recommended: true, reason: 'you said options' },
      { method: 'mindmap', label: 'Mind map', blurb: '', svg: '<svg viewBox="0 0 100 100"/>', recommended: false, reason: '' },
    ],
  };
  const file = store.cacheIntakeGallery(gallery);
  assert.equal(file, path.join(store.info.dir, 'intake-gallery.json'));
  const reloaded = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(reloaded, gallery, 'the SAME cards come back — a re-present never regenerates minis');
  // Last-write-wins: a second present overwrites, never duplicates.
  store.cacheIntakeGallery({ ...gallery, id: 'gallery-2' });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).id, 'gallery-2');
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

test('a token event with its OWN category consumes the armed boundary label — the NEXT uncategorized turn does not misattribute to it', () => {
  const root = tmp();
  const store = new SessionStore('Consume-on-own-category test', root);
  // Boundary arms the sink...
  store.recordProgress(progressEvent('presented a board', { category: 'generation' }));
  // ...but this turn declares its OWN category, so it must consume the armed
  // label rather than leave it armed for the NEXT (uncategorized) turn.
  store.recordProgress(
    progressEvent('tweak round', { source: 'svg-artisan', tokens: { input: 100, output: 50 }, category: 'tweak' }),
  );
  // No new boundary: this uncategorized turn must fold into orchestration, NOT
  // inherit the stale 'generation' label (the bug) nor 'tweak' either.
  store.recordProgress(progressEvent('turn end', { source: 'hook:Stop', tokens: { input: 20, output: 10 } }));

  assert.deepEqual(store.tokensBySink(), { tweak: 150, orchestration: 30 });
  // Live and reloaded attribution must match (SessionStore.open mirrors the same bookkeeping).
  const reopened = SessionStore.open(store.info.dir);
  assert.deepEqual(reopened.tokensBySink(), { tweak: 150, orchestration: 30 });
});

test('a token-less turn-end consumes the armed label — no leak onto a later unrelated delta', () => {
  const root = tmp();
  const store = new SessionStore('Stale label test', root);
  store.recordProgress(progressEvent('presented a board', { category: 'generation' }));
  // The labeled turn ends with ZERO new billable tokens (fully cached turn /
  // unreadable transcript): the label must still be consumed by the turn-end.
  store.recordProgress(progressEvent('turn end', { source: 'hook:Stop' }));
  // A later unrelated turn must fold into orchestration, never inherit 'generation'.
  store.recordProgress(progressEvent('turn end', { source: 'hook:Stop', tokens: { input: 40, output: 60 } }));
  assert.deepEqual(store.tokensBySink(), { orchestration: 100 });
  // Reload reconstruction mirrors the same consume rule.
  const reopened = SessionStore.open(store.info.dir);
  assert.deepEqual(reopened.tokensBySink(), { orchestration: 100 });
});

test('reload of a thread whose LAST event is an unconsumed boundary re-arms it', () => {
  const root = tmp();
  const store = new SessionStore('Trailing boundary test', root);
  store.recordProgress(progressEvent('presented a board', { category: 'generation' }));
  const reopened = SessionStore.open(store.info.dir);
  // The first live delta after reload inherits the still-armed label.
  reopened.recordProgress(progressEvent('turn end', { source: 'hook:Stop', tokens: { input: 10, output: 90 } }));
  assert.deepEqual(reopened.tokensBySink(), { generation: 100 });
});

test('the persisted brainstorm.md digest routes EXPLICITLY to the best-SVG default (decision 4)', () => {
  const root = tmp();
  const store = new SessionStore('Routing line test', root);
  store.defaultModel = 'claude-fable-5';
  store.recordBoard(board(1));
  // The canonical response carries NO per-round model pick.
  store.recordResponse(response('b1'));
  const md = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
  assert.ok(
    md.includes('best-SVG default claude-fable-5'),
    'the durable record must carry the routing line even without a per-round pick — the rolling-digest resume reads THIS, not the live tool result',
  );
});

test('readIntakeGallery returns the cached cards, or null when nothing was cached', () => {
  const root = tmp();
  const store = new SessionStore('Gallery read test', root);
  assert.equal(store.readIntakeGallery(), null, 'no cache yet → null, never a throw');
  const gallery = { id: 'g1', prompt: 'p', cards: [{ method: 'funnel', label: 'Funnel', blurb: '', svg: '<svg viewBox="0 0 1 1"/>', recommended: true, reason: 'r' }] };
  store.cacheIntakeGallery(gallery);
  assert.deepEqual(store.readIntakeGallery(), gallery);
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

test('a presented mindmap board auto-captures its snapshot with provenance.kind (explicit Maximize-chat target)', () => {
  const root = tmp();
  const store = new SessionStore('Snapshot kind test', root);
  const tree = { nodeData: { id: 'root', topic: 'Root', children: [{ id: 'k', topic: 'Kid' }] } };
  store.recordBoard(board(1, { kind: 'mindmap', options: [], tree }));
  assert.equal(store.artifacts.length, 1, 'presenting a tree captures exactly one snapshot');
  const snapshot = store.artifacts[0];
  assert.equal(snapshot.provenance.kind, 'mindmap-snapshot', 'the snapshot is marked explicitly, not by heuristic');
  assert.equal(snapshot.provenance.boardId, 'b1');
  // The sidecar round-trips through the schema with the kind intact (rule 5).
  const sidecar = ArtifactSchema.parse(
    JSON.parse(fs.readFileSync(path.join(store.info.dir, 'artifacts', `${snapshot.slug}.json`), 'utf8')),
  );
  assert.equal(sidecar.provenance.kind, 'mindmap-snapshot');
  // Ordinary captures stay kind-less — the role is exclusive to the snapshot.
  const plain = store.captureArtifact('Winner', '<svg/>', 'n', { optionIds: ['a'] });
  assert.equal(plain.provenance.kind, undefined);
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

// ---------------------------------------------------------------------------
// Fullscreen keep/kill verdicts + kill-replacement pipeline
// (in-progress-feedback phase 2)
// ---------------------------------------------------------------------------

test('updateArtifactVerdict stamps verdict/verdictNote/verdictAt, rewrites the sidecar, and survives reload', () => {
  const root = tmp();
  const store = new SessionStore('Verdict test', root);
  const artifact = store.captureArtifact('Winner', '<svg/>', 'n', { optionIds: ['a'] });

  const updated = store.updateArtifactVerdict(artifact.slug, 'keep', 'love this one');
  assert.equal(updated.slug, artifact.slug);
  assert.equal(updated.verdict, 'keep');
  assert.equal(updated.verdictNote, 'love this one');
  assert.ok(updated.verdictAt, 'verdictAt stamped');

  const md = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
  assert.ok(md.includes('Artifact verdict (`winner`): KEEP — love this one'), 'brainstorm.md gets a verdict line');

  // Sidecar round-trips through the schema (rule 5), verdict fields intact.
  const sidecar = ArtifactSchema.parse(
    JSON.parse(fs.readFileSync(path.join(store.info.dir, 'artifacts', `${artifact.slug}.json`), 'utf8')),
  );
  assert.equal(sidecar.verdict, 'keep');
  assert.equal(sidecar.verdictNote, 'love this one');
  assert.ok(sidecar.verdictAt);

  // Persist + reload round-trip: SessionStore.open re-reads the sidecar with
  // the verdict fields intact — reload is not a memory-only concern.
  const reopened = SessionStore.open(store.info.dir);
  const reloaded = reopened.artifacts.find((a) => a.slug === artifact.slug);
  assert.equal(reloaded.verdict, 'keep');
  assert.equal(reloaded.verdictNote, 'love this one');
  assert.equal(reloaded.verdictAt, updated.verdictAt);
});

test('updateArtifactVerdict on an unknown slug returns null and touches nothing', () => {
  const root = tmp();
  const store = new SessionStore('Unknown verdict test', root);
  store.captureArtifact('Winner', '<svg/>', 'n', { optionIds: ['a'] });
  assert.equal(store.updateArtifactVerdict('missing', 'kill'), null);
  assert.equal(store.artifacts[0].verdict, undefined, 'the real artifact is untouched');
});

test('a note is optional on a verdict — omitting it leaves verdictNote unset', () => {
  const root = tmp();
  const store = new SessionStore('Verdict no-note test', root);
  const artifact = store.captureArtifact('Winner', '<svg/>', 'n', { optionIds: ['a'] });
  const updated = store.updateArtifactVerdict(artifact.slug, 'kill');
  assert.equal(updated.verdict, 'kill');
  assert.equal(updated.verdictNote, undefined);
});

test('captureArtifact with provenance.replaces stamps the killed artifact\'s replacedBy and survives reload', () => {
  const root = tmp();
  const store = new SessionStore('Replaces test', root);
  const killed = store.captureArtifact('Winner', '<svg/>', 'n', { optionIds: ['a'] });
  store.updateArtifactVerdict(killed.slug, 'kill', 'too gimmicky');
  store.addPendingReplacement({ replacesSlug: killed.slug, characteristic: '"Alpha"', note: 'too gimmicky', at: 'now' });

  const replacement = store.captureArtifact('Winner v2', '<svg/>', 'toned down', {
    optionIds: ['a'],
    replaces: killed.slug,
  });

  const killedInMemory = store.artifacts.find((a) => a.slug === killed.slug);
  assert.equal(killedInMemory.replacedBy, replacement.slug, 'in-memory killed artifact stamped');
  assert.equal(store.pendingReplacements.length, 0, 'the matching pending replacement is resolved');

  const md = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
  assert.ok(md.includes(`\`${killed.slug}\` (killed) replaced by \`${replacement.slug}\``));

  // Sidecar round-trips through the schema.
  const killedSidecar = ArtifactSchema.parse(
    JSON.parse(fs.readFileSync(path.join(store.info.dir, 'artifacts', `${killed.slug}.json`), 'utf8')),
  );
  assert.equal(killedSidecar.replacedBy, replacement.slug);
  const replacementSidecar = ArtifactSchema.parse(
    JSON.parse(fs.readFileSync(path.join(store.info.dir, 'artifacts', `${replacement.slug}.json`), 'utf8')),
  );
  assert.equal(replacementSidecar.provenance.replaces, killed.slug);

  // Reload: replacedBy and the resolved pending-replacements survive.
  const reopened = SessionStore.open(store.info.dir);
  assert.equal(
    reopened.artifacts.find((a) => a.slug === killed.slug).replacedBy,
    replacement.slug,
    'replacedBy survives reload',
  );
  assert.equal(reopened.pendingReplacements.length, 0, 'resolved pending stays resolved after reload');
});

test('addPendingReplacement upserts by replacesSlug and persists to pending-replacements.json; resolvePendingReplacement removes + persists', () => {
  const root = tmp();
  const store = new SessionStore('Pending test', root);
  const file = path.join(store.info.dir, 'pending-replacements.json');

  store.addPendingReplacement({ replacesSlug: 'glow-mark', characteristic: '"Alpha"', at: '2026-07-09T10:00:00.000Z' });
  assert.equal(store.pendingReplacements.length, 1);
  let onDisk = JSON.parse(fs.readFileSync(file, 'utf8')).map((p) => PendingReplacementSchema.parse(p));
  assert.equal(onDisk.length, 1);
  assert.equal(onDisk[0].replacesSlug, 'glow-mark');

  // Upsert: a second add for the SAME replacesSlug replaces, never duplicates.
  store.addPendingReplacement({
    replacesSlug: 'glow-mark',
    characteristic: '"Alpha"',
    note: 'too gimmicky',
    at: '2026-07-09T10:05:00.000Z',
  });
  assert.equal(store.pendingReplacements.length, 1, 'upsert, not append');
  assert.equal(store.pendingReplacements[0].note, 'too gimmicky');
  onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(onDisk.length, 1);
  assert.equal(onDisk[0].note, 'too gimmicky');

  // A different replacesSlug is a separate entry.
  store.addPendingReplacement({ replacesSlug: 'other-mark', at: '2026-07-09T10:10:00.000Z' });
  assert.equal(store.pendingReplacements.length, 2);

  // Reload: both persisted entries come back, schema-valid.
  const reopened = SessionStore.open(store.info.dir);
  assert.equal(reopened.pendingReplacements.length, 2);
  assert.deepEqual(
    reopened.pendingReplacements.map((p) => p.replacesSlug).sort(),
    ['glow-mark', 'other-mark'],
  );

  reopened.resolvePendingReplacement('glow-mark');
  assert.equal(reopened.pendingReplacements.length, 1);
  assert.equal(reopened.pendingReplacements[0].replacesSlug, 'other-mark');
  onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(onDisk.length, 1, 'removal persists to disk');
  assert.equal(onDisk[0].replacesSlug, 'other-mark');

  // Resolving an unknown slug is a harmless no-op.
  reopened.resolvePendingReplacement('nope');
  assert.equal(reopened.pendingReplacements.length, 1);
});

test('a corrupted pending-replacements.json is skipped on reload without throwing', () => {
  const root = tmp();
  const store = new SessionStore('Corrupt pending test', root);
  store.addPendingReplacement({ replacesSlug: 'glow-mark', at: 'now' });
  fs.writeFileSync(path.join(store.info.dir, 'pending-replacements.json'), 'this is { not json');

  let reopened;
  assert.doesNotThrow(() => {
    reopened = SessionStore.open(store.info.dir);
  }, 'malformed pending-replacements.json never throws');
  assert.deepEqual(reopened.pendingReplacements, [], 'unreadable file skipped honestly, no throw');
});

test('a pending-replacements.json with one corrupt entry among valid JSON never throws — entries before the bad one are kept (single try/catch over the loop)', () => {
  const root = tmp();
  const store = new SessionStore('Partially corrupt pending test', root);
  // A single malformed entry (fails PendingReplacementSchema) inside otherwise-
  // valid JSON: the array parse + per-entry schema.parse is wrapped in ONE
  // try/catch (mirrors the honest-skip contract of the other reload guards),
  // so the loop aborts at the first bad entry — anything pushed before it
  // survives, nothing after it is trusted, and reload never throws.
  fs.writeFileSync(
    path.join(store.info.dir, 'pending-replacements.json'),
    JSON.stringify([{ replacesSlug: 'ok', at: 'now' }, { at: 'now' /* missing replacesSlug */ }]),
  );
  let reopened;
  assert.doesNotThrow(() => {
    reopened = SessionStore.open(store.info.dir);
  }, 'malformed entry never throws');
  assert.deepEqual(
    reopened.pendingReplacements,
    [{ replacesSlug: 'ok', at: 'now' }],
    'the entry parsed before the corrupt one survives; the corrupt one and anything after it is dropped',
  );
});

// ---------------------------------------------------------------------------
// Token attribution edges + pipe-cursor idempotency (token-economy follow-ups,
// 2026-07-09): last-label-wins pinned, sidebar/meter skip rules unified, and
// the per-cursor high-water ledger that de-duplicates overlapping pipe deltas.
// ---------------------------------------------------------------------------

test('attribution: two boundaries before one delta — the LAST label wins (pinned heuristic)', () => {
  const store = new SessionStore('Label test', tmp());
  store.recordProgress(progressEvent('asked a concierge question', { category: 'intake' }));
  store.recordProgress(progressEvent('presented a board to the studio', { category: 'generation' }));
  store.recordProgress(
    progressEvent('Claude finished a turn', {
      source: 'hook:Stop',
      tokens: { input: 100, output: 10 },
    }),
  );
  assert.deepEqual(
    store.tokensBySink(),
    { generation: 110 },
    'the delta attributes to the label armed LAST; the earlier label never leaks',
  );
});

test('sidebar total equals the opened thread meter on a thread with a corrupt line', () => {
  const root = tmp();
  const store = new SessionStore('Skip-rule parity', root);
  store.recordProgress(progressEvent('real usage', { tokens: { input: 100, output: 10 } }));
  // A foreign/corrupt line: valid JSON carrying tokens but schema-invalid
  // (unknown category) — open() drops it, so the sidebar sum must drop it too.
  fs.appendFileSync(
    path.join(store.info.dir, 'progress.jsonl'),
    JSON.stringify({ at: 'x', note: 'foreign', category: 'bogus', tokens: { input: 999, output: 999 } }) + '\n' +
      'not json at all\n',
  );
  const reopened = SessionStore.open(store.info.dir);
  const meter = reopened.tokenTotals();
  const sidebar = SessionStore.list(root).find((s) => s.id === store.info.id);
  assert.deepEqual(meter, { input: 100, output: 10 }, 'open() drops the invalid line');
  assert.equal(sidebar.tokens, meter.input + meter.output, 'sidebar sum uses the SAME skip rule');
});

// Two hooks racing one cursor both read the same base and post overlapping
// windows — the ledger clamps the second to the un-accounted remainder.
test('cursor idempotency: overlapping deltas from one cursor base never double-count', () => {
  const store = new SessionStore('Race dedupe', tmp());
  // Hook A read base 0, transcript at 250/25.
  store.recordProgress(
    progressEvent('a subagent finished', {
      source: 'hook:SubagentStop',
      tokens: { input: 250, output: 25 },
      tokenCursor: { id: 'sess-1', gen: 0, input: 250, output: 25 },
    }),
  );
  // Hook B also read base 0, transcript meanwhile at 300/30 — its window
  // re-covers A's 250/25. Only the 50/5 remainder may land.
  store.recordProgress(
    progressEvent('Claude finished a turn', {
      source: 'hook:Stop',
      tokens: { input: 300, output: 30 },
      tokenCursor: { id: 'sess-1', gen: 0, input: 300, output: 30 },
    }),
  );
  assert.deepEqual(store.tokenTotals(), { input: 300, output: 30 }, 'sum equals the transcript, not 550/55');
});

test('cursor idempotency: a re-posted identical window records as token-less (slow-accept re-post)', () => {
  const store = new SessionStore('Repost dedupe', tmp());
  const event = () =>
    progressEvent('Claude finished a turn', {
      source: 'hook:Stop',
      tokens: { input: 250, output: 25 },
      tokenCursor: { id: 'sess-2', gen: 0, input: 250, output: 25 },
    });
  store.recordProgress(event());
  store.recordProgress(event());
  assert.deepEqual(store.tokenTotals(), { input: 250, output: 25 }, 'the duplicate contributes nothing');
  assert.equal(store.progress.length, 2, 'the duplicate event itself still lands (a real turn-end)');
  assert.equal(store.progress[1].tokens, undefined, 'its usage was already counted — recorded token-less');
});

test('cursor idempotency: the ledger survives a reload (high-water marks rebuilt in open())', () => {
  const store = new SessionStore('Reload dedupe', tmp());
  store.recordProgress(
    progressEvent('Claude finished a turn', {
      source: 'hook:Stop',
      tokens: { input: 250, output: 25 },
      tokenCursor: { id: 'sess-3', gen: 0, input: 250, output: 25 },
    }),
  );
  const reopened = SessionStore.open(store.info.dir);
  reopened.recordProgress(
    progressEvent('Claude finished a turn', {
      source: 'hook:Stop',
      tokens: { input: 300, output: 30 },
      tokenCursor: { id: 'sess-3', gen: 0, input: 300, output: 30 },
    }),
  );
  assert.deepEqual(reopened.tokenTotals(), { input: 300, output: 30 }, 'post-reload deltas still dedupe');
});

test('cursor idempotency: a generation bump resets the mark (compaction never eats real usage)', () => {
  const store = new SessionStore('Gen reset', tmp());
  store.recordProgress(
    progressEvent('Claude finished a turn', {
      source: 'hook:Stop',
      tokens: { input: 250, output: 25 },
      tokenCursor: { id: 'sess-4', gen: 0, input: 250, output: 25 },
    }),
  );
  // Transcript compacted and regrew: totals now BELOW the gen-0 mark, but the
  // pipe bumped gen — the fresh ledger accepts the delta in full.
  store.recordProgress(
    progressEvent('Claude finished a turn', {
      source: 'hook:Stop',
      tokens: { input: 40, output: 4 },
      tokenCursor: { id: 'sess-4', gen: 1, input: 40, output: 4 },
    }),
  );
  assert.deepEqual(store.tokenTotals(), { input: 290, output: 29 });
});

test('cursor idempotency: a fully-deduped event still consumes the armed sink label', () => {
  const store = new SessionStore('Consume label', tmp());
  store.recordProgress(
    progressEvent('Claude finished a turn', {
      source: 'hook:Stop',
      tokens: { input: 100, output: 10 },
      tokenCursor: { id: 'sess-5', gen: 0, input: 100, output: 10 },
    }),
  );
  store.recordProgress(progressEvent('presented a board to the studio', { category: 'generation' }));
  // The duplicate turn-end dedupes to zero but still ENDS the labeled turn.
  store.recordProgress(
    progressEvent('Claude finished a turn', {
      source: 'hook:Stop',
      tokens: { input: 100, output: 10 },
      tokenCursor: { id: 'sess-5', gen: 0, input: 100, output: 10 },
    }),
  );
  store.recordProgress(
    progressEvent('Claude finished a turn', {
      source: 'hook:Stop',
      tokens: { input: 150, output: 15 },
      tokenCursor: { id: 'sess-5', gen: 0, input: 150, output: 15 },
    }),
  );
  assert.deepEqual(
    store.tokensBySink(),
    { orchestration: 165 },
    'the label died with the deduped turn-end; the later delta folds into orchestration',
  );
});
