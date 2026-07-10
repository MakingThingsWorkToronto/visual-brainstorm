# Plan — Verified review findings backlog (2026-07-09)

## Session handoff — RESOLVED 2026-07-09

The blocked closeout commit below landed via the operator-authorized sweep
(`0dc483a`, sweep-convergence-2026-07-09, now archived): the tree was verified
green (build, unit 217/217, smoke PASS) and committed whole with per-plan
attribution. Nothing in this section remains actionable; the backlog below is
the live work.

## Session handoff (2026-07-09, session ended at context limit)

The photo-scribble-annotation + scribble-legibility closeout is DONE except the commit:

- **Done:** 8 review fixes applied + tests (double-send guard in NewDiscussionPanel;
  StrictMode-safe draft-ref commits, composite root width/height, measuring-gate draw
  race in PhotoScribble; photo-conditional README/seedNote + shared VIEW resolver +
  decodeImageDataUri reuse in bridge-server; sink consume-once in session-store recordProgress
  mirroring open(), with a live==reopened unit test; oneLine(topic) + countNodes import in
  tree-outline; editedTree ?? board.tree canvas seed in BoardSurvey). Learnings harvested
  (.agents/learnings.md top entry); plan-closeout step 2 + reading-scribbles skill improved;
  wiki reconciled by librarian (testing-observability ×2, user-guide token panel,
  system-architecture seed folder) + wiki_reload; both plan folders archived to _completed/.
- **Verification state:** build ✓, ui-smoke ✓ (incl. new width/height assert),
  session-store tests 17/17 ✓, full five-journey `npm test` ✓ earlier in session. Current
  `npm run smoke` red is the PARALLEL session's in-flight ConciergeExchange picked/typed
  change (smoke.mjs:959 + 5 unit cases expect the old string answer) — NOT these plans.
  `buildResponse` in BoardSurvey got explicit `remixNotes/questionAnswers/uncertainties/
  optionAnnotations` empties so the build compiles until that session's UI wiring lands.
- **BLOCKED-commit (step 10):** intentionally not committed — the parallel session was
  actively editing shared files (protocol new fields, BoardSurvey optionAnnotations wiring,
  NewDiscussionPanel intakeAnswers, session-store atomic writes) and the TS import graph
  fuses the diffs; no clean single-plan file subset existed. NEXT SESSION: once that stream
  converges (smoke green end-to-end), commit `--only` the closeout paths — the two
  `discussion/_completed/{photo-scribble-annotation,scribble-legibility}-2026-07-09/`
  folders, this plan, .agents/learnings.md, .claude/commands/plan-closeout.md,
  .claude/skills/reading-scribbles/, wiki pages + log, PhotoScribble/NewDiscussionPanel/
  BoardSurvey/bridge-server/session-store/tree-outline + test files — declaring any
  remaining peer riders in the commit body, subject
  `chore(closeout-photo-scribble-and-scribble-legibility): review-hardened + closed`.

Status: CLOSED 2026-07-09 — all 11 backlog items implemented + verified (build, unit
233/233, smoke, ui-smoke, all 5 human-sims PASS on the refactored runner); learnings
harvested (2 entries), artifact-chat.md improved (first-class rearm resume), wiki
reconciled (interaction-protocol detour/drafts/mind-map contracts + harness pages),
archived to _completed/. Design decisions recorded in the Progress log below.

Original backlog status: OPEN — backlog. Each item below was CONFIRMED by an adversarial code review
(8 finder angles + per-candidate verification) of the 2026-07-09 working tree, but
belongs to an already-closed plan or needs a design decision, so it was not fixed
inline during the photo-scribble / scribble-legibility closeout. Fixed in that
closeout (not listed here): double-send guard, scribble README honesty, StrictMode
double-commit, composite SVG sizing, photo-aspect draw race, sink consume-once,
tree-outline topic newlines + countNodes reuse, mindmap draft-restore seed.

## Correctness

1. **Artifact-chat detour can strand a mid-detour submit** — `apps/mcp/src/bridge-server.ts`
   (~1234): the non-destructive detour deletes the pending `present_board` resolver while the
   board stays live. A user submit landing before the orchestrator re-presents is parked in
   `this.responses` with no waiter, and the subsequent `presentAndWait` blocks (until timeout /
   `peek_response`) on an answer that already exists. Fix direction: `presentAndWait` should
   consult parked responses for the live board before blocking, or the detour should be a
   first-class "non-destructive command" mechanism instead of a string special case.
2. **`recordBoard`'s duplicate-id early-return is unreachable** — `apps/mcp/src/session-store.ts`
   (~257): board ids are server-minted per `present_board` call (`board-r${round}-${Date.now()}`),
   so the guard never fires. Remove it, or if re-present-same-id ever becomes real, make it
   content-aware (silent drop of changed content would break rule 7 provenance).

## Efficiency — the draft payload cluster (one design pass)

