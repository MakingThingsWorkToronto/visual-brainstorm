/**
 * Human-simulation harness — the MIND-MAP maximize→chat journey (rule 10). Sibling to the
 * other human-sim harnesses (shared scaffold: scripts/lib/sim-runner.mjs — browser
 * discovery/SKIP, real MCP server spawn, raw CDP, checkpoints, teardown).
 *
 * REAL ROUTE: the mindmap board is presented through the real `present_board` MCP tool
 * (kind="mindmap" + tree, blocked exactly like a live session). Proves the operator's
 * mind-map asks end to end: the live mind map renders with a MAXIMIZE control; clicking it
 * opens the SAME fullscreen viewer as any artifact (SVG left, chat right); a question typed
 * there PARKS the blocked tool call (the documented non-destructive detour), the
 * sim-as-orchestrator answers via the real `reply_artifact_chat` under the mindmap's
 * snapshot artifact (Claude's bubble renders in frame) while the board stays live; and the
 * tree is persisted MODEL-LEGIBLY to round-NN/tree.md (the traversable outline
 * read-mindmap reads). Canonical tree content only — the pathway is the product's.
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
    const board = loadCanonical('boards/mindmap-tree.json', BoardSchema);
    const rootTopic = board.tree.nodeData.topic;
    // The server mints this thread's FIRST round → round-01.
    const roundDir = path.join(store.info.dir, 'round-01');
    return { store, board, rootTopic, roundDir };
  },
  run: async ({ mcp, awaitBase, store, board, rootTopic, roundDir, cdp, evaluate, waitInPage, click, typeInto, step, stepCount, browserName }) => {
    const parkWait = mcp.call('present_board', {
      discussionId: store.info.id, // the documented resume path binds the seeded thread
      title: board.title,
      prompt: board.prompt,
      kind: 'mindmap',
      tree: board.tree,
      options: [],
      axes: [],
      timeoutSeconds: 600,
      openBrowser: false,
    }, 660_000);
    const base = await awaitBase();
    console.log(`human-sim-mindchat: mindmap board presented via the real tool (root "${rootTopic}")`);

    // =========================================================================
    let liveBoardId;
    await step('studio loads the live mind map with a maximize control', async () => {
      await cdp.send('Page.navigate', { url: `${base}/` });
      await waitInPage(
        'the mind-map canvas + the maximize button',
        `!!document.querySelector('[data-testid="mindmap-canvas"]') &&
         !!document.querySelector('[data-testid="mindmap-maximize"]')`,
        30_000,
      );
      const st = await (await fetch(`${base}/api/state`)).json();
      liveBoardId = st.activeBoard?.id;
      assert.ok(liveBoardId, 'the live board id is readable from /api/state');
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
    const mindA = 'Leaning Motion kinetic: streak, orbit, and afterimage children would push it.';
    await step('ask about the mind map — the tool PARKS; the real reply renders under the snapshot artifact', async () => {
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
      // THE DETOUR CONTRACT, live: the blocked present_board resolves with the
      // synthetic park response carrying the question.
      const parked = await parkWait;
      assert.equal(parked.status, 'responded', 'the blocked present_board resolved on the chat');
      assert.equal(parked.response.action, 'park', 'the detour rides a synthetic park response');
      assert.deepEqual(parked.response.commands, ['artifact-chat'], 'the park carries the artifact-chat command');
      assert.ok(parked.response.elaboration.includes(mindQ), 'the park carries the user question verbatim');
      // Persisted under the mindmap SNAPSHOT artifact (boardId provenance, no optionIds).
      const st = await (await fetch(`${base}/api/state`)).json();
      const mindmapArtifact = st.artifacts.find(
        (a) => a.provenance.boardId === liveBoardId && a.provenance.optionIds.length === 0,
      );
      assert.ok(mindmapArtifact, 'the mind-map snapshot artifact exists');
      assert.ok(
        (st.artifactChat ?? []).some((m) => m.role === 'user' && m.text === mindQ && m.artifactSlug === mindmapArtifact.slug),
        'the mind-map chat persisted under the snapshot artifact slug',
      );
      // Sim-as-orchestrator answers through the REAL tool; Claude's bubble must
      // render back in the open dialog.
      const replied = await mcp.call('reply_artifact_chat', { artifactSlug: mindmapArtifact.slug, text: mindA });
      assert.equal(replied.status, 'replied');
      await waitInPage(
        "Claude's reply bubble appears in the mind-map dialog",
        `document.body.textContent.includes(${JSON.stringify(mindA)})`,
        8_000,
      );
      // The board stayed live through the chat (non-destructive detour).
      const health = await (await fetch(`${base}/api/health`)).json();
      assert.equal(health.activeBoard?.id, liveBoardId, 'the mind-map board stayed live through the chat');
    });

    return (
      `${stepCount()} steps: real ${browserName} over raw CDP rendered a mind map presented by the REAL ` +
      'present_board tool, confirmed round-NN/tree.md (model-legible outline), made a REAL engine edit, maximized ' +
      'into the unified fullscreen viewer (mindmap-aware hint) and confirmed the flush persisted the LIVE tree ' +
      '(draft.json + tree.md Live heading with the edit — what read-mindmap reads), then asked a question that ' +
      "PARKED the blocked tool call and was answered via the real reply_artifact_chat (Claude's bubble rendered, " +
      'chat persisted under the snapshot artifact) while the board stayed live; zero exceptions, zero STUDIO ' +
      'CLIENT ERROR lines'
    );
  },
});
