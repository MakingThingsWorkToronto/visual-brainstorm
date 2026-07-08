# UI changes — wave: Completed nav · archived chat · reopen · slider tag · pin + unified viewer

**Status:** closed 2026-07-07

Snapshot of the `discussion/ui-changes/` running inbox for the wave closed on 2026-07-07.
Implemented, proven (build + unit + smoke + ui-smoke + human-sim live + human-sim archived +
break-sweep), documented (wiki + user-guide + diagram), and archived here.

## Items shipped

- The sliders have a heading with text and then a numeric value. The numeric value concatenated as a postfix is confusing as it seems like the heading. Please put the numeric value in a tag visual and right align to the heading to differentiate it from the heading.
  → `BoardSurvey.tsx`: value moved into a right-aligned bordered tag (accent when moved off default).
- The artifact-chat thread continues not exist for the artifact itself when opened on an archived plan. The artifact-chat must allow a conversation using the existing mcp backbone even in historical archived chats. The code is already written but the UI is confused ensure this is wired up. The human-sim for this is not comprehensive otherwise this would work - significantly improve testing to ensure the entire journey is tested using canonical data. If there is slop preventing this from working in a non-preview harness delete the slop.
  → `App.tsx` chat selectors branch on `archived.*`; WayfinderStrip renders for archived; read-only replay. Fixed a real latent bug: `GET /api/artifact-svg` now serves `_completed` threads (`resolveArtifactSvgPath`). New gated `scripts/human-sim-archived.mjs` proves the whole journey on canonical data. No preview-only slop existed — it was a wiring gap.
- Historical chats should be re-openable from the ui either by clicking an explicit reopen button or by clicking the chat separator button. Both will produce a confirm dialog that the user wants to reopen the chat and if they click yes a message should be sent to claude code to move the plan out of _completed into discussion and the visual brainstorm should switch to the reopened plan at the appropriate step. The divider button was supposed to have been added already in the ui plan however i cannot see it when running in non-preview mode. If preview related complexity / slop is preventing this from working then delete the slop.
  → `App.tsx`: ↩ Reopen banner button + ↩ reopen-from-here round-separator action → confirm → `POST /api/command {command:'reopen', discussionId, round}`. Bridge `reopen` command + `reopenSeedNote`; new `.claude/commands/reopen.md` (git mv out of `_completed/` + present_board resume). The "missing divider" was the revisit-round action gated `viewingLive`-only (only appeared to work in preview because the harness makes every round live) — no preview slop to delete.
- Change the left nav label from "Archive" to "Completed" to align with label used in repo for completed plans.
  → `Sidebar.tsx` label + `studio-anatomy.svg` diagram.
- Add the ability to pin any artifact to the filmstrip round explorer. Pinned artifacts should be displayed below the filmstrip row in a dedicated row. Standardize all artifact click handlers accross to UI so they all follow the same path opening in full screen with the notes and artifact chat. Any other full screen renders should be deleted as slop. All code duplication should be removed.
  → `PreviewModal.tsx` + `ArtifactChat.tsx` DELETED, replaced by one `ArtifactFullscreen.tsx` that every click path opens (keeps, pinned, round-history options, live-board options). App's two parallel chat/preview state machines collapsed into one. Pins persisted per-thread: `SessionInfo.pinnedSlugs` + `SessionStore.togglePinned` + `POST /api/pinned`; dedicated "📌 pinned" row under the WayfinderStrip.
