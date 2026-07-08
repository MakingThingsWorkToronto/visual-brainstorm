---
model: inherit
---

# /reopen — the user reopened an archived (completed) thread from the studio

The studio's reopen control (the explicit **Reopen** button on an archived thread's banner,
or the ⟲ reopen tag on a round separator) asked to bring a finished thread back to life. The
user confirmed a dialog; the bridge dispatched a `reopen` command to you — queued into the
next tool result / `session_status.pendingUiCommands`, or (if a live board was waiting) via a
synthetic park response. Its seedNote leads with `REOPEN:` and names:

- the **discussionId** to reopen,
- its **current folder** (under `discussion/_completed/`),
- the **round** to resume at (omitted → resume at the latest round).

Reopening is the inverse of `/plan-closeout`'s final archive step. Nothing is regenerated —
the cached rounds, artifacts, and `brainstorm.md` reload as-is (rule 7).

## Procedure

1. **Read the seedNote.** It is the instruction set: the discussionId, the `_completed/`
   folder path, and the target round. Confirm the folder exists there (`ls` / `git status`).
2. **Move it back out of `_completed/`.** `git mv discussion/_completed/<dir> discussion/<dir>`
   — keep the folder name unchanged (its `session.id` basename must resolve; see
   `SessionStore.resolveDir`, which checks the live root first). If the plan was archived to a
   dated `_completed/<slug>-<date>/` on closeout, move that whole folder back. Verify with
   `git status` that the thread now lives under `discussion/`.
3. **Resume it live at the right round.** Call `load_discussion(discussionId)` to see the
   cached rounds, then `present_board` with `discussionId=<id>` to make it the live session
   again — re-present the target round's board (or the latest if no round was given) exactly
   as cached. Do NOT regenerate anything; the studio drops back to the live view and shows the
   reopened thread (its keeps, dialogs, and history all reload).
4. **Narrate honestly.** The re-presented board's `prompt` (or your reply) should say the
   thread was reopened and the brainstorm continues from round N — the user must see the
   reopen acknowledged, not silently swapped.

## Notes

- If the seedNote reports **no discussionId** (a malformed reopen), don't guess — ask the user
  which archived thread to reopen (`list_discussions` shows the archived ones).
- The reopened thread keeps its full history on disk; later work appends as new rounds. This
  mirrors the revisit-round contract (`.claude/commands/revisit-round.md`) — history is never
  erased.

## Changelog
- 2026-07-07 — created (discussion/ui-changes plan item 3 — reopen archived threads from the studio)
