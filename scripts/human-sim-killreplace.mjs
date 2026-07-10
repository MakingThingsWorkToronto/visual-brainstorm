/**
 * Human-simulation harness — the ARTIFACT KILL→REPLACE journey (plan
 * `discussion/in-progress-feedback-2026-07-09/plan.md`, phase 5 human-
 * verification; comprehensive-human-testing mandate, CLAUDE.md rule 10).
 * Sibling to scripts/human-sim-livechat.mjs / -archived.mjs / -boardchat.mjs /
 * -mindchat.mjs (shared scaffold: scripts/lib/sim-runner.mjs).
 *
 * Proves the whole kill→regenerate loop end to end on the REAL path:
 *
 *   an artifact streams in (real `capture_artifact`) → the fullscreen
 *   viewer's Keep/Kill controls → kill WITH a note → the artifact is
 *   VISIBLY eliminated from the shelf and a shimmer placeholder
 *   (`pending-replacement`) fills its slot → the queued `replace-artifact`
 *   command surfaces via the real `session_status` tool (exactly how a live
 *   orchestrator learns about it, mirroring how -livechat.mjs collects
 *   `artifact-chat`) → a replacement (real `capture_artifact` with
 *   `replaces`) AND an unrelated sibling capture land ASYNCHRONOUSLY
 *   (`Promise.all` — no ordering assumed, proving the kill never blocks
 *   sibling generation) → BOTH chips render, the placeholder is gone → a
 *   Keep verdict on the replacement shows "✓ Kept", persisting across a
 *   close/reopen.
 *
 * Folded in here (this journey's OWN break-sweep over its two new controls —
 * distinct scope from scripts/ui-break-sweep.mjs's cross-surface audit):
 *   - kill-form Cancel leaves the artifact and the shelf untouched
 *   - Escape while the kill-note textarea is focused cancels the FIELD, not
 *     the viewer (the pre-existing viewer contract must still hold)
 *   - an empty-note kill still works (the note is optional) — proven by
 *     killing the REPLACEMENT itself, a chip that is ITSELF the product of a
 *     prior kill, exercising the chained shelf-slot model a second hop deep
 *
 * REAL ROUTE: the live thread is seeded PHYSICALLY on disk (rule 11: harness
 * data stays dumb) then BOUND through the real `present_board` tool with
 * discussionId + rearmBoardId (the documented recovery resume — returns the
 * recorded response instantly, leaves the thread live with no board
 * waiting), exactly as -livechat.mjs does. Every artifact capture and every
 * verdict then goes through the real MCP tool / real POST endpoint / real WS
 * broadcast — nothing is faked, and the kill is never issued by calling the
 * bridge's producer directly (rule 10's faked-orchestrator trap).
 */
import assert from 'node:assert';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { loadCanonical } from '../tests/canonical/load.mjs';
import { BoardResponseSchema, BoardSchema } from '../packages/protocol/dist/index.js';
import { sleep } from './lib/cdp.mjs';
import { runHumanSim } from './lib/sim-runner.mjs';

/**
 * The bridge runs in its OWN process on the real route, so a disk write can
 * land a beat after its WS echo renders — poll briefly instead of reading once.
 */
async function waitForDisk(what, predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() > deadline) throw new Error(`never persisted to disk: ${what}`);
    await sleep(150);
  }
}

const artifactHref = (slug) => `/api/artifact-svg/${encodeURIComponent(slug)}.svg`;

