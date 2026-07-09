# Plan — Make the mind map model-legible + chat-iterable

**Slug:** mindmap-model-legible-2026-07-09
**Status:** closed 2026-07-09

## Operator ask (2026-07-09)

> Push the boundaries testing the mind map; find gaps in what humans can do. Ensure the mind
> map is usable; its data persists into the discussion folder in a way the MODEL can fully
> read + traverse + finds useful. Create a command to READ a mind map, used by the orchestrator
> to understand user intention; beef up skills that help the orchestrator read the map. The
> mind-map output must be easy for the agent to understand (data + skills + commands) and
> ANCHOR all conversation + plan generation, and be taken into account when submitted. Ensure
> the mind map uses artifact-chat so the user can iteratively improve it.

## Gaps found (anchored to code)

- `session-store.recordBoard` persists `tree.json` + an SVG snapshot; `recordResponse` persists
  `tree-ops.jsonl` + `edited-tree.json`; `feedback.buildFeedbackDigest` summarizes edits — but
  NO traversable OUTLINE of the hierarchy is persisted; the model must parse JSON.
- No `.claude/commands/read-mindmap.md`; `brainstorm-phases` explains ops but not how to READ
  the whole tree as intent or anchor a plan on it.
- The live mind map (`MindmapCanvas`) has NO chat composer — no iterative natural-language
  improvement (the operator's headline ask).
- Mindmap DRAFT is not persisted live (`BoardSurvey` draft effect skips `isMindmap`), so the
  in-progress tree isn't recallable/readable mid-edit.

## Changes

1. **Model-legible persistence (mcp):** `tree-outline.ts` → `treeToOutline(tree)` = indented
   markdown (topic · `id` · note per node) + a header (node/branch/depth counts, notes list).
   `SessionStore` writes `round-NN/tree.md` on present (presented), response (edited), and draft
   (live), and folds the outline into `brainstorm.md`. `buildFeedbackDigest` gains the full
   outline (not just counts). Enable mindmap DRAFT persistence (drop the `isMindmap` skip) so
   the live tree + outline persist for recall.
2. **read-mindmap command + skill (rule 11):** `.claude/commands/read-mindmap.md` — read
   `tree.md` / `edited-tree.json` / `draft.json` / `tree-ops.jsonl`, produce a structured
   "user intention" (hierarchy = what they're building; notes = steering; ops = decision log;
   thin branches = gaps) that ANCHORS the next tree + conversation + plan. `brainstorm-phases`
   mindmap section beefed up to point at it; `run-brainstorm` step (mindmap round + closeout)
   runs read-mindmap first; `plan-closeout` anchors the build plan on the tree.
3. **Mind-map artifact-chat (studio):** a chat panel on the live mind map, addressed to the
   round's mindmap snapshot artifact slug (reuses the slug-parameterized chat + non-destructive
   detour — the canvas stays live, the tree isn't lost). Sending flushes the live-tree draft
   first so the orchestrator reads the CURRENT tree, then improves it (re-presents an improved
   tree = the iterative loop).
4. **Tests (rule 10):** unit — `treeToOutline`, `tree.md` on present/response/draft, mindmap
   draft persistence; human-sim — mind-map chat improves the tree (real browser), gap-hunt the
   human affordances.

## Verification
- `npm run build` + `npm test` green; new `scripts/human-sim-mindchat.mjs` gated.

## Progress log
- 2026-07-09 — plan written; gaps captured.
- 2026-07-09 — IMPLEMENTED + VERIFIED:
  - `apps/mcp/src/tree-outline.ts` `treeToOutline` → `round-NN/tree.md` on present/response/draft;
    folded into `brainstorm.md` + the feedback digest (full outline). Mindmap DRAFT now persists
    (removed the `isMindmap` skip) → live tree + tree.md recallable.
  - `.claude/commands/read-mindmap.md` (registered in the SSOT); `brainstorm-phases` skill +
    `run-brainstorm` (mindmap round) + `plan-closeout` (build plan) invoke it.
  - studio: `MindmapCanvas` maximize icon → the unified `ArtifactFullscreen` (SVG + chat right)
    via `openArtifactChat(mindmapArtifact)`; App finds the snapshot artifact by provenance;
    chat is the iterative-improvement channel (non-destructive detour keeps the live tree).
  - tests: `tests/mindmap-outline.test.mjs` (5) + `scripts/human-sim-mindchat.mjs` (real browser, 4).
  - GREEN: full `build`; `test:unit` 186/186; `smoke` PASS; real-browser journeys
    mindchat 4/4, boardchat 4/4 (regression). The orchestrator's tree IMPROVEMENT via
    read-mindmap→re-present needs a live model (inherent).
  - NOTE: the operator's parallel scribble WIP (read-scribble / reading-scribbles / PhotoScribble)
    briefly blocked the studio build + churned the surface registry; resolved by them mid-cycle.
- 2026-07-09 (fresh-eyes review) — found + fixed:
  - **BUG (semantic): `treeToOutline` flagged EVERY leaf `— thin`**, not just top-level empty
    branches — every deep detail leaf looked like a "gap", which would mislead read-mindmap.
    Fixed to `depth === 1 && no children` (a top dimension the user opened but never filled).
    The old test's `includes()` checks missed it (prefix-matched the buggy suffix); added a
    negative assertion (`!includes('… — thin')` for a deep leaf).
  - **ROBUSTNESS: multi-line topic/note would corrupt the indented outline** — added `oneLine()`
    whitespace-collapse (mirrors tree-svg's XML escaping) so structure survives pasted text.
  - **CLEANUP: inline `import('…').MindTree` type** → top-level `MindTree` import.
  - Reviewed the chat helpers / non-destructive park / draft persistence / optimistic echo — no
    bugs; noted two low-severity edges (exact-duplicate optimistic messages dedupe by text, and
    a user submitting during the ~seconds a chat reply is authored — recoverable via peek_response).
  - GREEN after fixes: full `build`; `test:unit` 188/188; `smoke` PASS; `mindmap-outline` 5/5.
- STATUS: implementation complete + proven on a real browser; close via `/plan-closeout`.
- 2026-07-09 (crash-resume closeout) — PC crashed before /plan-closeout ran; resumed session
  re-proved green (full build; full `npm test` incl. mindchat 4/4, boardchat, livechat, archived),
  then attributed against a LIVE shared tree: peer closeout `515ffd4`
  (artifact-chat-everywhere) had already committed this plan's runtime code + tests + wiki-log
  entries as DECLARED riders (snapshot-verified in a fresh worktree). This closeout lands the
  residue: changelog lines in plan-closeout/run-brainstorm/brainstorm-phases attributed to this
  plan, a CLAUDE.md quick-map row for /read-mindmap, the user-guide mind-map chat doc + its
  wiki-log line, and the archive. Left for peers (declared): run-brainstorm.md carries the
  changelog line uncommitted (token-economy session is LIVE in that file);
  `.github/prompts/read-mindmap.prompt.md` rides the copilot-slash-commands closeout that owns
  the `.github` registry rename (the prompt exists on disk + is registered in the pending
  `.github/agentic-surface-registry.json`).
