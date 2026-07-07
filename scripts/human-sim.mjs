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
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { loadCanonical } from '../tests/canonical/load.mjs';
import { BoardSchema, ThemeSchema } from '../packages/protocol/dist/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Browser discovery — Edge preferred, Chrome fallback (headless=new capable).
// ---------------------------------------------------------------------------
function findBrowsers() {
  const pf = process.env.ProgramFiles ?? 'C:/Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:/Program Files (x86)';
  const local = process.env.LOCALAPPDATA ?? '';
  const candidates = [
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    local ? path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return { found: candidates.filter((p) => fs.existsSync(p)), candidates };
}

/**
 * Launch one candidate headless and wait for its DevTools endpoint. Edge on
 * Windows can exit 0 immediately WITHOUT printing an endpoint (launcher/startup-
 * boost handoff — observed 2026-07-07), so a launch only counts once the
 * `DevTools listening on ws://…` line appears; otherwise the caller falls back
 * to the next installed browser.
 */
function launchBrowser(exe, profileDir) {
  const proc = spawn(
    exe,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-gpu',
      '--window-size=1440,1000',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let stderrBuf = '';
  const devtoolsPort = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`no DevTools endpoint within 20s; stderr:\n${stderrBuf || '(empty)'}`)),
      20_000,
    );
    proc.stderr.on('data', (chunk) => {
      stderrBuf += String(chunk);
      const m = stderrBuf.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)\//);
      if (m) {
        clearTimeout(timer);
        resolve(Number(m[1]));
      }
    });
    proc.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`exited early (code ${code}) without a DevTools endpoint; stderr:\n${stderrBuf || '(empty)'}`));
    });
  });
  return { proc, devtoolsPort };
}

// ---------------------------------------------------------------------------
// Minimal raw CDP client over the repo's own `ws`.
// ---------------------------------------------------------------------------
class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    socket.on('message', (data) => {
      const msg = JSON.parse(String(data));
      if (msg.id) {
        const waiter = this.pending.get(msg.id);
        if (!waiter) return;
        this.pending.delete(msg.id);
        if (msg.error) waiter.reject(new Error(`CDP ${waiter.method}: ${msg.error.message}`));
        else waiter.resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners.get(msg.method) ?? []) fn(msg.params);
      }
    });
  }

  static connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { maxPayload: 64 * 1024 * 1024 });
      socket.once('open', () => resolve(new Cdp(socket)));
      socket.once('error', reject);
    });
  }

  /** Every command has a hard timeout — no infinite hangs, ever. */
  send(method, params = {}, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method}: no reply within ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
  }

  close() {
    try {
      this.socket.close();
    } catch {
      /* already gone */
    }
  }
}

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
    let devtoolsPort = null;
    const launchFailures = [];
    for (const [i, exe] of browsers.entries()) {
      // Per-attempt profile: a handoff-style launcher (Edge) may leave a hidden
      // process holding its dir, which would wedge the next candidate.
      const attemptProfile = path.join(profileDir, `attempt-${i}`);
      fs.mkdirSync(attemptProfile, { recursive: true });
      const attempt = launchBrowser(exe, attemptProfile);
      try {
        devtoolsPort = await attempt.devtoolsPort;
        browser = attempt.proc;
        browserName = path.basename(exe);
        break;
      } catch (launchErr) {
        launchFailures.push(`${exe}: ${launchErr.message}`);
        try {
          attempt.proc.kill();
        } catch {
          /* already gone */
        }
      }
    }
    if (devtoolsPort === null) {
      throw new Error(
        `every installed chromium-family browser failed to serve CDP:\n${launchFailures.join('\n')}`,
      );
    }
    if (launchFailures.length > 0) {
      console.log(`human-sim: fell back past ${launchFailures.length} browser(s) that never served CDP`);
    }
    console.log(`human-sim: ${browserName} headless, CDP on ${devtoolsPort}`);

    // --- find the page target and connect raw CDP ---
    let pageWsUrl = null;
    for (let i = 0; i < 50 && !pageWsUrl; i++) {
      try {
        const targets = await (await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`)).json();
        pageWsUrl = targets.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? null;
      } catch {
        /* devtools http not ready yet */
      }
      if (!pageWsUrl) await sleep(100);
    }
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

    // --- in-page helpers -----------------------------------------------------
    const evaluate = async (expression, { awaitPromise = false } = {}) => {
      const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise,
      });
      if (exceptionDetails) {
        throw new Error(
          `in-page evaluation threw: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`,
        );
      }
      return result.value;
    };

    const waitInPage = async (what, expression, timeoutMs = 15_000) => {
      const start = Date.now();
      for (;;) {
        const value = await evaluate(expression);
        if (value) return value;
        if (Date.now() - start > timeoutMs) {
          throw new Error(`timed out after ${timeoutMs}ms waiting for ${what}`);
        }
        await sleep(120);
      }
    };

    /** Real mouse click at the element's center once its rect stops moving
     *  (smooth scrolls animate — clicking a moving target misses). */
    const click = async (what, finderExpr) => {
      const center = await evaluate(
        `(async () => {
          const el = ${finderExpr};
          if (!el) return null;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const frame = () => new Promise((r) => requestAnimationFrame(r));
          let prev = el.getBoundingClientRect();
          for (let i = 0; i < 90; i++) {
            await frame();
            const rect = el.getBoundingClientRect();
            if (Math.abs(rect.x - prev.x) < 0.5 && Math.abs(rect.y - prev.y) < 0.5) {
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            }
            prev = rect;
          }
          return null;
        })()`,
        { awaitPromise: true },
      );
      if (!center) throw new Error(`could not find (or settle) ${what} to click it`);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: center.x, y: center.y, button: 'none' });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: center.x, y: center.y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: center.x, y: center.y, button: 'left', clickCount: 1 });
    };

    /** Focus a real element, then commit text via Input.insertText (real input events). */
    const typeInto = async (what, finderExpr, text) => {
      const focused = await evaluate(
        `(() => { const el = ${finderExpr}; if (!el) return false; el.focus(); return document.activeElement === el; })()`,
      );
      if (!focused) throw new Error(`could not focus ${what}`);
      await cdp.send('Input.insertText', { text });
    };

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

    // The canonical diverge board, re-anchored to this thread (fresh id rule
    // does not apply — this is its first presentation).
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

    await step('a captured artifact appears in the wayfinder keeps', async () => {
      const artifact = store.captureArtifact('Beta keeper', board.options[1].svg, 'kept by the human sim', {
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

    passed = true;
    console.log(
      `HUMAN SIM PASS — ${stepCount} steps: real ${browserName} over raw CDP drove the built studio ` +
        'against a real bridge (new discussion → board response → artifact visible), zero exceptions, ' +
        'zero STUDIO CLIENT ERROR lines, root mounted throughout',
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
    if (browser && browser.exitCode === null) {
      const gone = new Promise((r) => browser.once('exit', r));
      browser.kill();
      await Promise.race([gone, sleep(5_000)]);
    }
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