3. **Draft attachments keep full base64** — `session-store.ts` `recordBoardDraft` (~359) never
   blanks `attachment.dataUri` (unlike the submit path), so a multi-MB photo is pretty-printed
   into `round-NN/draft.json` on every debounced change, retained in memory, shipped in every
   `hello` snapshot, echoed to every WS client (including the sender, `bridge-server.ts` ~727),
   and embedded whole into `session_status` output (`apps/mcp/src/index.ts` ~608 — a drafted
   photo is ~1.7M tokens of base64 in model context). Decide the draft-restore contract
   (drafts restore dials, not file bytes?) then: blank dataUris on the draft path, return a
   compact draft summary from `session_status`, and skip the WS echo to the originating socket.
4. **`BoardSurvey` stringifies the full draft every render** — `BoardSurvey.tsx` (~339):
   `draftKey = JSON.stringify(buildResponse(...))` runs per keystroke including attachment
   base64, then the debounced effect `JSON.parse`s it back. Key the effect on the underlying
   state values (or exclude attachment dataUris from the key) and pass the object directly.
5. **`useBridge` upserts the sender's own draft echo** (~120) — full App re-render ~2×/s during
   mind-map editing for data the client already holds; bail when the incoming draft deep-equals
   the stored one or matches the locally-mounted board.

## Structure / reuse

6. **Five human-sim harness copies** — `human-sim.mjs`, `-archived`, `-boardchat`, `-livechat`,
   `-mindchat` each duplicate ~100 lines of scaffold (temp dirs, bridge boot, CDP wiring,
   `checkpoint()`/`step()`, failure screenshot, teardown). Extract a shared runner into
   `scripts/lib/` so crash-discipline hardening lands once, not five times.
7. **Test helper duplication** — `tests/board-draft.test.mjs` re-implements (and has already
   diverged from) `startBridge()`/`postJson()` in `tests/api-status-matrix.test.mjs`;
   `tests/mindmap-outline.test.mjs` + `scripts/human-sim-mindchat.mjs` bypass `loadCanonical`.
8. **`pipe-progress.mjs` redeclares the token-sink enum** (~82, rule 5) — an unknown
   `--category` is silently stripped and misfolds into `orchestration`. Constraint: the hook
   must never fail, so use a guarded dynamic import of protocol dist (fall back to the local
   list when unbuilt) or at minimum a sync-comment pointing at `TOKEN_SINKS`.
9. **Mindmap snapshot located by heuristic** — `App.tsx` (~418): "newest artifact with this
   boardId and zero optionIds" — add an explicit provenance kind to the Artifact shape
   (protocol change, rule 5 cycle) so a future board-scoped no-option capture can't hijack
   the Maximize chat target.
10. **`tree-outline.ts` emits each note twice** (inline `note:` meta + trailing roll-up) —
    intentional steering summary per its comment, but it doubles steering text in model
    context every round; decide one form.
11. **`BoardSurvey` draft-flush spelling drift** (~450 vs ~950): one site spreads
    `buildResponse(...)`, the other doesn't — unify.

## Progress log

- 2026-07-09 (resume session) — sweep landed (`0dc483a`), handoff resolved. Backlog worked:
  - **#1+#2 (one design):** the detour resume is now a FIRST-CLASS REARM — this also fixed
    real code↔wiki drift: the wiki/comments claimed "re-enter present_board on the SAME board
    (recordBoard idempotent by id)" but present_board always mints a new id+round, so the old
    resume duplicated the round AND remounted BoardSurvey (dials lost). Now:
    `present_board {rearmBoardId}` → `bridge.rearmAndWait` consumes a mid-detour submit
    immediately (the strand fix), else re-arms the still-live board (no new round, no remount —
    App keys BoardSurvey by board.id). recordBoard's unreachable guard removed; the park digest
    line hands the orchestrator the exact rearm call; artifact-chat.md step 5 rewritten.
    Tests: tests/bridge-rearm.test.mjs (3). Wiki interaction-protocol reconcile → closeout step.
  - **#3–5 (design decided: drafts restore dials, NOT file bytes):** attachment dataUris
    blanked at BOTH ends of the draft path — BoardSurvey.buildDraft (the ONE flush spelling,
    also resolving #11) and recordBoardDraft (defense in depth; now returns the stored draft,
    bridge broadcasts THAT). With bytes structurally absent, the session_status embed is small
    → kept as-is (no consumer-breaking "compact summary" shape). BoardSurvey no longer
    stringifies the draft per render (#4: effect keyed on the underlying state values);
    useBridge drops the active board's own draft echo (#5: drafts feed mount-time initializers
    only; reload/re-present restores from hello). Tests: board-draft.test.mjs blanking suite.
  - **#6+#7:** scripts/lib/sim-runner.mjs owns the five sims' scaffold (incl. the launch retry
    only the flagship had); tests/lib/bridge-harness.mjs owns startBridge/postJson;
    mindmap-outline + human-sim-mindchat routed through loadCanonical.
  - **#8:** pipe-progress.mjs validates --category against protocol TOKEN_SINKS via guarded
    dynamic import (hook can never fail; local mirror only when dist unbuilt).
  - **#9:** Artifact provenance.kind ('mindmap-snapshot') — recordBoard marks the snapshot,
    App.tsx locates by kind (old heuristic kept ONLY as legacy fallback for pre-kind threads).
    Protocol+store+studio+tests in the same cycle (rule 5).
  - **#10 (decided):** inline `note:` is THE form (position is meaning); roll-up dropped;
    header now counts noted nodes and says to read them as intent.
