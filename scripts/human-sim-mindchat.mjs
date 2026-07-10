/**
 * Human-simulation harness — the MIND-MAP maximize→chat journey (rule 10). Sibling to the
 * other human-sim harnesses (shared scaffold: scripts/lib/sim-runner.mjs — browser
 * discovery/SKIP, bridge boot, raw CDP, checkpoints, teardown).
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
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { BoardSchema } from '../packages/protocol/dist/index.js';
import { loadCanonical } from '../tests/canonical/load.mjs';
import { runHumanSim } from './lib/sim-runner.mjs';

await runHumanSim('MINDCHAT', {
  prepare: ({ scratch }) => {
    const store = new SessionStore('Glow mark — a live mind map', scratch);
    const board = { ...loadCanonical('boards/mindmap-tree.json', BoardSchema), sessionId: store.info.id };
    const rootTopic = board.tree.nodeData.topic;
    const roundDir = path.join(store.info.dir, `round-${String(board.round).padStart(2, '0')}`);
    return { store, board, rootTopic, roundDir };
  },
  run: async ({ bridge, base, board, rootTopic, roundDir, cdp, evaluate, waitInPage, click, typeInto, step, stepCount, browserName }) => {
    bridge.presentAndWait(board, 120_000, /* openBrowser */ false).catch(() => {});
    console.log(`human-sim-mindchat: mindmap board ${board.id} live (root "${rootTopic}")`);

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

    const simTopic = 'Kinetic afterglow (sim edit)';
    await step('a REAL engine edit lands on the canvas (mind-elixir addChild, no fabrication)', async () => {
      // The canvas exposes its live instance on the engine container (interop
      // convention) — drive the GENUINE engine→onEdit path, never a fake response.
      // MindElixir is a lazy chunk: the container (and maximize button) render
      // before the instance lands, so wait for .mind rather than sampling once.
      await waitInPage(
        'the live engine instance on the container',
        `!!document.querySelector('[data-testid="mindmap-engine"]')?.mind`,
        15_000,
      );
      const added = await evaluate(
        `(async () => {
          const mind = document.querySelector('[data-testid="mindmap-engine"]')?.mind;
          if (!mind) return 'no engine instance on the container';
          const el = mind.findEle(mind.nodeData.id);
          if (!el) return 'root element not found';
          const node = mind.generateNewObj();
          node.topic = ${JSON.stringify(simTopic)};
          await mind.addChild(el, node);
          return 'ok';
        })()`,
        { awaitPromise: true },
      );
      assert.equal(added, 'ok', `the engine accepted a real addChild edit (${added})`);
      await waitInPage(
        'the new node renders on the canvas',
        `document.body.textContent.includes(${JSON.stringify(simTopic)})`,
        8_000,
      );
    });

    await step('maximize → the SAME fullscreen viewer; the flush persists the LIVE tree (draft.json + tree.md)', async () => {
      await click('the mind-map maximize button', `document.querySelector('[data-testid="mindmap-maximize"]')`);
      await waitInPage(
        'the unified fullscreen viewer with a chat composer + the mindmap-aware hint',
        `!!document.querySelector('.tabular-nums') &&
         document.body.textContent.includes('Notes') &&
         !!document.querySelector('input[placeholder="Ask or ask for a change…"]') &&
         document.body.textContent.includes('Claude reads your CURRENT tree')`,
      );
      // Maximize flushes the live draft (fire-and-forget POST + a 500ms debounce
      // backstop) — poll the store's files: this is EXACTLY what /read-mindmap and
      // an artifact-chat answer read mid-edit.
      const draftFile = path.join(roundDir, 'draft.json');
      const deadline = Date.now() + 8_000;
      let flushed = false;
      while (Date.now() < deadline) {
        if (fs.existsSync(draftFile)) {
          const draft = JSON.parse(fs.readFileSync(draftFile, 'utf8'));
          if (JSON.stringify(draft.editedTree ?? {}).includes(simTopic)) {
            flushed = true;
            break;
          }
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      assert.ok(flushed, 'draft.json carries the live editedTree with the sim edit (flushed on maximize)');
      const treeMd = fs.readFileSync(path.join(roundDir, 'tree.md'), 'utf8');
      assert.ok(treeMd.includes('### Live tree'), 'tree.md refreshed to the LIVE heading (mid-edit legibility)');
      assert.ok(treeMd.includes(simTopic), 'tree.md contains the edited node (what read-mindmap reads)');
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

    return (
      `${stepCount()} steps: real ${browserName} over raw CDP rendered a live mind map, ` +
      'confirmed round-NN/tree.md (model-legible outline), made a REAL engine edit, maximized into the unified ' +
      'fullscreen viewer (mindmap-aware hint) and confirmed the flush persisted the LIVE tree (draft.json + tree.md ' +
      'Live heading with the edit — what read-mindmap reads), then asked a question that persisted under the mindmap ' +
      'snapshot artifact while the board stayed live; zero exceptions, zero STUDIO CLIENT ERROR lines'
    );
  },
});
