# Plan — Always-available, thread-addressed artifact chat

**Slug:** artifact-chat-everywhere-2026-07-09
**Owner:** brainstorm-orchestrator domain (artifact chat), implemented via the studio + bridge + protocol layers.
**Status:** closed 2026-07-09

## Problem (operator, across multiple sessions)

> "Have a chat dialog for every artifact … all messages generate responses specific to that
> artifact so users can dial it in. This should always be visible in full-screen artifact view,
> for archived conversations and for previous messages etc. Users should be able to ask
> questions about the artifact whenever they want."

## What already exists (verified 2026-07-09)

- `ChatSection` in `apps/studio/src/components/ArtifactFullscreen.tsx` — the artifact-specific
  chat surface (the `div.flex-1.space-y-2.overflow-y-auto.p-3` the operator named).
- Full live round-trip, unit + smoke tested: UI → `POST /api/artifact-chat` → record to the
  thread's `artifacts/chat.jsonl` + WS broadcast + `dispatchCommand('artifact-chat', seedNote)`
  → orchestrator runs `.claude/commands/artifact-chat.md` → `reply_artifact_chat` → WS → UI.
- Works for captured artifacts AND previous-round board options **on the live thread**.

## The gaps

1. **Composer gated to the live thread.** `onSend: viewingLive ? sendFsChat : undefined`
   (App.tsx). Archived (`_completed`) threads get a read-only replay — you cannot ask a
   question. THIS is the operator's main complaint.
2. **Chat is single-thread.** `/api/artifact-chat` + `reply_artifact_chat` only touch the one
   live `store`. Archived threads are read-only snapshots (`GET /api/discussions/:id`). To make
   archived chat interactive the chat must be **thread-addressed** (carry `discussionId`) end to
   end, and the reply must route back to the archived view.

## Decisions (operator, 2026-07-09)

- **Answerer runtime:** answers are produced by the live brainstorm orchestrator (no new
  standalone loop). A chat on any thread dispatches an `artifact-chat` command carrying the
  target `discussionId`; the running orchestrator `load_discussion`s that thread, reads the SVG,
  and replies in place. If no brainstorm session is running, chats queue (honest pending) — the
  operator accepted this.
- **Archived behaviour:** **answer in place** — record the Q&A into the archived thread's own
  `chat.jsonl`; do NOT reopen. Revisions (capturing a NEW artifact) require a live store, so on
  an archived thread a change request is answered honestly: "reopen the thread to revise" (rule
  6/7). Questions are fully supported everywhere — the operator's emphasis.

## Changes

1. **protocol (rule 5):** add optional `discussionId` to the `artifact-chat` WS envelope
   (`ServerToStudio`). `ArtifactChatMessage` (persisted) is unchanged — the owning thread is its
   folder.
2. **bridge-server:**
   - `resolveStore(discussionId?)` → live `store` when absent/matching, else `SessionStore.open`.
   - `announceArtifactChat(message, discussionId?)` → record to the resolved store + broadcast
     `{ type:'artifact-chat', message, discussionId: target.info.id }`.
   - `/api/artifact-chat` accepts optional `discussionId`; resolves the target thread (404 if the
     thread or the artifact/option is missing there), records the user message in place, and
     dispatches with a seedNote that names the `discussionId` (+ `load_discussion` + reply-with-
     discussionId instructions, and the honest "revisions need reopen" note for non-live threads).
3. **index.ts:** `reply_artifact_chat` accepts optional `discussionId`; validates the artifact/
   option in the target thread and records/broadcasts in place via the bridge.
4. **studio:**
   - Composer always interactive in fullscreen (drop the `viewingLive` gate); `sendFsChat` passes
     the current view's `discussionId` (archived → `archived.session.id`, live → undefined).
   - `useBridge`: live-state append guarded by `discussionId === state.session.id`; expose
     `subscribeChat` so App appends replies to the matching `archived` view.
   - Empty-hint invites asking on archived threads too.
