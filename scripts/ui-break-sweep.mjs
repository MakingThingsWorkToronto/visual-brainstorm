/**
 * UI break sweep (comprehensive-human-testing phase 4, CLAUDE.md rule 10).
 *
 * Extends the human-sim harness (scripts/human-sim.mjs, shared plumbing in
 * scripts/lib/cdp.mjs): a real headless chromium browser over raw CDP drives
 * the REAL built studio against a REAL Bridge, and per surface (New Discussion
 * landing + the six phase mechanics on their canonical boards) it:
 *
 *   1. empty-submits every submit-shaped button at pristine state,
 *   2. enumerates EVERY interactive control from the LIVE DOM
 *      (button/input/textarea/select/link/[role=button]/drag targets — drift
 *      is impossible because the census is the DOM, not a hand-kept list),
 *      then per control runs the applicable break gestures:
 *        buttons  → rapid double-click (no debounce assumption)
 *        text     → 100k-char oversize, hostile input (script tag, control
 *                   chars, emoji, RTL override), then cleared
 *        range    → real mouse drag across the track
 *        select   → option cycle (native setter + change event; the native
 *                   dropdown never opens headless)
 *        color    → programmatic set (native picker unavailable headless)
 *        file     → real click + CDP file-chooser interception feeding a
 *                   canonical file via DOM.setFileInputFiles (OS dialogs are
 *                   unopenable headless; controls that never raise a chooser
 *                   are reported "enumerated, not exercisable headless")
 *        drag     → real pointer drag (cluster cards, sketch pad, zoom pan)
 *   3. reloads mid-flow (Page.reload) and verifies the studio recovers
 *      (root mounts, board/panel rehydrates from the bridge's hello).
 *
 * After EVERY gesture the full crash check runs (unmounted root, page
 * exceptions, console.error, STUDIO CLIENT ERROR in GET /api/logs). A crash
 * signal with the root still mounted is a FINDING — recorded with
 * surface/control/gesture/evidence and the sweep CONTINUES. An unmounted root,
 * process death, or a dead bridge is an unhandled crash → hard fail (exit 1).
 * Controls newly revealed by a gesture (menus, dialogs, lens buttons, duels)
 * join the queue with a revealedBy chain so they are exercised too.
 *
 * Concurrent-session hazard: another live session rebuilding this repo clears
 * apps/studio/dist mid-run, and the bridge's unguarded createReadStream then
 * crashes the whole process (documented open bug, learnings 2026-07-07). The
 * sweep serves a SNAPSHOT of dist (copied to scratch, via VIBR_STUDIO_DIST) so
 * a mid-run rebuild cannot yank files out from under it — the bytes are still
 * the real built studio. If the in-process bridge dies anyway (that unguarded
 * stream on artifact SVGs, say), the sweep restarts bridge+browser page ONCE,
 * resumes from the next surface, and reports it; a second death is a hard fail.
 *
 * Chrome dedupe: nav/sidebar/wayfinder/modal chrome is identical on every
 * surface, so chrome controls are exercised once (on the first surface where
 * they appear) and counted as deduped afterwards; board-scoped controls are
 * exercised per surface because every phase gates them differently.
 *
 * Exit discipline: exit 0 with findings printed loudly (findings are honest
 * data); exit 1 only on unhandled crash / harness failure / budget blown.
 * Never process.exit() — the loop drains (Windows/libuv learning 2026-07-07).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bridge } from '../apps/mcp/dist/bridge-server.js';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { loadCanonical, CANONICAL_DIR } from '../tests/canonical/load.mjs';
import { BoardSchema, ThemeSchema } from '../packages/protocol/dist/index.js';
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
// Budgets & payloads
// ---------------------------------------------------------------------------
const TOTAL_BUDGET_MS = 9 * 60_000; // whole-sweep wall clock
const PRESENT_TIMEOUT_MS = 5_000; // presentAndWait waiter (fire-and-forget; short so timers drain fast)
const MAX_CONTROLS_PER_SURFACE = 70;
const OVERSIZE_TEXT = 'A'.repeat(100_000);
const HOSTILE_TEXT =
  '<script>alert(1)</script>' + String.fromCharCode(0, 7, 27) + ' 🧨🔥💥 مرحبا ' + '‮reversed‬' + ' {{constructor}} %s%n "quotes" backtick';
const CANONICAL_ATTACH_FILE = path.join(CANONICAL_DIR, 'boards', 'diverge.json');

const GUIDE_TITLES = {
  diverge: 'Pick what to build on',
  expand: 'Amplify what resonates',
  mutate: 'Change one thing at a time',
  wreck: 'Find what is broken',
  cluster: 'Group by dragging',
  converge: 'The gate: choose the final',
};
const EMPTY_SUBMIT_LABELS = new Set([
  'send & iterate', 'accept', 'send', 'save', 'save notes', 'set for this thread', 'capture', 'finalize & close out',
]);
// Phase tabs reveal OTHER phases' mechanics locally; those controls belong to
// their own surface sweep — don't requeue what a tab click reveals.
const NO_REQUEUE_LABELS = new Set(['diverge', 'expand', 'mutate', 'wreck', 'cluster', 'converge']);

// ---------------------------------------------------------------------------
// In-page enumeration source (String.raw: backslashes survive into the page).
// ---------------------------------------------------------------------------
const ENUM_SRC = String.raw`(function () {
  const NORM = (t) => (t || '').replace(/\s+/g, ' ').replace(/\d+/g, '').replace(/#/g, '').trim().slice(0, 32).toLowerCase();
  const labelOf = (el) => {
    const tag = el.tagName.toLowerCase();
    const formy = tag === 'textarea' || tag === 'input' || tag === 'select';
    const lab = el.closest('label');
    const cands = formy
      ? [el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('title'), lab ? lab.textContent : '']
      : [el.getAttribute('aria-label'), el.textContent, el.getAttribute('title')];
    for (const c of cands) { const n = NORM(c); if (n) return n; }
    return '(unlabeled)';
  };
  const kindOf = (el) => {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'text';
    if (tag === 'input') {
      if (type === 'range') return 'range';
      if (type === 'file') return 'file';
      if (type === 'color') return 'color';
      return 'text';
    }
    if (tag === 'button' || el.getAttribute('role') === 'button') return 'button';
    if (el.classList.contains('cursor-grab') || el.classList.contains('cursor-crosshair') || el.classList.contains('touch-none')) return 'drag';
    return 'button';
  };
  const regionOf = (el) => (el.closest('nav') ? 'nav' : el.closest('main') ? 'main' : 'chrome');
  return function enumerate(rootId) {
    const root = rootId ? document.getElementById(rootId) : null;
    const sel = 'button, input, textarea, select, a[href], [role="button"], .cursor-zoom-in, .cursor-grab, .cursor-crosshair, .touch-none';
    const els = [...document.querySelectorAll(sel)];
    const out = [];
    const counts = new Map();
    for (const el of els) {
      if (rootId && el.closest('main') && !(root && root.contains(el))) continue;
      const kind = kindOf(el);
      let target = el;
      let rect = el.getBoundingClientRect();
      if (kind === 'file' && (rect.width === 0 || rect.height === 0)) {
        const lab = el.closest('label');
        if (lab) { target = lab; rect = lab.getBoundingClientRect(); }
      }
      const visible = rect.width > 0 && rect.height > 0;
      const label = labelOf(kind === 'file' && target !== el ? target : el);
      const key = kind + '|' + label;
      const nth = counts.get(key) || 0;
      counts.set(key, nth + 1);
      out.push({ el, target, key, nth, kind, label, visible, disabled: !!el.disabled, region: regionOf(el) });
    }
    return out;
  };
})()`;

const censusExpr = (rootId) =>
  `(${ENUM_SRC})(${JSON.stringify(rootId)}).map((d) => ({ key: d.key, nth: d.nth, kind: d.kind, label: d.label, visible: d.visible, disabled: d.disabled, region: d.region }))`;

const locateExpr = (rootId, key, nth) => `(async () => {
  const hit = (${ENUM_SRC})(${JSON.stringify(rootId)}).find((d) => d.key === ${JSON.stringify(key)} && d.nth === ${nth});
  if (!hit || !hit.visible) return null;
  const el = hit.target;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  let prev = el.getBoundingClientRect();
  for (let i = 0; i < 90; i++) {
    await frame();
    const rect = el.getBoundingClientRect();
    if (Math.abs(rect.x - prev.x) < 0.5 && Math.abs(rect.y - prev.y) < 0.5) {
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height, disabled: hit.disabled };
    }
    prev = rect;
  }
  return null;
})()`;

/** In-page programmatic click by key — HARNESS PLUMBING ONLY (reviving a menu
 *  before re-exercising its item, closing stray overlays); the gestures under
 *  test always use real CDP mouse events. */
