/**
 * Shared human-sim scaffold — rule 10 crash discipline in ONE place so a
 * hardening change lands once, not five times (review-followups-2026-07-09;
 * previously five scripts each carried ~100 verbatim lines of this, and the
 * flagship's launch-retry hardening never reached its siblings).
 *
 * Owns, identically for every sim:
 *   - browser discovery + the loud SKIP (exit 0 — genuinely absent, nothing faked)
 *   - scratch/profile temp dirs (profile always removed; scratch kept as evidence
 *     on failure, removed on pass)
 *   - the REAL Bridge on an ephemeral port over the sim's prepared store
 *   - headless launch with ONE retry (a loaded machine can miss the DevTools
 *     window once without anything being wrong) + raw-CDP wiring: page
 *     exceptions, console.error, and STUDIO CLIENT ERROR log-ring lines all
 *     fail the run at the next checkpoint
 *   - checkpoint()/step() with the failing-step report, failure screenshot
 *     (Page.bringToFront first — backgrounded tabs return stale frames)
 *   - teardown: CDP close, WHOLE browser tree + profile stragglers (Windows
 *     orphans renderer children; leaked trees starve the next run's launch),
 *     bridge stop. NEVER process.exit() — exitCode only, the loop drains
 *     (Windows/libuv learning 2026-07-07).
 *
 * The sim supplies only its journey:
 *
 *   runHumanSim('MINDCHAT', {
 *     prepare: ({ scratch }) => {
 *       const store = new SessionStore('…', scratch);
 *       return { store, board: … };          // store REQUIRED; extras reach run()
 *     },
 *     run: async ({ bridge, base, store, board, step, … }) => {
 *       await step('…', async () => { … });
 *       return 'summary for the PASS line';
 *     },
 *   });
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Bridge } from '../../apps/mcp/dist/bridge-server.js';
import { loadCanonical } from '../../tests/canonical/load.mjs';
import { ThemeSchema } from '../../packages/protocol/dist/index.js';
import {
  Cdp,
  findBrowsers,
  findPageTarget,
  killBrowserTree,
  killProfileStragglers,
  launchAnyBrowser,
  makePageHelpers,
  sleep,
} from './cdp.mjs';

/**
 * @param {string} label   Sim name for messages ('' for the flagship): SKIP/PASS/
 *                         FAIL lines read `HUMAN SIM <LABEL> …`, logs `human-sim-<label>: …`.
 * @param {object} spec    { models?, prepare({scratch}) -> {store, ...extras}, run(ctx) -> pass summary }
 */
export async function runHumanSim(label, { models = ['claude-fable-5'], prepare, run }) {
  const tag = label ? `HUMAN SIM ${label}` : 'HUMAN SIM';
  const prefix = label ? `human-sim-${label.toLowerCase()}` : 'human-sim';
  const { found: browsers, candidates } = findBrowsers();
  if (browsers.length === 0) {
    console.log(`${tag} SKIP: no chromium-family browser found (looked for: ${candidates.join(', ')})`);
    return; // loud skip, honest exit 0
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `vibr-${prefix}-`));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), `vibr-${prefix}-profile-`));
  const logLines = [];
  const exceptions = [];
  const consoleErrors = [];
  let bridge = null;
  let browser = null;
  let browserName = 'browser';
  let cdp = null;
  let currentStep = 'bootstrap';
  let passed = false;

  try {
    currentStep = 'prepare (seed stores/canonical data)';
    const prepared = await prepare({ scratch });
    assert.ok(prepared?.store, 'prepare() must return { store, … }');

    currentStep = 'bridge boot';
    bridge = new Bridge(prepared.store, {
      discussionRoot: scratch,
      themes: [loadCanonical('themes/theme.json', ThemeSchema)],
      theme: 'aurora',
      models,
      defaultModel: models[0],
      log: (line) => logLines.push(line),
      recentLogs: () => logLines.slice(-500),
    });
    await bridge.start(0); // ephemeral port
    const base = `http://127.0.0.1:${bridge.port}`;
    console.log(`${prefix}: bridge up at ${base} (thread ${prepared.store.info.id})`);

    // One retry: on a machine loaded with concurrent sessions, a cold launch can
    // miss the 20s DevTools window once without anything being wrong.
    currentStep = 'browser launch';
    let launched;
    try {
      launched = await launchAnyBrowser(browsers, profileDir);
    } catch (firstErr) {
      console.log(`${prefix}: first launch pass failed (${firstErr.message.split('\n')[0]}…) — retrying once`);
      killProfileStragglers(profileDir);
      await sleep(3_000);
      const retryProfile = path.join(profileDir, 'retry');
      fs.mkdirSync(retryProfile, { recursive: true });
      launched = await launchAnyBrowser(browsers, retryProfile);
    }
    browser = launched.proc;
    browserName = launched.name;
    if (launched.failures.length > 0) {
      console.log(`${prefix}: fell back past ${launched.failures.length} browser(s) that never served CDP`);
    }
    console.log(`${prefix}: ${browserName} headless, CDP on ${launched.devtoolsPort}`);

    currentStep = 'CDP connect';
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

    const { evaluate, waitInPage, click, typeInto } = makePageHelpers(cdp);

    const checkpoint = async (stepLabel) => {
      const rootChildren = await evaluate(
        `document.getElementById('root') ? document.getElementById('root').childElementCount : -1`,
      );
      if (rootChildren <= 0) throw new Error(`crash after "${stepLabel}": #root childElementCount=${rootChildren}`);
      if (exceptions.length > 0) throw new Error(`crash after "${stepLabel}": ${exceptions.join('\n')}`);
      if (consoleErrors.length > 0) throw new Error(`crash after "${stepLabel}": console.error: ${consoleErrors.join('\n')}`);
      const logs = await (await fetch(`${base}/api/logs`)).json();
      const clientErrors = logs.lines.filter((l) => l.includes('STUDIO CLIENT ERROR'));
      if (clientErrors.length > 0) throw new Error(`crash after "${stepLabel}":\n${clientErrors.join('\n')}`);
    };
    let stepCount = 0;
    const step = async (name, fn) => {
      currentStep = name;
      await fn();
      await checkpoint(name);
      stepCount++;
      console.log(`  ✓ ${name}`);
    };

    const summary = await run({
      ...prepared,
      bridge,
      base,
      scratch,
      logLines,
      browserName,
      cdp,
      evaluate,
      waitInPage,
      click,
      typeInto,
      step,
      checkpoint,
      stepCount: () => stepCount,
    });
    passed = true;
    console.log(`${tag} PASS — ${summary ?? `${stepCount} steps, zero exceptions, zero STUDIO CLIENT ERROR lines`}`);
  } catch (err) {
    process.exitCode = 1;
    console.error(`\n${tag} FAIL at step: ${currentStep}`);
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
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
