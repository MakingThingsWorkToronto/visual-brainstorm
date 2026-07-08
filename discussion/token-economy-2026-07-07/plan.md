# Token-economy for the Visual Brainstorm

**Status:** open — 2026-07-07 (fork resolved by operator; see Decisions locked)
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
| 1 | **Instrument & baseline + quality bake-off** | Per-session token accounting split by sink (generation / intake / orchestration) from `progress.jsonl` deltas, PLUS the **description ratio** (brief tokens ÷ implementer output) and a **regeneration-waste** count (full redraws that could have been mutations). Separately, a **quality bake-off among AVAILABLE models** (Opus vs Sonnet on the same terse brief) to *rank* the best-SVG model for the default — a quality ranking, NOT a cost tradeoff. Note: subagent token usage likely isn't captured in the pipe today — expect real instrumentation work, not just a report. No production change yet. | pending |
| 2 | **Explicit model selection + terse-brief discipline** | Fix the `model:undefined` fallthrough (`NewDiscussionPanel.tsx:352` / `feedback.ts`) so SVG generation ALWAYS routes to an explicit model: the user's pick, else the bake-off winner (best-SVG default). Set `svg-artisan` frontmatter + `run-brainstorm` step 4 accordingly. Enforce terse-brief discipline so the description ratio stays low. Reconcile `wiki/System/model-tiering.md` (the SVG carve-out is "best available model, explicit", not "opus by omission"). | pending |
| 3 | **Mutate-don't-regenerate on tweaks** (primary saving) | Distinguish *tweak* (dials/notes, same direction) from *redirect* (new direction). On a tweak, pass the prior round's captured SVGs to the artisan with a targeted-mutation instruction instead of fresh authoring. Codify in `run-brainstorm` step 4 + `svg-artisan`. Continuity (quality) + pays only the delta (tokens). This is where most of the real saving lives now that the model is fixed. | pending |
| 4 | **Orchestrator context economy** | Orchestrator works from a compact rolling digest (recent rounds + running direction from the per-round decision blocks) instead of a full `brainstorm.md` re-read each round. Split `svg-authoring` into full-craft (artisan loads) vs a compact "what-good-looks-like / validity scan" reference (orchestrator loads) so the orchestrator stops carrying the full craft doc it delegates away. | pending |
| 5 | **Intake content economy** | Reduce intake generation cost WITHOUT a cheaper model (decision 3): gallery minis stay on the best model but are minimal in CONTENT (few elements → fewer output tokens) and generated once/cached, not redrawn. Update `run-brainstorm` step 0 and the gallery-mini delegation. | pending |
| 6 | **Codify + verify savings** | `wiki/System/model-tiering.md` + `wiki/user-guide.md` updated; `wiki/log.md` lines. Re-run a real session, compare token accounting vs the phase-1 baseline — prove the cut is real and the SVGs are unchanged in quality (same model). Then closeout. | pending |

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
