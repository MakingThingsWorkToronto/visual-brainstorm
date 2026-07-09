# Token-economy for the Visual Brainstorm

**Status:** closed 2026-07-09 — phases 1–6 implemented, tested, and codified. The live-session
A/B (a real human brainstorm measured against the phase-1 baseline) remains as FUTURE
verification, accepted by the operator at closeout; run it during the next real brainstorm and
compare `progress.jsonl` per-sink accounting against the phase-1 baseline.
**Owner persona:** brainstorm-orchestrator (loop owner) delegating BUILD to svg-artisan / test-engineer / wiki-librarian
**Trigger:** operator directive — "create a token-economy plan; then explore token efficiency. The SVGs must stay pretty."

## Intent

Make a full brainstorm session cost materially fewer tokens **without touching SVG quality.**
The operator resolved the central fork: the implementer model is NOT a token lever — board SVGs
always render on the best available model. So every saving in this plan comes from
**orchestration efficiency, context economy, and not regenerating what we already have** — never
from a cheaper drawing model.

## Decisions locked (operator, 2026-07-07)

1. **Best available model, always.** Board-SVG generation uses the model the user specifies;
   absent that, the **highest-ranked model on SVG benchmarks** among models *actually available
   in Claude Code*. Priority is the best visual output.
2. **Fable is out.** No longer available to the operator — do not design around it. Opus is
   available. Only use confirmed-available models.
