---
model: haiku
---

# /artifact-chat — answer or revise a captured artifact from the studio's artifact chat

The user clicked a captured artifact and typed into its chat panel. The bridge routed it to
you as command `artifact-chat` — via a board response (`commands:['artifact-chat']`, the
question in `elaboration`/`seedNote`), via `session_status.pendingUiCommands`, via the next
tool result, or via `open_studio`/`waitForCommand`. This is a DETOUR, not a phase change.

## Procedure

1. **Locate the artifact.** The seedNote names the artifact slug and its svgPath. Use
   `session_status` (or `load_discussion` for an archived thread) to confirm the artifact
   exists, then **Read the SVG file** — you answer about what is actually on disk, never
   from memory.
2. **ALWAYS delegate — never answer or regenerate inline** (operator mandate: "claude code
   should always use sub agents for this chat"). Classify the message:
   - **Question** → spawn a general subagent that Reads the artifact SVG plus the thread's
     `brainstorm.md` (provenance: which round, which parents, which notes decided it) and
     returns a short answer.
   - **Change request** → spawn agent **`svg-artisan`** (any `BoardResponse.model` override
     in force for the thread applies here too) to produce a FULL self-contained revised SVG
     per `.claude/skills/svg-authoring` — a complete replacement, never a patch or overlay.
3. **Deliver.**
   - Change: `capture_artifact` the revised SVG with `revises: <original slug>` and name it
     `<original name> rev N` — a revision is a NEW artifact linked to its parent; the
     original is never overwritten (rule 7). Then `reply_artifact_chat` with a short text
     and the `revisedSlug`.
   - Question: `reply_artifact_chat` with the answer text only.
4. **Rules.** Never mutate the original artifact (rule 7). Revised SVGs must be
   sanitize-safe — no scripts, event handlers, foreignObject, or javascript: hrefs
   (rule 8). If the subagent fails, report the failure honestly via `reply_artifact_chat`
   — never fabricate a result (rule 6). Keep replies SHORT: the panel is a chat, not an
   essay.
5. **Resume.** Return to exactly what the session was doing before the chat arrived —
   re-present the pending board, keep waiting, or continue the command in progress. The
   chat changes nothing about the funnel state.

## Changelog
- 2026-07-07 — created (artifact-chat feature per discussion/askaquestion-2026-07-06/plan.md:
  fullscreen artifact chat routes through UI-command plumbing; orchestrator only routes and
  replies, subagents do the thinking)