5. **.claude/commands/artifact-chat.md:** archived-thread handling (load_discussion by
   discussionId, reply with discussionId, revisions on archived → reopen honestly).
6. **Tests (rule 10):** api-status-matrix — POST with a second thread's `discussionId` records in
   THAT thread + queues a command naming it; 404 for a missing thread; `reply_artifact_chat` with
   discussionId writes to that thread. smoke — cross-thread chat round-trip.
7. **Docs (rules 2, 12):** wiki interaction-protocol / interface-coverage, user-guide, learnings,
   log.md.

## Verification

- `npm run build` + `npm test` (unit + smoke) green.
- Manual/human-sim: open an archived thread, open an artifact fullscreen → composer present; a
  question records into that thread's `chat.jsonl` and (with an orchestrator running) is answered
  in place; the reply appears in the archived view.

## Progress log
- 2026-07-09 — plan written; gaps + decisions captured.
- 2026-07-09 — IMPLEMENTED + VERIFIED (runnable layers):
  - protocol: `artifact-chat` envelope gained optional `discussionId`.
  - bridge: `resolveChatStore(discussionId?)`, `announceArtifactChat(msg, discussionId?)`,
    thread-addressed `/api/artifact-chat` (404 on bad thread/artifact, seedNote names archived
    id + load_discussion + honest revise-needs-reopen).
  - index: `reply_artifact_chat` gained `discussionId` (records + routes to the owning thread).
  - studio: composer always interactive in fullscreen; `postChat`/`sendFsChat` carry the
    archived `discussionId`; `useBridge` guards live append by id + `subscribeChat`; App routes
    replies into the `archived` snapshot.
  - command: `.claude/commands/artifact-chat.md` archived-thread handling + changelog.
  - tests: api-status-matrix — archived-thread record/route/404 (real bridge + WS); canonical
    404 relaxed to `contains`. human-sim-archived flipped from "no composer" to "composer
    present + a new question round-trips in place". journeys.md row 4b added.
  - docs: wiki interaction-protocol, user-guide, log.md, .agents/learnings.md.
  - GREEN: `npm run build`; `npm run test:unit` (167/167); `npm run smoke`.
  - NOT RUN HERE: `npm run test:human*` / `smoke:ui` — no CDP browser in this sandbox
    (`no DevTools endpoint`). Assertions updated for a real-browser run; **owed on the
    operator's machine.**
- 2026-07-09 (round 2) — operator report: "I submit a message but do not see my chat
  message bubble." Deeper gap analysis:
  - Root cause class: the chat rendered the user's OWN message ONLY via the WS echo
    (`postChat` never appended locally). Any timing/routing/reconnect edge → the user sees
    nothing after Send. No browser journey had ever TYPED a message (the live journey only
    asserted the composer EXISTS; archived only covered the `subscribeChat` route).
  - Fix: **optimistic echo** — App keeps a local `pendingChats` overlay; the user's bubble
    shows instantly, merges into `fsMessages` (de-duped by role+text vs persisted), prunes
    once the persisted twin arrives, rolls back on POST failure. Server persistence unchanged
    (single truth).
  - New real-browser journey `scripts/human-sim-livechat.mjs` (gated in `npm test`, script
    `test:human:livechat`): seed a live thread + keep → default view → click keep AND a
    round-history option → type + Send → assert the user bubble is in frame AND on disk.
  - VERIFIED (real browser, this machine): `human-sim-livechat` PASS (5 steps);
    `human-sim-archived` PASS (6 steps, no regression); `test:unit` 169/169; `smoke` PASS;
    studio `build` green. (human-sim CDP flakes under load — env, not product; retried to green.)
  - Note corrected in learnings: `human-sim*` ARE real-browser (raw CDP) harnesses; only
    `smoke:ui` is jsdom.
