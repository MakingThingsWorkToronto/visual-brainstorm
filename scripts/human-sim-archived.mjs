/**
 * Human-simulation harness — the ARCHIVED-thread journey (comprehensive-human-testing
 * mandate, CLAUDE.md rule 10). Sibling to scripts/human-sim.mjs (shared scaffold:
 * scripts/lib/sim-runner.mjs) proving the bug this wave fixed:
 * App.tsx wired chatMessages/chatArtifact/WayfinderStrip to the LIVE state only, so
 * a completed (_completed/) thread's captured-artifact chat never rendered. A
 * component-only test cannot catch this — the bug lived in App-level wiring — so
 * this drives the REAL built studio against the REAL stdio MCP route end to end:
 *
 *   open_studio blocks on the landing panel → left-nav Completed section → open a
 *   seeded archived thread → "Completed thread" banner + WayfinderStrip renders its
 *   keep → click the keep → the unified ArtifactFullscreen viewer opens showing the
 *   PERSISTED chat (user + claude) WITH a live composer → a NEW question typed there
 *   records into the archived thread, echoes back in place, AND resolves the blocked
 *   open_studio with the artifact-chat command (discussionId in the seedNote) → the
 *   REAL reply_artifact_chat (with that discussionId) renders Claude's answer into
 *   the archived dialog — never the live thread.
 *
 * The archived thread is seeded PHYSICALLY on disk under discussionRoot/_completed/
 * using the real SessionStore write helpers against canonical fixtures (rule 11) —
 * mirroring tests/canonical/threads/session.json's glow-mark narrative. Nothing is
 * faked: the bridge reloads this thread from disk through the SAME GET
 * /api/discussions/:id → SessionStore.open() path a real plan-closeout leaves behind,
 * and the orchestrator side is real tools/call requests.
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { SessionStore } from '../apps/mcp/dist/session-store.js';
import { loadCanonical } from '../tests/canonical/load.mjs';
import { ArtifactChatMessageSchema, BoardResponseSchema, BoardSchema } from '../packages/protocol/dist/index.js';
import { sleep } from './lib/cdp.mjs';
import { runHumanSim } from './lib/sim-runner.mjs';

/**
 * The bridge runs in its OWN process on the real route, so a disk write can
 * land a beat after its WS echo renders — poll briefly instead of reading once.
 */
async function waitForDisk(what, predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (predicate()) return;
    if (Date.now() > deadline) throw new Error(`never persisted to disk: ${what}`);
    await sleep(150);
  }
}