const reviveClickExpr = (rootId, key, nth) =>
  `(() => { const hit = (${ENUM_SRC})(${JSON.stringify(rootId)}).find((d) => d.key === ${JSON.stringify(key)} && d.nth === ${nth});
    if (!hit || !hit.visible) return false; hit.target.click(); return true; })()`;

const focusExpr = (rootId, key, nth) =>
  `(() => { const hit = (${ENUM_SRC})(${JSON.stringify(rootId)}).find((d) => d.key === ${JSON.stringify(key)} && d.nth === ${nth});
    if (!hit || !hit.visible) return false; hit.el.focus(); return document.activeElement === hit.el; })()`;

const valueLenExpr = (rootId, key, nth) =>
  `(() => { const hit = (${ENUM_SRC})(${JSON.stringify(rootId)}).find((d) => d.key === ${JSON.stringify(key)} && d.nth === ${nth});
    return hit ? String(hit.el.value ?? '').length : -1; })()`;

const clearFieldExpr = (rootId, key, nth) => `(() => {
  const hit = (${ENUM_SRC})(${JSON.stringify(rootId)}).find((d) => d.key === ${JSON.stringify(key)} && d.nth === ${nth});
  if (!hit) return false;
  const el = hit.el;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, 'value').set;
  set.call(el, '');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`;

