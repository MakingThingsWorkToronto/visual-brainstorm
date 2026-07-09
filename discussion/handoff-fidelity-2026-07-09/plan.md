# Plan — Handoff fidelity: perfect the two-way Claude ⇄ studio data exchange (2026-07-09)

**Status:** in progress
**Authority:** operator directive — "audit and code review the agentic-to-UI handoff and the MCP … if sufficient data is not passed (either direction), fix it; add MCP data where needed; persist the two-way exchange to disk so it works through crashes; update wiki, agentic layer, code everywhere."
**Grounding:** wiki/Requirements/interaction-protocol.md (§Feedback packaging: "Nothing is dropped"), wiki/System/interface-coverage.md (Known gaps), wiki/Product/phase-funnel.md, three deep audits (protocol/MCP, studio UI, tests/agentic layer) run 2026-07-09.
**Respected in-flight plans:** mindmap-model-legible-2026-07-09 (tree.md legibility — this plan only adds rename/move op emission + TreeOp fields), scribble-legibility-2026-07-09 (seed folder — untouched), token-economy-2026-07-07 (no model-tier changes).

## Audit verdict (current state)

The UI→bridge→disk half is strong and honestly tested. Three structural failures break the
"human time perfectly informs Claude" contract:

1. **Captured-but-never-told (digest fidelity).** `positions` (cluster drag XY — "distance IS
   data") is persisted but NEVER surfaced in the feedback digest (documented drift: the skill
   teaches it, feedback.ts drops it). Deck `keep` verdicts are silent (only kills emit).
   Intake-survey answers are flattened to a word-soup in the browser (question↔answer mapping
   lost). Concierge chip-taps vs typed text merge irrecoverably. Mindmap rename/move are never
   emitted as ops (and `move` has no new-parent field).
2. **Expressiveness ceilings (both directions).** Claude cannot ask a structured question
   mid-round (concierge is intake-only); cannot state per-option rationale; lineage
   (`parents`) is never rendered so the human can't SEE their feedback driving options. The
   human cannot annotate ON a generated option (the scribble pad is intake-only — arrows/boxes
   pointing at a specific element of option C are impossible); cannot say "take the layout of
   A and the palette of C" structurally; cannot flag uncertainty.
3. **Crash-durability holes.** `peek_response` reads only process memory (a persisted
   pre-crash response reads as "pending" forever after restart). Pending concierge/gallery
   questions, the intake gate (`galleryPicked`), the seedBrief handoff, and the queued UI
   commands are memory-only. Persistence writes are non-atomic and a truncated
   `board.json`/`response.json` bricks the whole thread reload. `reopen.md` promises a
   `git mv` no code performs (a resume without it appends rounds inside `_completed/`).

Plus: no deterministic guard cross-checks BoardResponse fields ↔ digest ↔ skills (why drift
№1 shipped green), and `expand` is missing from the `present_board` tool description.

## Phases

### Phase 1 — Digest fidelity (protocol + feedback.ts + guard)
- `feedback.ts`: spatial narrative derived from `positions` (cluster tightness, cross-cluster
  nearest pairs, isolates; also the positions-without-clusters case). Deck `KEEP` line.
- `TreeOpSchema`: optional `oldTopic` (rename), `newParentId`/`newParentTopic` (move).
  `MindmapCanvas.emitEdit` diffs prev↔next tree to EMIT rename/move ops (engine-agnostic —
  no reliance on mind-elixir bus op names). Digest lines show old→new and the new parent.
- `present_board` description: add `expand` to the funnel prose.
- **Guard:** `tests/field-coverage.test.mjs` — every `BoardResponseSchema` key must appear in
  `feedback.ts` (or an explicit exemption list with reasons); every field the
  brainstorm-phases skill cites must exist in the schema. Drift like №1 can never ship green again.

### Phase 2 — Structured intent channels (the visionary core)
- **Mid-round questions (Claude → human):** `Board.questions?: SurveyQuestion[]` (reuse the
  protocol survey shape); `present_board` gains `questions` input; BoardSurvey renders a
  "Claude asks" box (reuse the Survey component); answers ride
  `BoardResponse.questionAnswers: Record<qid,string[]>`; digest emits `Answer — "<question>": …`.
