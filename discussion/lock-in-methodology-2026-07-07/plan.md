# Lock the concierge→gallery→mind-map methodology into the REAL flow

**Status:** open 2026-07-07.
**Trigger (operator, live):** "I still see the og new discussion surface. I should see the methodology locked into the final artifact in the plan." + the session-long mandate: real-world testing, no mocks/preview, predict journeys then audit additively, assert canonical DATA (not 200s/render).

## Diagnosis (evidence-based)
- The crowned methodology (brief → concierge Q&A → Living Gallery → mind map, artifact `concierge-living-gallery`) is **orchestration-gated, not structural**. `App.tsx` renders `ConciergeIntake`/`LivingGallery` ONLY when `state.concierge`/`state.gallery` are set, which happens ONLY when a live Claude session calls `ask_concierge`/`present_gallery`. With no active driver (or a driver that jumps brief→`present_board`), the user is left on the New Discussion landing — the "og surface."
- `run-brainstorm.md` step 0d even permits skipping intake ("jump straight to boards") — so it is explicitly NOT locked.
- **Why tests missed it:** `human-sim.mjs` **fakes the orchestrator** — it calls `bridge.presentGallery(...)`/`askConcierge(...)` itself. It proves the studio CAN render a gallery, never that a real orchestrated session PRODUCES one. That is the coverage gap behind "bugs are being missed."
- **Collision:** the concurrent `studio-survey-intake` work reskinned the New Discussion panel into tappable *Survey questions* — a second question-asking intake overlapping the concierge. Likely part of what the operator sees.
- Intake tools are intact (`ask_concierge` index.ts:296, `present_gallery` :327) — no hard regression; the gap is determinism + coverage.

## Operator decision: "all of the above" — three locks
1. **Structural (bridge-driven) lock** — on `new-brainstorm` submit the BRIDGE deterministically enters the concierge state; the studio shows `ConciergeIntake` (not the panel) and the orchestrator MUST fill it. The methodology can't be silently skipped because the studio is already in it.
2. **Orchestration lock + real-journey test** — step 0 intake MANDATORY in `run-brainstorm` / `brainstorm-orchestrator` / `brainstorm-phases` (remove the skip escape); a REAL orchestrated-journey test that fails if the methodology doesn't fire (NOT `bridge.presentGallery`-faked).
3. **Resolve the survey-intake collision** — reconcile the two intakes so concierge→gallery is unambiguously the front door.

## Sequencing — BLOCKED vs SAFE (shared-tree reality, 2026-07-07)
A concurrent session holds a large UNCOMMITTED diff across the structural targets: `apps/mcp/src/bridge-server.ts`, `apps/studio/src/App.tsx`, `apps/studio/src/components/NewDiscussionPanel.tsx`, and the test files `scripts/{human-sim,smoke}.mjs`, `scripts/ui-smoke.ts`, plus `packages/protocol`, `config.ts`, `index.ts` (a `runtime` field + decision-tree feature). Editing those now clobbers their work (`.agents/learnings.md` shared-tree-commit-trap).

- **SAFE NOW (clean files):** orchestration lock in `.claude/commands/run-brainstorm.md` + `.claude/agents/brainstorm-orchestrator.md` + `.claude/skills/brainstorm-phases/SKILL.md`; the test-honesty contract in `.claude/agents/test-engineer.md`; a CLAUDE.md rule; the predicted-journeys registry (`tests/journeys.md`, new); the visual-honesty helper + unit test (`scripts/lib/visual-honesty.mjs`, `tests/visual-honesty.test.mjs`, DONE + 7/7 green).
- **BLOCKED until the concurrent diff commits:** the structural bridge/studio lock (#1); wiring visual-honesty + the real-journey test into `human-sim.mjs`/`smoke.mjs` (#2 test half); the survey-intake reconciliation (#3). Do these once `git status` shows those files clean, then verify with `npm test` + a real human-sim (no faked present).

## Already delivered this session (collision-free)
- `scripts/lib/visual-honesty.mjs` — `assertShowsCanonical` / `assertNotFalseGreen` / `assertSurfaceShowsCanonical`: a 200/render/testid is not proof; the surface must VISIBLY show the specific canonical values; error/blank/empty-data surfaces are rejected. (Ported from the donor `frontend-tester` Rule 14 / L-152.)
- `tests/visual-honesty.test.mjs` — jsdom unit coverage, 7/7 green.

## Verify / Closeout
Each lock ships WITH its real-journey assertion. Final: `npm test` + a real human-sim that asserts the concierge/gallery surface appears from a brief submit WITHOUT the harness faking `present_gallery`. `/plan-closeout` when all three land.

## Architecture (operator, live): run-brainstorm IS the dispatch abstraction
"ask_concierge shouldn't be an à-la-carte command — abstract it behind run-brainstorm. run-brainstorm advances the studio UI to the appropriate stage; the procedure must be FOLLOWED. The UI are tools and need to be dispatchable."
- **Model:** the studio stages (brief → concierge → gallery → board) are a followed STATE MACHINE. The MCP tools (`open_studio`/`ask_concierge`/`present_gallery`/`present_board`) are the internal DISPATCH STEPS that advance the UI stage to stage — never called individually "when useful." `run-brainstorm` is the single abstraction that dispatches them in order.
- **DONE (clean, command layer):** `run-brainstorm.md` reframed — "This procedure IS the abstraction; advance the UI stage by stage, never à la carte"; a stage tool out of sequence (board before a gallery pick) is a bug.
- **BLOCKED (code — concurrent-dirty `bridge-server.ts`/`index.ts`/`App.tsx`):** make the sequence STRUCTURALLY enforced/dispatchable so a compliant procedure isn't just prompt-hoped:
  1. Bridge tracks an intake stage; **`present_board` before a recorded gallery pick is REJECTED** with an honest error ("intake incomplete — run concierge→gallery first"). The model structurally cannot skip.
  2. New Discussion **brief submit transitions the studio into a `concierge-expected` state** (a "clarifying…" surface), so the user is never stranded on the panel while the orchestrator catches up — the studio DISPATCHES the procedure forward, not only the orchestrator.
  3. Optionally collapse the à-la-carte tool surface: the stage tools stay, but their doc/registration frames them as run-brainstorm-internal dispatch steps (not general-purpose).

## Progress log
- 2026-07-07 — plan scaffolded; diagnosis recorded; visual-honesty helper+test delivered (7/7); orchestration lock (mandatory intake) + run-brainstorm-as-dispatch-abstraction reframe committed (15f1729); structural half (bridge-enforced ordering + studio stage-dispatch) BLOCKED on the concurrent uncommitted diff.
