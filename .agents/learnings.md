# Agentic Learnings (newest first)

## 2026-07-09 — a peer's catch-all commit can CONSUME your staged index between your `git add` and `git commit`

- **The trap:** in the shared tree, a limit-hit peer ran a catch-all `git commit` ("all
  changes for cursor before limit") in the seconds between this session's `git add` and its
  `git commit` — the peer's commit swallowed the staged files, our commit failed with
  exit 1 (nothing to commit), and the peer's commit sat UNPUSHED because that session died.
  Naively re-adding and re-committing would have duplicated the work; treating exit 1 as
  "add failed" would have been wrong too.
- **How to apply:** on an empty-commit failure in a shared tree, do NOT retry blindly —
  re-attribute against HEAD first (`git grep '<your distinctive marker>' HEAD -- <paths>`).
  If your edits are already in a peer's commit, your only job may be `git push` (check
  `git status -sb` for "ahead"). Same lesson as crash-resume attribution, but the race
  window is SECONDS, not sessions. Related: never dispatch the same closeout/resume prompt
  to two chats — twin sessions race the identical steps 8–10 (observed d5b56d6: safe only
  because the loser stopped at read-only verification).

## 2026-07-09 — deterministic digests and agent contracts can contradict each other; review INSTRUCTION SURFACES pairwise, not just code

- **The trap:** the TWEAK digest (feedback.ts) ordered "include a clarifying variant of
  each UNSURE option" and "return a variant embracing the flaw" while svg-artisan.md's
  mutation contract said "NEVER re-author from scratch" — an artisan following its own
  file literally must refuse its brief. Code review of either file alone passes; only
  diffing the two instruction surfaces against each other exposes the deadlock. Same
  class: the pipe comment claimed tweak needs manual `--category tweak` after the
  PreToolUse boundary had made it mechanical.
- **How to apply:** when a deterministic producer (digest builder, seedNote, hook) emits
  instructions that an agent/skill file also legislates, fresh-eyes reviews must read the
  producer's OUTPUT TEXT and the consumer's contract side by side and reconcile every
  imperative. A load-bearing MARKER (e.g. the digest's MUTATE keyword driving the token
  pipe's tweak/generation binning) must be documented at the point where a human or model
  could paraphrase it away (VALIDITY-SCAN briefing contract does this now).

## 2026-07-09 — adding a ProgressEvent/BoardResponse field: the bridge's INBOUND zod whitelist strips it silently despite rule 5

- **The trap:** protocol schemas are the single source of truth, but the bridge's POST
  handlers (`/api/progress`, and the same pattern elsewhere) validate the inbound body with
  a LOCAL `z.object({...})` whitelist BEFORE re-parsing with the shared schema — zod strips
  unknown keys, so a field added only to `packages/protocol` vanishes on the wire with a
  200 OK and no error anywhere. The shared-schema parse succeeding is a false comfort: it
  never sees the stripped field.
- **How to apply:** a protocol field addition is a THREE-point change: the protocol schema,
  the bridge's inbound validator for every endpoint that accepts that shape, and the pipe/
  sender emission. Prove it with a wire test that POSTs the new field and asserts it
  survives into `/api/state` (tests/api-status-matrix.test.mjs pattern), not just a schema
  round-trip.

## 2026-07-09 — a delegated multi-part contract completes PARTIALLY on crash; resume verifies every part, not the headline

- **The trap:** handoff-fidelity Phase 5 delegated "edit 5 wiki pages + log each + wiki_reload"
  and "update reopen.md" to subagents that died mid-contract. The HEADLINE work landed (pages
  edited, reopen.md header rewritten) so every spot-check looked done — but zero rule-2 log
  lines existed, the grounding index was stale, and reopen.md's PROCEDURE step still commanded
  the manual `git mv` its own header said the bridge now performs. Partial completion reads as
  completion unless each contractual part is checked separately.
- **How to apply:** on resume, enumerate the delegation brief's parts and verify each one
  (page content ∧ log line ∧ reload; header ∧ every procedure step it contradicts). For doc
  edits, grep the WHOLE file for statements the change obsoletes — a crashed editor updates
  prose top-down and dies mid-file.

## 2026-07-09 — never `git commit --amend` in a shared live tree — a peer can push your original within seconds

- **The trap:** amended a just-made local commit (message fix only) — but a concurrent session
  had ALREADY pushed the original to origin in the ~3 minutes between commit and amend. Local
  and remote then held two commits with identical trees and different messages; the rebase
  dropped the amended one, so the WRONG (pre-amend) message is permanent history.
- **How to apply:** in this multi-session tree, treat every commit as published the moment it
  exists — peers sweep and push on their own cadence. Message wrong? Let it stand or add a
  follow-up commit; only amend after `git log origin/main..HEAD` proves the commit is still
  local-only AND no peer session is alive.

## 2026-07-09 — a feature isn't shippable until its journey rows exist; six affordances shipped with zero

- **The trap:** handoff-fidelity shipped six user-visible affordances (Claude-asks, unsure,
  remix recipes, annotate-on-option, rationale+lineage, crash recovery) with full unit/digest
  coverage but NOT ONE predicted row in tests/journeys.md — rule 10's "predict EVERY human
  journey before you test it" was silently skipped, and the plan was declared ready for human
  testing with no registry of what the human must walk.
- **How to apply:** journey rows are part of the feature's definition of done, authored with
  the honest DONE/OWED split (backend proofs vs the live-model walk). A closeout that claims
  "ready for human testing" must name the journeys the human will execute.

## 2026-07-09 — SVG→canvas rasterization: explicit root width/height, and any size cap must preserve box-aspect == viewBox-aspect

- **The trap (second occurrence of the same class):** board options carry viewBox but no
  width/height (svg-authoring craft) — Firefox/Safari draw an intrinsically-unsized SVG BLANK
  through canvas drawImage. composeSeedSvg carried the guard; the new annotate-on-option path
  did not. Separately, the scribble pad clamped viewH and height-capped a
  `preserveAspectRatio="none"` svg while width stayed `w-full` — shearing box-aspect away from
  viewBox-aspect, distorting the image, EVERY stored mark coordinate, and the composite the
  model sees.
- **How to apply:** any new `renderCompositePng(...)` caller injects explicit dims first
  (`withExplicitSize`, unit-guarded in ui-smoke "annotate guards"); grep existing callers when
  adding one. With `preserveAspectRatio="none"`, the box MUST keep the viewBox ratio — cap
  size via the wrapper's max-width (maxH × aspect), never the element's height alone.

## 2026-07-09 — in-place engine edits fire no select event; selection-derived UI must refresh from the op diff

- **The trap:** mind-elixir's double-click rename commits via an `operation` event only — the
  action bar's `selected.topic` (set on select events) went stale, so rename→Explode fanned
  children named after the OLD topic, and every op payload carried it too.
- **How to apply:** any state derived from "the selected node" refreshes inside the same diff
  that emits ops (`emitEdit`: rename updates the binding, a vanished id clears it). Don't trust
  engines to announce selection changes for in-place edits.

## 2026-07-09 — a shared MCP server needs host-specific launch files AND an enforced capability boundary

- **The trap:** one root `.mcp.json` is not portable configuration. VS Code Copilot discovers
  `.vscode/mcp.json` with a `servers` object and a workspace `cwd`; GitHub-hosted Copilot uses
  agent-scoped declarations or repository settings, while `.github/mcp.json` is only a versioned
  `mcpServers` payload. More dangerous: both hosts can launch the same stdio process, but a
  GitHub Actions runner's `127.0.0.1` studio has no human browser — prose saying "do not call it"
  leaves the model free to block on an impossible board response.
- **How to apply:** encode host mode in the launch environment and reject user-interactive tools
  at the MCP boundary (`VIBR_COPILOT_HOSTED=1` → `unsupported-host`) before a bridge starts.
  Prove both manifests with real `initialize → initialized → tools/list`, test the hosted refusal,
  and keep the local manifest unflagged. For hooks, VS Code ignores Claude matcher filters, so
  load a native `.github/hooks/` wrapper and suppress the automatic Claude-hook import; malformed
  hook payloads must conservatively run guards rather than silently bypass them.

## 2026-07-09 — a "non-destructive" pause needs a first-class RESUME, or the resume path quietly undoes it (and the docs will claim otherwise)

- **The trap:** the artifact-chat detour took the pending `present_board` resolver while the
  board "stayed live", and the wiki + code comments said resume = "re-enter present_board on
  the SAME board (recordBoard idempotent by id)". But `present_board` structurally CANNOT
  reuse an id (it mints `board-r{round}-{Date.now()}` and `nextRound()` appends) — so the
  documented resume never existed: the real resume minted a duplicate round, remounted
  BoardSurvey (destroying the very dials the detour preserved), and a user submit landing
  MID-detour had no waiter and stranded until timeout. Everything read plausibly; the
  mechanism was fictional. Two independent review findings (unreachable guard + strand) were
  symptoms of this one fiction.
- **How to apply:** when a design says "X is non-destructive / stays live", implement the
  RESUME as a first-class operation (here: `present_board {rearmBoardId}` →
  `bridge.rearmAndWait`, which consumes a parked mid-pause answer before re-arming) and
  write a test that answers DURING the pause. And when a comment claims "idempotent so
  callers may repeat" — verify a caller CAN actually repeat with the same identity; an
  unreachable guard plus a confident comment is drift wearing a seatbelt.

## 2026-07-09 — debounced draft persistence must never carry payload bytes (dials, not files)

- **The trap:** the board-draft path reused the full `BoardResponse` shape, so one attached
  photo was re-shipped as base64 on EVERY debounced keystroke — pretty-printed into
  draft.json, held in memory, sent in every hello snapshot, echoed to every WS client
  (including the sender), and embedded whole into `session_status` (~1.7M tokens of base64
  in model context). Each hop individually looked like "just pass the draft along."
- **How to apply:** decide what a draft IS (generation meta — dials/selections/notes/tree;
  the REAL submit carries bytes) and enforce it at BOTH ends: the client's single
  `buildDraft()` spelling strips `attachment.dataUri`, and `recordBoardDraft` blanks
  defensively and returns the stored draft so the broadcast can't leak the raw upload.
  Also: don't `JSON.stringify` a large object per render to detect change — key the effect
  on the underlying state values (useState identity IS the change signal).

## 2026-07-09 — human sims must wait for the LAZY-LOADED engine instance, not its container

- **The trap:** `MindElixir` ships as a lazy Vite chunk, so `[data-testid="mindmap-engine"]`
  (and the maximize button) render BEFORE `(container).mind` exists. A sim step that samples
  `.mind` once — after only waiting for the container — flakes under machine load (three
  concurrent sessions): "no engine instance on the container", red suite, green on re-run.
- **How to apply:** any journey step that drives a lazily-mounted engine waits for the
  INSTANCE (`waitInPage('...', "!!el?.mind")`), never just the container/testids around it.
  Also: `npm test 2>&1 | tail` reports TAIL's exit code — check `PIPESTATUS[0]` (or don't
  pipe) before believing a green. And when a gated sim gains/changes steps, its
  `tests/journeys.md` row updates in the SAME change — the fresh-eyes review found row 3d
  still claiming "4 steps" after the sim grew to 5 (a stale DONE row mis-states the proof).

## 2026-07-09 — a NEW artifact KIND must be routed in every command that handles artifacts generically

- **The trap:** the mindmap snapshot became a new KIND of artifact (provenance `boardId` +
  `optionIds: []`, target of the maximize→chat), but `.claude/commands/artifact-chat.md`
  still classified every artifact alike: questions answered from the artifact's SVG (for a
  mindmap that's the STALE presented tree, not the user's current edits) and change requests
  routed to `svg-artisan` for an SVG redraw (the WRONG channel — a tree improves by
  re-presenting an improved TREE, which auto-captures its own snapshot). The code, skill,
  and run-brainstorm wiring were all correct; the generic COMMAND was the silent gap — found
  only by an "assume nothing works" review of the full chain.
- **How to apply:** when a feature mints a new artifact kind (or provenance shape), sweep
  `.claude/commands/` for every command that handles artifacts generically and add the
  kind's branch (or state why generic handling is right). A feature "wired into the skills"
  can still be mis-handled by a sibling command that never learned the kind exists. Prove
  chat-adjacent flows with a journey step that EDITS state first (the mindchat sim now makes
  a real engine edit before maximizing — stale-snapshot bugs are invisible to no-edit runs).

## 2026-07-09 — a crashed session's "verified" plan status is a claim, not proof: review-harden before closing; and four UI/persistence traps the review confirmed

