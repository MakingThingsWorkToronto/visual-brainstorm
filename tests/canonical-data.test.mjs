// Proves the canonical dataset (tests/canonical/README.md): every file parses through
// its protocol schema, the set is internally consistent (responses reference real
// boards/options), and schema defaults apply where canonical files omit fields.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { CANONICAL_DIR, loadCanonical } from './canonical/load.mjs';
import {
  BoardResponseSchema,
  BoardSchema,
  DiscussionSummarySchema,
  PHASES,
  SessionInfoSchema,
  ThemeSchema,
} from '../packages/protocol/dist/index.js';

// Every canonical JSON file, enumerated explicitly with its schema. A file on disk
// that is NOT in this map fails the stray-file test below — nothing skips proving.
const CANONICAL_FILES = {
  'threads/session.json': SessionInfoSchema,
  'threads/discussion-summary.json': DiscussionSummarySchema,
  'boards/diverge.json': BoardSchema,
  'boards/expand.json': BoardSchema,
  'boards/mutate.json': BoardSchema,
  'boards/wreck.json': BoardSchema,
  'boards/cluster.json': BoardSchema,
  'boards/converge.json': BoardSchema,
  'responses/iterate.json': BoardResponseSchema,
  'responses/steer-attachments.json': BoardResponseSchema,
  'responses/wreck-flaws.json': BoardResponseSchema,
  'responses/cluster-positions.json': BoardResponseSchema,
  'responses/converge-triage.json': BoardResponseSchema,
  'responses/finalize.json': BoardResponseSchema,
  'themes/theme.json': ThemeSchema,
};

test('every canonical file parses through its protocol schema', () => {
  for (const [relPath, schema] of Object.entries(CANONICAL_FILES)) {
    assert.doesNotThrow(() => loadCanonical(relPath, schema), `${relPath} must parse`);
  }
});

test('no stray canonical JSON escapes the proving map', () => {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json')) {
        found.push(path.relative(CANONICAL_DIR, full).replaceAll('\\', '/'));
      }
    }
  };
  walk(CANONICAL_DIR);
  assert.deepEqual(found.sort(), Object.keys(CANONICAL_FILES).sort());
});

test('the six boards cover the six phases, one each, with 2+ rendered options', () => {
  for (const phase of PHASES) {
    const board = loadCanonical(`boards/${phase}.json`, BoardSchema);
    assert.equal(board.phase, phase, `boards/${phase}.json carries its phase`);
    assert.equal(board.sessionId, 'glow-mark-2026-07-07', 'boards belong to the canonical thread');
    assert.ok(board.options.length >= 2, `${phase} board has 2+ options`);
    for (const option of board.options) {
      assert.ok(option.svg.includes('viewBox="0 0 100 100"'), `${phase}/${option.id} svg is self-contained`);
    }
  }
});

test('board lineage is coherent: every parent id exists on an earlier board', () => {
  const boards = PHASES.map((phase) => loadCanonical(`boards/${phase}.json`, BoardSchema)).sort(
    (a, b) => a.round - b.round,
  );
  const seen = new Set();
  for (const board of boards) {
    for (const option of board.options) {
      for (const parent of option.parents) {
        assert.ok(seen.has(parent), `${board.id}/${option.id} parent "${parent}" from an earlier round`);
      }
    }
    for (const option of board.options) seen.add(option.id);
  }
});

test('every canonical response targets a real board and only its option ids', () => {
  const boardsById = new Map(
    PHASES.map((phase) => loadCanonical(`boards/${phase}.json`, BoardSchema)).map((b) => [b.id, b]),
  );
  const responseFiles = Object.keys(CANONICAL_FILES).filter((p) => p.startsWith('responses/'));
  for (const relPath of responseFiles) {
    const response = loadCanonical(relPath, BoardResponseSchema);
    const board = boardsById.get(response.boardId);
    assert.ok(board, `${relPath} boardId "${response.boardId}" is a canonical board`);
    const optionIds = new Set(board.options.map((o) => o.id));
    const referenced = [
      ...response.selectedOptionIds,
      ...Object.keys(response.perOptionNotes),
      ...response.remixPairs.flat(),
      ...Object.keys(response.triage),
      ...Object.keys(response.mutations),
      ...Object.keys(response.flaws),
      ...Object.keys(response.positions),
      ...response.clusters.flat(),
      ...Object.keys(response.deckVerdicts),
      ...response.duelResults.flatMap((d) => [...d.pair, d.winner]),
      ...response.ranking,
      ...(response.finalOptionId ? [response.finalOptionId] : []),
    ];
    for (const id of referenced) {
      assert.ok(optionIds.has(id), `${relPath} references "${id}" — an option on ${board.id}`);
    }
  }
});

