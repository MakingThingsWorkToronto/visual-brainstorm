/**
 * Shared human-sim scaffold — rule 10 crash discipline in ONE place so a
 * hardening change lands once, not five times (review-followups-2026-07-09;
 * previously five scripts each carried ~100 verbatim lines of this, and the
 * flagship's launch-retry hardening never reached its siblings).
 *
 * REAL ROUTE (real-routes-human-sim-2026-07-09): the orchestrator side is NOT
 * faked. The scaffold spawns the BUILT stdio MCP server (apps/mcp/dist/index.js)
 * in a scratch working directory — exactly the process Claude Code runs — and
 * hands the sim a real MCP client (`mcp.call('present_board', …)`), never an
 * in-process Bridge whose producers the sim could call directly. The tool
 * layer's own contracts (intake lock, option/axes validation, digest
 * construction, park→reply→rearm) are therefore under test in every journey.
 * The only thing still fixture-driven is the CONTENT of the calls (canonical
 * boards — rule 11: harness code stays dumb) and the model that would author
 * replies; the pathway is the product's.
 *
 * Owns, identically for every sim:
 *   - browser discovery + the loud SKIP (exit 0 — genuinely absent, nothing faked)
 *   - scratch/profile temp dirs (profile always removed; scratch kept as evidence
 *     on failure, removed on pass)
 *   - the spawned MCP server: cwd = scratch (its visual-brainstorm.config.json
 *     carries the sim's models/theme), VIBR_HOME = scratch (thread cache),
 *     VIBR_PORT=0 (ephemeral — concurrency-safe across simultaneous runs)
 *   - awaitBase(): the studio URL discovered from the bridge's own
 *     .logs/bridge-port.json once the FIRST tool call arms the server
 *   - headless launch with ONE retry (a loaded machine can miss the DevTools
 *     window once without anything being wrong) + raw-CDP wiring: page
 *     exceptions, console.error, and STUDIO CLIENT ERROR log-ring lines all
 *     fail the run at the next checkpoint
 *   - checkpoint()/step() with the failing-step report, failure screenshot
 *     (Page.bringToFront first — backgrounded tabs return stale frames)
 *   - teardown: CDP close, WHOLE browser tree + profile stragglers (Windows
 *     orphans renderer children; leaked trees starve the next run's launch),
 *     MCP child killed. NEVER process.exit() — exitCode only, the loop drains
 *     (Windows/libuv learning 2026-07-07).
 *
 * The sim supplies only its journey:
 *
 *   runHumanSim('MINDCHAT', {
 *     prepare: ({ scratch }) => {
 *       const store = new SessionStore('…', scratch);   // optional disk seeding
 *       return { store, board: … };                      // extras reach run()
 *     },
 *     run: async ({ mcp, awaitBase, step, … }) => {
 *       const wait = mcp.call('present_board', …);       // the REAL tool
 *       const base = await awaitBase();
 *       await step('…', async () => { … });
 *       return 'summary for the PASS line';
 *     },
 *   });
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCanonical } from '../../tests/canonical/load.mjs';
import { ThemeSchema } from '../../packages/protocol/dist/index.js';
import { McpClient } from './mcp-client.mjs';
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

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MCP_ENTRY = path.resolve(HERE, '../../apps/mcp/dist/index.js');

/**
 * @param {string} label   Sim name for messages ('' for the flagship): SKIP/PASS/
 *                         FAIL lines read `HUMAN SIM <LABEL> …`, logs `human-sim-<label>: …`.
 * @param {object} spec    { models?, prepare({scratch}) -> extras, run(ctx) -> pass summary }
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
  let mcp = null;
  let browser = null;
  let browserName = 'browser';
  let cdp = null;
  let currentStep = 'bootstrap';
  let passed = false;
  let base = null;

  try {
    currentStep = 'prepare (seed stores/canonical data)';
    const prepared = (await prepare?.({ scratch })) ?? {};

    currentStep = 'MCP server spawn (the real stdio route)';
    // The server reads visual-brainstorm.config.json from ITS cwd — give the
    // scratch one the sim's models + the canonical Aurora theme (stylesDir).
    fs.mkdirSync(path.join(scratch, 'styles'), { recursive: true });
    const theme = loadCanonical('themes/theme.json', ThemeSchema);
    fs.writeFileSync(path.join(scratch, 'styles', `${theme.name}.json`), JSON.stringify(theme, null, 2));
    fs.writeFileSync(
      path.join(scratch, 'visual-brainstorm.config.json'),
      JSON.stringify({ theme: theme.name, models, defaultModel: models[0], stylesDir: 'styles' }, null, 2),
    );
    if (!fs.existsSync(MCP_ENTRY)) throw new Error(`built MCP server missing at ${MCP_ENTRY} — run npm run build first`);
    mcp = new McpClient({
      args: [MCP_ENTRY],
      cwd: scratch,
      env: { ...process.env, VIBR_HOME: scratch, VIBR_PORT: '0' },
      onLog: (line) => logLines.push(line),
    });
    await mcp.initialize();
    console.log(`${prefix}: real MCP server up over stdio (scratch ${scratch})`);

    // The bridge (and its HTTP port) exists only once the first tool call arms
    // it — the port file is the bridge's own durable announcement.
    const awaitBase = async (timeoutMs = 30_000) => {
      if (base) return base;
      const portFile = path.join(scratch, '.logs', 'bridge-port.json');
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        if (fs.existsSync(portFile)) {
          try {
            const { port } = JSON.parse(fs.readFileSync(portFile, 'utf8'));
            if (port) {
              base = `http://127.0.0.1:${port}`;
              console.log(`${prefix}: bridge up at ${base}`);
              return base;
            }
          } catch {
            /* torn write — retry */
          }
        }
        if (Date.now() > deadline) throw new Error('bridge-port.json never appeared — did a tool call arm the bridge?');
        await sleep(100);
      }
    };

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
    if (!pageWsUrl) throw new Error('DevTools /json/list exposed no page target');
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
      if (base) {
        const logs = await (await fetch(`${base}/api/logs`)).json();
        const clientErrors = logs.lines.filter((l) => l.includes('STUDIO CLIENT ERROR'));
        if (clientErrors.length > 0) throw new Error(`crash after "${stepLabel}":\n${clientErrors.join('\n')}`);
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

    const summary = await run({
      ...prepared,
      mcp,
      awaitBase,
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
    console.error(`\nlast MCP-server log lines:\n${logLines.slice(-30).join('\n') || '(none)'}`);
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
    mcp?.close();
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
