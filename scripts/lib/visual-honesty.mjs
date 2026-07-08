/**
 * Visual-honesty assertions for the real-browser human-sim.
 *
 * Ported from the donor repo's frontend-tester contract (TradesPath CLAUDE.md
 * Rule 14 / SG-49 "Screenshot Content Validation" + L-152 "assert the specific
 * value, not list length"): a rendered surface — or a 200 — is NOT proof. The
 * capture/DOM "succeeds" on a spinner, an error boundary, a blank page, or a
 * surface rendered with EMPTY/WRONG data just as it does on the real thing. A
 * test that only asserts "a testid exists" or "N rows rendered" reports green on
 * garbage. Proof is: the page VISIBLY contains the specific CANONICAL values.
 *
 * These helpers run in the human-sim (real Chrome over CDP) via its `evaluate`
 * (in-page eval → JSON). Root every expected value in `tests/canonical/` so the
 * assertion exercises the real seeded reality, never a synthetic literal.
 */
import assert from 'node:assert';

/** Surfaces that "render" but are a false-green — never accept these as a page. */
export const FALSE_GREEN_MARKERS = [
  'Something went wrong',
  'Unexpected Application Error',
  'The studio hit an error', // studio CrashPanel copy
  'Application error: a client-side exception',
  'This page could not be found',
  'Redirecting…',
  'Completing sign-in',
];

/** innerText (VISIBLE text only — respects display:none) with a textContent fallback. */
const VISIBLE_TEXT = `((document.body && (document.body.innerText || document.body.textContent)) || '')`;

/**
 * Assert every expected canonical string is VISIBLY on the page. `values` are
 * the specific canonical data the surface must show (labels, names, node topics,
 * a quoted reason) — NOT structural markers. Throws naming the missing values.
 */
export async function assertShowsCanonical(evaluate, label, values) {
  const list = [...new Set(values.filter((v) => typeof v === 'string' && v.length > 0))];
  const missing = await evaluate(
    `(() => { const t = ${VISIBLE_TEXT}; return ${JSON.stringify(list)}.filter((v) => !t.includes(v)); })()`,
  );
  assert.deepEqual(
    missing,
    [],
    `[visual-honesty] "${label}": expected canonical data NOT in frame — missing ${JSON.stringify(missing)}. ` +
      `A 200/render/testid is not proof; the surface must SHOW the real values (empty/wrong data is a false-green).`,
  );
}

/**
 * Assert the surface is not a false-green: no error/redirect/blank copy, and the
 * page carries real text (not an empty shell). Call it on every data-bearing
 * surface BEFORE trusting a downstream assertion.
 */
export async function assertNotFalseGreen(evaluate, label) {
  const verdict = await evaluate(
    `(() => {
       const t = ${VISIBLE_TEXT};
       const hit = ${JSON.stringify(FALSE_GREEN_MARKERS)}.find((m) => t.includes(m));
       if (hit) return 'error-surface: ' + JSON.stringify(hit);
       if (t.trim().length < 12) return 'blank/empty shell (visible text < 12 chars)';
       return '';
     })()`,
  );
  assert.equal(verdict, '', `[visual-honesty] "${label}" is a false-green — ${verdict}`);
}

/**
 * Assert a data-bearing surface is honest in one call: not a false-green AND it
 * visibly shows every canonical value. This is the bar for every list/board/
 * gallery/canvas the human walks through.
 */
export async function assertSurfaceShowsCanonical(evaluate, label, values) {
  await assertNotFalseGreen(evaluate, label);
  await assertShowsCanonical(evaluate, label, values);
}
