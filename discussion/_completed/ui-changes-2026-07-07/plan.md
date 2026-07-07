**Status:** closed 2026-07-07 — all 6 items shipped in one wave (build + unit/smoke/ui-smoke +
human-sim + break-sweep green; wiki reconciled across 6 pages; learnings harvested;
build-check + diagnose-studio improved from them). Archived to `_completed/ui-changes-2026-07-07/`.

**Wave 1 — 2026-07-07: items 1-6 below shipped** (build + unit/smoke/ui-smoke green; wiki
reconciled; learnings harvested). Notes per item: (1) converge = card grid, verdicts + note
in each card; (2)+(3) artifact zoom docks Notes ABOVE chat, Save persists to
artifacts/<slug>.json in the thread folder, notes visible while a reply is pending and on
previous rounds; (4) hover (always-on for touch) ⟲ tag on round separators reopens that
round prefilled — sending rewinds the brainstorm (REWIND digest / revisit-round command);
(5) token meter root cause: the pipe posted to port 5199 only and burned its cursor on
failed posts — NO thread ever recorded an event; bridge now writes
.logs/bridge-port.json for discovery, the cursor commits only on confirmed delivery, and
the Σ badge shows on the activity strip + archived banner; (6) previous rounds' options
open fullscreen with a persisted chat (option:<boardId>:<optionId> in artifacts/chat.jsonl,
reloadable, read-only on archived threads).

- Change the converge screen to use cards rather than the list format and put the keep, kill, merge and final buttons inside the card with the note.
- I do not see the claude code artifact chat interface in the artifact zoom. I see the artifact notes on the right. Notes should be above the chat for this artifact. Artifact notes should persist to the plan folder on submission.
- The artifact fullscreen is inconsistent when waiting for a chat response i cannot see the notes and the notes should persist with the artifact and be visible when viewing previous rounds. 
- We need a way to go back to a previous round for example when we hover over (click on mobile) the round separator for example "#round-board-r3-1783402138333 > div.flex.items-center.gap-3.py-1" the user should see a tag-like-rounded-corner button (same font size as divider) to return to that round. if the user clicks on this it will open the UI to the answers from that round to allow the user to change settings and re "Send and iterate".
- I do not see the token consumption in the UI from this plan: C:\Code\svgbrainstorm\discussion\_completed\askaquestion-2026-07-06\plan.md
- I do not see the artifact-chat-ui, this should be visible for previous rounds so users can ask questions about previous choices and this chat shall be persisted to the plan folder so it may be reloaded in future brainstorming rounds.