- **A plan.md that says "IMPLEMENTED + verified" from a session that CRASHED gets a fresh adversarial review before closeout, not a rubber stamp.** The pre-crash status was green, yet an 8-angle review with per-candidate verification confirmed 8 real defects in the "verified" diff (double-dispatch, StrictMode duplication, cross-browser rasterization loss, dishonest generated README, sink-attribution divergence…). Tests passing proves the paths the tests walk — a recall-biased review walks the others.
- **React StrictMode double-invokes state updaters: NEVER call setState inside another updater.** PhotoScribble committed arrow/box marks via `setAnnotations` inside the `setDraft` updater — dev double-committed every mark (invisible perfect overlap; undo removed only the phantom), while production (what human-sims test) invoked once, so no test could catch it. Commit gestures from a synchronous `useRef` mirror of the in-flight value; keep every updater pure.
- **Turning a sync submit handler async opens a double-dispatch window — add the in-flight guard in the same change.** Send & iterate gained `await renderCompositePng(...)` (hundreds of ms on a big photo); the button stayed enabled during the await, so a double-click POSTed two new-brainstorm commands → two seed folders, two threads. Any `onClick` that becomes async needs `disabled`/re-entry state as part of the same diff.
- **An SVG headed for canvas `drawImage` needs explicit root `width`/`height`, not just a viewBox.** Firefox/Safari mis-rasterize intrinsically-unsized SVGs (blank or 300×150 default) — the vision composite would silently vanish off Chromium while the all-Edge/Chrome test fleet stays green. Emit `width`/`height` matching the viewBox on any SVG that will be rasterized.
- **Generated model-facing docs must be conditional on what was actually written.** The seed folder's README said "photo.png is the clean background" unconditionally — every blank-canvas scribble sent /read-scribble to Read a nonexistent file. When code writes prose that names sibling files, derive the prose from the same booleans that gated the writes (and resolve shared values — the VIEW target — ONCE, passed to every consumer).
- **Stateful replay bookkeeping must be one logic, not two mirrors.** `recordProgress` (live) and `SessionStore.open` (reload) disagreed on whether a category+tokens event consumes the armed sink label → identical progress.jsonl produced different tokensBySink live vs reloaded. When a reducer runs both live and in replay, share the transition (or add a test asserting live == reopened, as now).

- **Verify each phase green AT LANDING TIME** (workspace-scoped tsc + the affected test files). A later full-tree red whose error lines sit in fields/files your diff never touched belongs to the parallel session's in-flight work — record the honest state in the plan and do NOT "fix" their half-landed feature (collision); their errors shift minute to minute while they work.
- **A model QUALITY bake-off needs no live human session:** parallel `svg-artisan` subagents with Agent-tool model overrides on the SAME terse brief give a real generation-path ranking. 2026-07-09 result: fable > opus > sonnet — sonnet violated the JSON-only output contract (prose preamble), opus drifted board-level stroke style (3 vs the skill's 2.5); judge against the svg-authoring checklist, not taste alone.

## 2026-07-09 — resuming a closeout after a crash: peers may have ALREADY committed parts of your plan; attribute against HEAD symbols, then verify the commit as a standalone snapshot

- **Don't assume your plan's work is still uncommitted after a crash/resume.** Peer sessions' closeouts commit shared files with declared riders — here rounds 1–3 of `artifact-chat-everywhere` (protocol `discussionId`+`drafts`, `resolveChatStore`, `pendingChats`, ArtifactFullscreen, wiki log lines, user-guide) were already in HEAD via peer commits; only round 4 was pending. Attribute by checking each plan SYMBOL against HEAD (`git grep <symbol> HEAD -- <paths>`) instead of trusting `git status` or the plan's progress log — then commit only the residue.
- **When crashed peers can't converge and the TS import graph fuses the pending diffs** (e.g. `session-store.ts` imports an untracked peer `tree-outline.ts`; `bridge-server.ts` imports peer protocol types), a clean single-plan file subset does not exist: `tsc -p` typechecks the whole project, so a file-level `--only` subset can commit a snapshot that doesn't build. The safe path: include the minimal build-coupled closure as DECLARED riders, then **prove the exact committed snapshot builds+tests in a fresh `git worktree` of that commit** (npm ci there) before pushing — working-tree green does not prove commit-snapshot green.

## 2026-07-09 — a "flag the gaps" heuristic that fires on EVERY leaf flags nothing; and prefix `includes()` asserts miss suffix bugs

- **A model-facing signal must be SELECTIVE or it's noise.** `treeToOutline` flagged every leaf at `depth > 0` as `— thin` (a "gap the user opened but didn't grow") — so every legitimate detail leaf looked like a gap, drowning the real signal read-mindmap needs. The meaningful gap is narrow: a TOP-LEVEL branch (`depth === 1`) with no children (a dimension opened but never filled). When you add a heuristic label the model reads, ask "what fraction of nodes will this fire on?" — if it's most of them, it conveys nothing.
- **`assert(out.includes('- circle-M  _(`m1`)_'))` PASSES on the buggy `- circle-M  _(`m1`)_  — thin`** because the expected string is a PREFIX of the actual line. A positive `includes` on a line that can grow a suffix cannot catch an over-eager suffix — add a NEGATIVE assertion (`!out.includes('… — thin')`) for the case that must NOT get the suffix. Prefix-matching asserts are a blind spot for "extra stuff got appended" bugs.
- **A deterministic text projection read by indentation must be newline-safe.** A pasted multi-line topic/note would break `tree.md`'s line-per-node structure (a child line appears un-indented). Collapse whitespace (`oneLine()`) when projecting — the same discipline as XML-escaping topics in the SVG snapshot: user text is DATA, never structure.

## 2026-07-09 — a plan-closeout commit can be blocked by a SHARED file that references another session's UNCOMMITTED work

- **The trap:** several sessions share one working tree. This closeout (harness-registry-guard) edited `.claude/agentic-surface-registry.json`; concurrently other sessions added `read-mindmap` + `read-scribble` command ENTRIES to that same registry while their `read-mindmap.md` / `read-scribble.md` files stayed untracked (`??`). Committing the registry now — even `--only` that one path — ships entries pointing at files NOT in the commit → on a fresh clone the guard's reverse check sees dangling entries → **my own committed test goes RED**. There was no clean unilateral subset: omitting the registry leaves the committed guard red on the already-committed `add-theme`/`revisit-round`; removing the other sessions' entries clobbers their in-flight work.
- **How to apply:** when closeout verify (its Verify-reality step) is green but a shared file you touched references another session's uncommitted files, DO NOT force a commit — attribute it, wait for their loop to converge (their `.md` files become tracked), re-verify, then commit. A guard/registry/index that cross-references files is a cross-session coupling: the last session to converge owns the consistent commit. Never clobber a peer's entries to make your own commit clean.

## 2026-07-09 — make a visual structure MODEL-LEGIBLE: persist an outline + a read-command, don't make the model parse JSON

- **A tree persisted only as JSON (`edited-tree.json`) + a count in the digest is NOT model-legible.** The orchestrator had to parse and traverse JSON to understand the map. Fix: a deterministic `treeToOutline(tree)` → indented markdown (`round-NN/tree.md`) written on present/response/draft, folded into `brainstorm.md` AND the feedback digest (the FULL outline, not a count). Header = node/branch/depth counts; each node carries its `id` (op cross-ref) + `note` (intent); leaves the user opened but never grew get a `— thin` flag = a GAP. The model reads the structure at a glance; JSON stays for exact traversal.
- **Pair the legible data with a READ command that turns it into INTENTION, and wire that command into the skill + loop + deliverable.** `.claude/commands/read-mindmap.md` reads tree.md/edited-tree.json/draft.json/tree-ops.jsonl → the user's intention (structure = what they're building; notes = steering, weight highest; `delete` ops = permanent out-of-scope; `— thin` = gaps). It's invoked by `brainstorm-phases` (skill), `run-brainstorm` (mindmap round), and `plan-closeout` (build-plan phases = the tree's top branches). Data + skill + command together = "easy for the agent to understand"; no single layer suffices.
- **The live in-progress structure must persist too, not just the submission.** The mind-map draft was skipped (`if isMindmap return`) so a mid-edit tree wasn't recallable/readable. Removing the skip makes `editedTree` ride the debounced `/api/board-draft` → `draft.json` + a refreshed `tree.md` always reflect the tree the user is LOOKING at — what an artifact-chat mid-edit must read.
- **"Chat on X" + "same fullscreen as an artifact" = a MAXIMIZE control → the existing viewer, not a bespoke panel.** The mind map's snapshot is already a captured artifact (boardId provenance, no optionIds); a maximize icon that calls `openArtifactChat(thatArtifact)` reuses the whole SVG-left/chat-right `ArtifactFullscreen` (chat = iterative improvement; the non-destructive detour keeps the live tree). Find the artifact by provenance, newest-match-wins for a re-presented tree.
- **A canonical fixture's field values are NOT what you assume — read them.** `boards/mindmap-tree.json` has `round: 7`; tests hardcoding `round-01/tree.md` failed with ENOENT. Derive paths from the fixture (`round-${board.round}`), never a guessed literal.
- **How to apply:** to make any structured artifact legible to the model, ship THREE things together — a deterministic text projection persisted to disk, a read-command that turns it into intention, and skill/loop wiring that runs that command at the right moments. JSON on disk alone is not legibility.

## 2026-07-09 — Harness parity checks stay useful only if intentional adapter gaps are encoded, not merely documented

- **A durable `.claude` command must land in exactly one of two states for each supported harness: adapted or explicitly excluded.** Leaving an intentional Copilot omission only in prose (`harness-copilot.md`) keeps `scripts/check-agentic-surface.mjs` noisy, which hides the next REAL gap. Here the stale warnings for `add-theme` / `revisit-round` masked two fresh mismatches: `read-mindmap` existed in the SSOT registry with no Copilot index entry, and `read-scribble` already had a prompt file on disk but was missing from `.github/agentic-surface-registry.json`.
- **How to apply:** when a new durable command lands, reconcile `.github/agentic-surface-registry.json` in the same cycle or add the command to `.claude/agentic-surface-registry.json` `exclusions.copilot.commands` with a reason. Treat a zero-warning parity guard as the target state; otherwise the first warning is never actionable.

## 2026-07-09 — an SVG with an embedded raster is NOT vision-readable; rasterize a composite PNG (in the browser) so the model can SEE user input

- **The trap:** the annotated-photo scribble persisted as one `.svg` with the photo as an embedded `<image href="data:image/png;base64,…">`. The seedNote said "Read it" — but the **Read tool returns the SVG's XML text, not a rendered image**. The model saw base64 gibberish + `<polyline>`/`<text>` coordinates, never the picture the human marked up. A whole intent channel (the point of scribbling) was invisible. Vision only works on a REAL raster file (`.png`/`.jpeg`), not an SVG-as-text and not an SVG that merely *contains* a raster.
- **The fix, dependency-free:** rasterize a **composite PNG** in the STUDIO BROWSER (Node has no rasterizer; adding sharp/resvg/puppeteer is a heavy dep). Mirror the CameraModal pattern (`composer.tsx`): load the SVG via `new Image()` with `src="data:image/svg+xml,…"`, `drawImage` onto a `<canvas>`, `toDataURL('image/png')`. The SVG's embedded photo is a same-origin `data:` URI so the canvas is NOT tainted and `toDataURL` succeeds. Ship the PNG on the seed; the bridge just writes bytes.
- **Persist for TRAVERSAL, not just vision.** A composite PNG gives vision but the model can't tell which palette color an arrow was or read a note's exact text from pixels. So also ship **structured JSON** (each mark: type, palette color NAME, coords, note text) and write a **folder** (`.seeds/seed-<stamp>/`: composite.png + photo.png + scribble.svg + scribble.json + a model-facing README.md). Vision (see it) + JSON (traverse it) + README (how to read it) together make user input fully legible.
- **Give the model a reader command + a craft skill, and WIRE it in.** A rich folder nobody reads is dead. Pattern (mirrors `/read-mindmap`): a `read-*` command (VIEW the png, read the json, synthesize INTENT, append to `brainstorm.md`) + a `reading-*` skill (the interpretation vocabulary) + a reference from `run-brainstorm` step 1 / the orchestrator front door / `brainstorm-phases`, so the intent ANCHORS round 1 and the build plan. Register in `.claude/agentic-surface-registry.json` + `.github/agentic-surface-registry.json` + a prompt mirror (the PostToolUse guard blocks an unregistered command on write).

## 2026-07-09 — an rAF overlay animation has a whole class of lifecycle bugs a unit test can't see — adversarially review the loop

An adversarial multi-lens review of the wayfinding pulse (a fixed rAF SVG overlay) surfaced 8 real bugs that build+unit+journey tests all passed over. The pattern: **the geometry is unit-testable, but the LOOP LIFECYCLE and the DOM-tag coupling are where the bugs live**, and only reading-the-code review finds them.