const cycleSelectExpr = (rootId, key, nth) => `(() => {
  const hit = (${ENUM_SRC})(${JSON.stringify(rootId)}).find((d) => d.key === ${JSON.stringify(key)} && d.nth === ${nth});
  if (!hit) return false;
  const el = hit.el;
  if (!el.options || el.options.length === 0) return false;
  const idx = (el.selectedIndex + 1) % el.options.length;
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
  set.call(el, el.options[idx].value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

const setColorExpr = (rootId, key, nth) => `(() => {
  const hit = (${ENUM_SRC})(${JSON.stringify(rootId)}).find((d) => d.key === ${JSON.stringify(key)} && d.nth === ${nth});
  if (!hit) return false;
  const el = hit.el;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, '#12ab34');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

/** Close stray fullscreen overlays via their own Cancel/✕ buttons (plumbing). */
const closeOverlaysExpr = `(() => {
  let closed = 0;
  for (const overlay of [...document.querySelectorAll('div.fixed')]) {
    const cls = overlay.className || '';
    if (!cls.includes('inset-0')) continue;
    const btn = [...overlay.querySelectorAll('button')].find((b) => ['✕', '×', 'Cancel', 'call it off'].includes(b.textContent.trim()));
    if (btn) { btn.click(); closed++; }
  }
  return closed;
})()`;

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------
class FatalCrash extends Error {} // unmounted root / process-level — hard fail
class BridgeDown extends Error {} // bridge unreachable — restart once, then hard fail
class BudgetExceeded extends Error {}

// ---------------------------------------------------------------------------
// The run.
// ---------------------------------------------------------------------------
const { found: browsers, candidates } = findBrowsers();
if (browsers.length === 0) {
  console.log(
    `BREAK SWEEP SKIP: no chromium-family browser found (looked for: ${candidates.join(', ')})`,
  );
  // Loud skip, honest exit 0 — the browser is genuinely absent, nothing was faked.
} else {
  const startedAt = Date.now();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-break-sweep-'));
  const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-break-sweep-profile-'));
  const logLines = [];
  const exceptions = [];
  const consoleErrors = [];
  const seenClientErrors = new Set();
  const uncaughtErrors = [];
  let bridge = null;
  let browser = null;
  let browserName = 'browser';
  let cdp = null;
  let passed = false;
  let bridgeRestarts = 0;
  let currentContext = 'bootstrap';

  // Report state
  const surfaceReports = []; // { name, rows: [{control, gestures, outcome}], dedupedChrome, note }
  const findings = []; // { id, surface, control, gesture, evidence, count }
  const findingIndex = new Map();
  let gestureCount = 0;
  let controlCount = 0;
  const chromeDoneOn = new Map(); // key -> surface name (nav/chrome global dedupe)
  let presentCounter = 0;
  let jsDialogs = 0;
  let fileChoosersServed = 0;

  const store = new SessionStore('Break sweep session', scratch);
  const aurora = loadCanonical('themes/theme.json', ThemeSchema);

  const fileFinding = (surface, control, gesture, evidence) => {
    const dedupeKey = evidence.replace(/\d+/g, '#').slice(0, 160);
    const existing = findingIndex.get(dedupeKey);
    if (existing) {
      existing.count++;
      return existing.id;
    }
    const finding = {
      id: `F${findings.length + 1}`,
      surface,
      control,
      gesture,
      evidence: evidence.slice(0, 600),
      count: 1,
    };
    findings.push(finding);
    findingIndex.set(dedupeKey, finding);
    console.log(`  !! FINDING ${finding.id} [${surface} / ${control} / ${gesture}]: ${finding.evidence}`);
    return finding.id;
  };

  const bridgeOptions = () => ({
    discussionRoot: scratch,
    themes: [aurora],
    theme: 'aurora',
    models: ['claude-fable-5', 'claude-haiku-4-5'],
    defaultModel: 'claude-fable-5',
    engine: 'claude',
    log: (line) => logLines.push(line),
    recentLogs: () => logLines.slice(-800),
  });

  // Concurrent-session immunity: serve a snapshot of the real built studio so
  // a mid-run rebuild clearing apps/studio/dist cannot yank files mid-stream.
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const realDist = path.join(repoRoot, 'apps', 'studio', 'dist');
  const distSnapshot = path.join(scratch, 'dist-snapshot');

  const startBridge = async () => {
    const b = new Bridge(store, bridgeOptions());
    process.env.VIBR_STUDIO_DIST = distSnapshot;
    try {
      await b.start(0);
    } finally {
      delete process.env.VIBR_STUDIO_DIST;
    }
    return b;
  };
  const base = () => `http://127.0.0.1:${bridge.port}`;

  // The documented bridge hazard: an unguarded stream 'error' surfaces as an
  // uncaughtException in THIS process (the bridge is in-process). Capture it so
  // the surface loop can restart the bridge once instead of dying silently.
  process.on('uncaughtException', (err) => {
    uncaughtErrors.push(err);
    console.error(`break-sweep: uncaughtException captured (bridge hazard path): ${err?.message ?? err}`);
  });

  try {
    if (!fs.existsSync(path.join(realDist, 'index.html'))) {
      throw new Error(`studio not built (${realDist} missing) — run: npm run build`);
    }
    fs.cpSync(realDist, distSnapshot, { recursive: true });
    bridge = await startBridge();
    console.log(`break-sweep: bridge up at ${base()} (thread ${store.info.id}, dist snapshot ${distSnapshot})`);

    // Fake media devices: the camera modal gets a real (fake) stream instead of
    // a permission prompt that headless can never answer. One retry: on a
    // machine loaded with concurrent sessions, a cold launch can miss the 20s
    // DevTools window once (observed 2026-07-07) without anything being wrong.
    let launched;
    const launchArgs = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
    try {
      launched = await launchAnyBrowser(browsers, profileDir, launchArgs);
    } catch (firstErr) {
      console.log(`break-sweep: first launch pass failed (${firstErr.message.split('\n')[0]}…) — retrying once`);
      killProfileStragglers(profileDir);
      await sleep(3_000);
      const retryProfile = path.join(profileDir, 'retry');
      fs.mkdirSync(retryProfile, { recursive: true });
      launched = await launchAnyBrowser(browsers, retryProfile, launchArgs);
    }
    browser = launched.proc;
    browserName = launched.name;
    if (launched.failures.length > 0) {
      console.log(`break-sweep: fell back past ${launched.failures.length} browser(s) that never served CDP`);
    }
    console.log(`break-sweep: ${browserName} headless, CDP on ${launched.devtoolsPort}`);

    const pageWsUrl = await findPageTarget(launched.devtoolsPort);
    if (!pageWsUrl) throw new Error('DevTools /json/list never exposed a page target');
    cdp = await Cdp.connect(pageWsUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    cdp.on('Runtime.exceptionThrown', (p) => {
      exceptions.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text);
    });
    cdp.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        consoleErrors.push(p.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
      }
    });
    // window.confirm / alert would block the page forever headless — dismiss
    // and count them (the Plan closeout button confirms before dispatching).
    cdp.on('Page.javascriptDialogOpening', (p) => {
      jsDialogs++;
      console.log(`  · js dialog auto-dismissed: "${(p.message ?? '').slice(0, 80)}"`);
      cdp.send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
    });
    // File choosers: intercept and feed a canonical file programmatically
    // (headless has no OS dialog to click through).
    cdp.on('Page.fileChooserOpened', (p) => {
      cdp
        .send('DOM.setFileInputFiles', { files: [CANONICAL_ATTACH_FILE], backendNodeId: p.backendNodeId })
        .then(() => {
          fileChoosersServed++;
        })
        .catch((err) => console.log(`  · file chooser intercept failed: ${err.message}`));
    });
    const armFileInterception = () => cdp.send('Page.setInterceptFileChooserDialog', { enabled: true });
    await armFileInterception();

    const { evaluate, waitInPage } = makePageHelpers(cdp);

    // --- low-level real-input gestures --------------------------------------
    const mouse = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, ...extra });
    const rawClick = async (c) => {
      await mouse('mouseMoved', c.x, c.y, { button: 'none' });
      await mouse('mousePressed', c.x, c.y, { button: 'left', clickCount: 1 });
      await mouse('mouseReleased', c.x, c.y, { button: 'left', clickCount: 1 });
    };
    const rapidDoubleClick = async (c) => {
      await mouse('mouseMoved', c.x, c.y, { button: 'none' });
      await mouse('mousePressed', c.x, c.y, { button: 'left', clickCount: 1 });
      await mouse('mouseReleased', c.x, c.y, { button: 'left', clickCount: 1 });
      await sleep(40); // human "oops double" cadence — no debounce assumption
      await mouse('mousePressed', c.x, c.y, { button: 'left', clickCount: 1 });
      await mouse('mouseReleased', c.x, c.y, { button: 'left', clickCount: 1 });
    };
    const dragFrom = async (c, dx, dy) => {
      await mouse('mouseMoved', c.x, c.y, { button: 'none' });
      await mouse('mousePressed', c.x, c.y, { button: 'left', clickCount: 1, buttons: 1 });
      const steps = 6;
      for (let i = 1; i <= steps; i++) {
        await mouse('mouseMoved', c.x + (dx * i) / steps, c.y + (dy * i) / steps, { button: 'left', buttons: 1 });
        await sleep(20);
      }
      await mouse('mouseReleased', c.x + dx, c.y + dy, { button: 'left', clickCount: 1 });
    };
    const pressEscape = async () => {
      await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    };

    const checkBudget = () => {
      if (Date.now() - startedAt > TOTAL_BUDGET_MS) {
        throw new BudgetExceeded(`wall-clock budget of ${TOTAL_BUDGET_MS / 1000}s exceeded`);
      }
      if (uncaughtErrors.length > 0) {
        throw new BridgeDown(`in-process bridge crash: ${uncaughtErrors.map((e) => e?.message ?? e).join('; ')}`);
      }
    };

    // --- the crash check after EVERY gesture ---------------------------------
    const checkpoint = async (surface, control, gesture) => {
      const ids = [];
      const rootChildren = await evaluate(
        `document.getElementById('root') ? document.getElementById('root').childElementCount : -1`,
      );
      if (rootChildren <= 0) {
        throw new FatalCrash(
          `unmounted root after [${surface} / ${control} / ${gesture}] (#root childElementCount=${rootChildren})`,
        );
      }
      for (const e of exceptions.splice(0)) ids.push(fileFinding(surface, control, gesture, `uncaught page exception: ${e}`));
      for (const e of consoleErrors.splice(0)) ids.push(fileFinding(surface, control, gesture, `console.error: ${e}`));
      let logs;
      try {
        logs = await (await fetch(`${base()}/api/logs`)).json();
      } catch (err) {
        throw new BridgeDown(`bridge unreachable during checkpoint: ${err?.message ?? err}`);
      }
      for (const line of logs.lines) {
        if (line.includes('STUDIO CLIENT ERROR') && !seenClientErrors.has(line)) {
          seenClientErrors.add(line);
          ids.push(fileFinding(surface, control, gesture, line));
        }
      }
      return ids;
    };

    // --- surface plumbing ----------------------------------------------------
    const fetchState = async () => {
      try {
        return await (await fetch(`${base()}/api/state`)).json();
      } catch (err) {
        throw new BridgeDown(`bridge unreachable: ${err?.message ?? err}`);
      }
    };

    const boardBases = Object.fromEntries(
      ['diverge', 'expand', 'mutate', 'wreck', 'cluster', 'converge'].map((phase) => [
        phase,
        loadCanonical(`boards/${phase}.json`, BoardSchema),
      ]),
    );

    const surfaceSignatureExpr = (surface) => {
      if (surface.kind === 'landing') {
        return `document.body.textContent.includes('New Discussion') && !!document.querySelector('textarea') && document.body.textContent.includes('What do you want to explore?')`;
      }
      const title = JSON.stringify(boardBases[surface.phase].title.slice(0, 16));
      const guide = JSON.stringify(GUIDE_TITLES[surface.phase]);
      return `document.body.textContent.includes('your turn') && document.body.textContent.includes(${title}) && document.body.textContent.includes(${guide})`;
    };

    const presentFresh = async (surface) => {
      const clone = {
        ...boardBases[surface.phase],
        id: `${boardBases[surface.phase].id}-sweep-${++presentCounter}`,
        sessionId: store.info.id,
      };
      surface.currentBoardId = clone.id;
      surface.rootId = `round-${clone.id}`;
      // Fire-and-forget: the sweep never fakes a response; the short waiter
      // resolves null on its own (board stays live for the humanlike gestures).
      bridge.presentAndWait(clone, PRESENT_TIMEOUT_MS, /* open browser */ false).catch(() => {});
      await waitInPage(`the ${surface.phase} board to render`, surfaceSignatureExpr(surface), 20_000);
    };

    /** Bring the surface back to a workable state after a gesture knocked it
     *  around (submits clear boards, tabs switch mechanics, links navigate,
     *  panels replace the main area). Every path is a legitimate app flow. */
    const restore = async (surface) => {
      // Let in-flight submits (async onRespond fetch) land before probing state.
      await sleep(250);
      // 1. If a link navigated the tab off the studio, come home.
      const onStudio = await evaluate(`location.port === ${JSON.stringify(String(bridge.port))} && !!document.getElementById('root')`).catch(() => false);
      if (!onStudio) {
        await cdp.send('Page.navigate', { url: `${base()}/` });
        await waitInPage('the studio root after off-page navigation', `document.getElementById('root') && document.getElementById('root').childElementCount > 0`, 20_000);
        await cdp.send('DOM.enable').catch(() => {});
        await armFileInterception().catch(() => {});
      }
      // 2. Close stray fullscreen overlays (preview/camera/logs/artifact chat).
      await pressEscape();
      await evaluate(closeOverlaysExpr).catch(() => {});
      // 3. Cancel an unexpectedly opened New Discussion panel (board surfaces only).
      if (surface.kind !== 'landing') {
        await evaluate(
          `(() => { if (!document.body.textContent.includes('What do you want to explore?')) return false;
            const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel');
            if (btn) { btn.click(); return true; } return false; })()`,
        ).catch(() => {});
        // 4. Leave an archived-thread view via the Live session button.
        await evaluate(
          `(() => { if (!document.body.textContent.includes('Archived thread')) return false;
            const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Live session'));
            if (btn) { btn.click(); return true; } return false; })()`,
        ).catch(() => {});
      }
      // 5. Board surfaces: a submit cleared the board, or a phase tab switched
      //    the mechanic — re-present a fresh canonical clone.
      if (surface.kind === 'board') {
        const state = await fetchState();
        const alive = state.activeBoard && state.activeBoard.id === surface.currentBoardId;
        const looksRight = alive && (await evaluate(surfaceSignatureExpr(surface)).catch(() => false));
        if (!looksRight) await presentFresh(surface);
      } else {
        const ok = await evaluate(surfaceSignatureExpr(surface)).catch(() => false);
        if (!ok) {
          await cdp.send('Page.navigate', { url: `${base()}/` });
          await waitInPage('the landing panel after restore', surfaceSignatureExpr(surface), 20_000);
          await cdp.send('DOM.enable').catch(() => {});
          await armFileInterception().catch(() => {});
        }
      }
      bridge.drainCommands(); // keep the UI-command queue from growing unbounded
    };

    const locate = (surface, d) =>
      evaluate(locateExpr(surface.kind === 'board' ? surface.rootId : null, d.key, d.nth), { awaitPromise: true });

    const revive = async (surface, d, depth = 0) => {
      let center = await locate(surface, d);
      if (center || depth >= 4 || !d.revealedBy) return center;
      await revive(surface, d.revealedBy, depth + 1);
      await evaluate(reviveClickExpr(surface.kind === 'board' ? surface.rootId : null, d.revealedBy.key, d.revealedBy.nth)).catch(() => {});
      await sleep(250);
      center = await locate(surface, d);
      return center;
    };

    const takeCensus = (surface) =>
      evaluate(censusExpr(surface.kind === 'board' ? surface.rootId : null));

    // --- per-control gesture programs ---------------------------------------
    const runControl = async (surface, d, report) => {
      const rootId = surface.kind === 'board' ? surface.rootId : null;
      const controlName = `${d.kind} "${d.label}"${d.nth > 0 ? `[${d.nth}]` : ''}`;
      currentContext = `${surface.name} / ${controlName}`;
      const gesturesRun = [];
      const findingIds = [];
      let note = '';

      const gesture = async (name, fn) => {
        checkBudget();
        gesturesRun.push(name);
        gestureCount++;
        await fn();
        findingIds.push(...(await checkpoint(surface.name, controlName, name)));
      };

      const center = await revive(surface, d);
      if (!center) {
        report.rows.push({ control: controlName, gestures: [], outcome: 'vanished (transient control, could not relocate)' });
        return;
      }

      try {
        if (d.kind === 'button') {
          await gesture('rapid-double-click', () => rapidDoubleClick(center));
          if (center.disabled) note = 'disabled at click time (click inert by design)';
        } else if (d.kind === 'link') {
          await gesture('click', async () => {
            await rawClick(center);
            await sleep(300);
            // A live-view keep opens the artifact chat (preventDefault), but a
            // bare anchor could navigate the tab to the raw SVG — come home
            // BEFORE the checkpoint so a mounted-root check stays meaningful.
            const here = await evaluate(`!!document.getElementById('root')`).catch(() => false);
            if (!here) {
              note = 'link navigated off the studio — returned';
              await cdp.send('Page.navigate', { url: `${base()}/` });
              await waitInPage(
                'the studio after link navigation',
                `document.getElementById('root') && document.getElementById('root').childElementCount > 0`,
                20_000,
              );
              await cdp.send('DOM.enable').catch(() => {});
              await armFileInterception().catch(() => {});
            }
          });
        } else if (d.kind === 'text') {
          const focus = () => evaluate(focusExpr(rootId, d.key, d.nth));
          if (await focus()) {
            await gesture('oversize-100k', async () => {
              await evaluate(clearFieldExpr(rootId, d.key, d.nth));
              await focus();
              await cdp.send('Input.insertText', { text: OVERSIZE_TEXT }, 30_000);
              const len = await evaluate(valueLenExpr(rootId, d.key, d.nth));
              if (len === 0) {
                findingIds.push(fileFinding(surface.name, controlName, 'oversize-100k', 'enabled+focused text field silently ignored typed input'));
              }
            });
            await gesture('hostile-input', async () => {
              await evaluate(clearFieldExpr(rootId, d.key, d.nth));
              await focus();
              await cdp.send('Input.insertText', { text: HOSTILE_TEXT });
            });
            await gesture('cleared', async () => {
              await evaluate(clearFieldExpr(rootId, d.key, d.nth));
            });
          } else {
            note = 'unfocusable (hidden or replaced mid-sweep)';
          }
        } else if (d.kind === 'range') {
          await gesture('drag-slider', () => dragFrom({ x: center.x, y: center.y }, Math.max(20, center.w / 2 - 2), 0));
        } else if (d.kind === 'select') {
          await gesture('cycle-option', async () => {
            const ok = await evaluate(cycleSelectExpr(rootId, d.key, d.nth));
            if (!ok) note = 'no options to cycle';
          });
        } else if (d.kind === 'color') {
          await gesture('programmatic-set', async () => {
            await evaluate(setColorExpr(rootId, d.key, d.nth));
          });
          note = 'native color picker not available headless; value set programmatically';
        } else if (d.kind === 'file') {
          const before = fileChoosersServed;
          await gesture('chooser-intercept-set', async () => {
            await rawClick(center);
            const deadline = Date.now() + 3_000;
            while (fileChoosersServed === before && Date.now() < deadline) await sleep(100);
          });
          note =
            fileChoosersServed > before
              ? `file chooser intercepted, canonical file attached (${path.basename(CANONICAL_ATTACH_FILE)})`
              : 'enumerated, not exercisable headless (no file chooser event)';
        } else if (d.kind === 'drag') {
          await gesture('drag-move', () => dragFrom(center, 60, 40));
        }
      } catch (err) {
        if (err instanceof FatalCrash || err instanceof BridgeDown || err instanceof BudgetExceeded) throw err;
        note = `gesture error: ${err?.message ?? err}`;
      }

      controlCount++;
      const outcome =
        findingIds.length > 0
          ? `FINDING ${[...new Set(findingIds)].join(', ')}`
          : `ok${note ? ` (${note})` : ''}`;
      report.rows.push({ control: controlName, gestures: gesturesRun, outcome });
    };

    // --- one surface ---------------------------------------------------------
    const runSurface = async (surface) => {
      currentContext = `${surface.name} / enter`;
      console.log(`\n=== surface: ${surface.name} ===`);
      const report = { name: surface.name, rows: [], dedupedChrome: 0, notes: [] };
      surfaceReports.push(report);

      if (surface.kind === 'board') {
        await presentFresh(surface);
      } else {
        await waitInPage('the New Discussion landing panel', surfaceSignatureExpr(surface), 30_000);
      }
      await checkpoint(surface.name, '(surface)', 'enter');

      // Phase A: empty submits at pristine state.
      const pristine = await takeCensus(surface);
      for (const d of pristine.filter((c) => c.visible && c.kind === 'button' && EMPTY_SUBMIT_LABELS.has(c.label))) {
        checkBudget();
        currentContext = `${surface.name} / empty-submit ${d.label}`;
        const center = await locate(surface, d);
        if (!center) continue;
        gestureCount++;
        await rawClick(center);
        const ids = await checkpoint(surface.name, `button "${d.label}"`, 'empty-submit');
        report.rows.push({
          control: `button "${d.label}"`,
          gestures: ['empty-submit'],
          outcome: ids.length > 0 ? `FINDING ${ids.join(', ')}` : 'ok',
        });
        await restore(surface);
      }

      // Phase B: the census crawl (revealed controls join the queue).
      const seen = new Set();
      const queue = [];
      const admit = (list, revealedBy) => {
        for (const c of list) {
          if (!c.visible) {
            if (c.kind === 'file' && !seen.has(c.key + '#' + c.nth)) {
              seen.add(c.key + '#' + c.nth);
              report.rows.push({ control: `file "${c.label}"`, gestures: [], outcome: 'enumerated, not exercisable headless (input hidden, no visible label)' });
            }
            continue;
          }
          const id = c.key + '#' + c.nth;
          if (seen.has(id)) continue;
          seen.add(id);
          if (c.region !== 'main' && !revealedBy) {
            const doneOn = chromeDoneOn.get(c.key);
            if (doneOn && doneOn !== surface.name) {
              report.dedupedChrome++;
              continue;
            }
            chromeDoneOn.set(c.key, surface.name);
          }
          queue.push({ ...c, revealedBy: revealedBy ?? null });
        }
      };
      admit(await takeCensus(surface), null);

      let processed = 0;
      while (queue.length > 0) {
        checkBudget();
        if (processed >= MAX_CONTROLS_PER_SURFACE) {
          report.notes.push(`control cap ${MAX_CONTROLS_PER_SURFACE} reached; ${queue.length} queued controls not exercised`);
          break;
        }
        const d = queue.shift();
        processed++;
        await runControl(surface, d, report);
        // Discover controls the gestures revealed (menus, dialogs, duels…).
        if (!NO_REQUEUE_LABELS.has(d.label)) {
          const after = await takeCensus(surface).catch(() => []);
          admit(after, d);
        }
        await restore(surface);
      }

      // Phase C: mid-flow reload — the studio must recover from the hello resync.
      currentContext = `${surface.name} / reload`;
      checkBudget();
      gestureCount++;
      await cdp.send('Page.reload');
      await sleep(400);
      let recovered = true;
      try {
        await waitInPage('the root after mid-flow reload', `document.getElementById('root') && document.getElementById('root').childElementCount > 0`, 30_000);
        await waitInPage('the surface to rehydrate after reload', surfaceSignatureExpr(surface), 20_000);
      } catch (err) {
        recovered = false;
        fileFinding(surface.name, '(surface)', 'mid-flow-reload', `did not rehydrate: ${err?.message ?? err}`);
      }
      await cdp.send('DOM.enable').catch(() => {});
      await armFileInterception().catch(() => {});
      const ids = await checkpoint(surface.name, '(surface)', 'mid-flow-reload');
      report.rows.push({
        control: '(surface)',
        gestures: ['mid-flow-reload'],
        outcome: !recovered || ids.length > 0 ? `FINDING ${[...new Set(ids)].join(', ') || '(rehydrate)'}` : 'ok (root mounted, state rehydrated)',
      });
      if (!recovered) await restore(surface);
    };

    // =========================================================================
    // The sweep: landing first (fresh thread = the intake surface), then the
    // six phase mechanics on their canonical boards.
    // =========================================================================
    await cdp.send('Page.navigate', { url: `${base()}/` });
    await waitInPage(
      'the mounted root',
      `document.getElementById('root') && document.getElementById('root').childElementCount > 0`,
      30_000,
    );
    await waitInPage(
      'the hello state (session title in the sidebar)',
      `document.body.textContent.includes('Break sweep session')`,
    );

    const surfaces = [
      { name: 'landing/new-discussion', kind: 'landing' },
      ...['diverge', 'expand', 'mutate', 'wreck', 'cluster', 'converge'].map((phase) => ({
        name: phase,
        kind: 'board',
        phase,
      })),
    ];

    for (const surface of surfaces) {
      try {
        await runSurface(surface);
      } catch (err) {
        if (err instanceof BridgeDown && bridgeRestarts === 0) {
          bridgeRestarts++;
          const why = uncaughtErrors.map((e) => e?.message ?? String(e)).join('; ') || err.message;
          uncaughtErrors.length = 0;
          console.error(`break-sweep: bridge died mid-sweep (${why}) — restarting bridge once and resuming from the next surface`);
          surfaceReports.at(-1)?.notes.push(`ABORTED: bridge process death (${why.slice(0, 200)}); bridge restarted, sweep resumed at the next surface`);
          try {
            await bridge.stop();
          } catch {
            /* half-dead server */
          }
          bridge = await startBridge();
          await cdp.send('Page.navigate', { url: `${base()}/` });
          await waitInPage('the root after bridge restart', `document.getElementById('root') && document.getElementById('root').childElementCount > 0`, 30_000);
          await cdp.send('DOM.enable').catch(() => {});
          await armFileInterception().catch(() => {});
          continue;
        }
        throw err;
      }
      // The wayfinder keeps + artifact chat ride the later surfaces' chrome:
      // capture one canonical artifact after the first board surface.
      if (surface.name === 'diverge' && store.artifacts.length === 0) {
        const board = boardBases.diverge;
        const artifact = store.captureArtifact('Sweep keeper', board.options[0].svg, 'kept by the break sweep', {
          boardId: board.id,
          optionIds: [board.options[0].id],
        });
        bridge.announceArtifact(artifact);
        console.log(`  · artifact "${artifact.slug}" captured — keeps strip + artifact chat join the chrome census`);
      }
    }

    // =========================================================================
    // The report.
    // =========================================================================
    console.log('\n================ BREAK SWEEP REPORT ================');
    for (const report of surfaceReports) {
      console.log(`\n--- ${report.name} — ${report.rows.length} controls exercised${report.dedupedChrome > 0 ? `, ${report.dedupedChrome} chrome controls deduped (exercised on an earlier surface)` : ''} ---`);
      for (const row of report.rows) {
        console.log(`  ${row.outcome.startsWith('FINDING') ? '!!' : '· '} ${row.control} × [${row.gestures.join(', ') || '-'}] → ${row.outcome}`);
      }
      for (const note of report.notes) console.log(`  NOTE: ${note}`);
    }
    console.log(`\nsurfaces: ${surfaceReports.length} · controls exercised: ${controlCount} · gestures: ${gestureCount} · js dialogs dismissed: ${jsDialogs} · file choosers served: ${fileChoosersServed} · bridge restarts: ${bridgeRestarts}`);
    if (findings.length > 0) {
      console.log('\n!!!!!!!!!!!!!!!!!!!! FINDINGS (honest data — real product defects to file) !!!!!!!!!!!!!!!!!!!!');
      for (const f of findings) {
        console.log(`${f.id} [${f.surface} / ${f.control} / ${f.gesture}]${f.count > 1 ? ` (seen ${f.count}x)` : ''}:\n    ${f.evidence}`);
      }
    } else {
      console.log('\nfindings: none');
    }

    passed = true;
    console.log(
      `\nBREAK SWEEP PASS — ${controlCount} controls, ${gestureCount} gestures, ${findings.length} findings, zero unhandled crashes`,
    );
  } catch (err) {
    process.exitCode = 1;
    console.error(`\nBREAK SWEEP FAIL at: ${currentContext}`);
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    if (exceptions.length > 0) console.error(`\npage exceptions:\n${exceptions.join('\n')}`);
    if (consoleErrors.length > 0) console.error(`\npage console errors:\n${consoleErrors.join('\n')}`);
    if (findings.length > 0) {
      console.error(`\nfindings recorded before the failure:`);
      for (const f of findings) console.error(`${f.id} [${f.surface} / ${f.control} / ${f.gesture}]: ${f.evidence}`);
    }
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
    try {
      await bridge?.stop();
    } catch {
      /* half-dead server after a captured crash */
    }
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