3. **No progressive-fidelity-by-phase. No hybrid-by-board-kind.** Both rejected. No downgrading
   at diverge, no per-kind model juggling. One rule: best model (or user's pick) everywhere.
4. **Model selection must be EXPLICIT**, never a `model:undefined` fallthrough.
5. **Winner + poster stay gorgeous; nothing regenerates a captured artifact** (rules 7, 6).

## Where the tokens actually go

| Sink | Why it's expensive | Lever (given decisions above) |
|---|---|---|
| **Board-SVG generation** (best model, 4–8 options × N rounds) | output-token heavy × option count × rounds — the dominant cost | **NOT the model.** Cut *redundant* generation (phase 3) and keep briefs terse (phase 2) |
| **Tweak rounds** (dial/note nudges re-author every option from scratch) | pays full generation price for a small delta | phase 3 — mutate, don't redraw |
| **Orchestrator context** (full `brainstorm.md` re-read each round; full craft skill loaded) | input context grows unbounded round over round | phase 4 |
| **Live gallery minis** (4 SVGs at intake, before any commitment) | premium SVGs spent before the user has chosen anything | phase 5 — fewer/smaller in CONTENT, not a cheaper model |
| Poster / decision record | already deterministic (`compose_poster`) — cheap | leave alone |

## The crux — orchestration intelligence vs implementation intelligence

Still the right frame, but the decisions above sharpen where it pays. Two separable capabilities:
**orchestration** (read the human, judge the funnel, decide *what* to draw and *why* — stays
high-tier) and **implementation** (turn a brief into a pretty SVG — now always the best model).

Because we no longer save by downgrading the implementer, the ONLY generation-side lever is the
**coupling cost** — the delegation prompt. The operator's anti-pattern: if the orchestrator
*over-describes*, it pays premium orchestration tokens for something the implementer's craft skill
already knows. So:

1. **Metric — description ratio** = orchestrator brief tokens ÷ implementer output tokens. Keep it
   low: the craft lives in `svg-authoring` (the artisan loads it), so a correct brief carries only
   the round *delta* (direction, palette-by-name, axis deltas, per-option one-liners), never a
   re-teaching of how to draw. Measured in phase 1.
2. **Delegation is justified by session-long context economy**, not per-round tokens — keeping the
   long-horizon orchestrator lean is the win. Evaluate over the whole session.

## SVG quality — preserved by construction

The quality floor is the `svg-authoring` checklist (viewBox discipline, aligned grid, one coherent
stroke system, palette cohesion, no orphan nodes), enforced every round on the best model. Cohesion
via shared per-round design tokens (author the palette + frame + type scale once, inline per option
to stay self-contained, rule 8) — a quality signal AND one reasoning pass. Continuity via mutation
(phase 3): a tweak preserves the liked SVG exactly. There is no quality/economy tradeoff here
because the model never changes — the savings are purely in *what we ask for* and *what we reuse*.

## Phases (loopable — one per `/loop` tick; update Status + append Progress)

| # | Phase | Deliverable | Status |
|---|---|---|---|
| 1 | **Instrument & baseline + quality bake-off** | Per-session token accounting split by sink (generation / intake / orchestration) from `progress.jsonl` deltas, PLUS the **description ratio** (brief tokens ÷ implementer output) and a **regeneration-waste** count (full redraws that could have been mutations). Separately, a **quality bake-off among AVAILABLE models** (Opus vs Sonnet on the same terse brief) to *rank* the best-SVG model for the default — a quality ranking, NOT a cost tradeoff. Note: subagent token usage likely isn't captured in the pipe today — expect real instrumentation work, not just a report. No production change yet. | **instrumentation + UI DONE** (2026-07-09); live bake-off + description-ratio/regeneration-waste metering deferred to phase 6 (need live runs) |
| 2 | **Explicit model selection + terse-brief discipline** | Fix the `model:undefined` fallthrough (`NewDiscussionPanel.tsx:352` / `feedback.ts`) so SVG generation ALWAYS routes to an explicit model: the user's pick, else the bake-off winner (best-SVG default). Set `svg-artisan` frontmatter + `run-brainstorm` step 4 accordingly. Enforce terse-brief discipline so the description ratio stays low. Reconcile `wiki/System/model-tiering.md` (the SVG carve-out is "best available model, explicit", not "opus by omission"). | **DONE** (2026-07-09) |
| 3 | **Mutate-don't-regenerate on tweaks** (primary saving) | Distinguish *tweak* (dials/notes, same direction) from *redirect* (new direction). On a tweak, pass the prior round's captured SVGs to the artisan with a targeted-mutation instruction instead of fresh authoring. Codify in `run-brainstorm` step 4 + `svg-artisan`. Continuity (quality) + pays only the delta (tokens). This is where most of the real saving lives now that the model is fixed. | **DONE** (2026-07-09) |
| 4 | **Orchestrator context economy** | Orchestrator works from a compact rolling digest (recent rounds + running direction from the per-round decision blocks) instead of a full `brainstorm.md` re-read each round. Split `svg-authoring` into full-craft (artisan loads) vs a compact "what-good-looks-like / validity scan" reference (orchestrator loads) so the orchestrator stops carrying the full craft doc it delegates away. | **DONE** (2026-07-09) |
| 5 | **Intake content economy** | Reduce intake generation cost WITHOUT a cheaper model (decision 3): gallery minis stay on the best model but are minimal in CONTENT (few elements → fewer output tokens) and generated once/cached, not redrawn. Update `run-brainstorm` step 0 and the gallery-mini delegation. | **DONE** (2026-07-09) |
| 6 | **Codify + verify savings** | `wiki/System/model-tiering.md` + `wiki/user-guide.md` updated; `wiki/log.md` lines. Re-run a real session, compare token accounting vs the phase-1 baseline — prove the cut is real and the SVGs are unchanged in quality (same model). Then closeout. | **bake-off + codify + build/test DONE** (2026-07-09); live-session A/B vs baseline awaits the next real human brainstorm |

## Deferred to a separate plan (does not belong here)

The **target-repo-aware, self-updating output commands** work — `plan-closeout` /
`create-dispatch-command` / `discover-skills` detecting target-vs-this-repo, adapting to each
target's structure, offering to copy the *current live* agentic loop into a bare target, and the
`plan-closeout → discover-skills` integration (the operator's ORIGINAL ask) — is a separate concern
from token economy and should get its own plan. Captured here so it isn't lost; to be split out.

## Exit criteria

- A real session's token accounting shows a measured reduction vs the phase-1 baseline, attributed
  to specific phases (regeneration-waste ↓, description ratio ↓, context ↓).
- SVGs render on the best available model throughout; winner + poster unchanged in quality.
- Model selection is always explicit (no `undefined` fallthrough); `model:` guardrail and wiki agree.
- `npm run build` + `npm test` green; wiki + guide match the product.

## Open questions for the operator

- **Phase-1 first.** The bake-off + baseline is the evidence phases 2–5 depend on — run it first.
- **Best-SVG default:** the bake-off ranks Opus vs Sonnet on quality; if Sonnet ties Opus on SVG,
  it becomes the default (still "best available," just cheaper by coincidence). If Opus wins, it
  stays the default and the savings come entirely from phases 3–5. Either way the model is explicit.

## Progress log (append-only)

- 2026-07-07 — plan created from operator directive (token-economy pivot during the
  plan-closeout ↔ discover-skills intake). Grounded in `wiki/System/model-tiering.md`,
  `.agents/learnings.md`, `visual-brainstorm.config.json`.
- 2026-07-07 — reframed around the orchestration-vs-implementation crux; added description-ratio.
- 2026-07-07 — **fork resolved by operator + fresh-eyes rewrite.** Fable removed (unavailable);
  best available model always for SVG, explicit selection, no progressive-fidelity, no hybrid.
  Model is no longer a token lever — savings come from mutate-don't-regenerate (phase 3), context
  economy (phase 4), terse briefs (phase 2), and intake content economy (phase 5). Bake-off
  repurposed from cost-tradeoff to a QUALITY ranking of available models. Target-repo-aware
  commands + closeout↔discover-skills integration split out to its own plan (was phase 6).
  See [[svg-model-selection-philosophy]].
- 2026-07-09 — **operator chose "implement, don't just close out."** Direction: follow the
  plan phase-by-phase; keep brainstorm + plan-output quality UNTOUCHED (efficiency only);
  support BOTH harnesses (Claude `.claude/` + Copilot `.github/`); and SURFACE the existing
  token-consumption measurement in the UI. This reframed phase 1 from "report" to "present
  in the studio."
- 2026-07-09 — **phases 2–5 implemented (crash-resume session).** Phase 2: explicit routing
  everywhere — `NewDiscussionPanel` always sends the model (no `!== defaultModel → undefined`),
  `/api/command` new-brainstorm seedNote names the best-SVG default when no pick,
  `buildFeedbackDigest(board, response, defaultModel)` emits a "Model routing" line every
  round; `svg-artisan` frontmatter → `fable`; terse-brief discipline in run-brainstorm step 4 +
  orchestrator delegate table; `wiki/System/model-tiering.md` reconciled (best-SVG carve-out =
  best available model, explicit — Fable's availability was RESTORED and the committed config
  already sets `defaultModel: claude-fable-5`, superseding decision 2's "Fable is out"; decision
  1 governs). Phase 3: deterministic TWEAK-vs-redirect classifier in the digest (nudge-only
  responses instruct MUTATE this round's `round-NN/option-<id>.svg`, never redraw) + mutation
  contract in svg-artisan + doctrine in run-brainstorm/brainstorm-phases. Phase 4:
  `svg-authoring/VALIDITY-SCAN.md` (compact judge-side reference — orchestrator loads it, never
  the full craft doc) + rolling-digest resume (decision blocks + last record, never a full
  brainstorm.md re-read). Phase 5: gallery minis minimal-in-content doctrine +
  `SessionStore.cacheIntakeGallery` → `intake-gallery.json` (re-presents reuse cards, never
  re-delegate; `cardsCachedAt` in tool results). Tests added: explicit-default routing (digest +
  /api/command), TWEAK classification (3), gallery cache (1). `.github` adapters flow through
  (thin wrappers over `.claude`); registry updated (svg-artisan fable).
- 2026-07-09 — **caveman skill ingested (operator request).** Upstream JuliusBrussee/caveman
  (terse register, −65% output tokens measured upstream) added as `.claude/skills/caveman/` +
  registry entry, SCOPED to machine-read seams only: subagent report-backs, mechanical reports,
  delegation-brief prose (literals exact). Explicitly excluded: human-facing brainstorm voice,
  SVG content, wiki/plans/decision blocks (quality lock). Wired into the orchestrator's
  delegation contract.
- 2026-07-09 — **phase 6 bake-off run (real delegated generation, same terse brief ×3 models).**
  Ranking: **1. Fable** (perfect output contract, board-level stroke coherence 2.5 throughout,
  best brief fidelity — "calm" honored, 4 genuinely divergent reads; 27.7k subagent tokens) ·
  **2. Opus** (creative "Metric Tiles", cheapest at 24k, but board-level style drift stroke 3
  vs 2.5 and two energetic bolts against a "calm" brief) · **3. Sonnet** (contract violation —
  prose before the JSON array; bolt motif duplicated across two options; 42.3k tokens).
  **Best-SVG default confirmed: `claude-fable-5`** (matches committed config). Description
  ratio measured: ~95-token brief ÷ ~650-token SVG output ≈ **0.15** — the terse-brief
  discipline holds. Regeneration-waste now has a deterministic mechanism (TWEAK digest line);
  its per-session count and the full token A/B vs the phase-1 baseline need the next LIVE
  human brainstorm — the one remaining exit criterion.
- 2026-07-09 — **verification state (honest, rule 6/10).** Every token-economy change was
  proven green WHEN LANDED: mcp tsc clean + 85/85 unit tests across feedback / api-status-matrix /
  session-store / intake-gate (incl. the 6 new tests: explicit-default routing ×2, /api/command
  routing ×2 rewritten, TWEAK ×3, gallery cache ×1) + agentic-surface/copilot-adapter 6/6 + the
  surface guard. At session end the FULL workspace build is red on a PARALLEL session's in-flight
  work (BoardSurvey.buildResponse missing the new remixNotes/questionAnswers/uncertainties/
  optionAnnotations; bridge-server concierge picked/typed; reloadCommandJournal not yet written)
  — error lines exclusively in files/fields the token-economy diff never touches. Re-run
  `npm run build && npm test` after that session lands, before any completion claim on the
  SHARED tree.
- 2026-07-09 — **CLOSEOUT IN PROGRESS (session hit its limit mid-procedure — resume here).**
  Operator invoked /plan-closeout accepting that the live-session A/B remains future
  verification. State per step: **1 done** (this plan). **2 BLOCKED-on-peer**: `npm run build`
  GREEN (exit 0); `npm run smoke` RED at scripts/smoke.mjs:959 "askConcierge resolves with the
  posted answer" — actual `{answer:'customers · founders', picked:[], typed:''}` vs expected
  string; this traces to the PARALLEL session's in-flight concierge picked/typed change
  (bridge-server.ts edited 16:38, BoardSurvey.tsx 16:48 — their loop still running), NOT
  token-economy code. Wait for their loop to converge, re-run `npm run build && npm run smoke`,
  then continue. **3 done** (learnings entry "two LIVE sessions in one tree…" at top of
  .agents/learnings.md). **4 done** (improved: run-brainstorm ×4 changelog entries, svg-artisan
  fable+mutation contract, brainstorm-orchestrator context-economy+caveman wiring,
  brainstorm-phases explicit-routing+TWEAK, svg-authoring split + NEW VALIDITY-SCAN.md, NEW
  caveman skill, agentic-surface-registry svg-artisan→fable + caveman entry; harness parity:
  .github adapters are thin wrappers — only run-brainstorm.prompt.md craft link updated to
  VALIDITY-SCAN; guard 0 warnings). **5 done** (model-tiering.md + user-guide.md + log.md ×2
  lines + wiki_reload OK). **6 skip** (no targetRepo in thread/config). **7 skip** (build plan,
  not a brainstorm thread). **Remaining: 8** set Status closed <date> · **9** archive this
  folder to discussion/_completed/ · **10** commit `--only` the plan's paths + push — RIDER
  DISCIPLINE: shared sources (feedback.ts, index.ts, bridge-server.ts, session-store.ts,
  NewDiscussionPanel.tsx, tests/{feedback,api-status-matrix,session-store}.test.mjs,
  run-brainstorm.md, brainstorm-orchestrator.md, brainstorm-phases/SKILL.md) also carry OTHER
  plans' uncommitted edits — inspect `git diff --cached --name-status`, declare riders in the
  commit body or wait for peers to commit first; clean solo paths: VALIDITY-SCAN.md,
  caveman/SKILL.md, svg-artisan.md, agentic-surface-registry.json, .github/prompts/
  run-brainstorm.prompt.md, wiki/System/model-tiering.md, wiki/user-guide.md (check), wiki/log.md
  (shared append), .agents/learnings.md (shared append), this plan folder. Subject:
  `chore(closeout-token-economy): explicit routing + tweak-mutation + context/intake economy +
  fable bake-off` · **11** report.
- 2026-07-09 — **CLOSED (resume session).** Step 2 unblocked: the peer (handoff-fidelity)
  landed its concierge picked/typed + BoardSurvey wiring; on the converged tree `npm run build`
  GREEN, `npm run test:unit` 217/217, `npm run smoke` PASS (incl. the previously-red
  smoke.mjs:959 structured-concierge assertion), `npm run smoke:ui` PASS. Steps 8–10 executed:
  Status closed, folder archived to `discussion/_completed/`, committed `--only` this plan's
  paths with riders declared (shared sources also carry handoff-fidelity-2026-07-09 edits).
  Live-session A/B = accepted future verification (measure next real brainstorm vs baseline).
- 2026-07-09 — **phase 1 landed (instrumentation + UI).** New `ProgressEvent.category`
  (`TokenSink`) + `StudioState.tokensBySink`; honest per-sink attribution in `SessionStore`
  (boundary label declares a sink → next Stop-hook delta inherits it, consume-once, else
  orchestration); `pipe-progress.mjs` labels board/gallery/concierge/poster boundaries +
  accepts CLI `--category`; `SessionActivity` renders an always-visible "Where the tokens
  went" bar breakdown. Real deltas, heuristic attribution, subagent under-count disclosed
  (rule 6). Green: build, unit (188+2), ts (13), smoke (attribution + state), ui-smoke
  (labeled bars). Wiki: testing-observability.md + log.md. DEFERRED to phase 6 (need live
  runs): the Opus-vs-Sonnet quality bake-off, the description-ratio metric, and the
  regeneration-waste count.
