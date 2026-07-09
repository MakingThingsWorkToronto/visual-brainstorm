---
model: haiku
---

# /artifact-chat — answer or revise a captured artifact from the studio's artifact chat

The user clicked a captured artifact (or a previous-round option, on ANY thread — live or
archived) and typed into its chat panel. The bridge routed it to you as command `artifact-chat`
— via a board response (`commands:['artifact-chat']`, the question in `elaboration`/`seedNote`),
via `session_status.pendingUiCommands`, via the next tool result, or via
`open_studio`/`waitForCommand`. This is a DETOUR, not a phase change.

**Which thread owns it.** The seedNote names the artifact and, when the dialog is on an
ARCHIVED (non-live) thread, its `discussionId` plus the instruction to `load_discussion` it.
Users can ask about any artifact whenever they want — you answer in place, in that thread.

## Procedure

1. **Locate the artifact.** The seedNote names the artifact slug and its svgPath. Use
   `session_status` for the live thread, or `load_discussion(discussionId)` when the seedNote
   names an archived thread, to confirm the artifact exists, then **Read the SVG file** — you
   answer about what is actually on disk, never from memory.
2. **ALWAYS delegate — never answer or regenerate inline** (operator mandate: "claude code
   should always use sub agents for this chat"). Classify the message:
   - **Mind-map snapshot FIRST** (provenance `boardId` set + `optionIds: []`, name like
     "… round N tree"): the snapshot SVG is the tree AS PRESENTED — the user has usually
     edited since (maximize flushes their live draft before the chat opens). **Run
     `.claude/commands/read-mindmap.md` FIRST** (subagent) — it prefers `draft.json`'s live
     `editedTree` and the refreshed `round-NN/tree.md`, NEVER the stale snapshot. A
     **question** is answered from that CURRENT tree (structure, notes, thin gaps). An
     **improvement request (LIVE thread)** improves the TREE, not the picture: reply via
     `reply_artifact_chat` saying what you'll change, then `present_board` a NEW mindmap
     board whose tree GROWS from the live tree per the request (honor notes, never
     reintroduce deleted branches) — presenting auto-captures the new snapshot (rule 7).
     Do NOT route a mind-map change to `svg-artisan`: a hand-drawn SVG revision of a tree
     breaks the co-edit loop (the canvas edits `tree`, not the artwork).
   - **Question** → spawn a general subagent that Reads the artifact SVG plus the thread's
     `brainstorm.md` (provenance: which round, which parents, which notes decided it) and
     returns a short answer. Works on ANY thread, live or archived.
   - **Change request (LIVE thread only)** → spawn agent **`svg-artisan`** (any
     `BoardResponse.model` override in force for the thread applies here too) to produce a FULL
     self-contained revised SVG per `.claude/skills/svg-authoring` — a complete replacement,
     never a patch or overlay.
3. **Deliver** — pass `discussionId` to `reply_artifact_chat` whenever the seedNote named one
   (archived thread), so the reply records into THAT thread and routes to its view; omit it for
   the live thread.
   - Change (live): `capture_artifact` the revised SVG with `revises: <original slug>` and name
     it `<original name> rev N` — a revision is a NEW artifact linked to its parent; the
     original is never overwritten (rule 7). Then `reply_artifact_chat` with a short text and
     the `revisedSlug`.
   - Question: `reply_artifact_chat` with the answer text only.
   - **Change request on an ARCHIVED thread**: `capture_artifact` writes to the LIVE store, so
     it CANNOT revise an archived artifact. Answer honestly (rule 6) via `reply_artifact_chat`
     (with the archived `discussionId`): the thread must be reopened to capture a revision —
     do NOT capture into the wrong thread. The question itself is still answered.
4. **Rules.** Never mutate the original artifact (rule 7). Revised SVGs must be
   sanitize-safe — no scripts, event handlers, foreignObject, or javascript: hrefs
   (rule 8). If the subagent fails, report the failure honestly via `reply_artifact_chat`
   — never fabricate a result (rule 6). Keep replies SHORT: the panel is a chat, not an
   essay.
5. **Resume.** Return to exactly what the session was doing before the chat arrived. If the
   chat interrupted a blocked `present_board` (the park digest says so), resume the wait with
   `present_board {rearmBoardId: "<the parked boardId>"}` — NO options/tree/axes; the board
   stayed live in the studio (dials intact), no new round is minted, and if the user submitted
   DURING the chat the rearm returns their answer immediately. Never re-send the board's
   content to resume — that would mint a duplicate round. Otherwise continue whatever command
   was in progress. The chat changes nothing about the funnel state.

## Changelog
- 2026-07-09 — resume is now a first-class rearm: `present_board {rearmBoardId}` re-arms the
  still-live board (and consumes a mid-detour submit) instead of re-sending the board content
  (from review-followups-2026-07-09: mid-detour submits used to strand until timeout)
- 2026-07-09 — mind-map branch: a chat on the mindmap snapshot runs /read-mindmap FIRST (live
  draft/tree.md, never the stale presented snapshot); improvements re-present an improved TREE
  (auto-captured), never an svg-artisan SVG redraw (from mindmap-chat-hardening-2026-07-09)
- 2026-07-09 — thread-addressed: chat is now available on ANY thread (live, archived,
  previous-round options); the seedNote carries an archived thread's `discussionId` and
  `reply_artifact_chat` takes it so answers record in place. Revisions stay live-only (honest
  "reopen to revise" on archived). Per discussion/artifact-chat-everywhere-2026-07-09/plan.md.
- 2026-07-07 — created (artifact-chat feature per discussion/askaquestion-2026-07-06/plan.md:
  fullscreen artifact chat routes through UI-command plumbing; orchestrator only routes and
  replies, subagents do the thinking)