await runHumanSim('ARCHIVED', {
  prepare: ({ scratch }) => {
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
    return { archivedStore, artifact, userText, claudeText };
  },
  run: async ({ mcp, awaitBase, archivedStore, artifact, userText, claudeText, cdp, evaluate, waitInPage, click, typeInto, step, stepCount, browserName }) => {
    console.log(`human-sim-archived: archived thread ${archivedStore.info.id} seeded under _completed/`);
    // The REAL landing flow: open_studio blocks for a command — an archived
    // artifact-chat question resolves it exactly as a brief submit would.
    const openStudioWait = mcp.call('open_studio', { timeoutSeconds: 600, openBrowser: false }, 660_000);
    const base = await awaitBase();

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

    await step('click the keep — the unified ArtifactFullscreen opens with the PERSISTED chat + a live composer', async () => {
      await click(
        `the "${artifact.slug}" keep`,
        `[...document.querySelectorAll('a')].find((a) => (a.getAttribute('href') || '').includes('/api/artifact-svg/${encodeURIComponent(artifact.slug)}.svg'))`,
      );
      // Signature markers of the unified viewer (item 5: ArtifactFullscreen replaces
      // the old split viewer) — zoom % control + Notes dock.
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
      // Archived threads are now INTERACTIVE for questions: the chat composer is
      // present so the user can ask about the artifact whenever they want
      // (answered in place — 2026-07-09). Notes/pin stay live-thread-only.
      assert.equal(
        await evaluate(`!!document.querySelector('input[placeholder="Ask or ask for a change…"]')`),
        true,
        'chat composer input present on an archived thread (ask questions anytime)',
      );
      assert.equal(
        await evaluate(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Save notes')`),
        false,
        'no Save notes button on an archived thread (notes stay live-thread only)',
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

    // A REAL question typed on the ARCHIVED thread must round-trip: recorded into
    // that thread, echoed back into its dialog over WS (routed by discussionId),
    // DELIVERED to the blocked open_studio as the artifact-chat command, and
    // answered in place via the real reply_artifact_chat.
    const followUp = 'On this archived one — could the filament read cooler-toned?';
    const answer = 'Cooler works: swap the amber filament for #60a5fa and the warmth reads as focus.';
    await step('ask a NEW question on the archived thread — it records, echoes, and reaches the orchestrator', async () => {
      await typeInto(
        'the archived chat composer',
        `document.querySelector('input[placeholder="Ask or ask for a change…"]')`,
        followUp,
      );
      await click(
        'the chat Send button',
        `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send')`,
      );
      // The message returns over WS and lands in THIS archived thread's dialog
      // (never the live thread) — proves thread-addressed chat + archived routing.
      await waitInPage(
        'the freshly-asked question appears in the archived dialog',
        `document.body.textContent.includes(${JSON.stringify(followUp)})`,
        8_000,
      );
      // It also persisted to the archived thread's own chat.jsonl on disk.
      await waitForDisk('the new question in the archived thread chat.jsonl (answer-in-place)', () =>
        SessionStore.open(archivedStore.info.dir).artifactChat.some((m) => m.role === 'user' && m.text === followUp),
      );
      // THE REAL COMMAND CHANNEL: the question resolves the blocked open_studio —
      // exactly how a live session learns about an archived-thread chat.
      const submitted = await openStudioWait;
      assert.equal(submitted.status, 'submitted', 'open_studio resolved with the queued command');
      assert.equal(submitted.command, 'artifact-chat', 'the command is an artifact-chat');
      assert.equal(submitted.prompt, followUp, 'the command carries the question verbatim');
      assert.ok(
        submitted.seedNote && submitted.seedNote.includes(archivedStore.info.id),
        'the seedNote routes the reply to the ARCHIVED thread (discussionId)',
      );
    });

    await step("reply via the REAL reply_artifact_chat — Claude's answer renders in the archived dialog", async () => {
      const replied = await mcp.call('reply_artifact_chat', {
        artifactSlug: artifact.slug,
        text: answer,
        discussionId: archivedStore.info.id,
      });
      assert.equal(replied.status, 'replied');
      assert.equal(replied.discussionId, archivedStore.info.id, 'the reply recorded into the archived thread');
      await waitInPage(
        "Claude's reply bubble appears in the archived dialog",
        `document.body.textContent.includes(${JSON.stringify(answer)})`,
        8_000,
      );
      await waitForDisk("Claude's reply in the archived thread chat.jsonl", () =>
        SessionStore.open(archivedStore.info.dir).artifactChat.some((m) => m.role === 'claude' && m.text === answer),
      );
      // The LIVE (placeholder) thread received nothing — the dialog is addressed
      // to the archived thread only.
      const liveState = await (await fetch(`${base}/api/state`)).json();
      assert.equal(
        (liveState.artifactChat ?? []).length,
        0,
        'the live thread received nothing — the dialog is addressed to the archived thread only',
      );
    });

    return (
      `${stepCount()} steps: real ${browserName} over raw CDP opened a seeded ` +
      '_completed/ thread from the left nav (Completed thread banner, WayfinderStrip keep, reopen controls ' +
      'present), clicked the keep into the unified ArtifactFullscreen viewer, confirmed the PERSISTED ' +
      'artifact chat (user + claude) replays with a LIVE composer (no Save notes, no pin toggle), then ' +
      'asked a NEW question that recorded + echoed in place, resolved the blocked open_studio as the ' +
      "artifact-chat command (discussionId in the seedNote), and rendered Claude's real reply_artifact_chat " +
      'answer into the archived dialog (never the live thread); zero exceptions, zero STUDIO CLIENT ERROR ' +
      'lines, root mounted throughout'
    );
  },
});
