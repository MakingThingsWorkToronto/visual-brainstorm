/**
 * Human-simulation harness — the LIVE ACTIVE-BOARD chat journey (rule 10). Sibling
 * to human-sim.mjs / -archived / -livechat (same raw-CDP plumbing, same SKIP + exit
 * discipline).
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
 *
 * SKIP: no chromium-family browser → loud SKIP, exit 0. Never process.exit().
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { loadCanonical } from '../tests/canonical/load.mjs';
import { BoardSchema, ThemeSchema } from '../packages/protocol/dist/index.js';
import {
  Cdp,
  findBrowsers,
  findPageTarget,
  killBrowserTree,
  killProfileStragglers,
  launchAnyBrowser,
  makePageHelpers,
} from './lib/cdp.mjs';

const { found: browsers, candidates } = findBrowsers();
if (browsers.length === 0) {
  console.log(`HUMAN SIM BOARDCHAT SKIP: no chromium-family browser found (looked for: ${candidates.join(', ')})`);
} else {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-human-sim-boardchat-'));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-human-sim-boardchat-profile-'));
  const logLines = [];
  const exceptions = [];
  const consoleErrors = [];
  let bridge = null;
  let browser = null;
  let browserName = 'browser';
  let cdp = null;
  let currentStep = 'bootstrap';
  let passed = false;

  const liveStore = new SessionStore('Glow mark — a live board brainstorm', scratch);
  const board = { ...loadCanonical('boards/diverge.json', BoardSchema), sessionId: liveStore.info.id };
  const dialAxis = board.survey.axes[0]; // e.g. "tone"
  const optionId = board.options[0].id; // "a"

  try {
    bridge = new Bridge(liveStore, {
      discussionRoot: scratch,
      themes: [loadCanonical('themes/theme.json', ThemeSchema)],
      theme: 'aurora',
      models: ['claude-fable-5'],
      defaultModel: 'claude-fable-5',
      log: (line) => logLines.push(line),
      recentLogs: () => logLines.slice(-500),
    });
    await bridge.start(0);
    const base = `http://127.0.0.1:${bridge.port}`;
    // Present the board and BLOCK (fire-and-forget) — the chat detour resolves it.
    bridge.presentAndWait(board, 120_000, /* openBrowser */ false).catch(() => {});
    console.log(`human-sim-boardchat: bridge up at ${base}, board ${board.id} live (dial=${dialAxis.id})`);

    const launched = await launchAnyBrowser(browsers, profileDir);
    browser = launched.proc;
    browserName = launched.name;
    console.log(`human-sim-boardchat: ${browserName} headless, CDP on ${launched.devtoolsPort}`);

    const pageWsUrl = await findPageTarget(launched.devtoolsPort);
    assert.ok(pageWsUrl, 'DevTools /json/list exposed a page target');
    cdp = await Cdp.connect(pageWsUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    cdp.on('Runtime.exceptionThrown', (p) => {
      exceptions.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text);
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') consoleErrors.push(p.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
    });

    const { evaluate, waitInPage, click, typeInto } = makePageHelpers(cdp);

    const checkpoint = async (label) => {
      const rootChildren = await evaluate(
        `document.getElementById('root') ? document.getElementById('root').childElementCount : -1`,
      );
      if (rootChildren <= 0) throw new Error(`crash after "${label}": #root childElementCount=${rootChildren}`);
      if (exceptions.length > 0) throw new Error(`crash after "${label}": ${exceptions.join('\n')}`);
      if (consoleErrors.length > 0) throw new Error(`crash after "${label}": console.error: ${consoleErrors.join('\n')}`);
      const logs = await (await fetch(`${base}/api/logs`)).json();
      const clientErrors = logs.lines.filter((l) => l.includes('STUDIO CLIENT ERROR'));
      if (clientErrors.length > 0) throw new Error(`crash after "${label}":\n${clientErrors.join('\n')}`);
    };
    let stepCount = 0;
    const step = async (name, fn) => {
      currentStep = name;
      await fn();
      await checkpoint(name);
      stepCount++;
      console.log(`  ✓ ${name}`);
    };

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

    passed = true;
    console.log(
      `HUMAN SIM BOARDCHAT PASS — ${stepCount} steps: real ${browserName} over raw CDP drove a LIVE active board, ` +
        'moved a dial (persisted to /api/state drafts), opened an option into the unified fullscreen viewer with a chat ' +
        'composer, asked a question (user bubble + option-slug persistence), and confirmed the board stayed live with ' +
        'the dial UNCHANGED — dials persist through chat; zero exceptions, zero STUDIO CLIENT ERROR lines',
    );
  } catch (err) {
    process.exitCode = 1;
    console.error(`\nHUMAN SIM BOARDCHAT FAIL at step: ${currentStep}`);
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    if (exceptions.length > 0) console.error(`\npage exceptions:\n${exceptions.join('\n')}`);
    if (consoleErrors.length > 0) console.error(`\npage console errors:\n${consoleErrors.join('\n')}`);
    console.error(`\nlast bridge log lines:\n${logLines.slice(-30).join('\n') || '(none)'}`);
    if (cdp) {
      try {
        await cdp.send('Page.bringToFront');
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const shot = path.join(scratch, 'failure.png');
        fs.writeFileSync(shot, Buffer.from(data, 'base64'));
        console.error(`screenshot: ${shot}`);
      } catch (shotErr) {
        console.error(`(screenshot unavailable: ${String(shotErr)})`);
      }
    }
    console.error(`evidence kept in: ${scratch}`);
  } finally {
    cdp?.close();
    killBrowserTree(browser);
    killProfileStragglers(profileDir);
    await bridge?.stop();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5 });
    } catch {
      /* harmless temp dir */
    }
    if (passed) {
      try {
        fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
      } catch {
        /* harmless temp dir */
      }
    }
  }
}