- 2026-07-09 (round 3) — operator: "ensure this works for real actual chats; no preview
  functionality blocking it (delete it if found); must run in the claude code harness."
  - Searched the whole codebase for blocking preview/fixture/demo/fake responder: **NONE
    exists** (PreviewModal already consolidated into ArtifactFullscreen; replies flow only
    through the real `reply_artifact_chat` MCP tool; `human-sim.mjs` even comments "not the
    preview player"). Nothing to delete (rule 6 — did not fabricate a deletion).
  - Confirmed the REAL reply loop is wired for the harness: chat → `dispatchCommand` (park
    while blocked in present_board, else queue) → `run-brainstorm.md` step 7 detour →
    `artifact-chat.md` subagent → `reply_artifact_chat` → studio. Mechanically proven by
    `smoke` on the real bridge (queue → pendingUiCommands → reply broadcast + revises + reload).
  - FIX (rule 6): honest pending — `ChatSection` stops the perpetual "Claude is thinking…"
    after ~25s and states the message is saved + answered when a brainstorm runs.
  - FIX: `run-brainstorm.md` step 7 now drains `session_status.pendingUiCommands` on every
    present_board timeout and before each round, so a chat sent with no live board still gets
    answered while a session runs.
  - Known limitation (NOT changed): the LIVE ACTIVE board's option preview (BoardSurvey) has
    no composer — chatting there would park/reset the in-progress board answer. Captured
    artifacts, previous-round options, and archived threads all chat fine. Adding live-board
    chat safely needs board-draft preservation across the park — deferred, offered to operator.
  - VERIFIED: studio build green; `test:unit` 169/169; `smoke` PASS; `human-sim-livechat`
    5/5 (real browser). Reply GENERATION still needs a live model (can't be unit-tested).
- 2026-07-09 (round 4) — operator: composer on the CURRENT option set; every fullscreen =
  same viewer with chat right; dials PERSIST through chat; new MCP method if needed; persist
  ALL artifact-generation meta to the discussion folder for recall. Implemented:
  - protocol (rule 5): `StudioState.drafts: BoardResponse[]` + `draft` WS envelope (a draft is
    an un-submitted BoardResponse — no new shape).
  - store: `recordBoardDraft` → `round-NN/draft.json` (separate from response.json), loads on
    open, in `drafts`; `recordBoard` idempotent by board id (re-present after the detour).
  - bridge: `POST /api/board-draft` (200/404/400) + broadcast; `state()` carries drafts;
    NON-DESTRUCTIVE artifact-chat detour (resolve present_board WITHOUT clearing the board /
    recording a park) so dials never unmount.
  - MCP: `session_status` now returns each board's in-progress `draft` (recall surface).
  - studio: every fullscreen (keep, previous option, LIVE board option) uses the SAME
    ArtifactFullscreen with chat; App exposes slug-parameterized chat helpers; BoardSurvey
    debounce-persists the draft (`onDraft`) + restores it (`initial`) + flushes before a chat.
  - tests: `tests/board-draft.test.mjs` (store + endpoint + non-destructive park, 5 tests);
    `scripts/human-sim-boardchat.mjs` (real browser: dial persists through chat, 4 steps);
    api-matrix census + canonical state key set updated.
  - VERIFIED: full build green; `test:unit` 176/176; `smoke` PASS; real-browser journeys
    boardchat 4/4, livechat 5/5, archived 6/6. Reply GENERATION still needs a live model.
- STATUS: implementation complete + proven on a real browser; close via `/plan-closeout`.
- 2026-07-09 — closeout (resumed after a PC crash interrupted it): re-verified green
  (build; test:unit 188/188; smoke). Attribution against HEAD showed rounds 1–3 already
  committed by peer closeouts (declared riders); only round 4 (board drafts) was pending,
  build-coupled by the TS import graph to three crashed peer plans' diffs (mindmap
  legibility, photo-scribble, token-economy phase 1) — committed as the last-to-converge
  writer with riders declared, snapshot-verified in a fresh worktree before push.
