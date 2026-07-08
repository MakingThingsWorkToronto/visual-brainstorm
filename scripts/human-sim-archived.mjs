/**
 * Human-simulation harness — the ARCHIVED-thread journey (comprehensive-human-testing
 * mandate, CLAUDE.md rule 10). Sibling to scripts/human-sim.mjs (same CDP plumbing,
 * same crash discipline, same SKIP convention) proving the bug this wave fixed:
 * App.tsx wired chatMessages/chatArtifact/WayfinderStrip to the LIVE state only, so
 * a completed (_completed/) thread's captured-artifact chat never rendered. A
 * component-only test cannot catch this — the bug lived in App-level wiring — so
 * this drives the REAL built studio against a REAL bridge end to end:
 *
 *   left-nav Completed section → open a seeded archived thread → "Completed thread"
 *   banner + WayfinderStrip renders its keep → click the keep → the unified
 *   ArtifactFullscreen viewer opens (item 5: replaces the old PreviewModal/ArtifactChat
 *   split) showing the PERSISTED chat (user + claude), read-only (no composer, no Save
 *   notes, no pin toggle — pinning is live-thread only) → the "↩ Reopen" controls
 *   (item 3) are present on the archived banner and on the round separator.
 *
 * The archived thread is seeded PHYSICALLY on disk under discussionRoot/_completed/
 * using the real SessionStore write helpers (recordBoard/recordResponse/
 * captureArtifact/recordArtifactChat) against canonical fixtures (tests/canonical/
 * boards/diverge.json, responses/iterate.json) — mirroring tests/canonical/threads/
 * session.json's glow-mark narrative — never a hand-built object literal (rule 5/
 * canonical-data convention). Nothing is faked: the bridge reloads this thread from
 * disk through the SAME GET /api/discussions/:id → SessionStore.open() path a real
 * plan-closeout leaves behind.
 *
 * SKIP convention (matches human-sim.mjs): no chromium-family browser → loud SKIP,
 * exit 0. Exit discipline: never process.exit() (Windows/libuv learning 2026-07-07).
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { loadCanonical } from '../tests/canonical/load.mjs';
import { ArtifactChatMessageSchema, BoardResponseSchema, BoardSchema, ThemeSchema } from '../packages/protocol/dist/index.js';
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
  console.log(
    `HUMAN SIM ARCHIVED SKIP: no chromium-family browser found (looked for: ${candidates.join(', ')})`,
  );
} else {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-human-sim-archived-'));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-human-sim-archived-profile-'));
  const logLines = [];
  const exceptions = [];
  const consoleErrors = [];
  let bridge = null;
  let browser = null;
  let browserName = 'browser';
  let cdp = null;
  let currentStep = 'bootstrap';
  let passed = false;

  // --- seed the archived thread PHYSICALLY under _completed/, canonical data throughout ---
  const completedRoot = path.join(scratch, '_completed');
  fs.mkdirSync(completedRoot, { recursive: true });
  const archivedStore = new SessionStore('Glow mark — a logo for Visual Brainstorm', completedRoot);
  const archivedBoard = { ...loadCanonical('boards/diverge.json', BoardSchema), sessionId: archivedStore.info.id };
  archivedStore.recordBoard(archivedBoard);
  archivedStore.recordResponse(loadCanonical('responses/iterate.json', BoardResponseSchema));
  const artifact = archivedStore.captureArtifact(
    'Glow Mark',
    archivedBoard.options[0].svg,
    'canonical capture',
    { boardId: archivedBoard.id, optionIds: ['a'] },
  );
  const userText = 'What does the filament symbolize?';
  const claudeText = 'The filament is the raw idea — warm, literal, the spark before the abstraction.';
  archivedStore.recordArtifactChat(
    ArtifactChatMessageSchema.parse({ artifactSlug: artifact.slug, role: 'user', text: userText, at: new Date().toISOString() }),
  );
  archivedStore.recordArtifactChat(
    ArtifactChatMessageSchema.parse({ artifactSlug: artifact.slug, role: 'claude', text: claudeText, at: new Date().toISOString() }),
  );
  // The chat.jsonl + artifacts/*.svg + session.json now live on disk under
  // _completed/<dir>/ exactly as plan-closeout leaves a thread — GET
  // /api/discussions/:id (bridge-server.ts) reloads it via SessionStore.open().
  assert.ok(fs.existsSync(path.join(archivedStore.info.dir, 'artifacts', 'chat.jsonl')), 'chat.jsonl seeded on disk');
  assert.ok(fs.existsSync(path.join(archivedStore.info.dir, 'artifacts', `${artifact.slug}.svg`)), 'artifact svg seeded on disk');

  // A separate LIVE thread — the bridge's bound store — so the studio has a live
  // session too (its landing panel is not the surface under test here).
  const liveStore = new SessionStore('Human sim archived-journey session', scratch);

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
    console.log(`human-sim-archived: bridge up at ${base} (live thread ${liveStore.info.id}, archived thread ${archivedStore.info.id})`);

    const launched = await launchAnyBrowser(browsers, profileDir);
    browser = launched.proc;
    browserName = launched.name;
    console.log(`human-sim-archived: ${browserName} headless, CDP on ${launched.devtoolsPort}`);

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

    const { evaluate, waitInPage, click } = makePageHelpers(cdp);

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
    await step('studio loads over the real bridge (root mounted)', async () => {
      await cdp.send('Page.navigate', { url: `${base}/` });
      await waitInPage(
        'the mounted root',
        `document.getElementById('root') && document.getElementById('root').childElementCount > 0`,
        30_000,
      );
      await waitInPage(
        'the Completed nav section listing the seeded archived thread',
        `document.body.textContent.includes('Completed (')`,
      );
    });

    await step('open the left-nav Completed section', async () => {
      await click(
        'the "Completed (n)" nav toggle',
        `[...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('Completed ('))`,
      );
      await waitInPage(
        'the seeded archived thread listed under Completed',
        `[...document.querySelectorAll('nav button')].some((b) => b.textContent.includes(${JSON.stringify(archivedStore.info.title)}))`,
      );
    });

    await step('click the seeded thread — it loads as archived', async () => {
      await click(
        'the seeded archived thread row',
        `[...document.querySelectorAll('nav button')].find((b) => b.textContent.includes(${JSON.stringify(archivedStore.info.title)}))`,
      );
      await waitInPage(
        'the "Completed thread" banner',
        `document.body.textContent.includes('Completed thread')`,
      );
      // Item 3: reopen controls present on the archived banner + round separator.
      await waitInPage(
        'the "↩ Reopen" banner button',
        `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '↩ Reopen')`,
      );
      await waitInPage(
        'the "↩ reopen from here" round-separator action',
        `[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '↩ reopen from here')`,
      );
    });

    await step('the WayfinderStrip renders with the seeded keep', async () => {
      await waitInPage(
        'the wayfinder keeps strip showing the seeded artifact',
        `document.body.textContent.includes('keeps, drag out') &&
         [...document.querySelectorAll('a')].some((a) =>
           (a.getAttribute('href') || '').includes('/api/artifact-svg/${encodeURIComponent(artifact.slug)}.svg'))`,
      );
    });

    await step('click the keep — the unified ArtifactFullscreen opens with the PERSISTED chat, read-only', async () => {
      await click(
        `the "${artifact.slug}" keep`,
        `[...document.querySelectorAll('a')].find((a) => (a.getAttribute('href') || '').includes('/api/artifact-svg/${encodeURIComponent(artifact.slug)}.svg'))`,
      );
      // Signature markers of the unified viewer (item 5: ArtifactFullscreen replaces
      // the old ArtifactChat/PreviewModal split) — zoom % control + Notes dock.
      await waitInPage(
        'the fullscreen viewer (title + zoom control + Notes dock)',
        `document.body.textContent.includes(${JSON.stringify(artifact.name)}) &&
         !!document.querySelector('.tabular-nums') &&
         document.body.textContent.includes('Notes')`,
      );
      await waitInPage(
        'the persisted user message',
        `document.body.textContent.includes(${JSON.stringify(userText)})`,
      );
      await waitInPage(
        'the persisted claude message',
        `document.body.textContent.includes(${JSON.stringify(claudeText)})`,
      );
      // Read-only replay: no composer input, no Send/Save notes buttons.
      assert.equal(
        await evaluate(`!!document.querySelector('input[placeholder="Ask or ask for a change…"]')`),
        false,
        'no chat composer input on an archived (read-only) thread',
      );
      assert.equal(
        await evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Save notes')`),
        false,
        'no Save notes button on an archived (read-only) thread',
      );
      assert.equal(
        await evaluate(`document.body.textContent.includes('canonical capture')`),
        true,
        'notes shown as read-only text (the artifact\'s persisted notes)',
      );
      assert.equal(
        await evaluate(`document.body.textContent.includes('📌')`),
        false,
        'no pin toggle on an archived thread (pin is live-thread only)',
      );
      // The captured SVG itself: fetched from /api/artifact-svg/:slug.svg — proves
      // the archived thread's own artifact bytes actually load (not stuck on the
      // "loading …" placeholder forever).
      await waitInPage(
        'the artifact SVG panel resolves (no longer showing the loading placeholder)',
        `!document.body.textContent.includes('loading ${artifact.slug}')`,
        8_000,
      );
    });

    passed = true;
    console.log(
      `HUMAN SIM ARCHIVED PASS — ${stepCount} steps: real ${browserName} over raw CDP opened a seeded ` +
        '_completed/ thread from the left nav (Completed thread banner, WayfinderStrip keep, reopen controls ' +
        'present), clicked the keep into the unified ArtifactFullscreen viewer, and confirmed the PERSISTED ' +
        'artifact chat (user + claude) replays read-only (no composer, no Save notes, no pin toggle), ' +
        'zero exceptions, zero STUDIO CLIENT ERROR lines, root mounted throughout',
    );
  } catch (err) {
    process.exitCode = 1;
    console.error(`\nHUMAN SIM ARCHIVED FAIL at step: ${currentStep}`);
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
      /* a straggling browser child may briefly hold a lock — harmless temp dir */
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
