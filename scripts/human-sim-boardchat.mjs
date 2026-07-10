/**
 * Human-simulation harness — the LIVE ACTIVE-BOARD chat journey (rule 10). Sibling
 * to human-sim.mjs / -archived / -livechat (shared scaffold: scripts/lib/sim-runner.mjs).
 *
 * Proves the operator's ask: the composer is available on the CURRENT option set,
 * the user can ask about a live artifact WITHOUT losing their dials, and the
 * generation meta persists. On the DEFAULT LIVE view with a board actively awaiting
 * a response:
 *
 *   move a dial → open an option fullscreen (SAME viewer, chat on the right) → type
 *   + Send a question → the user's bubble shows AND the board stays live with the
 *   dial UNCHANGED (non-destructive artifact-chat detour) → the in-progress answer
 *   (dial) is persisted to /api/state drafts (round-NN/draft.json) for recall.
 *
 * The board is presented via the REAL bridge.presentAndWait (fire-and-forget — the
 * chat resolves it), the studio renders it over the real WS, and the chat + draft
 * round-trip through the real POST /api/artifact-chat + POST /api/board-draft. No
 * mocks; the only thing not driven is the model that authors the REPLY.
 */
import assert from 'node:assert';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { loadCanonical } from '../tests/canonical/load.mjs';
import { BoardSchema } from '../packages/protocol/dist/index.js';
import { runHumanSim } from './lib/sim-runner.mjs';

await runHumanSim('BOARDCHAT', {
  prepare: ({ scratch }) => {
    const store = new SessionStore('Glow mark — a live board brainstorm', scratch);
    const board = { ...loadCanonical('boards/diverge.json', BoardSchema), sessionId: store.info.id };
    const dialAxis = board.survey.axes[0]; // e.g. "tone"
    return { store, board, dialAxis };
  },
  run: async ({ bridge, base, board, dialAxis, cdp, evaluate, waitInPage, click, typeInto, step, stepCount, browserName }) => {
    // Present the board and BLOCK (fire-and-forget) — the chat detour resolves it.
    bridge.presentAndWait(board, 120_000, /* openBrowser */ false).catch(() => {});
    console.log(`human-sim-boardchat: board ${board.id} live (dial=${dialAxis.id})`);

    // Set a React-controlled range input to `value` and fire the input event.
    const setRange = async (index, value) => {
      const ok = await evaluate(`(() => {
        const el = document.querySelectorAll('input[type=range]')[${index}];
        if (!el) return false;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(el, '${value}');
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      if (!ok) throw new Error('range input not found');
    };

    // =========================================================================
    await step('studio loads with the LIVE board (composer + dials in frame)', async () => {
      await cdp.send('Page.navigate', { url: `${base}/` });
      await waitInPage(
        'the active board rendered (its title + at least one dial slider)',
        `document.body.textContent.includes(${JSON.stringify(board.title)}) &&
         !!document.querySelector('input[type=range]')`,
        30_000,
      );
    });

    const DIAL = 88;
    await step('move a dial — the moved value shows and persists to /api/state drafts', async () => {
      await setRange(0, DIAL);
      await waitInPage(
        'the moved dial value is shown',
        `[...document.querySelectorAll('span')].some((s) => s.textContent.trim() === '${DIAL}')`,
      );
      // The debounced draft POST lands in the live state (generation meta persisted).
      let drafts = [];
      for (let i = 0; i < 60; i++) {
        const st = await (await fetch(`${base}/api/state`)).json();
        drafts = st.drafts ?? [];
        if (drafts.some((d) => d.axisValues?.[dialAxis.id] === DIAL)) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      assert.ok(
        drafts.some((d) => d.boardId === board.id && d.axisValues?.[dialAxis.id] === DIAL),
        'the dial persisted to /api/state drafts (round draft.json)',
      );
    });

    await step('open a LIVE option fullscreen — the SAME viewer with a chat composer', async () => {
      await click(
        'the first option (zoom-in preview)',
        `document.querySelector('button[title="Click for full-screen view (zoom, pan, notes)"]')`,
      );
      await waitInPage(
        'the fullscreen viewer with Notes + chat composer',
        `!!document.querySelector('.tabular-nums') &&
         document.body.textContent.includes('Notes') &&
         !!document.querySelector('input[placeholder="Ask or ask for a change…"]')`,
      );
    });

    const boardQ = 'Can this option read warmer without losing contrast?';
    await step('ask about the LIVE option — bubble shows, dial KEPT (non-destructive)', async () => {
      await typeInto(
        'the option chat composer',
        `document.querySelector('input[placeholder="Ask or ask for a change…"]')`,
        boardQ,
      );
      await click(
        'the chat Send button',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send')`,
      );
      await waitInPage(
        'the user question bubble appears in the option dialog',
        `document.body.textContent.includes(${JSON.stringify(boardQ)})`,
        8_000,
      );
      // The chat persisted under the option slug.
      const st = await (await fetch(`${base}/api/state`)).json();
      assert.ok(
        (st.artifactChat ?? []).some((m) => m.role === 'user' && m.text === boardQ && m.artifactSlug.startsWith('option:')),
        'the option chat persisted under its option:<boardId>:<optionId> slug',
      );
      // Close the viewer — the DIAL is unchanged (the board never unmounted).
      await click('the fullscreen close button', `document.querySelector('button[aria-label="Close"]')`);
      await waitInPage(
        'back on the live board with the dial STILL at its moved value (dials persist through chat)',
        `[...document.querySelectorAll('span')].some((s) => s.textContent.trim() === '${DIAL}') &&
         document.body.textContent.includes(${JSON.stringify(board.title)})`,
        8_000,
      );
      const range = await evaluate(`document.querySelectorAll('input[type=range]')[0].value`);
      assert.equal(String(range), String(DIAL), 'the dial slider still holds the moved value after the chat');
      // The board is STILL the live active board (bridge health).
      const health = await (await fetch(`${base}/api/health`)).json();
      assert.equal(health.activeBoard?.id, board.id, 'the board stayed live through the chat');
    });

    return (
      `${stepCount()} steps: real ${browserName} over raw CDP drove a LIVE active board, ` +
      'moved a dial (persisted to /api/state drafts), opened an option into the unified fullscreen viewer with a chat ' +
      'composer, asked a question (user bubble + option-slug persistence), and confirmed the board stayed live with ' +
      'the dial UNCHANGED — dials persist through chat; zero exceptions, zero STUDIO CLIENT ERROR lines'
    );
  },
});
