/**
 * Shared raw-CDP plumbing for the human-simulation harnesses
 * (scripts/human-sim.mjs and scripts/ui-break-sweep.mjs).
 *
 * Extracted VERBATIM from scripts/human-sim.mjs (phase 3) so both drivers share
 * one proven implementation: browser discovery with Edge→Chrome fallback (Edge
 * on Windows can exit 0 without ever serving CDP — learnings 2026-07-07), a
 * minimal CDP client over the repo's own `ws` (frameworkless, no Playwright),
 * and the in-page helpers (settled-rect real mouse clicks, Input.insertText
 * typing, polling waits) that drive React exactly like a human pointer does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import WebSocket from 'ws';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Browser discovery — Edge preferred, Chrome fallback (headless=new capable).
// ---------------------------------------------------------------------------
export function findBrowsers() {
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
 * to the next installed browser. `extraArgs` lets a driver add flags (e.g. fake
 * media devices) without changing the proven baseline.
 */
export function launchBrowser(exe, profileDir, extraArgs = []) {
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
      ...extraArgs,
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

/**
 * Try every installed candidate until one serves CDP. Per-attempt profile dirs:
 * a handoff-style launcher (Edge) may leave a hidden process holding its dir,
 * which would wedge the next candidate. Returns the surviving process, its
 * DevTools port, the basename, and the failure messages of skipped candidates.
 */
export async function launchAnyBrowser(browsers, profileRoot, extraArgs = []) {
  const failures = [];
  for (const [i, exe] of browsers.entries()) {
    const attemptProfile = path.join(profileRoot, `attempt-${i}`);
    fs.mkdirSync(attemptProfile, { recursive: true });
    const attempt = launchBrowser(exe, attemptProfile, extraArgs);
    try {
      const devtoolsPort = await attempt.devtoolsPort;
      return { proc: attempt.proc, devtoolsPort, name: path.basename(exe), failures };
    } catch (launchErr) {
      failures.push(`${exe}: ${launchErr.message}`);
      try {
        attempt.proc.kill();
      } catch {
        /* already gone */
      }
    }
  }
  throw new Error(
    `every installed chromium-family browser failed to serve CDP:\n${failures.join('\n')}`,
  );
}

/**
 * Kill the WHOLE browser process tree. On Windows, `proc.kill()` terminates
 * only the root — renderer/GPU/network children survive orphaned (observed
 * 2026-07-07: ~100 leaked headless chrome/msedge processes across harness
 * runs, enough contention to make the next launch time out). taskkill /T is
 * the reliable answer; POSIX gets a plain SIGKILL.
 */
export function killBrowserTree(proc) {
  if (!proc || proc.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      proc.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

/**
 * Best-effort sweep of straggler browser processes still holding a harness
 * profile dir (Edge's launcher handoff exits 0 while a hidden process keeps
 * the profile open — learnings 2026-07-07 — and that hidden tree is never a
 * child of the proc we spawned). Windows-only; matches by command line.
 */
export function killProfileStragglers(profileDir) {
  if (process.platform !== 'win32') return;
  const pattern = profileDir.replace(/'/g, "''");
  spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='chrome.exe' or Name='msedge.exe'" | ` +
        `Where-Object { $_.CommandLine -like '*${pattern}*' } | ` +
        `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ],
    { stdio: 'ignore', timeout: 15_000 },
  );
}

/** Poll DevTools /json/list until the page target exposes its ws URL (or null). */
export async function findPageTarget(devtoolsPort) {
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
  return pageWsUrl;
}

// ---------------------------------------------------------------------------
// Minimal raw CDP client over the repo's own `ws`.
// ---------------------------------------------------------------------------
export class Cdp {
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
// In-page helpers — real mouse clicks at settled rects, real input events.
// ---------------------------------------------------------------------------
export function makePageHelpers(cdp) {
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

  return { evaluate, waitInPage, click, typeInto };
}
