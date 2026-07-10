/**
 * Human-simulation harness — the LIVE ACTIVE-BOARD chat journey (rule 10). Sibling
 * to human-sim.mjs / -archived / -livechat (shared scaffold: scripts/lib/sim-runner.mjs).
 *
 * REAL ROUTE: the board is presented through the real `present_board` MCP tool
 * (blocked, exactly like a live session), and the journey proves the DOCUMENTED
 * non-destructive artifact-chat detour end to end:
 *
 *   move a dial → open an option fullscreen (SAME viewer, chat on the right) → type
 *   + Send a question → the blocked present_board resolves with the synthetic PARK
 *   response (action:"park", commands:["artifact-chat"], the question verbatim) →
 *   the sim-as-orchestrator answers via the real `reply_artifact_chat` (Claude's
 *   bubble renders in frame) → re-arms the SAME board via present_board.rearmBoardId
 *   → the dial is UNCHANGED → a real submit resolves the re-armed wait with the
 *   moved dial riding response.axisValues.
 *
 * That last hop — the detour's feedback reaching the ORCHESTRATOR with the dials
 * intact — was never provable on the faked-orchestrator route. The thread is
 * seeded on disk and resumed via discussionId (the documented resume path); the
 * board content is canonical fixture data (harness stays dumb, rule 11).
 */
import assert from 'node:assert';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { loadCanonical } from '../tests/canonical/load.mjs';
import { BoardSchema } from '../packages/protocol/dist/index.js';
import { sleep } from './lib/cdp.mjs';
import { runHumanSim } from './lib/sim-runner.mjs';

await runHumanSim('BOARDCHAT', {
  prepare: ({ scratch }) => {
    const store = new SessionStore('Glow mark — a live board brainstorm', scratch);
    const board = loadCanonical('boards/diverge.json', BoardSchema);
    const dialAxis = board.survey.axes[0]; // e.g. "tone"
    return { store, board, dialAxis };
  },
  run: async ({ mcp, awaitBase, store, board, dialAxis, cdp, evaluate, waitInPage, click, typeInto, step, stepCount, browserName }) => {
    // Present the board through the REAL tool and BLOCK — the chat detour
    // resolves it with the park response.
    const parkWait = mcp.call('present_board', {
      discussionId: store.info.id, // the documented resume path binds the seeded thread
      title: board.title,
      prompt: board.prompt,
      kind: board.kind,
      phase: board.phase,
      options: board.options,
      axes: board.survey.axes,
      timeoutSeconds: 600,
      openBrowser: false,
    }, 660_000);
    const base = await awaitBase();
    console.log(`human-sim-boardchat: board presented via the real tool (dial=${dialAxis.id})`);

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
    let liveBoardId;
    await step('studio loads with the LIVE board (composer + dials in frame)', async () => {
      await cdp.send('Page.navigate', { url: `${base}/` });
      await waitInPage(
        'the active board rendered (its title + at least one dial slider)',
        `document.body.textContent.includes(${JSON.stringify(board.title)}) &&
         !!document.querySelector('input[type=range]')`,
        30_000,
      );
      const st = await (await fetch(`${base}/api/state`)).json();
      liveBoardId = st.activeBoard?.id;
      assert.ok(liveBoardId, 'the live board id is readable from /api/state');
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
        await sleep(100);
      }
      assert.ok(
        drafts.some((d) => d.boardId === liveBoardId && d.axisValues?.[dialAxis.id] === DIAL),
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
    const boardA = 'Yes — shift the stroke to #f59e0b and keep the fill; contrast holds at 4.6:1.';
    await step('ask about the LIVE option — the blocked present_board PARKS with the question', async () => {
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
      // THE DETOUR CONTRACT, live: the blocked tool call resolves NOW with the
      // synthetic park response — the board is NOT consumed.
      const parked = await parkWait;
      assert.equal(parked.status, 'responded', 'the blocked present_board resolved on the chat');
      assert.equal(parked.response.action, 'park', 'the detour rides a synthetic park response');
      assert.deepEqual(parked.response.commands, ['artifact-chat'], 'the park carries the artifact-chat command');
      assert.ok(parked.response.elaboration.includes(boardQ), 'the park carries the user question verbatim');
      // The chat persisted under the option slug.
      const st = await (await fetch(`${base}/api/state`)).json();
      const chatMsg = (st.artifactChat ?? []).find((m) => m.role === 'user' && m.text === boardQ);
      assert.ok(chatMsg && chatMsg.artifactSlug.startsWith('option:'), 'the option chat persisted under its option:<boardId>:<optionId> slug');

      // Sim-as-orchestrator answers through the REAL tool; Claude's bubble must
      // render back in the open dialog.
      const replied = await mcp.call('reply_artifact_chat', { artifactSlug: chatMsg.artifactSlug, text: boardA });
      assert.equal(replied.status, 'replied');
      await waitInPage(
        "Claude's reply bubble appears in the option dialog",
        `document.body.textContent.includes(${JSON.stringify(boardA)})`,
        8_000,
      );
    });

    let rearmWait;
    await step('re-arm the SAME board via rearmBoardId — dial KEPT (non-destructive)', async () => {
      // The documented post-detour resume: no new round, same board id.
      rearmWait = mcp.call('present_board', {
        title: board.title,
        prompt: 'rearm after the artifact-chat detour',
        rearmBoardId: liveBoardId,
        timeoutSeconds: 600,
        openBrowser: false,
      }, 660_000);
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
      assert.equal(health.activeBoard?.id, liveBoardId, 'the board stayed live through the chat');
    });

    await step('a real submit resolves the re-armed wait WITH the moved dial', async () => {
      await click(
        'the first option select button',
        `[...document.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent.includes(${JSON.stringify(board.options[0].label)}))`,
      );
      await click(
        'the survey Send & iterate button',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send & iterate')`,
      );
      const result = await rearmWait;
      assert.equal(result.status, 'responded', 'the re-armed present_board resolved with the submit');
      assert.equal(result.response.boardId, liveBoardId, 'the response answers the SAME board (no round minted by the detour)');
      assert.equal(
        result.response.axisValues?.[dialAxis.id],
        DIAL,
        'the dial moved BEFORE the detour rode the response to the orchestrator',
      );
    });

    return (
      `${stepCount()} steps: real ${browserName} over raw CDP drove a board presented by the REAL ` +
      'present_board tool, moved a dial (persisted to drafts), asked an option question that PARKED the blocked tool ' +
      "call (action:park + artifact-chat command), answered it via the real reply_artifact_chat (Claude's bubble " +
      'rendered), re-armed the SAME board via rearmBoardId with the dial UNCHANGED, and a real submit returned the ' +
      'moved dial in response.axisValues; zero exceptions, zero STUDIO CLIENT ERROR lines'
    );
  },
});
