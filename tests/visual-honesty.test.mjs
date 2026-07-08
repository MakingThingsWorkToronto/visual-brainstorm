/**
 * Unit coverage for the visual-honesty assertions (scripts/lib/visual-honesty.mjs).
 * Runs the EXACT in-page filter logic against a real jsdom document (no browser),
 * proving the contract: a rendered shell / 200 is not proof — the specific
 * canonical values must be visibly present, and error/blank surfaces are rejected.
 */
import test from 'node:test';
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import {
  assertShowsCanonical,
  assertNotFalseGreen,
  assertSurfaceShowsCanonical,
  FALSE_GREEN_MARKERS,
} from '../scripts/lib/visual-honesty.mjs';

// A stand-in for the human-sim's CDP `evaluate`: runs the passed expression
// against a real jsdom document, exactly as it would run in-page.
const makeEval = (bodyHtml) => {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return (expr) => new Function('document', `return (${expr})`)(dom.window.document);
};

test('passes when every canonical value is visibly present', async () => {
  const evaluate = makeEval('<div>Mind map</div><div>Funnel</div><div>Wreck</div><div>Cluster</div>');
  await assertShowsCanonical(evaluate, 'living gallery', ['Mind map', 'Funnel', 'Wreck', 'Cluster']);
});

test('throws naming the specific missing canonical value (not just "0 rows")', async () => {
  const evaluate = makeEval('<div>Mind map</div>'); // the other three cards never rendered
  await assert.rejects(
    () => assertShowsCanonical(evaluate, 'living gallery', ['Mind map', 'Funnel', 'Wreck']),
    (err) => /missing/.test(err.message) && err.message.includes('Funnel') && err.message.includes('Wreck'),
  );
});

test('rejects an error-boundary false-green (rendered, but broken)', async () => {
  const evaluate = makeEval('<div>Something went wrong</div>');
  await assert.rejects(() => assertNotFalseGreen(evaluate, 'board'), /error-surface/);
});

test('rejects a blank/empty shell', async () => {
  const evaluate = makeEval('   ');
  await assert.rejects(() => assertNotFalseGreen(evaluate, 'board'), /blank\/empty/);
});

test('every FALSE_GREEN_MARKER is actually caught', async () => {
  for (const marker of FALSE_GREEN_MARKERS) {
    const evaluate = makeEval(`<main>${marker} — please retry</main>`);
    await assert.rejects(() => assertNotFalseGreen(evaluate, marker), /error-surface/);
  }
});

test('empty-data false-green fails even though the surface shell rendered', async () => {
  // The gallery chrome rendered (heading + empty card slots) but the DATA is absent —
  // exactly the class of bug a testid-presence assertion reports green on.
  const evaluate = makeEval('<h2>Living Gallery</h2><button data-testid="method-card-mindmap"></button>');
  await assert.rejects(
    () => assertSurfaceShowsCanonical(evaluate, 'living gallery', ['Mind map', 'Funnel', 'Wreck', 'Cluster']),
    /missing/,
  );
});

test('assertSurfaceShowsCanonical passes on a genuinely honest surface', async () => {
  const evaluate = makeEval(
    '<h2>Living Gallery</h2><div>Mind map</div><div>Funnel</div><div>Wreck</div><div>Cluster</div>' +
      '<div>You said the structure is still forming — a co-edited map fits.</div>',
  );
  await assertSurfaceShowsCanonical(evaluate, 'living gallery', [
    'Mind map',
    'Funnel',
    'Wreck',
    'Cluster',
    'You said the structure is still forming — a co-edited map fits.',
  ]);
});