await runHumanSim('KILLREPLACE', {
  prepare: ({ scratch }) => {
    // --- seed the LIVE thread on disk with a round (canonical data) ---
    const store = new SessionStore('Glow mark — a live logo brainstorm', scratch);
    const board = { ...loadCanonical('boards/diverge.json', BoardSchema), sessionId: store.info.id };
    store.recordBoard(board);
    store.recordResponse(loadCanonical('responses/iterate.json', BoardResponseSchema));
    return { store, board };
  },
  run: async ({ mcp, awaitBase, store, board, cdp, evaluate, waitInPage, click, typeInto, step, stepCount, browserName }) => {
    // Bind the seeded thread through the REAL tool route — same recovery
    // resume -livechat.mjs uses: returns the recorded response instantly and
    // arms the bridge on THIS thread with no board waiting.
    const bound = await mcp.call('present_board', {
      discussionId: store.info.id,
      rearmBoardId: board.id,
      title: board.title,
      prompt: 'bind the seeded live thread',
      timeoutSeconds: 60,
      openBrowser: false,
    });
    assert.equal(bound.status, 'responded', 'the rearm bind returned the recorded response');
    const base = await awaitBase();

    // =========================================================================
    await step('studio loads over the real bridge on the LIVE view (root mounted)', async () => {
      await cdp.send('Page.navigate', { url: `${base}/` });
      await waitInPage(
        'the mounted root',
        `document.getElementById('root') && document.getElementById('root').childElementCount > 0`,
        30_000,
      );
      const banner = await evaluate(`document.body.textContent.includes('Completed thread')`);
      assert.equal(banner, false, 'the default view is the LIVE thread, not an archived replay');
    });

    let artifact;
    await step('an artifact streams in — captured via the real capture_artifact tool, chip renders in the shelf', async () => {
      const captured = await mcp.call('capture_artifact', {
        name: 'Aurora glyph',
        svg: board.options[0].svg,
        notes: 'first pass — literal flame mark',
        boardId: board.id,
        optionIds: ['a'],
      });
      assert.equal(captured.status, 'captured');
      artifact = captured.artifact;
      const shown = artifact.slug.slice(0, 18);
      await waitInPage(
        `the "${artifact.slug}" chip in the wayfinder shelf`,
        `document.body.textContent.includes('keeps, drag out') &&
         [...document.querySelectorAll('a')].some((a) =>
           (a.getAttribute('href') || '').includes(${JSON.stringify(artifactHref(artifact.slug))}) &&
           a.textContent.includes(${JSON.stringify(shown)}))`,
      );
    });

    await step('click the chip — the fullscreen viewer opens with Keep + Kill controls', async () => {
      await click(
        `the "${artifact.slug}" chip`,
        `[...document.querySelectorAll('a')].find((a) => (a.getAttribute('href') || '').includes(${JSON.stringify(artifactHref(artifact.slug))}))`,
      );
      await waitInPage(
        'the fullscreen viewer (title + Keep + Kill controls)',
        `document.body.textContent.includes(${JSON.stringify(artifact.name)}) &&
         !!document.querySelector('[data-testid="fullscreen-keep"]') &&
         !!document.querySelector('[data-testid="fullscreen-kill"]')`,
      );
    });

    // --- break-sweep #1: kill-form Cancel leaves everything unchanged ---
    await step('break-sweep: kill-form Cancel closes the prompt, nothing is killed', async () => {
      await click('the Kill button', `document.querySelector('[data-testid="fullscreen-kill"]')`);
      await waitInPage(
        'the kill-note form',
        `!!document.querySelector('[data-testid="fullscreen-kill-form"]') &&
         !!document.querySelector('[data-testid="fullscreen-kill-note"]')`,
      );
      await typeInto(
        'the kill-note textarea',
        `document.querySelector('[data-testid="fullscreen-kill-note"]')`,
        'accidental note — this kill should never happen',
      );
      await click('the Cancel button', `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel')`);
      await waitInPage('the kill-form is gone', `!document.querySelector('[data-testid="fullscreen-kill-form"]')`);
      // Nothing changed: the viewer is still open on the SAME live artifact, no verdict recorded.
      assert.equal(
        await evaluate(`document.querySelector('[data-testid="fullscreen-keep"]').getAttribute('aria-pressed')`),
        'false',
        'Cancel recorded no verdict — Keep is not pressed',
      );
      const state = await (await fetch(`${base}/api/state`)).json();
      const disk = state.artifacts.find((a) => a.slug === artifact.slug);
      assert.equal(disk?.verdict, undefined, 'Cancel left the artifact verdict untouched');
      assert.ok(
        (await (await fetch(`${base}/api/state`)).json()).artifacts.some((a) => a.slug === artifact.slug),
        'the shelf still carries the original artifact untouched',
      );
    });

    // Cancel only hides the form — the drafted note text lives in component
    // state and survives a reopen (a nice "your draft wasn't lost" behavior).
    // Clear it explicitly (native-setter + input event, so React's controlled
    // value actually updates) before each fresh draft, exactly as a real user
    // would select-all + retype rather than append onto old text.
    const clearKillNote = async () => {
      await evaluate(`(() => {
        const el = document.querySelector('[data-testid="fullscreen-kill-note"]');
        const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
        set.call(el, '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
    };

    // --- break-sweep #2: Escape inside the kill-note textarea cancels the FIELD, not the viewer ---
    await step('break-sweep: Escape in the kill-note textarea does not close the viewer', async () => {
      await click('the Kill button', `document.querySelector('[data-testid="fullscreen-kill"]')`);
      await waitInPage('the kill-note form (reopened)', `!!document.querySelector('[data-testid="fullscreen-kill-form"]')`);
      await clearKillNote();
      await typeInto(
        'the kill-note textarea',
        `document.querySelector('[data-testid="fullscreen-kill-note"]')`,
        'a draft note — should survive Escape untouched',
      );
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await sleep(150); // give the (non-)handler a beat before asserting nothing moved
      assert.equal(
        await evaluate(`!!document.querySelector('[data-testid="fullscreen-kill-form"]')`),
        true,
        'Escape inside the textarea left the kill-form open',
      );
      assert.equal(
        await evaluate(`!!document.querySelector('[data-testid="fullscreen-keep"]')`),
        true,
        'Escape inside the textarea did NOT close the fullscreen viewer (the existing viewer contract)',
      );
      assert.equal(
        await evaluate(`document.querySelector('[data-testid="fullscreen-kill-note"]').value`),
        'a draft note — should survive Escape untouched',
        'Escape did not clear the drafted note either — it truly did nothing to the field',
      );
      // Reset for the real kill below.
      await click('the Cancel button', `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel')`);
      await waitInPage('the kill-form is gone again', `!document.querySelector('[data-testid="fullscreen-kill-form"]')`);
    });

    // --- the real kill, WITH a note — the note steers the replacement ---
    const killNote = 'Too literal — try something more abstract, keep the warm palette.';
    await step('kill WITH a note — the artifact is eliminated, a placeholder fills its slot', async () => {
      await click('the Kill button', `document.querySelector('[data-testid="fullscreen-kill"]')`);
      await waitInPage('the kill-note form', `!!document.querySelector('[data-testid="fullscreen-kill-form"]')`);
      await clearKillNote();
      await typeInto(
        'the kill-note textarea',
        `document.querySelector('[data-testid="fullscreen-kill-note"]')`,
        killNote,
      );
      await click('the "Kill & regenerate" confirm button', `document.querySelector('[data-testid="fullscreen-kill-confirm"]')`);
      // The viewer closes (App.tsx clears fullscreen on a kill verdict) and the
      // shelf VISIBLY drops the killed chip while a shimmer placeholder fills it.
      await waitInPage(
        'the viewer closed after the kill',
        `!document.querySelector('[data-testid="fullscreen-keep"]')`,
      );
      await waitInPage(
        'the killed chip is gone from the shelf',
        `![...document.querySelectorAll('a')].some((a) => (a.getAttribute('href') || '').includes(${JSON.stringify(artifactHref(artifact.slug))}))`,
      );
      await waitInPage(
        'the shimmer placeholder is visible in the killed slot, naming the killed artifact and the note',
        `[...document.querySelectorAll('[data-testid="pending-replacement"]')].some((el) =>
           el.textContent.includes('↻ replacing…') &&
           (el.getAttribute('title') || '').includes(${JSON.stringify(artifact.slug)}) &&
           (el.getAttribute('title') || '').includes(${JSON.stringify(killNote)}))`,
      );
      await waitForDisk('the artifact sidecar records the kill verdict + note', () =>
        SessionStore.open(store.info.dir).artifacts.find((a) => a.slug === artifact.slug)?.verdict === 'kill' &&
        SessionStore.open(store.info.dir).artifacts.find((a) => a.slug === artifact.slug)?.verdictNote === killNote,
      );
    });

    await step('the queued replace-artifact command reaches the real session_status', async () => {
      let pending = [];
      const deadline = Date.now() + 10_000;
      for (;;) {
        const status = await mcp.call('session_status', {});
        pending = status.pendingUiCommands ?? [];
        if (pending.some((c) => c.command === 'replace-artifact' && c.prompt === killNote)) break;
        if (Date.now() > deadline) throw new Error('the replace-artifact command never reached session_status');
        await sleep(200);
      }
      const cmd = pending.find((c) => c.command === 'replace-artifact' && c.prompt === killNote);
      assert.ok(
        cmd.seedNote && cmd.seedNote.includes(`replaces: "${artifact.slug}"`),
        'the seed payload carries the exact replaces slug the replacement capture must use',
      );
    });

    // --- the replacement AND an unrelated sibling land ASYNCHRONOUSLY: the
    // kill must never block sibling generation, and ordering must not matter. ---
    let replacement, sibling;
    await step('the replacement + a sibling capture land asynchronously — both render, the placeholder is gone', async () => {
      const [siblingCaptured, replacementCaptured] = await Promise.all([
        mcp.call('capture_artifact', {
          name: 'Beta thread',
          svg: board.options[1].svg,
          notes: 'an unrelated, independently-generated capture',
          boardId: board.id,
          optionIds: ['b'],
        }),
        mcp.call('capture_artifact', {
          name: 'Aurora glyph — abstract take',
          svg: board.options[2].svg,
          notes: 'regeneration honoring the kill note: abstracted, same warm palette',
          boardId: board.id,
          optionIds: ['a'],
          replaces: artifact.slug,
        }),
      ]);
      assert.equal(siblingCaptured.status, 'captured');
      assert.equal(replacementCaptured.status, 'captured');
      sibling = siblingCaptured.artifact;
      replacement = replacementCaptured.artifact;

      await waitInPage(
        'the placeholder is gone',
        `!document.querySelector('[data-testid="pending-replacement"]')`,
      );
      // Order-independent: assert BOTH real chips are in frame, whichever the DOM settled on first.
      await waitInPage(
        'the sibling chip renders with its own slug',
        `[...document.querySelectorAll('a')].some((a) =>
           (a.getAttribute('href') || '').includes(${JSON.stringify(artifactHref(sibling.slug))}) &&
           a.textContent.includes(${JSON.stringify(sibling.slug.slice(0, 18))}))`,
      );
      await waitInPage(
        'the replacement chip renders in the killed slot with its own slug',
        `[...document.querySelectorAll('a')].some((a) =>
           (a.getAttribute('href') || '').includes(${JSON.stringify(artifactHref(replacement.slug))}) &&
           a.textContent.includes(${JSON.stringify(replacement.slug.slice(0, 18))}))`,
      );
      await waitInPage(
        'the ORIGINAL killed chip never reappears',
        `![...document.querySelectorAll('a')].some((a) => (a.getAttribute('href') || '').includes(${JSON.stringify(artifactHref(artifact.slug))}))`,
      );
      await waitForDisk("the killed artifact's sidecar gains replacedBy", () =>
        SessionStore.open(store.info.dir).artifacts.find((a) => a.slug === artifact.slug)?.replacedBy === replacement.slug,
      );
    });

    await step('a Keep verdict on the replacement shows ✓ Kept, persisting across close/reopen', async () => {
      await click(
        `the "${replacement.slug}" chip`,
        `[...document.querySelectorAll('a')].find((a) => (a.getAttribute('href') || '').includes(${JSON.stringify(artifactHref(replacement.slug))}))`,
      );
      await waitInPage(
        'the replacement fullscreen viewer with Keep + Kill controls',
        `document.body.textContent.includes(${JSON.stringify(replacement.name)}) &&
         !!document.querySelector('[data-testid="fullscreen-keep"]')`,
      );
      await click('the Keep button', `document.querySelector('[data-testid="fullscreen-keep"]')`);
      await waitInPage(
        'the Keep button shows the ✓ Kept pressed state',
        `document.querySelector('[data-testid="fullscreen-keep"]').getAttribute('aria-pressed') === 'true' &&
         document.querySelector('[data-testid="fullscreen-keep"]').textContent.trim() === '✓ Kept'`,
      );
      await click('the fullscreen Close button', `document.querySelector('button[aria-label="Close"]')`);
      await waitInPage('the viewer is closed', `!document.querySelector('[data-testid="fullscreen-keep"]')`);
      await waitInPage(
        'the shelf shows the ✓ kept badge on the replacement chip',
        `[...document.querySelectorAll('a')].some((a) =>
           (a.getAttribute('href') || '').includes(${JSON.stringify(artifactHref(replacement.slug))}) &&
           a.textContent.includes('✓'))`,
      );
      // Reopen: the pressed state is PERSISTED, not a one-shot local toggle.
      await click(
        `the "${replacement.slug}" chip (reopen)`,
        `[...document.querySelectorAll('a')].find((a) => (a.getAttribute('href') || '').includes(${JSON.stringify(artifactHref(replacement.slug))}))`,
      );
      await waitInPage(
        'reopening shows the ✓ Kept pressed state persisted (not re-derived client-side)',
        `document.querySelector('[data-testid="fullscreen-keep"]').getAttribute('aria-pressed') === 'true' &&
         document.querySelector('[data-testid="fullscreen-keep"]').textContent.trim() === '✓ Kept'`,
      );
    });

    // --- break-sweep #3: an empty-note kill still works (note optional), on
    // a REPLACEMENT chip (proving the chained shelf-slot model a hop deep) ---
    await step('break-sweep: an empty-note kill on the (already-kept) replacement chip still works', async () => {
      await click('the Kill button (on the replacement, currently kept)', `document.querySelector('[data-testid="fullscreen-kill"]')`);
      await waitInPage('the kill-note form', `!!document.querySelector('[data-testid="fullscreen-kill-form"]')`);
      // No note typed — confirm immediately.
      await click('the "Kill & regenerate" confirm button (empty note)', `document.querySelector('[data-testid="fullscreen-kill-confirm"]')`);
      await waitInPage('the viewer closed after the empty-note kill', `!document.querySelector('[data-testid="fullscreen-keep"]')`);
      await waitInPage(
        'the replacement chip is gone and a NEW placeholder fills the SAME (chained) slot',
        `![...document.querySelectorAll('a')].some((a) => (a.getAttribute('href') || '').includes(${JSON.stringify(artifactHref(replacement.slug))})) &&
         [...document.querySelectorAll('[data-testid="pending-replacement"]')].some((el) =>
           (el.getAttribute('title') || '').includes(${JSON.stringify(replacement.slug)}))`,
      );
      // The sibling, uninvolved in this second kill, is completely unaffected.
      await waitInPage(
        'the unrelated sibling chip is still there, untouched',
        `[...document.querySelectorAll('a')].some((a) => (a.getAttribute('href') || '').includes(${JSON.stringify(artifactHref(sibling.slug))}))`,
      );
      await waitForDisk('the replacement sidecar records an empty-note kill verdict', () =>
        SessionStore.open(store.info.dir).artifacts.find((a) => a.slug === replacement.slug)?.verdict === 'kill' &&
        SessionStore.open(store.info.dir).artifacts.find((a) => a.slug === replacement.slug)?.verdictNote === undefined,
      );
    });

    return (
      `${stepCount()} steps: real ${browserName} over raw CDP bound a seeded live thread through the real ` +
      'present_board rearm route, captured an artifact via the real capture_artifact tool, killed it WITH a ' +
      'note from the fullscreen viewer (cancel + Escape-in-textarea break-sweep proven first), watched the ' +
      'shelf VISIBLY drop the chip for a shimmer placeholder, collected the queued replace-artifact command via ' +
      'the real session_status, then landed a real replacement + an unrelated sibling capture ASYNCHRONOUSLY ' +
      '(Promise.all, order never assumed) — both chips rendered, the placeholder cleared, and the killed ' +
      "sidecar gained replacedBy; a Keep verdict on the replacement showed ✓ Kept persisting across a " +
      'close/reopen; a final empty-note kill on that (already-kept) replacement chip proved the note optional ' +
      'and the chained shelf-slot model a hop deep; zero exceptions, zero STUDIO CLIENT ERROR lines, root ' +
      'mounted throughout'
    );
  },
});