- **rAF started on mount can leak a SECOND loop.** Requesting the initial frame unconditionally, plus a `visibilitychange` handler that requests another without cancelling first, = two self-rescheduling loops (double speed + a loop that survives unmount, since cleanup only cancels the last id). Fix: ONE guarded `start()` (`if (raf || mq.matches || document.hidden) return`) + `stop()` that zeroes `raf`; route mount, visibility, AND reduced-motion through them. Opening the tab in the BACKGROUND is the trigger the happy path never hits.
- **A per-frame "rebuild on signature change" teleports if you don't re-anchor the clock.** `t = (now - t0) % total` against a NEW `total` maps to an unrelated segment → the pulse jumps and smears its comet. Re-anchor `t0` (and clear the tail history) ONLY when the box KEY-SET changes (mount/unmount), NOT on pure geometry (scroll is perimeter-translation-invariant) or a state-flip that leaves `total` identical — those must stay continuous.
- **Two mounts of the "same" component double the DOM tags.** The revisit BoardSurvey and the live activeBoard BoardSurvey both mount, so `[data-guide]` returned two steps + two inputs and the pulse visited duplicates out of order. A shared component that emits guide tags needs a `guide?: boolean` prop so the caller can suppress the non-focused instance.
- **"Answered" ≠ "touched".** Sourcing a done/complete signal from `touched` (any interaction) greens a card while its send GATE is still closed (wreck needs 3 flaws, converge needs all triaged). Use `gate.ok && touched` — the real "you've done enough to send" signal already exists; reuse it.
- **prefers-reduced-motion read once at mount goes stale.** Toggling it OFF later leaves the pulse frozen (CSS un-hides it but no loop ever started). Add a `matchMedia('change')` listener.
- **Graceful-degradation vs bug is a judgment call — name it.** "busy → circle nav only" silently shows NOTHING on mobile (nav is `display:none`). Real behavior, but acceptable (no visible nav to circle) — decide and document, don't leave it ambiguous.
- **How to apply:** for any rAF/overlay/animation, run a review lens on the LOOP (start/stop/visibility/reduced-motion/unmount/double-loop) and one on the DOM-TAG COUPLING (double-mount, wrong "done" source, nested rects) — separate from the geometry unit tests. Verify each finding adversarially; ~half were refuted (several falsely claimed the feature "can't be built" against code that already built it).

## 2026-07-09 — chat on a LIVE board must not cost the user their draft: non-destructive detour + draft persistence

- **The blocking `present_board` can only be interrupted by resolving its promise — but resolving it via `acceptResponse` (the normal park) CLEARS `activeBoard`, which UNMOUNTS `BoardSurvey` and loses the user's in-progress dials/selections.** That is why the live board's option preview was chat-less. Fix: a NON-DESTRUCTIVE detour — for `command==='artifact-chat'`, resolve the pending resolver DIRECTLY (`this.pending.get(id)` → `resolve(response)`) WITHOUT `acceptResponse`, so no park response is recorded and `activeBoard` stays. The board never unmounts (React keeps state because `key={activeBoard.id}` is unchanged); the orchestrator answers then re-enters `present_board` on the same board to re-arm. Make `recordBoard` idempotent by board id so the re-present doesn't duplicate the round.
- **"Persist all the generation meta" = persist the in-progress answer, and it doubles as the restore path.** A board draft is just an un-submitted `BoardResponse` (rule 5 — reuse the schema, don't invent a shape). Debounce-POST it to `/api/board-draft` → `round-NN/draft.json` (SEPARATE from `response.json` so a draft is never mistaken for a submission), ride it on `StudioState.drafts` + a `draft` WS envelope, and restore via the existing `initial` prop. Exclude `respondedAt` from the debounce change-key or the timestamp makes it fire every render.
- **Unify by passing the chat DOWN, not by lifting all the draft state UP.** `BoardSurvey` owns a dozen pieces of draft state; lifting them to App to share ONE fullscreen is a huge refactor. Instead App exposes slug-parameterized chat helpers (`messagesFor`/`busyFor`/`onSend` keyed by `option:<board>:<opt>`) and BoardSurvey renders the SAME `ArtifactFullscreen` with a `chat` prop. "Same fullscreen view" means the same component + layout on every surface, not literally one element. Refactor per-subject busy from a single `chatSentAt` number to a `Record<slug, count>` so two surfaces share it.
- **Adding a field to `StudioState` breaks the canonical shape tests — that's the guardrail working.** `tests/canonical/api/state-200.json` and the WS-hello proof assert the EXACT key set; add the new key there in the same change (and to the api-matrix census if it's a new endpoint). A green shape test after a state change means you updated the canonical; a red one means you forgot.
- **How to apply:** when a UI action must interrupt a blocking wait without discarding the user's work, resolve the wait non-destructively (don't run the full submit/clear path) AND persist the work-in-progress to disk (which also gives you free recall + restore). Don't lift big local state to share a child — pass a small callback API down.

## 2026-07-09 — A handoff that carries a UI structure: move the SHAPE and its DEFAULT DATA into protocol

- **When an orchestrator→studio handoff needs to carry a UI structure (here the New Discussion
  intake survey), the structure's TYPE belongs in `packages/protocol` (rule 5), not in the
  component.** `SurveyQuestion` lived in `apps/studio/.../Survey.tsx`; the moment `SeedBrief`
  needed to ship a bespoke question set (`open_studio` `questions`), the type became a wire
  contract. Move it to protocol as a zod schema (`SurveyQuestionSchema` + inferred type) so the
  MCP tool param validates against the SAME shape the studio renders. Keep the studio module as
  the single import site by re-exporting: `export type { SurveyQuestion } from '@visual-brainstorm/protocol'`
  in `Survey.tsx` — no churn at the ~dozen call sites.
- **Promote the DEFAULT DATA too, not just the type.** The blank-UI preset became
  `DEFAULT_INTAKE_QUESTIONS` in protocol, so one canonical set is referenced by the panel (blank
  path), the tool description, the wiki, and the agent prose. A default that lives in a component
  can't be cited by the layers that need to describe it.
- **Design principle the operator insisted on: a handoff REPLACES, it doesn't pigeonhole.** The
  orchestrator authors creative questions anchored to THIS brief; they *replace* the preset in the
  panel rather than pre-filling a fixed set. The generic preset is only the fallback for a UI-started
  New Discussion where Claude hasn't heard the idea. Encode "author your own, don't reuse the preset"
  in the tool description + `run-brainstorm` step 0a + the orchestrator agent, or the model defaults
  to the safe-looking preset every time.
- **Layout must stop hardcoding ids once the set is variable.** The panel had hand-placed rows
  (`questionBox('making'), questionBox('vibe')`, …). A handoff set of arbitrary count/ids breaks
  that — chunk a flat `formBoxes` array two-per-row generically instead; the fixed-five output is
  byte-identical, so nothing regresses.

## 2026-07-09 — Concurrent working tree: a red human-sim can belong to another session's untracked WIP

