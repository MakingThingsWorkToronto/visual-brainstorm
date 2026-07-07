# Ask-a-Question — artifact chat, live progress, token meter, delegation coverage
**Status:** open
**Goal:** The studio becomes a two-way surface: Claude session progress streams into the UI
deterministically (no model in the pipe), every discussion shows its cumulative token cost,
and any generated artifact can be enlarged fullscreen and interrogated/changed through a
simple chat panel whose every message is answered by subagents, persisted to the thread
folder on disk, and whose artifact changes refresh everywhere the artifact is displayed.
All interface tasks map unambiguously to an owning command/agent, and all orchestrator↔UI
messaging is recallable from disk. Done = all six phases verified per rule 10 and committed.
**Source:** operator ask, discussion/askaquestion-2026-07-06 (original bullets preserved below) — every phase must trace here.

## Original ask (verbatim, 2026-07-06)

- need to improve the feedback between ui and claude code if possible create deterministic scripts to pipe claude session progress back to to the ui.
- add a token calculator to each visual brainstorming thread this should include all tokens used for that discussion.
- need the ability to ask a question about one of the artifacts generated and this dialog should persist to the plan folder. the user clicks and enlarges the artifact to full screen there should be a chat dialog to the right of the image. this chat dialog should message back claude code and allow the user to ask questions or make changes to the generated artifact and if the artifact is changed it should be refreshed on the screen after the change (everywhere it is displayed). claude code should always use sub agents for this chat and this chat should have a simplified chat input text with merely a send button.
- as we add complexity to the mcp and claude code please ensure the claude code visual brainstorm orchestrator agent is delegating to sub agents and that all messaging is persisted to disk for recall and that we have specialized sub agents and commands for agentic learnings to improve this repo. Ensure coverage for all interface tasks so there is no ambiguity.

## Phases
| # | Phase | Goal + exit criteria (intent, no code) | Owner | Status |
|---|---|---|---|---|
| 1 | progress-pipe | Deterministic session-progress feedback UI←Claude: a script/hook path (no model in the pipe, rule 6 — real events only) posts orchestrator progress to the bridge, which broadcasts to the studio (extending the existing thinking-envelope family) and persists events to the thread dir for recall; exit: a progress event posted via the script appears live in the open studio AND survives thread reload; unit + ui-smoke green | inline + test-engineer | done |
| 2 | token-meter | Per-thread token calculator: all token usage attributable to a discussion (orchestrator + delegated subagent rounds, reported over the phase-1 pipe) accumulates in the thread's persisted state and renders as a cumulative counter on that thread in the studio; exit: counter grows across rounds, survives reload, and archived threads still show their total; tests cover accumulation + reload | inline + test-engineer | todo |
| 3 | artifact-chat-protocol | Message shapes + persistence for the artifact dialog: chat message shape lives ONLY in packages/protocol (rule 5); bridge carries user questions to Claude Code (blocking-tool / pendingUiCommands semantics like other UI commands) and answers back; the dialog persists append-only in the thread folder alongside its artifact (rule 7 provenance); exit: a question/answer exchange round-trips and both messages are on disk under the thread; unit + smoke green | inline + test-engineer | todo |
| 4 | artifact-chat-ui | Fullscreen artifact chat surface: clicking an artifact enlarges it fullscreen with a chat panel on the right — simplified input (text box + send button only); a changed artifact refreshes everywhere it is displayed (fullscreen view, artifact shelf, any board reference); sanitization rule 8 applies to refreshed SVG; exit: ui-smoke renders the fullscreen+chat surface; live flow observed with the studio loaded (rule 10 UI clause); user-guide updated (rule 12) | inline + test-engineer | todo |
| 5 | artifact-chat-orchestration | The Claude-side procedure: a command obligating the orchestrator to ALWAYS answer artifact chat via subagents (never inline generation), to apply changes as a NEW captured artifact version with provenance linking its parent (rule 7 — originals never mutated), to broadcast the refresh, and to persist every message; exit: command doc exists, agents roster/wiki updated, and one real question + one real change request completed through the studio with the dialog + versioned artifact on disk | inline + wiki-librarian | todo |
| 6 | delegation-coverage | Coverage audit, no ambiguity: every interface task (each UI command, artifact chat, model routing, seeds, attachments, progress pipe) maps to exactly one owning command/agent; all orchestrator↔UI messaging persisted for recall; specialized subagent/command coverage for agentic learnings confirmed or added; exit: coverage table in the wiki with zero unowned tasks, wiki/log.md line per edit, build + all three test layers green | wiki-librarian + inline | todo |

## Progress log (append-only — every tick writes one line)
- 2026-07-06 23:56 — progress-pipe: ProgressEvent protocol + POST /api/progress + progress.jsonl persistence/reload + pipe-progress.mjs forwarder + PostToolUse/SubagentStop hooks + studio SessionActivity strip; verify: npm run build + npm test → all pass (55 unit, smoke, ui-smoke); commit 35fbf42 (riders from parallel sessions declared in body)
