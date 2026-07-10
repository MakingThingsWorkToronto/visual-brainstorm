/**
 * Human-simulation harness (comprehensive-human-testing phase 3, CLAUDE.md rule 10).
 *
 * A frameworkless driver: headless Edge/Chrome spoken to over RAW CDP using the
 * repo's own `ws` package (no Playwright/Puppeteer), loading the REAL built studio
 * (apps/studio/dist) served by the REAL stdio MCP server (spawned by
 * scripts/lib/sim-runner.mjs exactly as Claude Code runs it), and scripting a
 * full human goal end to end. BOTH ends are the real route: the human side is
 * raw CDP on the real studio; the orchestrator side is real `tools/call`
 * requests (open_studio → ask_concierge → present_gallery → present_board →
 * capture_artifact → reply_artifact_chat) against the product's own tool layer
 * — its intake lock, validation, and feedback digest are all live in this run:
 *
 *   open_studio blocks → new discussion (type a brief, pick a chip, annotate a
 *   photo seed, send) resolves it with the new-brainstorm command
 *   → present_board is REFUSED before the gallery pick (the intake gate, live)
 *   → concierge Q&A → gallery pick → mindmap round → canonical board round
 *   → a captured artifact becomes visible in the wayfinder strip.
 *
 * Interaction choices (documented per the mandate):
 *   - Clicks are REAL CDP mouse events (Input.dispatchMouseEvent at the element's
 *     settled center after scrollIntoView) — closest to a human pointer.
 *   - Pen/arrow strokes are REAL CDP mouse DRAGS (press → moves → release) on the
 *     scribble canvas; the note-placement pointerdown is a real dispatched
 *     PointerEvent on the canvas (headless CDP won't reliably synthesize a
 *     pointerdown for a stationary tap on the <svg> — same real-handler tradeoff
 *     the mindmap step makes with the live engine's own methods).
 *   - Typing is Runtime focus() + CDP Input.insertText — fires real `input` events,
 *     so React controlled inputs update exactly as they do for a human.
 *   - Elements are located by the surfaces' own semantic anchors (button text,
 *     aria-pressed, artifact hrefs) plus the studio's existing data-testids
 *     (e.g. scribble-canvas, mindmap-canvas) where a surface has no unique text.
 *
 * Scaffold (browser discovery/SKIP, bridge boot, launch retry, CDP wiring,
 * per-step crash checkpoints, failure screenshot/evidence, exit discipline,
 * teardown) lives in scripts/lib/sim-runner.mjs — shared by all five sims.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { loadCanonical } from '../tests/canonical/load.mjs';
import { BoardSchema, LivingGallerySchema } from '../packages/protocol/dist/index.js';
// Visual-honesty (CLAUDE.md rule 10): a rendered surface / testid is not proof —
// assert the SPECIFIC canonical data is visibly in frame; reject false-greens.
import { assertShowsCanonical, assertSurfaceShowsCanonical } from './lib/visual-honesty.mjs';
import { sleep } from './lib/cdp.mjs';
import { runHumanSim } from './lib/sim-runner.mjs';

await runHumanSim('', {
  models: ['claude-fable-5', 'claude-haiku-4-5'],
  run: async ({ mcp, awaitBase, scratch, cdp, evaluate, waitInPage, click, typeInto, step, stepCount, browserName }) => {
    // --- scribble-pad primitives: a real pointer DRAG (pen/arrow) and a key
    //     press (commit a text note), plus a real file-picker set. These drive
    //     the studio's genuine pointer/keyboard/file paths — nothing faked. ----
    await cdp.send('DOM.enable');
    // Scroll the canvas to viewport center, let the smooth-scroll settle, and
    // return its settled viewport rect. Coordinates from a NON-settled rect can
    // land off-screen (earlier toolbar clicks scrollIntoView and shift the pad),
    // so every drag/tap re-settles the canvas first.
    const settledCanvasRect = async () => {
      const rect = await evaluate(
        `(async () => {
          const el = document.querySelector('[data-testid="scribble-canvas"]');
          if (!el) return null;
          el.scrollIntoView({ block: 'center', inline: 'center' });
          const frame = () => new Promise((r) => requestAnimationFrame(r));
          let prev = el.getBoundingClientRect();
          for (let i = 0; i < 90; i++) {
            await frame();
            const r = el.getBoundingClientRect();
            if (Math.abs(r.y - prev.y) < 0.5 && Math.abs(r.x - prev.x) < 0.5) {
              return { x: r.x, y: r.y, w: r.width, h: r.height };
            }
            prev = r;
          }
          return { x: prev.x, y: prev.y, w: prev.width, h: prev.height };
        })()`,
        { awaitPromise: true },
      );
      if (!rect) throw new Error('scribble canvas not found');
      return rect;
    };
    const dragOnCanvas = async (from, to, steps = 8) => {
      const rect = await settledCanvasRect();
      const at = (f) => ({ x: rect.x + rect.w * f.x, y: rect.y + rect.h * f.y });
      const a = at(from);
      const b = at(to);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y, button: 'none' });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, button: 'left', buttons: 1 });
      }
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
    };
    const pressEnter = async () => {
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    };
    const setFileInput = async (selector, filePath) => {
      const { result } = await cdp.send('Runtime.evaluate', { expression: selector, returnByValue: false });
      if (!result.objectId) throw new Error(`file input not found: ${selector}`);
      await cdp.send('DOM.setFileInputFiles', { files: [filePath], objectId: result.objectId });
    };
    // A real 2×2 PNG on disk — the file a human would pick from the Attach dialog.
    const photoPath = path.join(scratch, 'inspiration.png');
    fs.writeFileSync(
      photoPath,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP8z8Dwn4EIwDiqEAAj4wf9lZ0DAAAAAElFTkSuQmCC',
        'base64',
      ),
    );

    // =========================================================================
    // The human goal. The REAL open_studio tool blocks for the brief — exactly
    // how a bare /run-brainstorm session starts — while raw CDP plays the human.
    // =========================================================================
    const openStudioWait = mcp.call('open_studio', { timeoutSeconds: 600, openBrowser: false }, 660_000);
    const base = await awaitBase();
    await step('studio loads over the real bridge (root mounted, landing panel up)', async () => {
      const loadStudio = async () => {
        await cdp.send('Page.navigate', { url: `${base}/` });
        await waitInPage(
          'the mounted root',
          `document.getElementById('root') && document.getElementById('root').childElementCount > 0`,
          30_000,
        );
      };
      try {
        await loadStudio();
      } catch (firstErr) {
        console.log(`human-sim: first studio load pass failed (${firstErr.message}) — retrying once`);
        await sleep(2_000);
        await loadStudio();
      }
      // Empty live thread (open_studio's placeholder) → the New Discussion
      // landing surface is the opener.
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
      await waitInPage(
        'the selected a logo survey chip',
        `(() => {
          const chip = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'a logo');
          return chip?.getAttribute('aria-checked') === 'true';
        })()`,
      );
      await typeInto('the brief textarea', `document.querySelector('textarea')`, brief);
      await waitInPage(
        'the controlled brief textarea value',
        `document.querySelector('textarea')?.value === ${JSON.stringify(brief)}`,
      );
      const value = await evaluate(`document.querySelector('textarea').value`);
      assert.equal(value, brief, 'typed brief landed in the controlled textarea');
    });

    // =========================================================================
    // Annotate-a-photo seed (journeys.md #7). The human attaches a photo, accepts
    // the "scribble on it?" offer, marks it up (pen + text note + arrow) in a
    // palette color, and sends — the annotated composite must ride to disk as the
    // sketch seed with the photo embedded, while the raw photo persists as an
    // attachment (Keep both). Every action here is a REAL studio interaction.
    // =========================================================================
    // NB: two buttons read "Aurora" — the studio theme-switcher pill AND the
    // Colors-card generation-palette button. Target the palette one by its unique
    // title so we set the GENERATION palette (genTheme), not the studio skin.
    const auroraPaletteBtn = `[...document.querySelectorAll('button')].find((b) => (b.getAttribute('title') || '').includes('Aurora palette for generated options'))`;
    await step('human picks the Aurora palette (its colors will ink the scribble)', async () => {
      await click('the Aurora generation-palette button in Colors', auroraPaletteBtn);
      await waitInPage(
        'the Aurora palette selected (aria-pressed)',
        `${auroraPaletteBtn}?.getAttribute('aria-pressed') === 'true'`,
      );
    });

    await step('human attaches a photo — the scribble offer appears', async () => {
      await click(
        'the More Tools (+) button',
        `document.querySelector('button[aria-label="More Tools"]')`,
      );
      await waitInPage(
        'the hidden Attach-file input mounted in the menu',
        `!!document.querySelector('input[type=file]')`,
      );
      await setFileInput(`document.querySelector('input[type=file]')`, photoPath);
      await waitInPage(
        'the "scribble on this photo?" offer banner',
        `!!document.querySelector('[data-testid="scribble-offer"]') &&
         document.body.textContent.includes('Want to scribble on this photo?')`,
      );
    });

    await step('human accepts — the photo becomes the scribble pad background', async () => {
      await click(
        'the offer’s Scribble a seed button',
        `document.querySelector('[data-testid="scribble-offer-accept"]')`,
      );
      // The pad expands, mounts the toolbar, and shows the photo as an <image>.
      await waitInPage(
        'the scribble canvas with the photo embedded + the Pen/Text/Arrow toolbar',
        `!!document.querySelector('[data-testid="scribble-canvas"] image') &&
         !!document.querySelector('[data-testid="scribble-tool-pen"]') &&
         !!document.querySelector('[data-testid="scribble-tool-text"]') &&
         !!document.querySelector('[data-testid="scribble-tool-arrow"]')`,
      );
    });

    let penHex;
    await step('human annotates the photo (pen + highlighter + box + note + arrow) + undo + fullscreen', async () => {
      // Pen: pick the first palette swatch, then drag a stroke across the photo.
      await click('the Pen tool', `document.querySelector('[data-testid="scribble-tool-pen"]')`);
      await click('the first palette swatch', `document.querySelector('[data-testid="scribble-swatch"]')`);
      await dragOnCanvas({ x: 0.18, y: 0.3 }, { x: 0.62, y: 0.72 });
      penHex = await waitInPage(
        'a drawn polyline in the pad, inked with the chosen swatch color',
        `(() => {
          const line = document.querySelector('[data-testid="scribble-canvas"] polyline');
          return line ? line.getAttribute('stroke') : null;
        })()`,
      );
      assert.equal(penHex.toLowerCase(), '#7c3aed', 'pen uses the selected Aurora palette color (not the default accent)');

      // Highlighter: a thick, translucent stroke (stroke-opacity 0.35).
      await click('the Highlighter tool', `document.querySelector('[data-testid="scribble-tool-highlighter"]')`);
      await click('the first palette swatch', `document.querySelector('[data-testid="scribble-swatch"]')`);
      await dragOnCanvas({ x: 0.2, y: 0.2 }, { x: 0.7, y: 0.24 });
      await waitInPage(
        'a translucent highlighter stroke',
        `[...document.querySelectorAll('[data-testid="scribble-canvas"] polyline')].some((l) => l.getAttribute('stroke-opacity') === '0.35')`,
      );

      // Box: circle a region — a translucent-filled <rect> (fill-opacity 0.12).
      await click('the Box tool', `document.querySelector('[data-testid="scribble-tool-box"]')`);
      await click('the first palette swatch', `document.querySelector('[data-testid="scribble-swatch"]')`);
      await dragOnCanvas({ x: 0.25, y: 0.45 }, { x: 0.6, y: 0.8 });
      await waitInPage(
        'a box rect scoping a region',
        `[...document.querySelectorAll('[data-testid="scribble-canvas"] rect')].some((r) => r.getAttribute('fill-opacity') === '0.12')`,
      );

      // Text: pick the tool + swatch, then drop a note. The pointerdown that opens
      // the popover is delivered as a real PointerEvent dispatched on the canvas —
      // headless CDP's mouse→pointer translation does not reliably synthesize a
      // pointerdown for a stationary tap on the <svg> (only a long multi-move drag,
      // as pen/arrow use), so we invoke the SAME real onPointerDown handler with a
      // real event. This mirrors the mindmap step's real-engine-method pattern
      // (CDP coords unreliable on that transformed canvas). Everything after —
      // typing, Enter-commit, the rendered <text>, the seed — is the genuine path.
      await click('the Text tool', `document.querySelector('[data-testid="scribble-tool-text"]')`);
      await click('the first palette swatch', `document.querySelector('[data-testid="scribble-swatch"]')`);
      await evaluate(
        `(() => {
          const el = document.querySelector('[data-testid="scribble-canvas"]');
          const r = el.getBoundingClientRect();
          el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.x + r.width * 0.5, clientY: r.y + r.height * 0.35, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1 }));
        })()`,
      );
      await waitInPage('the note input opens', `!!document.querySelector('[data-testid="scribble-note-input"]')`);
      await typeInto('the note input', `document.querySelector('[data-testid="scribble-note-input"]')`, 'FOCUS HERE');
      await pressEnter();
      await waitInPage(
        'the note rendered as a styled overlay <text> on the photo',
        `[...document.querySelectorAll('[data-testid="scribble-canvas"] text')].some((t) => (t.textContent || '').includes('FOCUS HERE'))`,
      );

      // Arrow: pick the tool + swatch, then drag from tail to head — an arrowhead
      // polygon must appear.
      await click('the Arrow tool', `document.querySelector('[data-testid="scribble-tool-arrow"]')`);
      await click('the first palette swatch', `document.querySelector('[data-testid="scribble-swatch"]')`);
      await dragOnCanvas({ x: 0.3, y: 0.82 }, { x: 0.8, y: 0.4 });
      await waitInPage(
        'the arrow rendered with its arrowhead polygon',
        `!!document.querySelector('[data-testid="scribble-canvas"] polygon')`,
      );

      // Undo-last: a throwaway pen stroke (3rd polyline) then undo removes exactly it,
      // leaving the pen + highlighter keepers (2 polylines).
      await click('the Pen tool (throwaway)', `document.querySelector('[data-testid="scribble-tool-pen"]')`);
      await dragOnCanvas({ x: 0.4, y: 0.5 }, { x: 0.5, y: 0.55 });
      await waitInPage(
        'the throwaway stroke makes 3 polylines',
        `document.querySelectorAll('[data-testid="scribble-canvas"] polyline').length === 3`,
      );
      await click('the undo button', `document.querySelector('[data-testid="scribble-undo"]')`);
      await waitInPage(
        'undo removed exactly the throwaway (back to 2 polylines, keepers intact)',
        `document.querySelectorAll('[data-testid="scribble-canvas"] polyline').length === 2 &&
         [...document.querySelectorAll('[data-testid="scribble-canvas"] text')].some((t) => (t.textContent || '').includes('FOCUS HERE'))`,
      );

      // Maximize → fullscreen input view (no artifact-chat — a scribble is input).
      // Marks persist across the maximize/minimize round-trip (shared state).
      await click('the Maximize button', `document.querySelector('[data-testid="scribble-maximize"]')`);
      await waitInPage(
        'the fullscreen scribble view opens with the marks kept',
        `!!document.querySelector('[data-testid="scribble-fullscreen"]') &&
         !!document.querySelector('[data-testid="scribble-fullscreen"] [data-testid="scribble-canvas"]') &&
         [...document.querySelectorAll('[data-testid="scribble-fullscreen"] text')].some((t) => (t.textContent || '').includes('FOCUS HERE'))`,
      );
      // A scribble is input-only: the fullscreen view has NO artifact-chat composer.
      assert.ok(
        await evaluate(`!document.querySelector('[data-testid="scribble-fullscreen"] input[placeholder="Ask or ask for a change…"]')`),
        'the fullscreen scribble is input-only (no artifact-chat composer)',
      );
      await click('the Minimize button', `document.querySelector('[data-testid="scribble-maximize"]')`);
      await waitInPage(
        'minimize returns inline with marks intact',
        `!document.querySelector('[data-testid="scribble-fullscreen"]') &&
         [...document.querySelectorAll('[data-testid="scribble-canvas"] text')].some((t) => (t.textContent || '').includes('FOCUS HERE'))`,
      );
    });

    let threadDir;
    await step('human sends it — the BLOCKED open_studio tool resolves with the command', async () => {
      await click(
        'the landing Send & iterate button',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send & iterate')`,
      );
      // The real route: the submit resolves the blocked open_studio tool call —
      // the exact payload a real orchestrator receives at this moment.
      const submitted = await openStudioWait;
      assert.equal(submitted.status, 'submitted', 'open_studio resolved as submitted');
      assert.equal(submitted.command, 'new-brainstorm');
      assert.equal(submitted.prompt, `${brief} (a logo)`, 'prompt carries the brief and the chip');
      assert.ok(submitted.instruction.includes('run-brainstorm'), 'the instruction routes to run-brainstorm.md');
      threadDir = submitted.threadDir;
      assert.ok(threadDir && fs.existsSync(threadDir), 'the thread directory exists on disk');

      // The annotated scribble persisted as a TRAVERSABLE FOLDER the model can
      // fully read — proven off disk. The seedNote routes the orchestrator to
      // /read-scribble.
      assert.ok(submitted.seedNote && submitted.seedNote.includes('read-scribble.md'), 'the scribble routes the orchestrator to /read-scribble');
      const seedDir = path.join(scratch, '.seeds');
      const folder = fs.existsSync(seedDir)
        ? fs.readdirSync(seedDir).find((f) => /^seed-/.test(f) && fs.statSync(path.join(seedDir, f)).isDirectory())
        : undefined;
      assert.ok(folder, 'the annotated scribble persisted as a .seeds/seed-<stamp>/ folder');
      const fp = path.join(seedDir, folder);
      for (const f of ['composite.png', 'photo.png', 'scribble.svg', 'scribble.json', 'README.md']) {
        assert.ok(fs.existsSync(path.join(fp, f)), `the scribble folder has ${f}`);
      }
      // THE CRUX: composite.png is a REAL raster (PNG magic header) rendered by the
      // real browser — vision-readable, unlike the SVG-as-text the model got before.
      const composite = fs.readFileSync(path.join(fp, 'composite.png'));
      assert.ok(composite.length > 100, 'composite.png has real bytes');
      assert.ok(
        composite[0] === 0x89 && composite[1] === 0x50 && composite[2] === 0x4e && composite[3] === 0x47,
        'composite.png carries the PNG magic header (a real raster the model can SEE, not XML text)',
      );
      // scribble.json — the structured, traversable marks with palette color NAMES.
      const sj = JSON.parse(fs.readFileSync(path.join(fp, 'scribble.json'), 'utf8'));
      const types = sj.items.map((i) => i.type);
      for (const t of ['pen', 'highlighter', 'box', 'arrow', 'note']) {
        assert.ok(types.includes(t), `scribble.json carries the ${t} mark`);
      }
      const note = sj.items.find((i) => i.type === 'note');
      assert.equal(note.text, 'FOCUS HERE', 'scribble.json carries the note text verbatim (a literal instruction)');
      assert.equal(note.colorValue.toLowerCase(), '#7c3aed', 'the mark ink is the chosen Aurora color');
      assert.ok(note.colorName && note.colorName !== 'accent', `the ink resolved to its Aurora palette color NAME (got "${note.colorName}")`);
      assert.ok(fs.readFileSync(path.join(fp, 'README.md'), 'utf8').includes('read-scribble'), 'the folder README routes to /read-scribble');
      // Keep both: the raw photo ALSO persisted as a plain attachment.
      const attachDir = path.join(threadDir, 'attachments');
      const attachFiles = fs.existsSync(attachDir) ? fs.readdirSync(attachDir) : [];
      assert.ok(
        attachFiles.some((f) => /\.(png|jpe?g|gif|webp)$/i.test(f)),
        'the raw photo ALSO persisted as an attachment (Keep both, not consumed by the scribble)',
      );

      // Human side: the toast confirms the dispatch.
      await waitInPage(
        'the queued-command toast',
        `document.body.textContent.includes("new-brainstorm queued for Claude's next check-in")`,
      );
      // Intake lock #2: the human is NOT dropped back onto the New Discussion
      // panel — the "preparing your questions" veil holds the surface until the
      // concierge arrives (so the methodology never looks skipped).
      await waitInPage(
        'the intake-preparing veil (not the og New Discussion panel)',
        `!!document.querySelector('[data-testid="intake-preparing"]') &&
         !document.querySelector('textarea')`,
      );
    });

    // =========================================================================
    // The concierge → gallery → mindmap intake, on the REAL tool route: every
    // orchestrator-side move below is an actual MCP tools/call against the
    // spawned server, while raw CDP drives the studio surfaces those calls put
    // on the wire. The tool layer's own guardrails are live — proven first.
    // =========================================================================
    const divergeCanonical = loadCanonical('boards/diverge.json', BoardSchema);
    await step('the intake gate is LIVE: present_board is refused before a gallery pick', async () => {
      const refused = await mcp.call('present_board', {
        title: divergeCanonical.title,
        prompt: divergeCanonical.prompt,
        kind: divergeCanonical.kind,
        phase: divergeCanonical.phase,
        options: divergeCanonical.options,
        axes: divergeCanonical.survey.axes,
        timeoutSeconds: 10,
        openBrowser: false,
      });
      assert.equal(refused.status, 'error', 'the first board of a fresh thread is refused before intake');
      assert.ok(
        refused.error.includes('Intake incomplete'),
        `the refusal names the intake lock (got: ${refused.error})`,
      );
    });

    let cAnswer;
    await step('concierge appears + human answers ("who is this glyph for?")', async () => {
      const cWait = mcp.call('ask_concierge', {
        question: 'Who is this glyph for?',
        suggestions: ['my team', 'developers'],
        timeoutSeconds: 120,
      }, 150_000);
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
      assert.equal(cAnswer.status, 'answered', 'ask_concierge resolved with a posted answer, not a timeout');
      assert.ok(cAnswer.answer.includes('developers'), 'answer carries the tapped chip');
      assert.ok(cAnswer.answer.includes('shipping a CLI'), 'answer carries the typed free text');
      assert.deepEqual(cAnswer.picked, ['developers'], 'picked chips stay structured on the answer');
      assert.equal(cAnswer.typed, 'shipping a CLI', 'typed concierge text stays structured on the answer');
    });

    let picked;
    await step('gallery appears + human picks Mind map', async () => {
      // The REAL present_gallery tool call (canonical cards — the content is a
      // fixture, the pathway is the product's; only the model that would author
      // the minis is out of the loop). Its pick opens the intake gate for real.
      const gallery = loadCanonical('gallery/gallery.json', LivingGallerySchema);
      const gWait = mcp.call('present_gallery', {
        prompt: gallery.prompt,
        cards: gallery.cards,
        timeoutSeconds: 120,
      }, 150_000);
      await waitInPage(
        'the living gallery with its recommended ribbon (proves it renders live)',
        `!!document.querySelector('[data-testid="living-gallery"]') &&
         !!document.querySelector('[data-testid="recommended-ribbon"]')`,
      );
      // Visual honesty (rule 10): the testids exist — now PROVE the real method
      // cards + the recommended reason actually rendered (an empty/wrong gallery
      // "renders" its shell just the same — that's the false-green class of bug).
      const rec = gallery.cards.find((c) => c.recommended);
      await assertSurfaceShowsCanonical(evaluate, 'living gallery', [
        ...gallery.cards.map((c) => c.label),
        rec?.reason ?? '',
      ]);
      await click(
        'the Mind map method card',
        `document.querySelector('[data-testid="method-card-mindmap"]')`,
      );
      picked = await gWait;
      assert.equal(picked.status, 'picked', 'present_gallery resolved with a pick, not a timeout');
      assert.equal(picked.method, 'mindmap', 'present_gallery resolved with the picked method');
      assert.equal(picked.label, 'Mind map', 'present_gallery preserves the picked card label');
      assert.equal(picked.recommended, true, 'present_gallery preserves whether the pick was recommended');
      assert.ok(picked.cardsCachedAt, 'the premium minis were cached with the thread (token economy, rule 7)');
    });

    // The gallery routed to the mindmap methodology — present it through the
    // REAL present_board tool (kind="mindmap" + tree, no options/axes). The
    // server mints the round (round 1 of this thread) and its board id.
    const treeArgs = {
      title: 'Mind map — your glyph',
      prompt: 'Co-edit the tree.',
      kind: 'mindmap',
      phase: 'diverge',
      options: [],
      axes: [],
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
      timeoutSeconds: 600,
      openBrowser: false,
    };
    let treeWait;
    await step('mindmap board renders with the LIVE mind-elixir engine mounted', async () => {
      treeWait = mcp.call('present_board', treeArgs, 660_000);
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
      // Visual honesty (rule 10): the engine mounted — now PROVE the CANONICAL tree
      // topics actually rendered in the canvas (a mounted-but-empty engine is a
      // false-green; childElementCount>0 alone would pass on chrome-only DOM).
      await assertShowsCanonical(evaluate, 'mindmap canvas', [
        treeArgs.tree.nodeData.topic,
        ...treeArgs.tree.nodeData.children.map((c) => c.topic),
      ]);
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
    });

    // Matt's node-controls matrix — proven ENTIRELY through the REAL engine, no
    // fixture-orchestrator (mind.getData() / removeNodes / addChild are the genuine
    // mind-elixir v5 methods): +5 seeds five real nodes; EXPLODE visibly fans a node
    // into ≥5 real children whose labels are STEERED by the node's note (a different
    // note → a different set); DELETE really removes a node from the tree.
    await step('EXPLODE really fans a node into ≥5 note-steered children (live engine)', async () => {
      // Select "Mark" (c1) via the engine's REAL selectNode (mind-elixir renders on
      // a transformed canvas where CDP click coords are unreliable — driving the
      // genuine engine method is the harness's established pattern, not a fake: the
      // ACTIONS below are real button clicks and every assertion reads the real
      // engine). Gate on the SPECIFIC node in the bar (a prior step left another
      // node selected, so "bar enabled" alone would false-pass).
      await evaluate(
        `(() => { const m = document.querySelector('[data-testid="mindmap-engine"]').mind; m.selectNode(m.findEle('c1')); })()`,
      );
      await waitInPage(
        'the node action bar binds to "Mark"',
        `(document.querySelector('[data-testid="node-actions"]').textContent || '').includes('Mark') && !document.querySelector('[data-testid="node-explode"]').disabled`,
      );
      await click('the +5 ideas button', `document.querySelector('[data-testid="node-add"]')`);
      await waitInPage(
        'the +5 button created five REAL child nodes under "Mark"',
        `(() => {
          const mind = document.querySelector('[data-testid="mindmap-engine"]').mind;
          const c1 = mind && mind.getData().nodeData.children.find((n) => n.id === 'c1');
          return !!c1 && (c1.children ? c1.children.length : 0) === 5;
        })()`,
        15_000,
      );

      // Note "Motion" (c2) with steering text, then EXPLODE it — the engine must
      // gain FIVE new children whose topics carry the note (proves the note steers
      // the explosion, deterministically, without any model in the loop).
      await evaluate(
        `(() => { const m = document.querySelector('[data-testid="mindmap-engine"]').mind; m.selectNode(m.findEle('c2')); })()`,
      );
      await waitInPage(
        'the bar rebinds to "Motion"',
        `(document.querySelector('[data-testid="node-actions"]').textContent || '').includes('Motion') && !document.querySelector('[data-testid="node-explode"]').disabled`,
      );
      await click('the Note button', `document.querySelector('[data-testid="node-note"]')`);
      await waitInPage('the note editor opens', `!!document.querySelector('[data-testid="node-note-input"]')`);
      await typeInto('the node note', `document.querySelector('[data-testid="node-note-input"]')`, 'make it kinetic');
      await click('save the note', `document.querySelector('[data-testid="node-note-save"]')`);
      await click('the Explode button', `document.querySelector('[data-testid="node-explode"]')`);
      await waitInPage(
        'EXPLODE fanned "Motion" into ≥5 children, each label steered by the note',
        `(() => {
          const mind = document.querySelector('[data-testid="mindmap-engine"]').mind;
          const c2 = mind.getData().nodeData.children.find((n) => n.id === 'c2');
          const kids = c2 && c2.children ? c2.children : [];
          return kids.length >= 5 && kids.filter((k) => (k.topic || '').includes('kinetic')).length >= 5;
        })()`,
        15_000,
      );

      // DELETE really removes: grab a +5 child's id, click it, Delete it, and prove
      // the engine tree lost exactly that node (Mark drops from 5 children to 4).
      const doomed = await evaluate(
        `(() => {
          const mind = document.querySelector('[data-testid="mindmap-engine"]').mind;
          const c1 = mind.getData().nodeData.children.find((n) => n.id === 'c1');
          return { id: c1.children[0].id, topic: c1.children[0].topic };
        })()`,
      );
      const doomedId = doomed.id;
      await evaluate(
        `(() => { const m = document.querySelector('[data-testid="mindmap-engine"]').mind; m.selectNode(m.findEle(${JSON.stringify(doomedId)})); })()`,
      );
      await waitInPage(
        'the bar rebinds to the doomed child',
        `(document.querySelector('[data-testid="node-actions"]').textContent || '').includes(${JSON.stringify(doomed.topic)}) && !document.querySelector('[data-testid="node-delete"]').disabled`,
      );
      await click('the Delete button', `document.querySelector('[data-testid="node-delete"]')`);
      await waitInPage(
        'DELETE really removed the node from the live tree ("Mark" 5 → 4 children)',
        `(() => {
          const mind = document.querySelector('[data-testid="mindmap-engine"]').mind;
          const c1 = mind.getData().nodeData.children.find((n) => n.id === 'c1');
          const kids = c1 && c1.children ? c1.children : [];
          return kids.length === 4 && !kids.some((k) => k.id === ${JSON.stringify(doomedId)});
        })()`,
        15_000,
      );

      // Send: the whole real edit rides back — editedTree shape + treeOps intents.
      await click(
        'the mindmap composer Send & iterate button',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send & iterate')`,
      );
      const treeResult = await treeWait;
      assert.equal(treeResult.status, 'responded', 'present_board resolved with a response for the mindmap board, not a timeout');
      // The REAL tool result: the feedback digest a live orchestrator acts on —
      // finally under test (the faked-orchestrator route never built it).
      assert.ok(Array.isArray(treeResult.feedbackDigest) && treeResult.feedbackDigest.length > 0, 'the tool built a feedback digest');
      assert.ok(
        treeResult.feedbackDigest.some((line) => line.includes('Model routing')),
        'the digest carries the explicit Model-routing line (token-economy doctrine)',
      );
      const treeResp = treeResult.response;
      assert.ok(treeResp.editedTree, 'response carries editedTree');
      const c1r = treeResp.editedTree.nodeData.children.find((n) => n.id === 'c1');
      assert.ok(c1r && c1r.children && c1r.children.length === 4, 'editedTree shows Mark at 4 children (5 added, 1 deleted)');
      const c2r = treeResp.editedTree.nodeData.children.find((n) => n.id === 'c2');
      assert.ok(c2r && c2r.children && c2r.children.length >= 5, 'editedTree shows Motion exploded into ≥5 children');
      assert.ok(
        c2r.children.filter((k) => (k.topic || '').includes('kinetic')).length >= 5,
        'the exploded child labels carry the steering note (note-steered expansion)',
      );
      assert.ok(c2r.note && c2r.note.includes('kinetic'), 'the node note folded into editedTree');

      const explodeOp = treeResp.treeOps.find((o) => o.op === 'explode' && o.nodeId === 'c2');
      assert.ok(explodeOp && explodeOp.note.includes('kinetic'), 'an explode op for Motion rode back with its steering note');
      assert.ok(treeResp.treeOps.some((o) => o.op === 'add' && o.count === 5), 'the +5 add op rode back');
      assert.ok(treeResp.treeOps.some((o) => o.op === 'delete'), 'the delete op rode back');

      // The decisions persisted as structured jsonl (rule: jsonl for decisions).
      // The mindmap is this thread's FIRST server-minted round → round-01.
      const roundDir = path.join(threadDir, 'round-01');
      const opsLines = fs.readFileSync(path.join(roundDir, 'tree-ops.jsonl'), 'utf8').trim().split('\n');
      assert.ok(opsLines.length >= 3, 'tree-ops.jsonl recorded add + explode + delete');

      const introMd = fs.readFileSync(path.join(threadDir, 'brainstorm.md'), 'utf8');
      assert.ok(introMd.includes('Concierge Q: Who is this glyph for?'), 'brainstorm.md records the concierge question');
      assert.ok(introMd.includes(`Concierge A: ${cAnswer.answer}`), 'brainstorm.md records the concierge answer');
      assert.ok(introMd.includes('Mind-map tree presented'), 'brainstorm.md records the mindmap presentation (recordBoard)');
      assert.ok(introMd.includes('EXPLODE'), 'the digest surfaces the EXPLODE decision for synthesis');
      assert.ok(introMd.includes('DELETE'), 'the digest surfaces the DELETE decision for synthesis');
    });

    // The decision tree is reachable from the wayfinder and renders the round record.
    await step('the decision-tree overlay opens and shows the mind-map round', async () => {
      await click('the decision-tree toggle', `document.querySelector('[data-testid="decision-tree-toggle"]')`);
      // Visual honesty (journeys.md #6): a bare `querySelector('svg')` FALSE-PASSES —
      // on a fetch failure App.tsx renders a fallback "decision tree unavailable"
      // <svg>, which satisfies "an svg exists" just the same. Wait for the REAL
      // round SVG by its CANONICAL content: the mind-map round's edited topic must
      // be a rendered <text> label (the builder emits "edited: <root topic>").
      await waitInPage(
        'the decision-tree overlay renders the REAL round SVG (canonical content, not the error fallback)',
        `(() => {
          const svg = document.querySelector('[data-testid="decision-tree-view"] svg');
          return !!svg && (svg.textContent || '').includes('Neon glyph');
        })()`,
        // 30s: the /api/decision-tree fetch reloads the thread from disk and can be
        // CPU-starved on a machine running concurrent sessions; a tight 15s made
        // this flake. The assertion still refuses the loading/error states — a real
        // hang (endpoint never responds) still fails, just with more slack.
        30_000,
      );
      // Close it so the timeline is clean for the following steps.
      await click('close the decision tree', `[...document.querySelectorAll('[data-testid="decision-tree-view"] button')].find((b) => b.textContent.trim() === 'Close')`);
    });

    // The canonical diverge board through the REAL present_board tool — its
    // option/axes validation runs live (an option board with fewer than 5 axes
    // is refused; the canonical fixture must satisfy the product's contract).
    // The server mints the round + board id; the sim reads the live id from
    // /api/state exactly as any observer of the real state would.
    const board = divergeCanonical;
    let waitForResponse = null;
    let liveBoardId;
    await step('a canonical board is presented and renders as the survey', async () => {
      waitForResponse = mcp.call('present_board', {
        title: board.title,
        prompt: board.prompt,
        kind: board.kind,
        phase: board.phase,
        options: board.options,
        axes: board.survey.axes,
        timeoutSeconds: 600,
        openBrowser: false,
      }, 660_000);
      await waitInPage(
        'the board survey (3 selectable options, "your turn")',
        `document.querySelectorAll('button[title="Select"], button[title="Deselect"]').length === 3 &&
         document.body.textContent.includes('your turn') &&
         document.body.textContent.includes(${JSON.stringify(board.title)})`,
      );
      const st = await (await fetch(`${base}/api/state`)).json();
      liveBoardId = st.activeBoard?.id;
      assert.ok(liveBoardId, 'the live board id is readable from /api/state');
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
      const result = await waitForResponse;
      assert.equal(result.status, 'responded', 'present_board resolved with a response, not a timeout');
      const response = result.response;
      assert.deepEqual(response.selectedOptionIds, ['b'], 'the clicked option rode the response');
      assert.equal(response.elaboration, elaboration, 'the typed elaboration rode the response');
      assert.equal(response.action, 'iterate');
      assert.ok(
        result.feedbackDigest.some((line) => line.includes('Beta')),
        'the feedback digest resolves the selection to its option label',
      );
      // The UI settles into history: the reply bubble shows the verdict.
      await waitInPage(
        'the round-history reply bubble',
        `document.body.textContent.includes('picked 1') &&
         ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Send & iterate')`,
      );
    });

    let artifact;
    await step('a captured artifact appears in the wayfinder keeps', async () => {
      // The REAL capture_artifact tool — provenance + persistence + announce in
      // one product call (rule 7), never a hand-rolled store write.
      const captured = await mcp.call('capture_artifact', {
        name: 'Beta keeper',
        svg: board.options[1].svg,
        notes: 'kept by the human sim',
        boardId: liveBoardId,
        optionIds: ['b'],
      });
      assert.equal(captured.status, 'captured');
      artifact = captured.artifact;
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

    // The operator's report (2026-07-09): "I submit a message but do not see my
    // chat message bubble." Prove the LIVE-thread send→echo→persist on the real
    // path — the user's OWN message must render in the dialog and hit chat.jsonl.
    const liveChatQ = 'Does this read at 16px on a dark bar?';
    await step('type a chat message on the LIVE artifact — the user bubble appears + persists', async () => {
      await typeInto(
        'the live chat composer',
        `document.querySelector('input[placeholder="Ask or ask for a change…"]')`,
        liveChatQ,
      );
      await click(
        'the chat Send button',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send')`,
      );
      await waitInPage(
        'the user message bubble appears in the artifact dialog',
        `document.body.textContent.includes(${JSON.stringify(liveChatQ)})`,
        8_000,
      );
      const chatState = await (await fetch(`${base}/api/state`)).json();
      assert.ok(
        (chatState.artifactChat ?? []).some((m) => m.role === 'user' && m.text === liveChatQ),
        'the live thread chat.jsonl carries the user message (persisted, rule 7)',
      );
    });

    // With no board waiting, the chat QUEUES for the orchestrator's next
    // check-in — session_status surfaces it, reply_artifact_chat answers it.
    // The full real dance, including Claude's bubble rendering back in frame.
    const liveChatA = 'At 16px the counters hold — the stroke is 2.4px at that scale.';
    await step('the queued chat reaches session_status; reply_artifact_chat renders the answer', async () => {
      let pending = [];
      const deadline = Date.now() + 10_000;
      for (;;) {
        const status = await mcp.call('session_status', {});
        pending = status.pendingUiCommands ?? [];
        if (pending.some((c) => c.command === 'artifact-chat')) break;
        if (Date.now() > deadline) throw new Error('the artifact-chat command never reached session_status');
        await sleep(200);
      }
      const chatCmd = pending.find((c) => c.command === 'artifact-chat');
      assert.equal(chatCmd.prompt, liveChatQ, 'the queued command carries the user question verbatim');
      const replied = await mcp.call('reply_artifact_chat', { artifactSlug: artifact.slug, text: liveChatA });
      assert.equal(replied.status, 'replied');
      await waitInPage(
        "Claude's reply bubble appears in the artifact dialog",
        `document.body.textContent.includes(${JSON.stringify(liveChatA)})`,
        8_000,
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

    return (
      `${stepCount()} steps: real ${browserName} over raw CDP drove the built studio ` +
      'against the REAL stdio MCP tool route (open_studio blocked → brief + annotated photo seed ' +
      '[pen + highlighter + box + note + arrow in a palette color, undo, fullscreen] → a traversable ' +
      '.seeds/ folder with a real composite PNG + scribble.json → present_board REFUSED by the live intake ' +
      'gate → ask_concierge → present_gallery pick → mindmap round via present_board (editedTree + digest) → ' +
      'canonical board round → capture_artifact → queued chat answered via reply_artifact_chat → pinned to ' +
      'the filmstrip), zero exceptions, zero STUDIO CLIENT ERROR lines, root mounted throughout'
    );
  },
});
