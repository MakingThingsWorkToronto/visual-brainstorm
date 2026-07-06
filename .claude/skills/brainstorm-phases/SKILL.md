---
name: brainstorm-phases
description: The five-phase funnel — when to use each phase, what the studio does, and exactly how to interpret each response field into the next round. Load before any multi-round brainstorm.
---

# Driving the Phase Funnel

The studio physically re-architects per `phase`. You choose the phase per board; the funnel
below is the default arc. Don't stay in diverge forever — after 2–3 expanding rounds, force
a narrowing phase. Theories: wiki/Product/phase-funnel.md.

## Phase table

| phase | when to use | studio mechanic | response fields to honor |
|---|---|---|---|
| `diverge` | opening rounds; after a gap note or remix suggests new territory | airy grid, no ceilings | `selectedOptionIds` (energy, not verdicts), `perOptionNotes`, `remixPairs`, `axisValues` |
| `expand` | a direction resonates and the user wants MORE of it | selection grid; gate: ≥1 selection | `selectedOptionIds`: the pool GROWS — add multiple new syntheses/variants of the picks; remove nothing |
| `mutate` | user is circling one direction but it isn't landing; creative block | one option at a time + distortion lenses | `mutations`: for each optionId, the lenses (flip/invert/stretch/compress/tilt/xray) that "revealed something" — next round REGENERATES those options leaning into what the distortion exposed (e.g. `stretch` kept → explore elongated/banner composition; `invert` → dark-first or negative-space variant; `xray` → structure-only skeleton) |
| `wreck` | perfectionism stall; polite feedback; round 1 felt "fine" | saboteur mode, ≥3 flaws gate | `flaws`: each flaw becomes a FIX CANDIDATE next round — present the repaired version beside a version that embraces the flaw as a feature. Thank the sabotage; never defend the work |
| `cluster` | option pool ≥ 8 across rounds; before converging | drag field; distance IS data | `positions`/`clusters`: the user's implicit taxonomy — name the clusters back to them; `gapNotes`: HIGHEST-VALUE SIGNAL — generate the hybrid living between those clusters next round |
| `converge` | pool is rich enough; time to distill | triage gate (keep/kill/merge + 🏁 Final crown, send locked until complete) | `triage`: `keep` → capture_artifact candidates; `kill` → never regenerate this direction; `merge` → produce ONE synthesis of all merge-marked options next round. **`action:"finalize"` + `finalOptionId`: THE answer — capture_artifact it, then run `.claude/commands/plan-closeout.md` immediately (finality triggers closeout)** |

## Transition heuristics

- diverge → diverge: only if the user's elaboration asks for MORE breadth.
- diverge → expand: selections show a direction resonating — amplify it without dropping the rest.
- diverge → mutate: selections cluster on one option with lukewarm notes.
- any → wreck: notes are polite/empty, or the user says "it's fine" — it isn't.
- diverge/mutate → cluster: total presented options ≥ 8.
- cluster → diverge (one round): a gap note names unexplored territory — go get it.
- cluster/wreck → converge: clusters are stable or flaws are fixed; announce the gate in the prompt.
- converge → done: capture artifacts for every keep; offer `park` summary.

## Universal rules

- Narrate the phase shift in the board `prompt` ("The pool is full — time to triage").
- **Execute the `feedbackDigest`** in the tool result line by line — it is the user's
  feedback packaged as labeled, imperative instructions. Nothing in it is optional.
- **Dial deltas are a complete instruction**: moved axisValues with nothing else selected
  MUST produce a visibly re-tuned next round (say so in the prompt) — never a no-op.
- `response.requestedPhase` set (user clicked a phase tab) → the next board uses that phase.
- `axisValues` are taste calibration for ALL future rounds, not one-off data — carry them
  forward as the next board's axis defaults.
- `response.model` set → delegate next-round SVG generation to that model (subagent).
- `response.commands` non-empty → STOP, run `.claude/commands/<command>.md`
  (new-brainstorm → run-brainstorm.md from step 1).
- **The pool is alive — every gesture eliminates or builds.** Maintain a thread-wide KILL
  LIST: an option killed in triage (or its clear stylistic direction) is NEVER presented
  again in that thread. Keeps are converged: captured via capture_artifact, and merge
  verdicts MUST yield exactly one synthesis next round. State the pool changes in the next
  board's prompt ("killed X for good; bred A×B").
- **Selections define the SYNTHESIS VECTOR — the iteration law.** When the user selects
  options, the ENTIRE next round is syntheses of those selections: two picks → ~5 distinct
  offspring all descended from BOTH; one pick → variants spun from it. Unselected directions
  are dropped, never re-shown. Every round must move measurably along this vector; a next
  round that ignores the previous selection is the tool failing at its one job.
- **SYNTHESIS IS BY MEANING, NEVER BY OVERLAY.** Extract what each parent MEANS (state it:
  bulb = "the idea", bubble = "the conversation"), combine the meanings, and draw the
  offspring FRESH ("an idea that speaks" → a bulb with a speech tail). Graphically
  compositing/overlaying the parent SVGs is forbidden — it produces mud, not synthesis.
  For `system-map` boards, combining two options = MERGING the two architectures (union of
  components, reconciled topology, duplicates collapsed), drawn as one clean new diagram.
- **`action:"back"` is the escape hatch.** The user rejected this round: re-present the
  PREVIOUS round's board unchanged (exact options from brainstorm.md / round-N-1
  board.json) and await a fresh answer. Do not advance the funnel; ignore the rest of that
  response as steering.
- **`brainstorm.md` in the thread dir is the append-only text memory** — every round's
  options (labels, descriptions, lineage) and every response digest, auto-written by the
  store. Read it (or load_discussion) before re-synthesizing so round N+1 provably builds
  on rounds 1..N; when resuming a thread it is the first thing to read.

## Changelog
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
- 2026-07-05 — feedbackDigest execution, dial-delta rule, requestedPhase, axis-defaults carry-forward (operator UX-test: dial-only response produced a no-op — never again)
- 2026-07-06 — living-pool rule: thread-wide kill list, selections narrow/build, merges synthesize, pool changes narrated in the next prompt (operator UX-test: selections/kills had no effect)
- 2026-07-06 — SYNTHESIS VECTOR law + brainstorm.md text memory (operator: "disconnect between user action and previous results — select bulb + chat → next 5 options synthesize bulb×bubble; this is how the brainstorm moves forward")
- 2026-07-06 — expand phase (pool grows with syntheses of selections) + finalize contract (🏁 Final crown → capture + plan-closeout) + new-brainstorm seed prompt (operator directives)
- 2026-07-06 — synthesis-by-MEANING law (never overlay parent SVGs; system-map = merge architectures) + back action contract (operator: "expand overlays both images — expand from the meaning in each image")