- **Rationale + lineage (Claude → human):** `BoardOption.rationale?` ("why I drew this /
  which of your feedback drove it") rendered under the option + in fullscreen; `parents`
  rendered as lineage chips (id→label resolved from cached rounds). svg-artisan +
  brainstorm-phases teach authoring rationale that QUOTES the user's feedback.
- **Annotate-on-option (human → Claude):** fullscreen viewer gains an Annotate mode reusing
  PhotoScribble with the option SVG as the pad background. Marks (incl. arrow tail→head,
  palette color names) ride `BoardResponse.optionAnnotations: Record<optionId,
  ScribbleAnnotations>`; a rasterized composite PNG rides the existing `attachments` channel
  (name `annotated-<optionId>.png`) so it persists via `attachments/` and is VISION-readable.
  Digest: per-option mark summary + "VIEW <savedPath>".
- **Remix recipes:** `BoardResponse.remixNotes: Record<'a×b',string>` — inline "what to take
  from each?" input when a remix pair forms; digest appends the recipe to the remix line.
- **Uncertainty:** `BoardResponse.uncertainties: string[]` (option ids) — an "unsure" toggle
  on grid + triage cards; digest instructs a clarifying variant or a mid-round question.
- **Concierge structure:** `ConciergeExchange` gains `picked: string[]` + `typed: string`
  (kept alongside the assembled `answer`); studio sends structure; `ask_concierge` returns it.
- **Intake survey structure:** new-brainstorm command payload gains
  `intakeAnswers: {question, answers[]}[]`; the panel ships them; the bridge compiles
  per-question seedNote lines (the flattened prompt stays for compatibility).
- **Gallery pick:** returns `{method, label, recommended, reason}` (was `method` only).

### Phase 3 — Crash durability (two-way exchange persisted to disk)
- `peek_response`: disk fallback — after memory, scan the attached store's rounds for the
  boardId's persisted response.
- Intake gate durable: `SessionInfo.intake?: {complete, method?}` written by
  `recordGalleryPick`; `bridge.intakeComplete` reads memory ∪ session.json.
- Pending concierge/gallery persisted: `<thread>/intake-pending.json` (question or gallery +
  any answer that arrived with no live waiter). Rehydrated into StudioState on attach; a
  re-called `ask_concierge`/`present_gallery` returns the stored answer/pick immediately.
- seedBrief persisted: `<discussionRoot>/.logs/pending-brief.json`; cleared on submit.
- Queued UI commands journaled: `<discussionRoot>/.logs/pending-commands.jsonl` (append
  queued/drained records with the FULL seedNote); undrained entries reload on start.
- Atomic writes (`tmp + rename`) in session-store; `open()` guards `board.json`/
  `response.json` parse per-round (skip + honest log, never brick the thread).
- `/api/respond` logs any unknown keys zod strips (schema-drift tripwire).
- Reopen integrity: the bridge itself moves the thread folder out of `_completed/` on the
  reopen command (honest fs move; git sees rename); `reopen.md` stops promising a manual
  `git mv`; test covers reopened-thread resume landing rounds in the live root.

### Phase 4 — Tests (rule 10 — ship WITH the change)
- `tests/protocol.test.mjs`: round-trips for every new field (additive).
- `tests/feedback.test.mjs`: positions narrative, deck keeps, questionAnswers, uncertainties,
  remixNotes, optionAnnotations, rename/move digest lines (additive — file is peer-dirty, append only).
- `tests/field-coverage.test.mjs` (new): the drift guard.
- `tests/session-store.test.mjs` + new `tests/durability.test.mjs`: atomic write, corrupt-file
  skip, intake persistence, peek fallback, pending-command journal reload, reopen move.
- Canonical fixtures: update ONLY if a StudioState/endpoint shape changes (none planned).

### Phase 5 — Wiki + agentic layer (same change, rule 12)
- wiki: interaction-protocol (new fields, digest lines, §Durability contract),
  system-architecture (persistence layout additions), interface-coverage (Table 2 rows +
  Known gaps closed), phase-funnel (response contract), user-guide (new affordances),
  log.md lines, `wiki_reload`.
- agentic: brainstorm-phases SKILL (interpret questionAnswers/uncertainties/remixNotes/
  optionAnnotations/positions narrative; author mid-round questions + rationale),
  run-brainstorm, svg-artisan (rationale authoring), brainstorm-orchestrator (recovery via
  disk-backed peek), reopen.md. All peer-dirty files: ADDITIVE edits only.

### Phase 6 — Verify
- `npm run build` + `npm test`; attribute any pre-existing reds to their owning plan before
  touching (shared-tree discipline).

## Progress
- [x] Audit (3 deep sweeps) — 2026-07-09
- [x] Phase 1 — digest fidelity — DONE 2026-07-09
- [x] Phase 2 — structured intent channels — DONE 2026-07-09
- [x] Phase 3 — crash durability — DONE 2026-07-09
- [x] Phase 4 — tests — DONE 2026-07-09: durability.test.mjs (5 crash-restart round-trips) +
  field-coverage.test.mjs (drift guard) + 9 feedback digest tests + intake-gate durability
  assertions + api-matrix/smoke assertions updated to the structured returns
- [x] Phase 5 — wiki + agentic layer — DONE 2026-07-09 (resume session): page edits verified
  IN PLACE (interaction-protocol §Durability contract, system-architecture persistence layout,
  interface-coverage gaps CLOSED, phase-funnel response contract, user-guide affordances;
  SKILL/run-brainstorm/svg-artisan/orchestrator carry the new fields). Resume closed two gaps
  the delegated session dropped: (a) the 5 rule-2 `wiki/log.md` lines + `wiki_reload`
  (wiki-librarian, 20 pages indexed); (b) `reopen.md` step 2 still instructed the manual
  `git mv` its own header said the bridge performs — now verify-not-move with the manual move
  only on the honest failure note (+ changelog line).
- [x] Phase 6 — verify: re-run on the converged shared tree 2026-07-09 (resume session):
  `npm run build` GREEN (exit 0, all workspaces); `npm run test:unit` 217/217;
  `npm run smoke` PASS (real bridge — incl. structured concierge/gallery returns);
  `npm run smoke:ui` PASS (all 6 phase surfaces). Browser human-sims not run in the earlier
  sandbox (environmental; assertions were updated where contracts changed).

**All six phases complete + verified — ready for `/plan-closeout`.**

## Implementation record (for resume — exact state as of 2026-07-09)

**All code changes are IN and `npm run build` is green.** Working tree only (not committed).

### packages/protocol/src/index.ts
- `SurveyQuestionSchema` MOVED above the Board section (now shared by intake + boards).
- `BoardOptionSchema.rationale?` (why drawn, quotes user feedback).
- `Board.questions: SurveyQuestion[] (default [])` — mid-round "Claude asks".
- `BoardResponse` new: `remixNotes: Record<'a×b',string>`, `questionAnswers: Record<qid,string[]>`,
  `uncertainties: string[]`, `optionAnnotations: Record<optionId, ScribbleAnnotations>`.
- `TreeOpSchema` new optional: `oldTopic`, `newParentId`, `newParentTopic`.
- `ConciergeExchange` new: `picked: string[]`, `typed: string` (defaults).
- `SessionInfo.intake?: {complete, method?}` — durable intake gate.

### apps/mcp
- `feedback.ts`: deck KEEP line; remix recipe appended; `Answer — "<question>"` lines
  (resolves board.questions text); `Annotated ON "<label>"` lines (mark counts + note texts +
  VIEW <savedPath> of `annotated-<id>.png`); `UNSURE` line (never a silent kill);
  `positionNarrative()` helper (cluster tightness welded/close/loose, closest cross-cluster
  pair <40 = hybrid invitation, outliers ≥35 nearest-neighbor, positions-without-clusters
  near pairs <22); rename shows `oldTopic→topic`; move names `newParentTopic`; nudge signals
  now include optionAnnotations + uncertainties.
- `index.ts`: OptionInput `rationale`; present_board `questions` input (max 4) + funnel prose
  now names `expand` + mid-round-questions/annotate/unsure guidance; board carries
  questions/rationale; `peek_response` falls back to `store.rounds[].response` (disk) after
  memory; `ask_concierge` returns `{answer,picked,typed}`; `present_gallery` returns
  `{method,label,recommended,reason}`.
- `session-store.ts`: `writeFileAtomic` (tmp+rename) for ALL JSON/svg writes; `open()` guards
  corrupt board.json/response.json per-round (skip + log, never brick the thread);
  `recordConcierge(question,answer,picked?,typed?)` (structure line in brainstorm.md);
  `recordGalleryPick` persists `info.intake={complete,method}` to session.json;
  `writeIntakePending/readIntakePending/clearIntakePending` → `<thread>/intake-pending.json`;
  `SessionStore.unarchive(root,id)` moves a thread out of `_completed/`.
- `bridge-server.ts`: types `ConciergeAnswer`/`GalleryPick`/`IntakePending`; constructor runs
  `reloadCommandJournal()` + `reloadSeedBrief()` + `rehydrateIntake()`; `intakeComplete` reads
  memory ∪ session.json; `attachStore` re-rehydrates; askConcierge/presentGallery persist
  pending BEFORE broadcast, keep the file on timeout, return stored answers/picks on re-call
  (crash recovery); `/api/concierge` accepts `picked`/`typed` + no-resolver durable-store path;
  `/api/gallery-pick` no-resolver path (records pick + opens gate durably); UI-command queue
  journaled to `<root>/.logs/pending-commands.jsonl` (queued/drained records, undrained reload);
  seedBrief persisted to `<root>/.logs/pending-brief.json` (cleared on new-brainstorm dispatch);
  `/api/respond` logs zod-stripped unknown keys (drift tripwire); `/api/command` accepts
  `intakeAnswers:[{question,answers[]}]` → per-question seedNote lines; reopen: the bridge
  ITSELF now calls `SessionStore.unarchive` (seedNote says the move already happened; honest
  failure note if the move fails).

### apps/studio
- `useBridge.ts` answerConcierge(id, answer, picked, typed); `ConciergeIntake` sends structure.
- `NewDiscussionPanel`: `NewDiscussionExtras.intakeAnswers` built from questions+answers on send.
- `PhotoScribble`: `initial?: Annotation[]` + `lockPhoto?` props (annotate reuse).
- `ArtifactFullscreen`: `annotate?: FullscreenAnnotate` prop → ✏️ Annotate toggle; rasterizes
  the shown SVG (svgDims parses viewBox) via renderCompositePng into the pad background;
  pointer events stopPropagation so drawing doesn't pan.
- `BoardSurvey`: "Claude asks" box (SurveyField reuse) → questionAnswers; unsure toggle per
  grid card (amber) → uncertainties; ✏️ annotated indicator; rationale + lineage chips
  (`lineageLabels` prop, ↑ parent labels); remix-recipes box → remixNotes; annotate wiring on
  the fullscreen preview (optionMarks state, toScribbleContent inverse restores drafts); send()
  rasterizes `annotated-<id>.png` composites onto attachments; touched includes unsure+marks.
  NOTE: a peer session had stubbed the new response fields with empties — replaced with real wiring.
- `App.tsx`: `lineageLabels` memo (id→label over all rounds) passed to both BoardSurvey mounts.
- `MindmapCanvas`: emitEdit diffs prev↔next tree (indexTree) → EMITS rename (with oldTopic) and
  move (with newParentId/Topic) ops. Engine-agnostic (no mind-elixir bus op names).

### Tests state
- UPDATED (were red from the contract change, now green-intent): `tests/api-status-matrix.test.mjs`
  (structured concierge/gallery resolutions), `tests/intake-gate.test.mjs` (+ session.json
  durability assertions).
- ADDED: `tests/feedback.test.mjs` — 9 appended tests (deck keeps, positions narratives ×3,
  questionAnswers, unsure, remix recipe, optionAnnotations, rename/move).
- ADDED: `tests/field-coverage.test.mjs` — the drift guard (schema↔digest↔skill↔tool-desc).
- REMAINING: `tests/durability.test.mjs` — concierge/gallery crash-rehydrate round-trips
  (timeout→new Bridge→POST no-resolver→re-call returns stored), command-journal reload,
  seedBrief reload, corrupt-round-skip reload, SessionStore.unarchive. Then full `npm test`.

### Wiki + agentic layer (Phase 5) — delegated briefs
Pages to update: Requirements/interaction-protocol.md (new fields, digest lines, NEW
§Durability contract), Requirements/system-architecture.md (persistence layout: intake-pending
.json, session.json intake, .logs/pending-commands.jsonl, .logs/pending-brief.json, atomic
writes, reopen moved by bridge, structured concierge/gallery returns), System/
interface-coverage.md (Table 2 rows + Known gaps: queued-commands + seedBrief + intake gaps
now CLOSED), Product/phase-funnel.md (response contract: questionAnswers/uncertainties/
remixNotes/optionAnnotations; Claude-asks box), wiki/user-guide.md (annotate an option, unsure,
remix recipes, Claude asks), log.md lines, wiki_reload.
Agentic: .claude/skills/brainstorm-phases/SKILL.md (interpret the new response fields; author
mid-round questions + per-option rationale), .claude/commands/run-brainstorm.md,
.claude/agents/svg-artisan.md (rationale authoring rule), .claude/agents/
brainstorm-orchestrator.md (disk-backed peek recovery, structured concierge/gallery returns),
.claude/commands/reopen.md (bridge already moves the folder — no git mv step).
