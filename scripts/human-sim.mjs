/**
 * Human-simulation harness (comprehensive-human-testing phase 3, CLAUDE.md rule 10).
 *
 * A frameworkless driver: headless Edge/Chrome spoken to over RAW CDP using the
 * repo's own `ws` package (no Playwright/Puppeteer), loading the REAL built studio
 * (apps/studio/dist) served by a REAL Bridge on an ephemeral port, and scripting a
 * full human goal end to end:
 *
 *   new discussion (type a brief, pick a chip, send)
 *   → respond to a presented canonical board (select, elaborate, submit)
 *   → a captured artifact becomes visible in the wayfinder strip.
 *
 * Interaction choices (documented per the mandate):
 *   - Clicks are REAL CDP mouse events (Input.dispatchMouseEvent at the element's
 *     settled center after scrollIntoView) — closest to a human pointer.
 *   - Typing is Runtime focus() + CDP Input.insertText — fires real `input` events,
 *     so React controlled inputs update exactly as they do for a human.
 *   - Elements are located by the surfaces' own semantic anchors (button text,
 *     aria-pressed, artifact hrefs) — no test ids were added to the studio.
 *
 * Crash detection after EVERY step:
 *   - unmounted root: document.getElementById('root').childElementCount === 0
 *   - Runtime.exceptionThrown / console.error in the page
 *   - `STUDIO CLIENT ERROR` lines in GET /api/logs (the bridge's log ring)
 *
 * Exit discipline (Windows/libuv learning 2026-07-07): NEVER process.exit() — a
 * hard exit races WebSocketServer teardown and clobbers the exit code. We set
 * process.exitCode and let the loop drain (smoke.mjs's pattern), after closing
 * the CDP socket, killing the browser, and stopping the bridge.
 *
 * SKIP convention (decided, documented): if NO chromium-family browser exists on
 * this machine, print `HUMAN SIM SKIP: no chromium-family browser found` and exit
 * 0 — a loud skip, never reported as a pass. Every other shortfall exits 1 with
 * the failing step, the last bridge log lines, and a screenshot
 * (Page.bringToFront first — backgrounded tabs return stale composited frames).
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { loadCanonical } from '../tests/canonical/load.mjs';
import { BoardSchema, LivingGallerySchema, ThemeSchema } from '../packages/protocol/dist/index.js';
// Shared CDP plumbing (extracted verbatim to scripts/lib/cdp.mjs for the
// ui-break-sweep driver — one proven implementation, two harnesses).
import {
  Cdp,
  findBrowsers,
  findPageTarget,
  killBrowserTree,
  killProfileStragglers,
  launchAnyBrowser,
  makePageHelpers,
  sleep,
} from './lib/cdp.mjs';

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------
const { found: browsers, candidates } = findBrowsers();
if (browsers.length === 0) {
  console.log(
    `HUMAN SIM SKIP: no chromium-family browser found (looked for: ${candidates.join(', ')})`,
  );
  // Loud skip, honest exit 0 — the browser is genuinely absent, nothing was faked.
} else {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-human-sim-'));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-human-sim-profile-'));
  const logLines = [];
  const exceptions = [];
  const consoleErrors = [];
  let bridge = null;
  let browser = null;
  let browserName = 'browser';
  let cdp = null;
  let currentStep = 'bootstrap';
  let passed = false;

  const store = new SessionStore('Human sim session', scratch);
  const aurora = loadCanonical('themes/theme.json', ThemeSchema);

  try {
    // --- real bridge, real built studio dist (default resolution), temp thread ---
    bridge = new Bridge(store, {
      discussionRoot: scratch,
      themes: [aurora],
      theme: 'aurora',
      models: ['claude-fable-5', 'claude-haiku-4-5'],
      defaultModel: 'claude-fable-5',
      engine: 'claude',
      log: (line) => logLines.push(line),
      recentLogs: () => logLines.slice(-500),
    });
    await bridge.start(0); // ephemeral port
    const base = `http://127.0.0.1:${bridge.port}`;
    console.log(`human-sim: bridge up at ${base} (thread ${store.info.id})`);

    // --- headless browser: try each installed candidate until one serves CDP ---
    const launched = await launchAnyBrowser(browsers, profileDir);
    browser = launched.proc;
    browserName = launched.name;
    if (launched.failures.length > 0) {
      console.log(`human-sim: fell back past ${launched.failures.length} browser(s) that never served CDP`);
    }
    console.log(`human-sim: ${browserName} headless, CDP on ${launched.devtoolsPort}`);

    // --- find the page target and connect raw CDP ---
    const pageWsUrl = await findPageTarget(launched.devtoolsPort);
    assert.ok(pageWsUrl, 'DevTools /json/list exposed a page target');
    cdp = await Cdp.connect(pageWsUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    cdp.on('Runtime.exceptionThrown', (p) => {
      exceptions.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text);
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        consoleErrors.push(p.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
      }
    });

    // --- in-page helpers (shared, scripts/lib/cdp.mjs) -----------------------
    const { evaluate, waitInPage, click, typeInto } = makePageHelpers(cdp);

    // --- the crash check that runs after EVERY step ---------------------------
    const checkpoint = async (label) => {
      const rootChildren = await evaluate(
        `document.getElementById('root') ? document.getElementById('root').childElementCount : -1`,
      );
      if (rootChildren <= 0) {
        throw new Error(`crash after "${label}": #root childElementCount=${rootChildren} (unmounted root)`);
      }
      if (exceptions.length > 0) {
        throw new Error(`crash after "${label}": uncaught page exception(s):\n${exceptions.join('\n')}`);
      }
      if (consoleErrors.length > 0) {
        throw new Error(`crash after "${label}": console.error in the studio:\n${consoleErrors.join('\n')}`);
      }
      const logs = await (await fetch(`${base}/api/logs`)).json();
      const clientErrors = logs.lines.filter((l) => l.includes('STUDIO CLIENT ERROR'));
      if (clientErrors.length > 0) {
        throw new Error(`crash after "${label}":\n${clientErrors.join('\n')}`);
      }
    };

    let stepCount = 0;
    const step = async (name, fn) => {
      currentStep = name;
      await fn();
      await checkpoint(name);
      stepCount++;
      console.log(`  ✓ ${name}`);
    };

    // =========================================================================
    // The human goal.
    // =========================================================================
    await step('studio loads over the real bridge (root mounted, session titled)', async () => {
      await cdp.send('Page.navigate', { url: `${base}/` });
      await waitInPage(
        'the mounted root',
        `document.getElementById('root') && document.getElementById('root').childElementCount > 0`,
        30_000,
      );
      // The hello envelope arrived when the sidebar names the live session.
      await waitInPage(
        'the hello state (session title in the sidebar)',
        `document.body.textContent.includes('Human sim session')`,
      );
      // Empty live thread → the New Discussion landing surface is the opener.
      await waitInPage(
        'the New Discussion landing panel',
        `document.body.textContent.includes('New Discussion') && !!document.querySelector('textarea')`,
      );
    });

    const brief = 'a neon glyph for a build tool';
    await step('human composes a brief (chip + typed prompt)', async () => {
      await click(
        `the "a logo" chip`,
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'a logo')`,
      );
      await typeInto('the brief textarea', `document.querySelector('textarea')`, brief);
      const value = await evaluate(`document.querySelector('textarea').value`);
      assert.equal(value, brief, 'typed brief landed in the controlled textarea');
    });

    await step('human sends it — new-brainstorm reaches the bridge queue', async () => {
      await click(
        'the landing Send & iterate button',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send & iterate')`,
      );
      // Bridge side: the command queues with the composed prompt (brief + chip).
      const deadline = Date.now() + 10_000;
      while (bridge.peekCommands().length === 0) {
        if (Date.now() > deadline) throw new Error('new-brainstorm never reached the bridge queue');
        await sleep(100);
      }
      const [cmd] = bridge.drainCommands(); // the harness stands in for the orchestrator's check-in
      assert.equal(cmd.command, 'new-brainstorm');
      assert.equal(cmd.prompt, `${brief} (a logo)`, 'prompt carries the brief and the chip');
      // Human side: the toast confirms the dispatch.
      await waitInPage(
        'the queued-command toast',
        `document.body.textContent.includes("new-brainstorm queued for Claude's next check-in")`,
      );
    });

    // =========================================================================
    // The concierge → gallery → mindmap intake (concierge-living-gallery,
    // phase 6 — REAL-SESSION proof, not the preview player). The harness plays
    // both ends: the Bridge side (askConcierge/presentGallery/presentAndWait,
    // exactly the calls the MCP tools make) and the human side (real CDP driving
    // the real studio surfaces those calls put on the wire).
    // =========================================================================
    let cAnswer;
    await step('concierge appears + human answers ("who is this glyph for?")', async () => {
      const cWait = bridge.askConcierge(
        'Who is this glyph for?',
        ['my team', 'developers'],
        60_000,
      );
      await waitInPage(
        'the concierge intake surface with its question',
        `!!document.querySelector('[data-testid="concierge-intake"]') &&
         document.body.textContent.includes('Who is this glyph for?')`,
      );
      await click(
        'the "developers" suggestion chip',
        `[...document.querySelectorAll('[data-testid="concierge-chips"] button')].find((b) => b.textContent.trim() === 'developers')`,
      );
      await typeInto(
        'the concierge free-text answer',
        `document.querySelector('[data-testid="concierge-intake"] textarea')`,
        'shipping a CLI',
      );
      await click(
        'the concierge Send answer button',
        `[...document.querySelectorAll('[data-testid="concierge-intake"] button')].find((b) => b.textContent.trim() === 'Send answer')`,
      );
      cAnswer = await cWait;
      assert.ok(cAnswer, 'askConcierge resolved with a posted answer, not a timeout');
      assert.ok(cAnswer.includes('developers'), 'answer carries the tapped chip');
      assert.ok(cAnswer.includes('shipping a CLI'), 'answer carries the typed free text');
    });

    let picked;
    await step('gallery appears + human picks Mind map', async () => {
      const gWait = bridge.presentGallery(
        { ...loadCanonical('gallery/gallery.json', LivingGallerySchema), id: 'human-sim-gallery' },
        60_000,
      );
      await waitInPage(
        'the living gallery with its recommended ribbon (proves it renders live)',
        `!!document.querySelector('[data-testid="living-gallery"]') &&
         !!document.querySelector('[data-testid="recommended-ribbon"]')`,
      );
      await click(
        'the Mind map method card',
        `document.querySelector('[data-testid="method-card-mindmap"]')`,
      );
      picked = await gWait;
      assert.equal(picked, 'mindmap', 'presentGallery resolved with the picked method');
    });

    const treeBoard = BoardSchema.parse({
      id: 'human-sim-mindmap',
      sessionId: store.info.id,
      round: store.nextRound(),
      kind: 'mindmap',
      phase: 'diverge',
      title: 'Mind map — your glyph',
      prompt: 'Co-edit the tree.',
      options: [],
      tree: {
        nodeData: {
          id: 'root',
          topic: 'Neon glyph',
          children: [
            { id: 'c1', topic: 'Mark' },
            { id: 'c2', topic: 'Motion' },
          ],
        },
        direction: 2,
      },
      survey: {},
      createdAt: new Date().toISOString(),
    });
    let treeWait;
    await step('mindmap board renders with the LIVE mind-elixir engine mounted', async () => {
      treeWait = bridge.presentAndWait(treeBoard, 60_000, false);
      await waitInPage(
        'the mindmap canvas surface',
        `!!document.querySelector('[data-testid="mindmap-canvas"]')`,
      );
      // The engine renders live DOM only in a real browser (never renderToString)
      // — this is the first place the genuine mind-elixir instance is exercised.
      await waitInPage(
        'the live mind-elixir engine mounted with real DOM',
        `(() => {
          const el = document.querySelector('[data-testid="mindmap-engine"]');
          return !!el && el.childElementCount > 0;
        })()`,
        15_000,
      );
    });

    await step('human edits the live tree via the real engine — editedTree returns', async () => {
      const childCount = await evaluate(
        `(async () => {
          const el = document.querySelector('[data-testid="mindmap-engine"]');
          const mind = el && el.mind;
          if (!mind) return 'no-instance';
          mind.selectNode(mind.findEle(mind.nodeData.id));
          await mind.addChild();
          return mind.getData().nodeData.children.length;
        })()`,
        { awaitPromise: true },
      );
      assert.ok(
        typeof childCount === 'number' && childCount > 2,
        `the REAL mind-elixir engine added a child via addChild() (got ${JSON.stringify(childCount)})`,
      );
      await click(
        'the mindmap composer Send & iterate button',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send & iterate')`,
      );
      const treeResp = await treeWait;
      assert.ok(treeResp, 'presentAndWait resolved with a response for the mindmap board, not a timeout');
      assert.ok(treeResp.editedTree, 'response carries editedTree');
      assert.ok(
        treeResp.editedTree.nodeData.children.length > 2,
        'the node added by the real engine rode back in editedTree',
      );
      const introMd = fs.readFileSync(path.join(store.info.dir, 'brainstorm.md'), 'utf8');
      assert.ok(introMd.includes('Concierge Q: Who is this glyph for?'), 'brainstorm.md records the concierge question');
      assert.ok(introMd.includes(`Concierge A: ${cAnswer}`), 'brainstorm.md records the concierge answer');
      assert.ok(introMd.includes('Mind-map tree presented'), 'brainstorm.md records the mindmap presentation (recordBoard)');
    });

    // The canonical diverge board, re-anchored to this thread (fresh id rule
    // does not apply — this is its first presentation). activeBoard was cleared
    // by the mindmap submit above, so this still lands as a fresh presentation.
    const board = { ...loadCanonical('boards/diverge.json', BoardSchema), sessionId: store.info.id };
    let waitForResponse = null;
    await step('a canonical board is presented and renders as the survey', async () => {
      waitForResponse = bridge.presentAndWait(board, 60_000, /* open browser */ false);
      await waitInPage(
        'the board survey (3 selectable options, "your turn")',
        `document.querySelectorAll('button[aria-pressed]').length === 3 &&
         document.body.textContent.includes('your turn') &&
         document.body.textContent.includes(${JSON.stringify(board.title)})`,
      );
    });

    await step('human selects an option (Beta)', async () => {
      await click(
        'the Beta select button',
        `[...document.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent.includes('Beta'))`,
      );
      await waitInPage(
        'Beta showing selected (aria-pressed=true)',
        `[...document.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent.includes('Beta'))?.getAttribute('aria-pressed') === 'true'`,
      );
    });

    const elaboration = 'chase the breakout arc — keep the energy escaping the frame';
    await step('human types an elaboration', async () => {
      await typeInto('the elaboration textarea', `document.querySelector('textarea')`, elaboration);
      const value = await evaluate(`document.querySelector('textarea').value`);
      assert.equal(value, elaboration);
    });

    await step('human submits — the bridge accepts the response', async () => {
      await click(
        'the survey Send & iterate button',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send & iterate')`,
      );
      // activeBoard → null is the acceptance signal (awaitingResponse tracks the
      // blocking wait, not board liveness — learnings 2026-07-07).
      const deadline = Date.now() + 15_000;
      for (;;) {
        const state = await (await fetch(`${base}/api/state`)).json();
        if (state.activeBoard === null) break;
        if (Date.now() > deadline) throw new Error('activeBoard never cleared after submit');
        await sleep(120);
      }
      const response = await waitForResponse;
      assert.ok(response, 'presentAndWait resolved with a response, not a timeout');
      assert.deepEqual(response.selectedOptionIds, ['b'], 'the clicked option rode the response');
      assert.equal(response.elaboration, elaboration, 'the typed elaboration rode the response');
      assert.equal(response.action, 'iterate');
      // The UI settles into history: the reply bubble shows the verdict.
      await waitInPage(
        'the round-history reply bubble',
        `document.body.textContent.includes('picked 1') &&
         ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Send & iterate')`,
      );
    });

    let artifact;
    await step('a captured artifact appears in the wayfinder keeps', async () => {
      artifact = store.captureArtifact('Beta keeper', board.options[1].svg, 'kept by the human sim', {
        boardId: board.id,
        optionIds: ['b'],
      });
      bridge.announceArtifact(artifact);
      assert.ok(fs.existsSync(artifact.svgPath), 'artifact SVG persisted to the thread (rule 7)');
      const shown = artifact.slug.slice(0, 18);
      await waitInPage(
        `the "${artifact.slug}" keep in the wayfinder strip`,
        `document.body.textContent.includes('keeps, drag out') &&
         [...document.querySelectorAll('a')].some((a) =>
           (a.getAttribute('href') || '').includes('/api/artifact-svg/${encodeURIComponent(artifact.slug)}.svg') &&
           a.textContent.includes(${JSON.stringify(shown)}))`,
      );
    });

    // =========================================================================
    // Item 5: the unified fullscreen viewer + pins-to-filmstrip. Opening the keep
    // must land on the ONE ArtifactFullscreen surface (replaces the old
    // PreviewModal/ArtifactChat split) — proven by its own signature controls
    // (zoom %, Notes, chat composer) — then pinning it must round-trip through
    // POST /api/pinned and surface in the WayfinderStrip's dedicated pinned row.
    // =========================================================================
    await step('the keep opens the unified ArtifactFullscreen viewer', async () => {
      await click(
        `the "${artifact.slug}" keep`,
        `[...document.querySelectorAll('a')].find((a) => (a.getAttribute('href') || '').includes('/api/artifact-svg/${encodeURIComponent(artifact.slug)}.svg'))`,
      );
      // Signature markers of the unified viewer: zoom % control, Notes dock, chat composer.
      await waitInPage(
        'the fullscreen viewer (zoom control + Notes + chat composer)',
        `document.body.textContent.includes('Beta keeper') &&
         !!document.querySelector('.tabular-nums') &&
         document.body.textContent.includes('Notes') &&
         !!document.querySelector('input[placeholder="Ask or ask for a change…"]')`,
      );
      await waitInPage(
        'the 📌 Pin toggle (live captured artifact)',
        `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '📌 Pin')`,
      );
    });

    await step('pinning the keep round-trips through /api/pinned and hits the filmstrip', async () => {
      await click(
        'the 📌 Pin toggle',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '📌 Pin')`,
      );
      await waitInPage(
        'the toggle flips to 📌 Pinned (POST /api/pinned round-trip + hello broadcast)',
        `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '📌 Pinned')`,
      );
      const pinnedState = await (await fetch(`${base}/api/state`)).json();
      assert.deepEqual(
        pinnedState.session.pinnedSlugs,
        [artifact.slug],
        '/api/state confirms the artifact is pinned',
      );
      await click('the fullscreen viewer close button', `document.querySelector('button[aria-label="Close"]')`);
      await waitInPage(
        'the WayfinderStrip pinned row shows the keep',
        `document.body.textContent.includes('📌 pinned') && document.body.textContent.includes('Beta keeper')`,
      );
    });

    passed = true;
    console.log(
      `HUMAN SIM PASS — ${stepCount} steps: real ${browserName} over raw CDP drove the built studio ` +
        'against a real bridge (new discussion → concierge Q&A → gallery pick → live mindmap edit → ' +
        'editedTree → board response → artifact visible → unified fullscreen viewer → pinned to the ' +
        'filmstrip), zero exceptions, zero STUDIO CLIENT ERROR lines, root mounted throughout',
    );
  } catch (err) {
    process.exitCode = 1;
    console.error(`\nHUMAN SIM FAIL at step: ${currentStep}`);
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    if (exceptions.length > 0) console.error(`\npage exceptions:\n${exceptions.join('\n')}`);
    if (consoleErrors.length > 0) console.error(`\npage console errors:\n${consoleErrors.join('\n')}`);
    console.error(`\nlast bridge log lines:\n${logLines.slice(-30).join('\n') || '(none)'}`);
    if (cdp) {
      try {
        // Backgrounded tabs return stale composited frames — bring to front first.
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
    // Whole tree, not just the root: Windows orphans renderer children, and a
    // leaked headless tree starves the NEXT harness run's launch (observed
    // 2026-07-07: ~100 leaked chrome/msedge processes across harness runs).
    killBrowserTree(browser);
    killProfileStragglers(profileDir);
    await bridge?.stop();
    // Temp profile always goes; the thread scratch dir survives failures as evidence.
    try {
      fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 5 });
    } catch {
      /* a straggling browser child may briefly hold a lock — harmless temp dir */
    }
    if (passed) {
      try {
        fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5 });
      } catch {
        /* harmless temp dir */
      }
    }
    // No process.exit() — the loop drains naturally, the exit code stays honest.
  }
}
