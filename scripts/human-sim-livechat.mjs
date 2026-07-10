/**
 * Human-simulation harness — the LIVE-thread ARTIFACT-CHAT journey (comprehensive-
 * human-testing mandate, CLAUDE.md rule 10). Sibling to scripts/human-sim.mjs and
 * scripts/human-sim-archived.mjs (shared scaffold: scripts/lib/sim-runner.mjs).
 *
 * Proves the operator's 2026-07-09 report — "I submit a message but do NOT see my chat
 * message bubble" — on the REAL path, on the DEFAULT LIVE VIEW (`archived === null`),
 * which no prior browser journey exercised: the full `human-sim.mjs` goal run opens the
 * fullscreen viewer and asserts the composer EXISTS but never TYPES a message, and
 * `human-sim-archived.mjs` exercises only the archived (`subscribeChat`) routing — not the
 * live `useBridge` reducer append that a mid-brainstorm chat actually uses.
 *
 *   default live view (seeded thread, rounds + a keep) → click the keep → the unified
 *   ArtifactFullscreen viewer with its composer → TYPE a question + Send → the user's OWN
 *   bubble must render in the dialog AND persist to the live thread's artifacts/chat.jsonl.
 *
 * The live thread is seeded PHYSICALLY on disk under discussionRoot/ using the real
 * SessionStore write helpers against canonical fixtures (tests/canonical/boards/diverge.json,
 * responses/iterate.json) — never a hand-built object literal (rule 5/canonical-data
 * convention). Nothing is faked: the studio renders from the real bridge `hello` state and
 * the chat round-trips through the real POST /api/artifact-chat → WS `artifact-chat` envelope.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { loadCanonical } from '../tests/canonical/load.mjs';
import { BoardResponseSchema, BoardSchema } from '../packages/protocol/dist/index.js';
import { runHumanSim } from './lib/sim-runner.mjs';

await runHumanSim('LIVECHAT', {
  prepare: ({ scratch }) => {
    // --- seed the LIVE thread (the bridge's bound store) with rounds + a keep ---
    const store = new SessionStore('Glow mark — a live logo brainstorm', scratch);
    const board = { ...loadCanonical('boards/diverge.json', BoardSchema), sessionId: store.info.id };
    store.recordBoard(board);
    store.recordResponse(loadCanonical('responses/iterate.json', BoardResponseSchema));
    const artifact = store.captureArtifact('Beta keeper', board.options[0].svg, 'canonical capture', {
      boardId: board.id,
      optionIds: ['a'],
    });
    assert.ok(fs.existsSync(path.join(store.info.dir, 'artifacts', `${artifact.slug}.svg`)), 'artifact svg seeded on disk');
    return { store, board, artifact };
  },
  run: async ({ base, store, artifact, cdp, evaluate, waitInPage, click, typeInto, step, stepCount, browserName }) => {
    // =========================================================================
    await step('studio loads over the real bridge on the LIVE view (root mounted)', async () => {
      await cdp.send('Page.navigate', { url: `${base}/` });
      await waitInPage(
        'the mounted root',
        `document.getElementById('root') && document.getElementById('root').childElementCount > 0`,
        30_000,
      );
      // NOT the archived read-only view — this is the live thread (no "Completed thread" banner).
      const banner = await evaluate(`document.body.textContent.includes('Completed thread')`);
      assert.equal(banner, false, 'the default view is the LIVE thread, not an archived replay');
    });

    await step('the WayfinderStrip renders the live keep', async () => {
      await waitInPage(
        'the live thread keep in the wayfinder',
        `[...document.querySelectorAll('a')].some((a) =>
           (a.getAttribute('href') || '').includes('/api/artifact-svg/${encodeURIComponent(artifact.slug)}.svg'))`,
        20_000,
      );
    });

    await step('click the keep — the unified ArtifactFullscreen opens with a composer', async () => {
      await click(
        `the "${artifact.slug}" keep`,
        `[...document.querySelectorAll('a')].find((a) => (a.getAttribute('href') || '').includes('/api/artifact-svg/${encodeURIComponent(artifact.slug)}.svg'))`,
      );
      await waitInPage(
        'the fullscreen viewer (title + zoom control + Notes + chat composer)',
        `document.body.textContent.includes(${JSON.stringify(artifact.name)}) &&
         !!document.querySelector('.tabular-nums') &&
         document.body.textContent.includes('Notes') &&
         !!document.querySelector('input[placeholder="Ask or ask for a change…"]')`,
      );
    });

    // THE reproduction of the operator's report: type + Send, the user's OWN bubble must show.
    const liveChatQ = 'Does this read at 16px on a dark bar?';
    await step('type a chat message on the LIVE artifact — the user bubble appears + persists', async () => {
      await typeInto(
        'the live chat composer',
        `document.querySelector('input[placeholder="Ask or ask for a change…"]')`,
        liveChatQ,
      );
      await click(
        'the chat Send button',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send')`,
      );
      // The user's own message must render in the dialog (the reported failure).
      await waitInPage(
        'the user message bubble appears in the artifact dialog',
        `document.body.textContent.includes(${JSON.stringify(liveChatQ)})`,
        8_000,
      );
      // …and persist to the live thread's chat.jsonl (rule 7) — proven via /api/state + disk.
      const chatState = await (await fetch(`${base}/api/state`)).json();
      assert.ok(
        (chatState.artifactChat ?? []).some((m) => m.role === 'user' && m.text === liveChatQ),
        '/api/state carries the user message on the live thread',
      );
      const reloaded = SessionStore.open(store.info.dir);
      assert.ok(
        reloaded.artifactChat.some((m) => m.role === 'user' && m.text === liveChatQ),
        'the user message persisted to the live thread chat.jsonl',
      );
    });

    // Also prove the PREVIOUS-ROUND OPTION chat (a different slug shape,
    // option:<boardId>:<optionId>) — the round-history thumbnail path, which the
    // captured-artifact step above does not exercise.
    const optionQ = 'Could option A lean warmer?';
    await step('close, open a previous-round OPTION, chat on it — the bubble appears + persists', async () => {
      await click('the fullscreen viewer close button', `document.querySelector('button[aria-label="Close"]')`);
      await waitInPage('the timeline is back (no open composer)', `!document.querySelector('input[placeholder="Ask or ask for a change…"]')`);
      // A round-history option thumbnail — its button title carries the preview hint.
      await click(
        'the first round-history option thumbnail',
        `[...document.querySelectorAll('button[title*="full-screen preview, notes and chat"]')][0]`,
      );
      await waitInPage(
        'the option fullscreen opens with a composer',
        `!!document.querySelector('input[placeholder="Ask or ask for a change…"]')`,
      );
      await typeInto(
        'the option chat composer',
        `document.querySelector('input[placeholder="Ask or ask for a change…"]')`,
        optionQ,
      );
      await click(
        'the chat Send button',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send')`,
      );
      await waitInPage(
        'the option-chat user bubble appears',
        `document.body.textContent.includes(${JSON.stringify(optionQ)})`,
        8_000,
      );
      const chatState = await (await fetch(`${base}/api/state`)).json();
      assert.ok(
        (chatState.artifactChat ?? []).some((m) => m.role === 'user' && m.text === optionQ && m.artifactSlug.startsWith('option:')),
        'the option chat persisted under its option:<boardId>:<optionId> slug',
      );
    });

    return (
      `${stepCount()} steps: real ${browserName} over raw CDP opened a seeded ` +
      'LIVE thread on the default view, clicked its keep into the unified ArtifactFullscreen viewer, TYPED a ' +
      'chat message and confirmed the user bubble renders in the dialog AND persists to chat.jsonl, ' +
      'zero exceptions, zero STUDIO CLIENT ERROR lines, root mounted throughout'
    );
  },
});