test('defaults apply where canonical responses omit fields (schema round-trip)', () => {
  // iterate.json carries only the core survey fields — every phase mechanic defaults empty.
  const iterate = loadCanonical('responses/iterate.json', BoardResponseSchema);
  assert.deepEqual(iterate.deckVerdicts, {});
  assert.deepEqual(iterate.duelResults, []);
  assert.deepEqual(iterate.ranking, []);
  assert.deepEqual(iterate.triage, {});
  assert.deepEqual(iterate.flaws, {});
  assert.deepEqual(iterate.positions, {});
  assert.deepEqual(iterate.attachments, []);
  assert.deepEqual(iterate.paletteColors, []);
  assert.deepEqual(iterate.commands, []);
  assert.equal(iterate.requestedPhase, undefined);
  // wreck-flaws.json omits selections and action's siblings — defaults fill them.
  const wreck = loadCanonical('responses/wreck-flaws.json', BoardResponseSchema);
  assert.deepEqual(wreck.selectedOptionIds, []);
  assert.deepEqual(wreck.perOptionNotes, {});
  assert.equal(wreck.action, 'iterate');
  // discussion summary carries archived explicitly; tokens is real data, not a default.
  const summary = loadCanonical('threads/discussion-summary.json', DiscussionSummarySchema);
  assert.equal(summary.archived, false);
  assert.equal(summary.tokens, 48250);
});

test('per-phase mechanics carry real data in their canonical responses', () => {
  const triage = loadCanonical('responses/converge-triage.json', BoardResponseSchema);
  assert.equal(triage.action, 'accept');
  assert.deepEqual(new Set(Object.values(triage.triage)), new Set(['keep', 'kill', 'merge']));
  assert.equal(
    Object.keys(triage.triage).length,
    loadCanonical('boards/converge.json', BoardSchema).options.length,
    'converge gate: every option triaged',
  );

  const cluster = loadCanonical('responses/cluster-positions.json', BoardResponseSchema);
  assert.equal(Object.keys(cluster.positions).length, 3);
  assert.ok(cluster.clusters.length >= 2);
  assert.ok(cluster.gapNotes[0].note.length > 0);

  const finalize = loadCanonical('responses/finalize.json', BoardResponseSchema);
  assert.equal(finalize.action, 'finalize');
  assert.equal(finalize.finalOptionId, 'fusion');
  assert.equal(finalize.duelResults[0].winner, finalize.ranking[0], 'duel winner leads the ranking');

  const steer = loadCanonical('responses/steer-attachments.json', BoardResponseSchema);
  assert.equal(steer.model, 'claude-opus-4-8');
  assert.equal(steer.requestedPhase, 'mutate');
  assert.ok(steer.attachments[0].dataUri.startsWith('data:image/png;base64,'));
  assert.ok(steer.attachments[1].savedPath.includes('attachments/'));
  assert.equal(steer.paletteColors.length, 3);
});

test('canonical theme is complete: both schemes, 5-color named palette on the accent', () => {
  const theme = loadCanonical('themes/theme.json', ThemeSchema);
  assert.equal(theme.palette.length, 5);
  for (const color of theme.palette) {
    assert.ok(color.name.length > 0, 'palette colors are named');
    assert.match(color.value, /^#[0-9a-f]{6}$/i);
  }
  assert.ok(
    theme.palette.some((c) => c.value.toLowerCase() === theme.light.accent.toLowerCase()),
    'palette anchors on the theme accent',
  );
});

test('session and summary describe the same canonical thread', () => {
  const session = loadCanonical('threads/session.json', SessionInfoSchema);
  const summary = loadCanonical('threads/discussion-summary.json', DiscussionSummarySchema);
  assert.equal(session.id, summary.id);
  assert.equal(session.dir, summary.dir);
  assert.equal(summary.rounds, PHASES.length, 'one canonical round per phase');
});