- **In a heavily shared working tree, `npm test`'s human-sim can fail on a feature you never
  touched.** Here it failed at the PhotoScribble "annotate the photo" step. Attribution: `git status`
  showed `PhotoScribble.tsx` as UNTRACKED (`??`) and `human-sim.mjs` as modified with freshly-injected
  diagnostic code (a synthetic-PointerEvent probe logging `[diag after canvas click]`) — i.e. someone
  is mid-debug on that exact failure right now. Prove your innocence by reading the failing handler
  (the note-input was gated purely by PhotoScribble's own `onDown`/`pending` state, self-contained) and
  confirming your change renders the component with identical props. Then report BLOCKED-by-other-plan,
  don't "fix" it (rule 9: not in scope; racing their loop corrupts both).
- **Closeout verify is build + smoke, NOT the full human-sim** (`/plan-closeout` step 2) — precisely so
  an unrelated in-flight UI feature can't block an otherwise-green plan from closing. Your feature's real
  proof was on its OWN surfaces: `protocol.test` (schema/default), `smoke.mjs` (real-bridge SeedBrief
  round-trip), `ui-smoke` (real-component render proving bespoke questions replace the preset).

## 2026-07-09 — Scoped-tools subagents don't inherit MCP tools; name them or the call silently fails

- **An agent whose frontmatter `tools:` is an explicit allowlist gets ONLY those tools — MCP
  tools are NOT included implicitly**, even though they're registered in `.mcp.json` and
  available to the main session. `wiki-librarian` had `tools: Read, Edit, Write, Grep, Glob`
  and therefore could not call `wiki_reload` at all; the "binding reload after every edit"
  contract would have silently no-opped in that agent. Fix: add the exact
  `mcp__<server>__<tool>` names (e.g. `mcp__visual-brainstorm-wiki__wiki_reload`) to the
  allowlist. Agents with `tools: All tools` / `*` get MCP tools for free — only scoped agents
  need the explicit wiring.
- **Corollary: when you give a scoped agent a new MCP-backed duty, widen its `tools:` in the
  SAME edit.** A duty in the prose that the tool list can't satisfy is a dead letter — grep the
  frontmatter, don't assume registration is enough.

## 2026-07-09 — Harness model-picker scoping: enforce `engineIds` at the bridge, not the selects

- **The `engineIds` field on `ModelCatalogEntry` already existed as the harness-scoping mechanism
  — but nothing enforced it.** The bridge served the whole configured catalog and both composer
  `<select>`s (`NewDiscussionPanel`, `BoardSurvey`) filtered only on `capabilities.delegate`. It
  *looked* correct because the defaults are all `claude` + runtime is `claude`; a Copilot/CODEX-only
  entry would have wrongly appeared in a Claude session. Lesson: a field that documents an intent
  ("which runtimes can honestly delegate to this model") is not a guarantee until a filter reads it.
- **Enforce it once, where the runtime is authoritative: the bridge constructor.** `Bridge` already
  holds `this.runtime`; filtering `modelsList` to `engineIds.includes(this.runtime.id)` at
  construction makes the served `state.models` the single "usable on this harness" list. Every
  downstream consumer (both selects, the `modelLabels` map) is then correct for free — no need to
  thread `runtime` into `BoardSurvey` (which doesn't even receive it). Prefer the one authoritative
  filter over duplicating a client-side check per select.
- **Legacy string models are self-matching, so the filter is safe by default.** `normalizeModel`
  stamps a string-configured model with `engineIds: [runtime.id]`, so it always passes the filter;
  only *explicit* cross-harness object entries are withheld. A misconfigured all-Copilot catalog in
  a Claude session yields an empty picker — which is the honest outcome, not a bug.
- **When a UI journey test fails during an unrelated fix, attribute before touching it.**
  `test:human:archived` failed on "no chat composer on archived threads" — but the working tree
  already carried the separate `artifact-chat-everywhere` WIP that deliberately made archived chat
  interactive (`onSend: sendFsChat` unconditionally). The failing assertion belongs to that in-flight
  feature, not the model-list change. `git diff <file>` on pre-modified paths confirms ownership fast.

## 2026-07-09 — New Discussion box/layout polish: legend misalignment, sticky-flush composer, global radius, row-coupled collapse

- **A native `<legend>` never aligns with padded fieldset content.** The browser renders a legend
  specially — it breaks the top border and uses its own inline offset — so it sits left of and
  above a `p-4` box's real content (looks "off"). If the answer group already has an `aria-label`,
  the legend is redundant: replace it with a plain heading `<div>` inside the box. Corollary bonus
  in this repo: the old collapsible shell used Tailwind `capitalize` on titles, which mangled
  full-sentence question headings ("Scribble a seed" → "Scribble A Seed") — drop it.
- **A bottom-anchored `sticky bottom-0` composer only sits FLUSH to the window if the scroll
  container's bottom padding is zeroed.** `<main>` had `pb-8` and the content column `pb-6`; sticky
  sticks to the padding edge, leaving a ~56px gap where lower content peeks out below the composer.
  Zero those paddings in the landing view (`newOpen || landing ? 'pb-0' : 'pb-8'`) and it's flush.
  Then an auto-growing `<textarea>` (height=scrollHeight on input) makes the box extend UPWARD for
  free, because the bottom edge is pinned. Prove it by pausing at a short viewport: composer
  `getBoundingClientRect().bottom === innerHeight` while `main.scrollTop > 0`.
- **Reskin every corner in ONE place via Tailwind v4 `@theme --radius-*`.** Overriding
  `--radius-xs … --radius-4xl` to a constant (5px) makes every `rounded-{sm..3xl}` uniform without
  touching a single component; leave `rounded-full` so pills/status-dots/avatars stay circular.
  Verify with `getComputedStyle(box).borderRadius === '5px'` and the pill still ~1e7px.
- **Row-coupled collapse needs EXPLICIT rows in the data model, not CSS grid auto-flow.** To make
  "collapse any box → its whole row collapses," model the panel as `rows: BoxDef[][]` and key the
  collapse state by `row[0].id`; a single auto-flow grid can't tell you which items share a visual
  row. Explicit rows also let a non-question box (Colors) fill the last question's empty grid slot
  instead of dropping to its own row.
- **How to apply:** for any "boxed form" surface, use one shared collapsible Box shell + an explicit
  rows model; never rely on `<legend>` for visual headings; and for a pinned composer, zero the
  scroll container's bottom padding (flush) rather than nudging the sticky offset.

## 2026-07-09 — driving an SVG pointer canvas from raw CDP: three gotchas that all look like "the handler is broken"

- **Context:** proving the "annotate a photo seed" pad (`PhotoScribble`) end-to-end in `human-sim.mjs` — pen drag, text note, arrow — cost ~8 failed runs, each looking like the React handler didn't fire. It always did; the harness/interaction was wrong. Diagnose these by DISPATCHING a native `PointerEvent` on the element in-page: if that opens/draws, the handler is fine and the problem is CDP input delivery or interaction timing.
- **CDP `Input.dispatchMouseEvent` fires `pointerdown` on the first MOVE-with-button, NOT on a bare stationary press.** A long multi-move DRAG (pen/arrow) reliably triggers React `onPointerDown`; a stationary tap (press+release same point) often does not. For a click-to-place interaction (the text-note popover) don't fight it — dispatch a real `new PointerEvent('pointerdown', {clientX,clientY,buttons:1})` on the canvas (same real handler, real state, real seed). This is the SAME real-handler tradeoff the mindmap step already makes by calling `mind.selectNode()` directly ("CDP coords unreliable on the transformed canvas").
- **`setPointerCapture` in `onPointerDown` is NOT implicitly released by CDP's synthetic `pointerup`** (real browsers release on pointerup). A pad that captures on every press then swallows the NEXT tool's `pointerdown` — pen works, the following text/arrow silently do nothing. If the drawing surface is bounded and has `onPointerLeave={end}`, capture buys nothing — drop it (fixed `PhotoScribble`). This was a real latent bug, not just a test artifact.
- **React 18 flushes `pointerdown` synchronously, so a click-to-open-a-focused-input opens AND focuses on PRESS; the tap's own release/click then blurs the still-empty input and an `onBlur→discard` cancels it.** A human never sees this (their release lands on the input under the cursor). In a harness: open with a dispatched pointerdown (no release), type, commit, done.
- **A drag handler that reads `draft`/state from the closure drops fast flicks.** `onMove`/`onUp` computed the arrow from the `draft` closure, which is `null` until the setState renders — a rapid CDP drag fired all moves before the first render, so the arrow stayed length-0 and never committed. Fix: functional updates (`setDraft(prev => …)`, and commit inside `setDraft(d => { …; return null })` in `onUp`). Real fast pointers hit this too.
- **How to apply:** when a real-browser pointer test on an SVG canvas "does nothing," first dispatch a native `PointerEvent` to split handler-bug from input-delivery; prefer real CDP DRAGS for strokes and a dispatched pointerdown for taps; never `setPointerCapture` on a bounded pad; and make drag state updates functional so a flick can't outrun a render.

## 2026-07-09 — "I don't see my chat bubble": a WS-echo-only chat is fragile; add optimistic echo + a REAL-browser send test

- **`human-sim*.mjs` ARE real-browser harnesses (raw CDP → headless chrome.exe), NOT jsdom.** (A sibling learning below claims "this repo has NO real-browser harness" — that is WRONG; `smoke:ui` is jsdom, but `human-sim`/`human-sim-archived`/`human-sim-livechat` launch a real browser, dispatch real `Input.dispatchMouseEvent`/`insertText`, and read real `getBoundingClientRect`/`textContent`.) They DO flake in a loaded sandbox: `no DevTools endpoint within 40s` (launch) and `Input.dispatchMouseEvent: no reply within 20000ms` (input hang) are ENVIRONMENTAL (too many concurrent browser trees starving CPU), not product bugs — distinguish by the failure step (`bootstrap`/CDP = env; an assertion message = real). Retry after other browser runs finish.
- **A chat that renders the user's OWN message only via the WS round-trip is fragile.** `postChat` deliberately did NOT append locally ("persistence is the single truth; the message returns over WS") — so the bubble's appearance depended on the envelope arriving AND passing the `discussionId` routing guard AND the fullscreen reading the right source. Any edge (reconnect, dropped frame, a snapshot-vs-live mismatch) = the user sees NOTHING after Send. Fix: **optimistic echo** — append the user message to a local `pendingChats` overlay immediately, merge it into `fsMessages` (de-duped by role+text against persisted), prune once the persisted twin arrives, roll back on POST failure. The server still persists independently (`announceArtifactChat`), so truth is unchanged; the DISPLAY just stops depending on WS timing.
- **The happy path passing in a browser did NOT mean "ready": no browser journey TYPED a message.** `human-sim.mjs` asserted the composer EXISTS but never sent; `human-sim-archived` covered only the archived (`subscribeChat`) route. The live `useBridge`-reducer send→echo was unproven. Added `scripts/human-sim-livechat.mjs` (gated in `npm test`): seed a LIVE thread + keep on disk → default view → click keep AND a round-history option → type + Send → assert the user bubble is in frame AND persisted (`/api/state` + disk `SessionStore.open`), for BOTH the artifact slug and the `option:<boardId>:<optionId>` slug.
- **How to apply:** any "send X and see it" UI must (a) echo optimistically so the human gets instant feedback independent of the network, and (b) have a real-browser test that actually TYPES and asserts the sender's own item renders — "the composer exists" is not "sending works."

## 2026-07-09 — a single traveling "wayfinding pulse" is an OVERLAY problem, not a per-box CSS problem

- **The operator framed it as "modify the generic box style + closest-point," but there is no shared box class** (boxes are ad-hoc Tailwind `rounded-* border border-line bg-surface`), and — more decisively — a single pulse that flies *between* boxes across the gaps and hands off CANNOT be a per-box `conic-gradient` border (each is independent and can't cross the gap or coordinate "one at a time"). The right shape: tag boxes with a `data-guide` attribute (`hub`|`step`|`input`) + a `data-guide-done` dirty flag, and ONE fixed full-viewport SVG overlay (`GuidePulse`) that reads those rects each frame, traces each rounded-rect perimeter, and animates a comet along perimeter-laps + straight closest-point links. Keep ALL geometry DOM-free in `apps/studio/src/lib/guidePath.ts` so it's unit-testable; the component is just DOM-read (`collectBoxes`) + rAF render.
- **Reuse the surface's own "answered" signal for the dirty flag — don't invent one.** `BoardSurvey`'s existing `touched` is exactly "the user has acted," and it's already true when a response is prefilled via `initial` (revisit), so "prefilled = answered ⇒ skip" falls out for free. New-discussion uses `canStart` (brief typed or seed prefilled). Concierge/gallery cards unmount on answer, so presence = actionable (no flag needed).
- **`vite dev` serves despite `tsc` errors; `vite build` does not.** The studio `build` is `tsc --noEmit && vite build`, so an in-flight WIP type error (here: a half-done `SurveyQuestion` move into `packages/protocol` left a duplicate decl in `Survey.tsx` + a cascade in `NewDiscussionPanel`) turns `npm run build` AND `npm test` (via `smoke:ui`? no — build) red across the board. To attribute a red build, filter the tsc output by file: if zero errors touch your files, it's not yours — don't "fix" the operator's WIP (rule 9). The dev server still runs the real app for a live drive.
- **This repo has NO real-browser harness** (`smoke:ui`/`human-sim` are JSDOM + `renderToString`; rAF/`getBoundingClientRect` don't work there). So an animation's PIXELS can't be auto-verified — prove the geometry with executed unit tests (added `tests/guide-path.test.ts`, run via a new `test:ts` = `tsx --test`), prove the TAGS ship by asserting `data-guide="…"` in the real `BoardSurvey` server-render (`smoke:ui`), and owe the live visual to the operator (or a live Claude-Code drive of `vite dev`).
- **How to apply:** for "one animated thing that moves across multiple elements," reach for a tagged-element registry + a single overlay driver, not N per-element CSS animations. Put the math in a pure module and test it; tell the operator the moving-pixels check is theirs when the repo lacks a browser runner.

## 2026-07-09 — "chat on every artifact" was already 90% built; the gap was thread-scope + an idle answerer, not the surface

- **Before building a "missing" feature the operator asked for repeatedly, trace the whole existing pipe end-to-end first.** The artifact-chat surface, POST/reply/WS round-trip, and unit+smoke coverage already existed and passed — the real gaps were narrow: (1) the composer was gated to the live thread (`onSend: viewingLive ? … : undefined`), and (2) the chat was single-thread (`/api/artifact-chat` + `reply_artifact_chat` only touched the one live `store`). Fixing the gaps was ~a dozen surgical lines across protocol/bridge/studio, not a rebuild. Reading the plumbing first turned a vague "make chat work" into a precise diff.
- **The bridge holds exactly ONE live thread (`this.store`); archived threads are read-only snapshots (`GET /api/discussions/:id`).** To make an archived artifact chattable, thread-address the chat: add optional `discussionId` to `POST /api/artifact-chat`, `reply_artifact_chat`, and the `artifact-chat` WS envelope; `resolveChatStore(id)` returns the live store or `SessionStore.open`s the archived one in place (disk is truth). `ArtifactChatMessage` itself stays unchanged — its owning thread is its folder; `discussionId` is transport-level routing only.
- **The studio's live `state` (from `useBridge`) is the LIVE thread only; the archived view lives in App's `archived` snapshot and never hears WS state.** Route replies by `discussionId`: guard the live-state append (`msg.discussionId !== state.session.id` → skip) AND expose a `subscribeChat` side-channel so App appends the matching envelope to `archived.artifactChat`. Fire subscribers OUTSIDE the `setState` updater (StrictMode runs updaters twice).
- **Revisions can't be answered in place on an archived thread — `capture_artifact` writes the LIVE store.** So an archived change-request is answered honestly ("reopen to revise"); only questions are fully in-place. Encoded in the seedNote + `.claude/commands/artifact-chat.md` (rules 6/7).
- **The browser (CDP) human-sim layers can't run in every sandbox** (`no DevTools endpoint within 40s`) — they no-op/exit-0 there, so a green `npm test` does NOT prove a UI change locally. Prove UI-adjacent logic on the REAL bridge + WS in `tests/api-status-matrix.test.mjs` (which DOES run), update the browser journey's assertions to the new behavior anyway (so it's correct when a real browser runs it), and tell the operator the browser journey is owed on their machine. **When you flip a journey assertion (archived "no composer" → "composer present"), the old assertion would now FALSE-FAIL a correct build — updating it is part of the change, not optional.**
- **How to apply:** for "add X everywhere" asks, grep the existing feature first; if it's single-thread, the cost is usually just threading an id through 3 layers + routing the WS reply — not new machinery.

## 2026-07-08 — the crowned methodology was orchestration-gated, not structural — and the human-sim FAKED the orchestrator, hiding it

- **A UI surface that appears only when a live model calls a tool is NOT tested by a harness that calls that tool ITSELF.** The concierge→gallery intake showed only when a real session invoked `ask_concierge`/`present_gallery`; `human-sim.mjs` called `bridge.presentGallery(...)` directly, so it proved the studio CAN render a gallery but never that a real run PRODUCES one. A user hit exactly this ("I still see the og new discussion surface"). Rule: a test that calls a surface's own producer proves nothing about the real path — flag `faked-orchestrator` risk explicitly (see `tests/journeys.md`), and make the guarantee STRUCTURAL, not prompt-hoped.
- **Prompt-level "MANDATORY" is not enforcement — gate it server-side.** The fix that actually locks the methodology in: the `present_board` MCP tool refuses the FIRST board of a fresh thread until a Living Gallery pick was made (`bridge.intakeComplete`, set in the gallery resolver, reset on `attachStore`). Harnesses that call `bridge.presentAndWait` directly bypass the tool guard, so they don't false-fail — put the gate at the TOOL boundary, not in `presentAndWait`. Unit-testable without a model (`tests/intake-gate.test.mjs`).
- **How to apply:** for any "the procedure must be followed" requirement, ask "can the model skip a step and still succeed?" If yes, add a structural refusal at the tool/bridge boundary; a `run-brainstorm.md`-style instruction alone will drift.

## 2026-07-08 — visual false-greens: `querySelector('svg')` / a testid / a 200 is not proof; assert the canonical DATA

- **The decision-tree journey's `!!v.querySelector('svg')` check passed on BOTH failure modes:** App.tsx's `decision tree unavailable` error-fallback `<svg>`, AND (with no svg yet) the "building the decision tree…" loading state. A broken/empty decision tree reported green. Fix: wait for the SPECIFIC canonical content — the mind-map round's `edited: <root topic>` label rendered as `<text>` (proven present deterministically via `decisionTreeToSvg`, then asserted in `human-sim`). This is the donor `frontend-tester` L-152 lesson, reproduced live.
- **An HTTP handler that can throw BEFORE writing a response hangs the client forever.** `GET /api/decision-tree/:id` ran `decodeURIComponent` + `SessionStore.resolveDir` OUTSIDE its try/catch; a throw there escaped the handler with NO `res.end`, so the studio's `await fetch` never resolved → overlay stuck on "building…". Rule: the ENTIRE handler body (id parse + path resolve included) goes inside the try that guarantees a 200/404. The stricter canonical-content assertion is what surfaced it — a bare svg-exists check would have "passed" the hang once any svg eventually appeared, or timed out ambiguously.
- **CPU starvation, not a bug, when browser-driven steps flake under multi-session load.** With 3+ node processes + a concurrent session saturating the machine, a local `/api/decision-tree` fetch exceeded a tight 15s step timeout intermittently (passed when quiet). Widen browser-step timeouts (→30s) for load tolerance WITHOUT weakening the assertion (still refuses loading/error states, so a true hang still fails). Distinguish flake from bug via the failure screenshot (`Page.bringToFront` + `captureScreenshot`) — it showed the literal "building…" veil, pinpointing the stuck fetch.

## 2026-07-08 — shared-tree closeout: attribute a build break by LINE-NUMBER DRIFT before touching it

- **A `tsc` error whose reported line no longer matches the file's current content means a concurrent session is editing that file RIGHT NOW** — the build ran against an in-flight version. Observed: `NewDiscussionPanel.tsx(266,25): 'stroke' implicitly any` while line 266 was `};`. Do NOT fix it — it isn't your plan's. `/plan-closeout` step 2: attribute, don't race; do the build-independent closeout work (learnings/commands/wiki), re-verify after their loop converges, and only then archive/commit.

## 2026-07-08 — mind-elixir v5 API: it's `removeNodes([Topic])`, NOT `removeNode()` — the optional-chain hid a dead feature

- **`mind.removeNode?.()` silently did NOTHING** because mind-elixir 5.13.0 has no `removeNode`
  method at all — the delete method is `removeNodes(tpcs: Topic[])` (plural, takes an ARRAY of
  Topic elements). The optional chain `?.()` swallowed the missing method, so the Delete button
  appeared wired but was a no-op — and every green test missed it because none actually asserted a
  node was gone. Correct call: `mind.removeNodes([mind.findEle(id)])`, and guard the root
  (`mind.nodeData.id === id`) since mind-elixir won't remove it. **Lesson: optional-chaining a
  third-party method you're not 100% sure exists converts "typo/renamed-API" bugs into silent
  no-ops — verify the method name against the installed version's `.d.ts` first.** For adding
  children with a chosen topic: `const n = mind.generateNewObj(); n.topic = '…'; mind.addChild(el, n)`.
- **CDP mouse-clicks don't reliably select mind-elixir nodes** (it renders on a transformed/scaled
  canvas, so the element's viewport-rect center often isn't the hit target). Driving the engine's
  real `selectNode(mind.findEle(id))` is the honest harness pattern (it's the same method a human
  click invokes internally) — the ACTIONS stay real button-clicks and assertions read the real
  `getData()`, so nothing is faked. Also: gate a selection wait on the SPECIFIC node's topic showing
  in the action bar, never just "bar enabled" — a prior step's selection makes "enabled" false-pass.
- **Explode is now an immediate, deterministic expansion, not a deferred marker.** Clicking Explode
  fans the node into 5 topic+note-anchored PROMPT children (`<topic> · <note> — <facet>`) via the
  real engine, so the user witnesses ≥5 options instantly and a different note yields a different
  set — no model, no fake. The `explode` op still rides back so a live orchestrator ENRICHES each
  prompt into a real idea (reshape the placeholder), rather than generating from nothing.

## 2026-07-09 — studio liquid-chrome effects: global CSS over Tailwind, animated conic borders, aurora z-order, transient-UI screenshots

- **A global surface treatment over Tailwind utilities must set ONLY `background-image`, never
  `box-shadow`.** Tailwind's `shadow`/`shadow-md` set `box-shadow` via `--tw-shadow`; a plain
  `.bg-surface { box-shadow: … }` rule (same single-class specificity, later in source) silently
  clobbers those — e.g. the Send & iterate button loses its drop shadow. `background-image` layers
  over `background-color` on the SAME element (different property, no conflict), so the chrome
  gloss composes with every existing shadow. This is how you skin "all surfaces" with one rule
  and zero per-component edits.
- **Animating a conic-gradient's angle REQUIRES a registered `@property`.** You cannot animate
  `conic-gradient(from Xdeg, …)` in a keyframe directly. Register `@property --chrome-angle {
  syntax:"<angle>"; inherits:false; initial-value:0deg }`, drive it with `@keyframes { to {
  --chrome-angle:360deg } }`, and reference `from var(--chrome-angle)`. One registered angle +
  the `padding + mask (linear-gradient content-box, linear-gradient) + mask-composite:exclude`
  ring technique gives you a "star spinning around the border" for any element (nav edge glow AND
  the send-prompt reveal share it).
- **A `position:fixed; z-index:0` background paints OVER static siblings.** Positioned/z-indexed
  siblings need explicit `relative z-10`, but the real trap is a responsively-static element:
  App.tsx's nav wrapper is `fixed inset-0 … lg:static`, and on `lg` the static nav was painted
  under the fixed aurora. Fix: `lg:relative lg:z-10` (mobile stays `fixed z-30`). Aurora itself
  must be `pointer-events:none` so it never eats clicks.
- **Screenshot a transient in-flight UI state by PAUSING its request over CDP, not by racing it.**
  The "sending…" prompt reveal only exists during the `/api/respond` round-trip (~ms on
  localhost). `Fetch.enable({patterns:[{urlPattern:'*/api/respond*',requestStage:'Request'}]})` +
  capturing `Fetch.requestPaused` holds the request open so the real app renders the real state
  under a real (paused) request; screenshot, then `Fetch.continueRequest`. Honest proof, nothing
  faked (rule 10). Reusable for any optimistic/pending UI.
- **The effects are theme-driven by construction** — aurora, nav glow, chrome gloss, and the spin
  border all read `--accent`/`--surface(-2)` via `color-mix`, so a new theme re-skins them for
  free, and every animation is gated behind `@media (prefers-reduced-motion: reduce)`.

## 2026-07-08 — porting the donor wiki-mcp: ESM/SDK rewrite + dependency-free + granular read

- **The donor `apps/wiki-mcp` (`C:\Code\tp`) is CommonJS + a hand-rolled JSON-RPC stdio loop +
  `fuse.js`/`express`/`helmet`/`cors`.** This repo is ESM/NodeNext and already depends on
  `@modelcontextprotocol/sdk`, so the faithful port is a REWRITE, not a copy: `McpServer` +
  `StdioServerTransport` (matching `apps/mcp`), a dependency-free relevance scorer (title-weighted
  term coverage, content frequency saturating at 3), and stdio-only (no HTTP mirror — the client
  is Claude Code). Fewer deps than the donor, same tools.
- **A new workspace under `apps/*` must be `npm install`-linked BEFORE `tsc`** — adding the dir +
  package.json isn't enough; the build script (`-w apps/wiki-mcp`) and any `tests/*.mjs` importing
  its `dist/` fail until `npm install` registers the workspace. Sequence: write package.json →
  `npm install` → build → test.
- **`WIKI_PATH` resolves module-relative, not cwd-relative.** MCP servers launch with cwd = the
  invoking project, so cwd is unreliable for finding THIS repo's `wiki/`. Resolve from the module:
  `path.resolve(dirname(fileURLToPath(import.meta.url)), '..','..','..','wiki')` (three `..` from
  `apps/wiki-mcp/dist/`), env `WIKI_PATH` overrides. ESM has no `__dirname`.
- **Context-shaping is the whole point of a read MCP.** Two levers: (1) SEARCH returns one bounded
  ~200-char snippet + metadata per hit, never page bodies, default limit 8 / max 25; (2) GRANULAR
  READ — `wiki_outline` (heading tree only) → `wiki_read(path, heading)` returns ONLY that
  heading's subsection (proven: 1467 chars vs a ~4KB full page), and a full read over the char cap
  truncates WITH the outline attached so the caller can pull one heading. Prove the stdio path with
  a scratchpad JSON-RPC probe (initialize → tools/list → tools/call), not just unit-testing the
  pure functions.

## 2026-07-07 — mind-elixir: a per-node action bar must bind to the engine's OWN selection, not the bus

- **`mind-elixir`'s `selectNode(el)` called PROGRAMMATICALLY does NOT fire the `selectNode` bus
  event, and does not reliably fire it on click either across versions.** A React action bar that
  enables itself when a node is "selected" will therefore never light up if it only listens to
  `bus.addListener('selectNode', …)`. This bit the human-sim node-controls step: the test did
  `mind.selectNode(mind.findEle('c1'))` and the bar stayed disabled → 15s timeout.
- **How to apply:** derive selection from the engine's own state, three ways belt-and-suspenders:
  (1) monkey-patch `instance.selectNode` to run a `readSelection()` on a `setTimeout(…, 0)` after
  the original (covers programmatic selection, incl. test drivers); (2) add a real `click` listener
  on the engine container that re-reads selection a tick later (covers human clicks); (3) keep the
  `selectNode`/`selectNodes` bus listeners as a bonus. `readSelection()` reads
  `mind.currentNode ?? mind.currentNodes?.[0]`, then the data via `el.nodeObj ?? el`. The human-sim
  driver's real CDP mouse `click` on `…mindmap-engine.mind.findEle(id)` then flows through path (2).
- **Node notes must live OUT-OF-BAND and be folded into `editedTree` on emit.** mind-elixir does not
  round-trip arbitrary custom fields through `getData()`, so a per-node note kept only on the engine
  node can vanish. Keep notes in a `Record<nodeId,string>` ref and walk+attach them onto the tree in
  the `onEdit` emitter, so the note always rides back even when no structural edit fired.

## 2026-07-07 — shared-state schema widening: normalize legacy bridge/test callers at the boundary, not at every callsite

- **When a protocol/config field widens from a scalar to a structured object, older bridge callers in `tests/` and `scripts/` will keep constructing the old shape long after the main app path is updated.** In this slice, `models: string[]` became a structured catalog and `runtime` became explicit metadata. The least-destructive rollout was to normalize legacy strings and missing runtime metadata at the `Bridge` boundary, while keeping the studio's `EMPTY` state seeded for version skew. That let `/api/state` and `hello` become authoritative immediately without forcing every smoke/human-sim helper to learn the new shape in the same edit.
- **How to apply:** for a provider-aware schema change, update `packages/protocol` first, then add compatibility normalizers at the first shared boundary (`config.ts`, `BridgeOptions`, `useBridge` defaults) before touching all test helpers. After that, update only the explicit assertions/canonical fixtures that care about the emitted shape. This keeps the rollout local, preserves older harness callers, and avoids a repo-wide edit burst for a single contract change.

## 2026-07-07 — shared-tree commit trap: a plain `git commit` grabs another session's STAGED changes

- **In a shared working tree, `git add <my-files>` then `git commit` will ALSO commit whatever a
  concurrent session left STAGED — most dangerously staged DELETIONS (`D ` in column 1 of
  `git status --short`).** I staged my two clean files and committed; the commit swept in a peer's
  staged `ArtifactChat.tsx`/`PreviewModal.tsx` deletions (their ArtifactFullscreen refactor),
  contaminating my commit AND breaking HEAD (the old committed `App.tsx` still imported the now-
  deleted files). `git status` working-tree view hides this — you must inspect the INDEX. Rule:
  before committing in a shared tree, run `git diff --cached --name-status` and confirm ONLY your
  paths are staged; if foreign changes are staged, either `git restore --staged .` first then
  re-add only yours, or use `git commit --only <exact paths>` (which ignores the rest of the index).
  Recovery from a contaminated commit: `git reset --soft HEAD~1` → `git restore --staged .` →
  re-add only your files → recommit.
- **The entangled-shared-file "leave it to ride their commit" pattern works in practice.** My
  one-line `App.tsx` scroll-fade hunk (entangled with a peer's big in-flight refactor of that file)
  and my `ui-smoke.ts` marker change were both unblocked when the peer's closeout committed those
  files — the scroll-fade hunk landed inside their `eedece9` closeout (verified via
  `git grep <hunk> HEAD -- App.tsx`), and ui-smoke.ts became clean-editable once they committed it.
  In a hot tree, origin/main advances between your own pushes; each `git push` just fast-forwards
  your stacked commit — check the `A..B` range to see what a peer landed in between.

## 2026-07-07 — the preview/fixture harness was a false-confidence second path — deleted; real pathways only

- **A fixture "preview" harness that renders the studio's surfaces without a real session is a
  trap, not a safety net.** `apps/mcp/src/preview.ts` (`npm run preview`/`demo`, `engine:'preview'`)
  played both ends with static fixtures, so a surface could look "verified in preview" while the
  REAL agentic path (a live Claude session calling `open_studio`/`ask_concierge`/`present_gallery`/
  `present_board`) was never exercised. The operator's rule: "if it only works in preview the app
  is a brick." We deleted the harness AND its sole reason to exist — the `StudioState.engine`
  `'claude'|'preview'` discriminator (protocol + bridge + studio + all harnesses + canonical
  `state-200.json`). Sessions are now always the real Claude engine; the `enginePreview` "no
  generator" banner in `NewDiscussionPanel` went with it.
- **How to apply:** never add a fixture player as a proof surface. UI/behaviour is proven by the
  REAL pathways ONLY — `npm run test:human` (real `Bridge`, real built studio dist, real browser
  over CDP), `npm run test:human:sweep`, `npm run smoke` (real transport), or a live Claude session
  for eyeballing. When you catch yourself building a second, generator-less path "just to see the
  UI," stop — drive the real one. The `engine` field's deletion is the pattern: a discriminator
  whose only values are "real" and "fake" means the fake path shouldn't exist ([[rule 6 no-fake-success]]).
- **Verification gotcha (confirmed live):** removing a shared protocol field touches ~15 files —
  the field's producers (bridge `state()`, studio `EMPTY`), every in-test `Bridge` construction,
  and canonical bodies (`state-200.json`) — plus the `NewDiscussionPanel` prop threaded through
  `App.tsx` + `ui-smoke`. Grep the field name across `apps/packages/scripts/tests` and strip the
  property lines with a one-liner; then `node -e JSON.parse` the canonical JSON so a dangling comma
  doesn't slip through. Product "preview" UI (`SvgPane`, `ArtifactFullscreen`, option/artifact
  previews) is unrelated — do NOT touch it when deleting the preview HARNESS.

## 2026-07-07 — leaked headless browsers = silent token/time drain when iterating human-sim

- **A subagent that re-runs the CDP human-sim many times (iterating on test authoring)
  accumulates leaked headless `msedge`/`chrome` processes that compound into a large token
  AND wall-clock burn** — not a hang, but it *looks* like "consuming tokens with no results":
  each launch that times out on contention retries, and a 5-minute job stretches to 40+ min /
  300k+ tokens. Root cause: `killProfileStragglers` (`scripts/lib/cdp.mjs`) sweeps only the
  CURRENT run's profile path, so headless browsers from PRIOR runs (each with its own
  `vibr-*`/Temp `--user-data-dir`) survive and pile up (see the ui-break-sweep entry below for
  the orphaned-child mechanism).
- **How to apply:** when an agent will run `test:human`/`test:human:archived`/`test:human:sweep`
  repeatedly, sweep ALL leaked headless browsers between runs, not just the current profile's.
  Targeted census (never kill the user's normal browser — headless is only ever the harness):
  `Get-CimInstance Win32_Process | ? { $_.Name -match 'chrome|msedge' -and $_.CommandLine -match '--headless' -and $_.CommandLine -match 'vibr|Temp' }`
  then `Stop-Process -Force` (kill the whole tree; renderer/GPU children outlive the root on
  Windows). A single `npm test` from a clean process table is fine — the drain is from *looped*
  runs. This manual all-headless sweep is safe ONLY for a single agent that owns the machine.
- **Do NOT auto-kill every `vibr-*` browser at harness startup** — the harnesses are documented
  concurrency-safe (per-run `mkdtemp` profiles + ephemeral ports; `wiki/System/testing-observability.md`),
  and a blanket sweep would murder a *concurrent* session's `npm test` browser. The leak is
  because the per-run cleanup (`killBrowserTree` + `killProfileStragglers(profileDir)`) sits in a
  `finally` that a SIGINT/SIGTERM/SIGKILL of the node process skips — exactly what an agent
  restarting runs mid-iteration triggers. The concurrency-safe durable fix is to register that
  SAME per-run cleanup (its OWN `profileDir` only) on `SIGINT`/`SIGTERM` before exit; SIGKILL
  still can't be caught, so the manual sweep above remains the recovery path.
- **Coordinator hygiene:** a completed subagent cannot still burn tokens — if consumption
  "won't stop", it already finished; the live cost is the leaked OS processes, so census +
  kill them rather than trying to cancel an agent that is already done.

## 2026-07-07 — ui-changes wave (Completed nav, archived chat, reopen, slider tag, pin + unified viewer)

- **Widening a component from live-only to archived audits EVERY by-slug fetch it triggers.**
  Rendering `WayfinderStrip`/the fullscreen viewer for archived threads exposed a latent
  `GET /api/artifact-svg` gap: it only searched `this.store` (the one live thread), so a
  completed thread's captured SVG 404'd and the modal hung on "loading…" (a *soft* failure —
  the fetch was `.catch()`'d, so no crash, no test caught it). Fix: `resolveArtifactSvgPath`
  now falls back across live + `_completed` thread dirs (`path.basename` guards traversal).
  Lesson: when a surface stops being `viewingLive`-gated, trace every endpoint it hits for an
  archived-thread fallback — the sibling `GET /api/discussions/:id` already had one; the
  svg route didn't.
- **"Works in preview but not in a real run" is usually a `viewingLive` state gate, not
  preview-only slop.** The "missing divider button" was the revisit-round `⟲` action gated
  `viewingLive &&` — it only *appeared* to work in the preview harness because that harness
  makes every answered round the LIVE round. There was no preview conditional to delete.
  Check the live-state gate before hunting for harness slop.
- **Consolidating a component: grep the IMPORT, not just the obvious render sites.** An
  explore that mapped "two fullscreen click paths" (keeps→ArtifactChat, round-history
  options→PreviewModal) MISSED a third: `BoardSurvey.tsx` imported `PreviewModal` for the
  live-board option preview (editable per-option note, no chat). Deleting the component broke
  the build there. `grep -rn "import.*PreviewModal"` finds every consumer; render-site
  reasoning does not. (The unified `ArtifactFullscreen` had to grow an `onChange` live-note
  mode + optional `chat` to absorb that third path.)
- **A new `SessionInfo`/`StudioState` field with `.default([])` ripples to canonical bodies
  AND the constructor.** Adding `pinnedSlugs` broke 5 unit tests: every `tests/canonical/api/`
  body embedding `session` failed its key-set assertion (assertMatches checks keys exactly),
  and the `SessionStore` constructor literal needed `pinnedSlugs: []` (the `.default` makes
  the OUTPUT type require the key). Checklist for a new session field: schema + constructor
  literal + every canonical body carrying it + the coverage table.

## 2026-07-07 — agentic-model-efficiency (model-tiering the .claude layer)

- **`model:` frontmatter is honored on ALL THREE `.claude` file types** — agents, slash
  commands, AND skills — accepting tier aliases (`haiku`/`sonnet`/`opus`/`fable`), full IDs,
  or `inherit`. Prefer aliases: they auto-track the best current model per tier, so efficiency
  improves for free. The guardrail + per-file assignments live in `wiki/System/model-tiering.md`.
- **For commands and skills the override lasts only the current turn** (agents get their own
  context). The load-bearing consequence: a **reference/craft skill must be `model: inherit`**,
  else merely LOADING it (e.g. svg-authoring, brainstorm-phases) silently switches the whole
  turn's model as a side effect. Same for a command that runs as a **sub-step inside a higher
  persona's turn** (revisit-round inside an opus orchestrator round) — `inherit` so it never
  downgrades the caller. Only standalone entry points pin a concrete tier.
- **Delegate-don't-upsize beats a heavier model.** A haiku router that hands the heavy step to
  the right-tier subagent (artifact-chat → svg-artisan) is cheaper AND better than running the
  whole flow on the heavy model. Opus is a reserved carve-out (orchestrator + security +
  long-run + quality-critical user-facing generation), never a default.
- **Donor precedent** (`C:\Code\tp\.claude`): model frontmatter on AGENTS ONLY (light ops →
  haiku, security-engineer → opus, rest → sonnet); commands/skills carried none. We kept the
  shape and extended it to stamp commands + skills too, pushing mechanical work down to haiku.
- **`.claude` files can be swept into a commit by a concurrent loop/hook mid-task** — during
  this plan another session committed all 24 of my working files under my plan slug
  (`feat(agentic-model-efficiency)…`) before I reached closeout. `git status` then showed my
  work "gone" though `git ls-files`/`git diff HEAD` proved it committed and clean. In a shared
  working tree, check `git log -- <path>` before assuming lost work; closeout becomes
  bookkeeping-only when BUILD already landed.

## 2026-07-07 — concierge-living-gallery (phase 6, real-session human-sim)

- **A live-DOM engine (mind-elixir) is only exercised in a REAL browser — renderToString/
  jsdom never runs its effect, so ui-smoke proves the static wrapper, NOT the engine.** The
  human-sim (real chrome/CDP) is the first and only place the genuine engine mounts; asserting
  `[data-testid="mindmap-engine"].childElementCount > 0` is the real proof it rendered.
- **To drive a real edit on a canvas engine honestly, expose the instance and call its OWN
  mutation method — don't fake the result.** MindmapCanvas assigns `elRef.current.mind =
  instance` (idiomatic mind-elixir interop); the human-sim does `mind.selectNode(mind.findEle(
  mind.nodeData.id)); await mind.addChild()`, which fires the engine's real `operation` event →
  the component's `onEdit` → `editedTree`. Clicking the real Send then round-trips it. That's a
  genuine engine edit through the genuine React path, not a POSTed fixture. Keyboard-driving
  mind-elixir headlessly is fragile; the instance handle is reliable AND honest.
- **The break-sweep's blocking surfaces need a long timeout + a re-present in `restore`.**
  `askConcierge`/`presentGallery` clear on resolve OR timeout; a break gesture that clicks
  "Send answer"/a card RESOLVES them (surface vanishes), and their timeout would also clear them
  mid-sweep. Present them with a long timeout and re-present in `restore` (same pattern as a
  submitted board). Also: concierge/gallery never populate `history`, so a resolved-but-not-yet-
  re-presented surface transiently shows the New Discussion landing — skip census re-admission
  unless the surface's own signature is present, or its controls bleed into the wrong surface.

## 2026-07-07 — concierge-living-gallery (phase 5, real-session routing)

- **"Works in `npm run preview`" is answered by wiring the SKILLS, not the harness.** The
  intake surfaces (concierge, gallery, mindmap) were fully built + smoke-green for two phases
  yet would never fire in a real brainstorm, because `run-brainstorm.md` / `brainstorm-orchestrator.md`
  / `brainstorm-phases/SKILL.md` didn't tell Claude to CALL `ask_concierge`/`present_gallery`/
  `open_studio(brief)`. Rule 11 is literal: the prompt→method recommendation and the pick→phase
  routing are HEURISTICS that live in the `.claude` markdown, not in code. Phase 5's whole
  deliverable was editing those three files (+ reconciling the wiki) — no product code except a
  preview-harness demo of the route.
- **Prove a real-session flow with a throwaway scratchpad script against the real bridge, then
  fold it into a runnable command.** For "brief→mindmap end-to-end" I ran a ~40-line
  `verify-route.mjs` importing the built `Bridge` (`engine:'claude'`), driving present_gallery→
  POST gallery-pick→present tree board→POST editedTree, asserting `activeBoard.kind==='mindmap'`
  and the returned `editedTree`. This is the `/verify` pattern (drive the flow, observe behavior)
  and is far stronger evidence than a build-check — the preview harness (interactive, opens a
  browser, loops forever) can't be asserted on directly.
- **Committing a stalled peer session's FINISHED work on its behalf is OK when: (a) its plan
  shows all steps done + verified, (b) the diff is coherent (spot-check 2 files), (c) the operator
  authorizes it, and (d) you attribute it clearly ("committed on behalf of <session>").** The
  `agentic-model-efficiency` session's `.claude` model-tiering work was complete but uncommitted,
  blocking phase 5's edits to the same files; the operator said commit it, so it shipped as its
  own attributed commit — NOT folded into my phase commit. Never do this for half-written work.

## 2026-07-07 — concierge-living-gallery (phase 4 + operator real-session mandate)

- **A studio surface working in `npm run preview` is NOT proof it works in a real brainstorm.**
  Preview (`apps/mcp/src/preview.ts`, `engine:'preview'`) is a fixture player with no Claude and
  no orchestration; real sessions run through the MCP tools (`open_studio`/`ask_concierge`/
  `present_gallery`/`present_board`) driven by the `.claude` skills+commands. Two separate gates:
  (a) transport works → prove with `scripts/smoke.mjs`, which builds a REAL `Bridge` with
  `engine:'claude'` and exercises the actual channels; (b) Claude actually CALLS the tools →
  lives in `run-brainstorm`/`brainstorm-orchestrator`/`brainstorm-phases`. A feature can be
  fully built + preview-visible + smoke-green and STILL never fire in a real session because no
  skill tells Claude to call its tool. Operator's words: "if it only works in preview the app is
  a brick." Wire the skills (that's the routing phase) and prove the real path with human-sim on
  a real bridge — never treat the preview demo as the acceptance test.
- **The blocking-channel pattern now has three instances** (`presentAndWait`, `askConcierge`,
  `presentGallery`) — all identical shape: set pending state, broadcast envelope, store ONE
  resolver, POST resolves it, timeout → null, clear + re-broadcast null on settle, record to
  brainstorm.md. Each new one is +1 `StudioState` field (breaks `state-200.json` canonical body —
  append the key in `bridge.state()` order), +1 `ServerToStudio` case in `useBridge` (or the app
  blanks), +1 endpoint (add 200/404/400 to the api-status-matrix — tests ship with features).

## 2026-07-07 — comprehensive-human-testing closeout (multi-loop working tree)

- **A delegated agent killed mid-task by a model/session limit usually leaves its files
  COMPLETE on disk — recover by verifying, not re-delegating.** The phase-4 test-engineer
  hit the Fable 5 limit during its own verify pass; the code it had written was whole. The
  cheap recovery: `node --check` each JS file, Read the new files for structural
  completeness, then run the phase's verification YOURSELF (build + the harness) rather
  than re-spawning an agent that would duplicate work or clobber finished files. Re-delegate
  only if the artifacts are genuinely half-written.
- **For SHARED append-only files (`wiki/*`, `.agents/learnings.md`) entangled with a
  concurrent session's uncommitted hunks, don't fight the tree — leave your edits
  uncommitted and let them ride that session's next natural commit.** Across phases 2–5 my
  wiki + learnings edits sat uncommitted (foreign hunks at the top); the ui-changes closeout
  commit (`1feb781`) swept them all in cleanly. `git commit --only <file>` can't split
  hunks, so committing shared files yourself rides THEIR work — the inverse violation.
  Verify your content actually landed with `git show <hash> -- <file>` and record BOTH
  hashes in the progress log. Commit only files you solely own (here: `package.json`).

## 2026-07-07 — ui-break-sweep harness (phase 4)

- **On Windows `proc.kill()` terminates only the browser ROOT — renderer/GPU/network
  children survive orphaned.** Across repeated CDP harness runs that leaked ~100 headless
  chrome/msedge processes, enough contention to time out the NEXT launch. Kill the whole
  tree: `taskkill /pid <pid> /T /F` (POSIX gets plain SIGKILL). Edge's launcher handoff
  also leaves a hidden process holding the FIRST profile dir that is never a child of the
  proc you spawned — sweep those by command-line match against the profile path
  (`killProfileStragglers` in `scripts/lib/cdp.mjs`). Give every launch attempt its own
  profile dir.
- **Enumerate break-sweep controls from the LIVE DOM every surface, never from a static
  census.** Querying `button, input, textarea, select, [role=button]` at gesture time
  makes control drift impossible to miss — but a transient control (e.g. converge's
  "sudden death: duel" button) can vanish between enumeration and its gesture. Record that
  as `vanished (transient control)`, NOT a crash: the sweep proved 404 controls / 486
  gestures with zero unhandled crashes precisely because it treats disappearance as data,
  not failure. A disabled control clicked is `inert by design`, also not a finding.

## 2026-07-07 — ui-changes wave (converge cards, option chat, revisit, token pipe)

- **The token meter silently recorded NOTHING since it shipped — no thread on disk had a
  progress.jsonl.** Two stacked causes, both invisible: (a) `pipe-progress.mjs` posted to
  port 5199 only, while a port-conflicted bridge falls back to a random port; (b) the
  transcript token cursor was committed BEFORE the POST, so any failed delivery destroyed
  that delta forever. Fix pattern for any deterministic pipe: the server writes a
  discovery file with its REAL port (`<discussionRoot>/.logs/bridge-port.json`), and
  cursors commit only after confirmed delivery (`res.ok`) so missed deltas ride along on
  the next event. Absence-of-data bugs need an existence check in tests — an assertion
  that the artifact file EXISTS after a real flow, not just unit math.
- **`spawnSync` a child that HTTP-POSTs a server living in the parent process = deadlock
  by construction.** The parent's event loop is blocked, so the TCP request is accepted
  and buffered by the OS but never answered until the child dies; the child's `fetch`
  hangs (AbortError at its timeout) while the event still "arrives" afterwards — which
  made the old commit-before-post look correct in smoke. Any harness testing
  delivery-confirmation logic must `spawn` async and await 'close'.
- **A response for an already-answered board is a REVISIT, not a duplicate.** The bridge
  resolves the CURRENT pending wait with it (boardId names the rewound round), so
  `present_board` must digest against the board named by `response.boardId` — digesting
  against the presented board silently mislabels every option id. Rewind never deletes
  rounds; response.json is rewritten, brainstorm.md appends.

## 2026-07-07 — concierge-living-gallery (phase 3, intake + handoff)

- **A new `ServerToStudio` envelope MUST get a `case` in `useBridge`'s switch — the switch
  has no `default`, so an unhandled type makes the setState updater return `undefined` and
  blanks the whole app.** Adding a WS message type is a THREE-file change: the protocol
  union, `bridge.state()`/broadcast, AND `useBridge`'s reducer + the `EMPTY` default (so a
  bridge built before the field degrades gracefully via `{...EMPTY, ...msg.state}`). Miss the
  reducer case and the studio goes blank the moment the envelope arrives.
- **Adding a field to `StudioState` breaks the canonical `/api/state` + `ws-hello` body
  assertions** (`tests/api-status-matrix.test.mjs` compares key-for-key against
  `tests/canonical/api/state-200.json`; `ws-hello.json` references it by sentinel). Append
  the new key to `state-200.json` in the SAME order `bridge.state()` emits it. Expect this
  every time StudioState grows — it's not a regression, it's the contract test doing its job.
- **The Claude Code → studio handoff was a one-liner gap with a real UX cost:** `open_studio`
  took no brief, so a purpose the human already typed in the terminal was lost and they
  retyped it in the New Discussion panel. Fix pattern for any async-seeded form field: carry
  it in `StudioState` (`seedBrief`), pre-fill via `useState(initialProp)` AND a ref-guarded
  effect (`seededRef`) that fills only when the prop first arrives over WS and the field is
  still untouched — never clobber what the user has since typed.
- **A blocking studio channel = present_board's shape reused:** `askConcierge` mirrors
  `presentAndWait` (broadcast a pending item, store a single resolver, POST answers it,
  timeout resolves null, clear + re-broadcast null on settle). For an adaptive/multi-turn
  loop the tool blocks per turn and Claude decides whether to call again — no fixed count in
  the harness (the count lives in Claude's judgement, rule 11).

## 2026-07-07 — concierge-living-gallery (phase 2, mind-elixir)

- **A browser engine that imports CSS/`.less` (mind-elixir) must be DYNAMICALLY
  imported inside the mount effect, never statically at module top.** ui-smoke runs the
  studio `.tsx` through tsx/esbuild with no `.less` loader and no real layout; a static
  `import 'mind-elixir'` anywhere in BoardSurvey's import graph would crash the whole
  render pass on the `.less` import. `await import('mind-elixir')` inside `useEffect`
  (which renderToString never runs) keeps the static graph clean AND code-splits the
  engine into its own chunk that only loads when the canvas mounts. Assert the STATIC
  wrapper markers in ui-smoke; the live engine gets real proof in the human-sim phase.
- **mind-elixir 5.13 API pinned:** `new MindElixir({el, direction, editable, theme})` →
  `.init({nodeData, direction})`; edits arrive via `instance.bus.addListener('operation',
  cb)`; read back with `.getData()` (returns `{nodeData, direction}`); `.exportSvg()`
  returns a Blob; light/dark = `MindElixir.THEME` / `MindElixir.DARK_THEME`; `direction`
  is typed `0|1|2` (cast our `number`). Our MindTree (`{nodeData, direction?}`) is
  structurally its data format — no adapter needed.
- **Rule 7 for a live-DOM engine = a deterministic SERVER-side snapshot, not the engine's
  own export.** mind-elixir renders in the browser; the server can't run it. `recordBoard`
  captures the presented tree via `apps/mcp/src/tree-svg.ts` (a plain recursive SVG layout,
  XML-escaping topics for rule 8) at present time — deterministic, testable, independent of
  whether the client ever exports. The browser engine is the editing surface; the snapshot
  is the archival still.

## 2026-07-07 — concierge-living-gallery (phase 1)

- **Concurrent dispatch loops share ONE working tree — a red `npm test` may belong to the
  OTHER plan's uncommitted diff.** Attribute before reacting: `git diff <suspect files> |
  Select-String '<failing string>'` — if the failing assertion's strings are `+` lines in
  someone else's in-flight diff, your phase didn't break it. Then (a) commit your own
  disjoint paths immediately to protect them from sweeps, (b) do NOT "fix" the other
  plan's canonical expectations mid-flight (their diff isn't final), (c) leave the row
  in-progress with the attribution and re-verify next tick.

## 2026-07-07 — mindmap-methodology brainstorm (4 rounds to finality)

- **Delegated SVG JSON can be invalid XML — scan before present_board.** svg-artisan
  emitted a `<text>` carrying two `x=` attributes (round 3); DOMParser rejects duplicate
  attributes, which would have crashed/blanked the option. The orchestrator owns a
  pre-present validity scan of delegated SVG (duplicate attributes, unclosed tags,
  double quotes when the brief demanded single).
- **The merge→crown two-step is the clean funnel ending.** Triage `merge` verdicts →
  next round presents exactly ONE synthesis at converge → the user crowns it Final.
  Diverge(6) → synthesis-diverge(5) → converge(3, merge+kill) → converge(1, crown) went
  brief-to-poster in 4 rounds with zero wasted boards; don't pad the pool once notes
  start converging on ordering instructions ("1 and 2 are perfect, X comes after").

## 2026-07-07 — human-sim harness (phase 3)

- **Windows Edge (`msedge.exe`) can exit 0 IMMEDIATELY with empty stderr when launched
  `--headless=new --remote-debugging-port=0` — a launcher/startup-boost handoff, even with a
  fresh `--user-data-dir`.** No error, no DevTools line, nothing. A CDP harness must treat
  "process exited (or 20s passed) without `DevTools listening on ws://…`" as launch failure
  and fall back to the next installed chromium-family browser (Chrome worked first try on
  the same machine). Give each attempt its OWN profile dir — a handoff may leave a hidden
  process holding the first one.
- **`document.body.innerText` reflects CSS `text-transform` — the studio's `uppercase`
  markers/titles render as `YOUR TURN`, so `innerText.includes('your turn')` never matches.**
  Assert page text via `textContent` (DOM truth); reserve innerText/screenshots for
  visibility questions. (Cost 15 minutes of "board never rendered" when the screenshot
  plainly showed it rendered.)
- **A concurrent session's `npm run build` clears `apps/studio/dist` mid-run — and the
  bridge's static file streaming (`fs.createReadStream(...).pipe(res)` with no `error`
  handler) then CRASHES the whole node process on the ENOENT** (unhandled stream 'error'
  event), not just that request. Open finding for bridge-server.ts static serving.

- **`String(ZodError)` never contains the word "ZodError"** — zod v3 stringifies to the
  bare issues JSON, so canonical 400-body expectations must anchor on issue codes
  (`invalid_type`, `invalid_enum_value`, `too_small`), never the class name. Non-JSON
  bodies DO yield `SyntaxError:` in the message.
- **`VIBR_STUDIO_DIST` is read inside `Bridge.start()`**, not at construction — per-test
  dist overrides must scope the env var tightly around `start(0)`; safe only because
  node:test runs one file's tests sequentially in one process.
- **`presentAndWait`'s third arg `open` defaults to `true`** — any test presenting a board
  must pass `false` or every test run pops a real browser window.
- Proving "silently ignored" over WS: send the ignored frame, then a garbage frame, and
  wait for the garbage's log line — in-order socket processing guarantees the ignored
  frame was consumed without side effects.

## 2026-07-07 — fixed-position overlays paint-trapped by `scroll-fade` (mask-image)

- **`mask-image` on an ancestor (main's `scroll-fade`) makes it a paint group that
  clips even `position: fixed` descendants — while `getBoundingClientRect()` still
  reports full-viewport geometry.** A `fixed inset-0` modal rendered inside
  `main.scroll-fade` painted inset to main's box, faded at the mask edges, and sat
  visually behind the sidebar/wayfinder ("fullscreen isn't fullscreen, appears behind
  the nav"). Measure-based debugging lies here: the DOM rect is correct, only PAINT is
  clipped — screenshot the page, don't trust rects. Fix: fullscreen dialogs portal to
  `document.body` (`BodyPortal` in `primitives.tsx`; inline fallback keeps
  `renderToString` ui-smoke working since the server renderer has no portals). Any new
  `fixed inset-0` surface must either mount at App root or wrap in `BodyPortal`.
- **CDP `Page.captureScreenshot` on a backgrounded tab can return a stale composited
  frame** that contradicts the live DOM — `Page.bringToFront` first, then capture.

## 2026-07-07 — canonical test data (phase 1)

- **A recursive directory walk on Windows yields backslash separators that never match
  forward-slash map keys.** `tests/canonical-data.test.mjs` guards against unproven stray
  canonical files by `deepEqual`-ing walked JSON paths against its explicit file→schema
  map; that only works with `path.relative(...).replaceAll('\\', '/')`. Any test that
  compares relative paths from `readdirSync` recursion to literal keys needs the same
  normalization.

## 2026-07-07 — studio blank-page crash (version skew)

- **A long-running bridge process serves the NEW studio bundle but sends OLD state
  shapes — and `hello`'s wholesale `return msg.state` made that a blank page.** The
  bridge process outlives rebuilds (it's spawned per Claude Code session); its compiled
  `state()` lacked fields the freshly-built client dereferences (`state.progress`), React
  unmounted the root, and the only server evidence was connect/disconnect pairs ~200ms
  apart. Fix pattern: the client merges every `hello` over its typed defaults
  (`{ ...EMPTY, ...msg.state }`). Treat "connected then disconnected within ~1s,
  repeatedly" in the bridge log as the client-crash signature.
- **ui-smoke (JSDOM renderToString) structurally cannot catch browser-runtime crashes** —
  useBridge/WebSocket/effects never run there. Repro cheaply without Playwright: headless
  Edge/Chrome + raw CDP over the repo's own `ws` package (`--remote-debugging-port`,
  `Runtime.exceptionThrown`, then `document.getElementById('root').childElementCount` —
  0 children = unmounted root). Script pattern: scratchpad `crash-repro.mjs`, 2026-07-07.
- **`/api/health` `awaitingResponse` tracks the BLOCKING present_board wait, not the
  board's liveness.** After the 1740s tool timeout it flips false while the board stays
  live and answerable (peek_response still `pending`). Don't monitor it to detect a user
  submission — poll `activeBoard: null` (set only when a response is accepted) instead.

## 2026-07-07 — brainstorm-orchestrator plan

- **Agent files can be living memory surfaces, same as commands.** The
  `brainstorm-orchestrator` agent persists brainstorm-routine orchestration lessons in its
  own `## Orchestration learnings` section — role memory lives next to the procedure owner,
  so spawning the agent loads it for free. Consequence for closeout step 4 ("which file
  would have prevented this?"): candidate files now include `.claude/agents/*` living
  sections, not just commands/skills. Repo-wide lessons still mirror to THIS file; wiki
  facts still go through wiki-librarian.

## 2026-07-07 — askaquestion plan

- **Parallel agent waves work when the contract is written down, not described.** Three
  waves (progress pipe, token meter, artifact chat) ran core + studio-UI + tests + docs as
  concurrent subagents building against code that had not landed yet — zero drift, because
  every prompt carried the EXACT zod schema literals, component props signatures, endpoint
  bodies/status codes, and the literal renderToString marker strings tests would match.
  Vague contracts ("add a chat panel") would have needed a reconcile pass; exact ones made
  the merge mechanical. Corollary: name which agent owns which files — two agents editing
  ui-smoke.ts would have conflicted.
- **Windows/libuv: `process.exit(0)` racing WebSocketServer teardown asserts
  `!(handle->flags & UV_HANDLE_CLOSING)` and clobbers the exit code AFTER your PASS line
  printed.** In scratch drivers, trust the printed assertions, not the exit code — or skip
  explicit exit and let the loop drain (smoke.mjs's pattern, which never hits this).
- **A concurrent /plan-closeout can sweep YOUR in-flight phase into ITS commit.** The
  token-meter tick's files showed clean at ship time because another session's closeout
  commit had taken them as riders minutes earlier. Before shipping a tick, `git log
  --oneline -3`: if your hunks are already in someone else's commit, commit only your
  remaining delta and record BOTH hashes in the Progress log — never re-stage or revert
  to "own" the work. (Mirror of the commit-riders learning, seen from the other side.)

## 2026-07-06 — ui-changes plan (studio restructure, 6 waves)

- **The scroll gutter must live INSIDE the `overflow-y-auto` element.** Padding on the
  scroll container's PARENT sits outside the scrollbar, so content ends flush against it
  and right borders "disappear". Put the right padding on the scrolling element itself and
  give fixed siblings (wayfinder strip) a matching margin. Same family: percentage heights
  (`min-h-full`) resolve to nothing inside a `min-h-screen` flex column — symptom is
  duplicate scrollbars (body + inner) AND fill-remaining-space silently failing. Fix:
  `h-screen` root, `flex-1` to fill, overflow on exactly one inner element.
- **Zod strips unknown keys: a UI-added response field silently vanishes** unless its shape
  lands in `packages/protocol` FIRST. The bridge parses every response through
  `BoardResponseSchema`; a studio-only field never reaches Claude and nothing errors.
  Rule 5 is not just governance — the parse enforces it destructively.
- **A resumed subagent's "standing flags" replay stale context.** The wiki-librarian
  (resumed via SendMessage across 6 waves) kept re-flagging a CLAUDE.md issue for hours
  after the coordinator fixed it — a resumed agent reasons from its own old transcript,
  not the current tree. Verify any repeated flag against the file before acting, and tell
  the agent explicitly to drop resolved flags. (The pattern itself was excellent: one
  persistent librarian per work stream, fed a concrete changed-facts brief per wave,
  instructed to verify against source.)
- **`capture="environment"` on desktop silently degrades to a file-open dialog.** Real
  camera capture needs `getUserMedia` + a preview/snap modal; keep the file-input fallback
  for denied/absent cameras and label it honestly (rule 6).
- **"Edit a built-in" features should shadow, not mutate.** Studio palette edits persist as
  `styles/<name>.json` — the exact drop-in files `loadThemes` already lets shadow built-ins
  by name. Zero code mutation, restart-safe, user-ownable, and deletion restores the
  built-in. Reuse this write-path for any future built-in-customization feature.
- **Studio rebuilds need only a browser refresh; server-side changes need a restart.** The
  bridge streams `apps/studio/dist` per-request, but themes, config, and endpoints load at
  process start. After editing `apps/mcp` or `packages/protocol`, restart the preview; a
  second instance falls back to a random port and logs PORT CONFLICT with the holder's pid.

## 2026-07-06 — ship-discipline-loopable-plans plan

- **Never cross-reference another command's step by NUMBER — use the step's name.**
  `wiki/Meta/agentic-loop.md` said push happens at plan-closeout "(its step 9)"; within
  the hour a new step 7 renumbered it to 10 and the wiki was silently wrong. Living
  documents renumber; names ("its Commit-and-push step") survive. Same family: before
  appending a `## Changelog` footer to a command, check one already exists — footers live
  at the END, and a blind append creates a duplicate heading mid-file.
- **`brainstorm.md` has two writers with distinct duties.** The MCP server auto-appends
  the mechanical record (rounds shown, raw responses, captures — `SessionStore.appendMd`,
  apps/mcp/src/session-store.ts); it will never contain WHY. Interpretation (direction
  chosen/rejected + rationale, emerged requirements) must be appended by the orchestrator
  per run-brainstorm step 5 — that layer is what makes a target-repo build plan authorable
  from the record instead of from chat memory.
- **File-level `git commit --only` cannot split hunks: a shared file already carrying
  another session's uncommitted edits commits THEIR hunks with yours.** Either wait for
  their loop to converge and commit, or declare the riders in the commit body — never
  pretend the commit is single-plan when the diff isn't.

## 2026-07-06 — studio-journey-ux plan

- **A live MCP server keeps writing to the discussionDir it loaded at startup** — config
  loads once at process start. When `discussionDir` moved (`.docs/discussion` →
  `discussion/`), the still-running server kept writing threads/artifacts to the OLD path;
  the strays had to be migrated by hand. After any config/path change: check
  `GET /api/health` → `session.dir` to see which root the running server ACTUALLY uses,
  and expect strays until it restarts. (`SessionStore.open()` self-heals a stale `dir`
  field inside session.json, so moved thread folders reload fine.)

- **Hand-built response fixtures break every time the schema gains a defaulted field.**
  Two session-store tests died on `response.ranking.length` because their fixture object
  literal predated the field. Fixtures must go through `BoardResponseSchema.parse` like
  every production caller (bridge HTTP/WS/synthetic-park and disk reload all parse) — then
  new defaulted fields can never re-break them.
- **Two Claude sessions can edit this repo concurrently and it works — IF both re-read
  before every edit.** This build landed while another session shipped fullscreen-preview +
  target-repo; merges met in BoardSurvey/TriageGate/JudgeDeck. The Edit tool's
  modified-since-read guard is the safety net: on conflict, grep the current state first —
  the other session may have already made your fix (onPreview wiring, twice).

## 2026-07-06 — fullscreen-notes-target-repo plan

- **ui-smoke markers must not span adjacent JSX expressions.** `renderToString` emits a
  comment node between neighboring text expressions (`{value}%` renders as
  `100<!-- -->%`), so a literal marker like `'100%'` never matches. Assert on a glyph or
  string that lives inside ONE expression/text node (e.g. the `⟲` button label).

## 2026-07-06 — docs-tests-agents plan + its closeout

- **Restructuring paths under a live MCP session splits the working set.** The discussion
  root is read from config at server launch; promoting `.docs/discussion/` to top-level
  `discussion/` while a session was live left that session writing to the OLD path. Rule:
  after any storage-path change, census live node processes first, migrate straggler
  threads only after their session ends, and never delete the old root while one runs.
- **Rule-10 verification races concurrent sessions in one working tree.** During closeout,
  `npm run build` failed three times with three DIFFERENT errors — all in another plan's
  in-flight files (JudgeDeck wiring), none from the plan being closed. Attribute failures
  before fixing: check open plans + `git status`, and don't edit a file another session is
  actively changing (the error's line number drifting between runs is the tell). Wait for
  their loop to converge, then re-verify.

## 2026-07-06 — de-slop of the demo orchestrator

- **Test harnesses accrete intelligence one "improvement" at a time until they impersonate
  the product.** The demo started as a surface exerciser; across iterations it grew pool
  evolution, mechanical synthesis, hand-drawn "semantic" tables, dial-restyling, and a
  kickoff brief — ~500 lines duplicating orchestration that belongs ONLY to Claude + the
  skill files, and it misled the operator ("prompt was not respected"). Rule: the harness
  stays dumb (fixtures in, responses logged); when a harness gap tempts you to add cleverness,
  the fix is wiring the REAL engine, not teaching the fake one. Deleted, replaced by
  `preview.ts` (fixtures only, temp-dir threads, `engine:'preview'` declared in the UI).

## 2026-07-05 — phase-funnel-ux plan (harvested at closeout 2026-07-06)

- **Board ids must be unique per presentation — the bridge dedups responses
  first-response-wins.** `bridge-server.ts` keeps `responses` keyed by boardId and ignores
  any later response for a known id, so re-presenting a board under a reused id (new cycle,
  ↩ back re-present) silently swallows the user's answer. Mint a fresh board id every
  `present_board`, even when showing "the same" board again. (Bit the demo as
  cross-cycle collisions before the demo was deleted; the dedup is still live.)

## 2026-07-05 — feedback-packaging session (operator UX test)

- **A dial-only response produced a no-op — the cardinal sin of this tool.** The operator
  moved two sliders, sent, and got a clever phase pivot instead of visibly re-tuned options.
  Fixed at three layers: tool description ("axis deltas are a complete instruction"),
  feedbackDigest (dial deltas rendered as imperative lines with direction), demo (dials
  literally re-render stroke-width/caps/accent). Interpretation cleverness never beats
  doing the obvious thing the user asked with their hands.
- **Every mechanic ships its state regardless of active tab** — phase tabs are clickable
  now, so users arrange clusters then switch tabs; conditional field-sending silently
  dropped that work. Send everything touched (`clusterTouched` pattern).
- **tsx (esbuild) needs a root tsconfig.json with `jsx:"react-jsx"`** to run studio TSX in
  scripts — nearest-tsconfig lookup doesn't reach apps/studio for files under scripts/.
- **jsdom + renderToString gives cheap per-surface render tests** (`npm run smoke:ui`) —
  only DOMParser/XMLSerializer globals needed since effects don't run server-side.

## 2026-07-05 — persistence/styles session

- **Schema evolution rule: cached threads must ALWAYS reload — tighten at the tool
  boundary, loosen the base schema.** The ≥5-axes invariant is enforced in `present_board`'s
  handler, NOT in `BoardSchema`, so round-1 threads cached before the rule still parse.
  Corollary: new BoardResponse fields get zod `.default(...)` so old disk data (and
  fixtures — see studio-journey entry) never break. New invariant → boundary check;
  new field → defaulted. (Harvested at closeout 2026-07-06.)
- **Two bridges can't share port 5199 — and on Windows, killing an `npm run` wrapper can
  orphan the node child, leaving the port held.** The bridge now falls back to an ephemeral
  port on EADDRINUSE (stderr warning) instead of crashing; the printed/returned `studioUrl`
  is the source of truth, never assume 5199. (Bit us twice: an orphaned OLD demo on 5199
  silently answered API probes meant for the new build — a ghost serving stale code. When
  testing a rebuilt demo, first `Get-CimInstance ... -match 'demo\.js'` → Stop-Process, and
  launch demos via `node apps/mcp/dist/demo.js` directly so a task stop kills the real
  process, not just the npm wrapper.)

## 2026-07-05 — bootstrap session

- **stdio MCP servers must never write to stdout.** The MCP protocol IS stdout; one stray
  `console.log` corrupts the stream and Claude Code drops the server. All apps/mcp logging
  goes through `console.error`. (Codified as CLAUDE.md appendix.)
- **`present_board` blocking + timeout recovery is the crux design.** MCP tool calls can block
  for long periods but clients enforce timeouts (Claude Code: `MCP_TOOL_TIMEOUT`). Design:
  block up to `timeoutSeconds` (default 1740s), return `{status:"pending"}` on expiry, persist
  the late response, recover via `peek_response`. Never treat timeout as failure.
- **Artifacts belong to the brainstormed project, not this repo.** Claude Code launches MCP
  servers with cwd = user's project, so `.visual-brainstorm/` lands where the user can commit it.
- **Donor architecture (C:\Code\tp) mapping:** root CLAUDE.md numbered mandates + AGENTS.md
  behaviour mandates + `discussion/<slug>-<date>/plan.md` + `_completed/` + authoritative
  wiki with append-only `log.md` + `.agents/` learnings/skills. Optimization taken here: wiki
  stays plain files (no wiki-MCP ceremony) because this repo's MCP layer is the product itself.
- **shadcn 2026-06 chat components** (UI north star): MessageScroller (scroll behaviors),
  Message/Bubble (rows/surfaces), Marker (status/separators), Attachment, plus `scroll-fade`
  and `shimmer` CSS utilities. Studio mirrors these patterns hand-rolled on Tailwind v4.
