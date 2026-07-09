/**
 * Human-simulation harness — the MIND-MAP maximize→chat journey (rule 10). Sibling to the
 * other human-sim harnesses (raw CDP, same SKIP + exit discipline).
 *
 * Proves the operator's mind-map asks on the REAL path: the live mind map renders with a
 * MAXIMIZE control; clicking it opens the SAME fullscreen viewer as any artifact (SVG left,
 * chat right); a question typed there records under the mindmap's snapshot artifact (the
 * iterative-improvement channel) while the board stays live (non-destructive); and the tree
 * is persisted MODEL-LEGIBLY to round-NN/tree.md (the traversable outline read-mindmap reads).
 *
 * The mindmap board is presented via the REAL bridge.presentAndWait (fire-and-forget); the
 * studio renders the real mind-elixir canvas; chat + persistence round-trip through the real
 * endpoints. No mocks; only the model that authors a REPLY / improves the tree is out of loop.
 *
 * SKIP: no chromium-family browser → loud SKIP, exit 0. Never process.exit().
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { BoardSchema, ThemeSchema } from '../packages/protocol/dist/index.js';
import { loadCanonical } from '../tests/canonical/load.mjs';
import {
  Cdp,
  findBrowsers,
  findPageTarget,
  killBrowserTree,
  killProfileStragglers,
  launchAnyBrowser,
  makePageHelpers,
} from './lib/cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const { found: browsers, candidates } = findBrowsers();
if (browsers.length === 0) {
  console.log(`HUMAN SIM MINDCHAT SKIP: no chromium-family browser found (looked for: ${candidates.join(', ')})`);
} else {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-human-sim-mindchat-'));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-human-sim-mindchat-profile-'));
  const logLines = [];
  const exceptions = [];
  const consoleErrors = [];
  let bridge = null;
  let browser = null;
  let browserName = 'browser';
  let cdp = null;
  let currentStep = 'bootstrap';
  let passed = false;

  const liveStore = new SessionStore('Glow mark — a live mind map', scratch);
  const board = BoardSchema.parse({
    ...JSON.parse(fs.readFileSync(path.join(here, '..', 'tests', 'canonical', 'boards', 'mindmap-tree.json'), 'utf8')),
    sessionId: liveStore.info.id,
  });
  const rootTopic = board.tree.nodeData.topic;
  const roundDir = path.join(liveStore.info.dir, `round-${String(board.round).padStart(2, '0')}`);

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
    bridge.presentAndWait(board, 120_000, /* openBrowser */ false).catch(() => {});
    console.log(`human-sim-mindchat: bridge up at ${base}, mindmap board ${board.id} live (root "${rootTopic}")`);

    const launched = await launchAnyBrowser(browsers, profileDir);
    browser = launched.proc;
    browserName = launched.name;
    console.log(`human-sim-mindchat: ${browserName} headless, CDP on ${launched.devtoolsPort}`);

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

    // =========================================================================
    await step('studio loads the live mind map with a maximize control', async () => {
      await cdp.send('Page.navigate', { url: `${base}/` });
      await waitInPage(
        'the mind-map canvas + the maximize button',
        `!!document.querySelector('[data-testid="mindmap-canvas"]') &&
         !!document.querySelector('[data-testid="mindmap-maximize"]')`,
        30_000,
      );
    });

    await step('the tree persisted MODEL-LEGIBLY to round-NN/tree.md (traversable outline)', async () => {
      // Deterministic server-side persistence — assert the file on disk.
      assert.ok(fs.existsSync(path.join(roundDir, 'tree.md')), 'round-NN/tree.md written on present');
      const treeMd = fs.readFileSync(path.join(roundDir, 'tree.md'), 'utf8');
      assert.ok(treeMd.includes('### Presented tree'), 'tree.md is the presented outline');
      assert.ok(treeMd.includes(`- ${rootTopic}`), 'tree.md lists the root topic (traversable)');
    });

    await step('maximize → the SAME fullscreen viewer (SVG + Notes + chat composer)', async () => {
      await click('the mind-map maximize button', `document.querySelector('[data-testid="mindmap-maximize"]')`);
      await waitInPage(
        'the unified fullscreen viewer with a chat composer',
        `!!document.querySelector('.tabular-nums') &&
         document.body.textContent.includes('Notes') &&
         !!document.querySelector('input[placeholder="Ask or ask for a change…"]')`,
      );
    });

    const mindQ = 'Can the “Motion” branch lean more kinetic?';
    await step('ask about the mind map — bubble shows + persists under the mindmap artifact', async () => {
      await typeInto(
        'the mind-map chat composer',
        `document.querySelector('input[placeholder="Ask or ask for a change…"]')`,
        mindQ,
      );
      await click(
        'the chat Send button',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send')`,
      );
      await waitInPage(
        'the user question bubble appears in the mind-map dialog',
        `document.body.textContent.includes(${JSON.stringify(mindQ)})`,
        8_000,
      );
      // Persisted under the mindmap SNAPSHOT artifact (boardId provenance, no optionIds).
      const st = await (await fetch(`${base}/api/state`)).json();
      const mindmapArtifact = st.artifacts.find(
        (a) => a.provenance.boardId === board.id && a.provenance.optionIds.length === 0,
      );
      assert.ok(mindmapArtifact, 'the mind-map snapshot artifact exists');
      assert.ok(
        (st.artifactChat ?? []).some((m) => m.role === 'user' && m.text === mindQ && m.artifactSlug === mindmapArtifact.slug),
        'the mind-map chat persisted under the snapshot artifact slug',
      );
      // The board stayed live through the chat (non-destructive detour).
      const health = await (await fetch(`${base}/api/health`)).json();
      assert.equal(health.activeBoard?.id, board.id, 'the mind-map board stayed live through the chat');
    });

    passed = true;
    console.log(
      `HUMAN SIM MINDCHAT PASS — ${stepCount} steps: real ${browserName} over raw CDP rendered a live mind map, ` +
        'confirmed round-NN/tree.md (model-legible outline), maximized into the unified fullscreen viewer with a chat ' +
        'composer, and asked a question that persisted under the mindmap snapshot artifact while the board stayed live; ' +
        'zero exceptions, zero STUDIO CLIENT ERROR lines',
    );
  } catch (err) {
    process.exitCode = 1;
    console.error(`\nHUMAN SIM MINDCHAT FAIL at step: ${currentStep}`);
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
