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
| `mutate` | user is circling one direction but it isn't landing; creative block | one option at a time + distortion lenses | `mutations`: for each optionId, the lenses (flip/invert/stretch/compress/tilt/xray) that "revealed something" — next round REGENERATES those options leaning into what the distortion exposed (e.g. `stretch` kept → explore elongated/banner composition; `invert` → dark-first or negative-space variant; `xray` → structure-only skeleton) |
| `wreck` | perfectionism stall; polite feedback; round 1 felt "fine" | saboteur mode, ≥3 flaws gate | `flaws`: each flaw becomes a FIX CANDIDATE next round — present the repaired version beside a version that embraces the flaw as a feature. Thank the sabotage; never defend the work |
| `cluster` | option pool ≥ 8 across rounds; before converging | drag field; distance IS data | `positions`/`clusters`: the user's implicit taxonomy — name the clusters back to them; `gapNotes`: HIGHEST-VALUE SIGNAL — generate the hybrid living between those clusters next round |
| `converge` | pool is rich enough; time to distill | triage gate (keep/kill/merge, send locked until complete) | `triage`: `keep` → capture_artifact candidates; `kill` → never regenerate this direction; `merge` → produce ONE synthesis of all merge-marked options next round |

## Transition heuristics

- diverge → diverge: only if the user's elaboration asks for MORE breadth.
- diverge → mutate: selections cluster on one option with lukewarm notes.
- any → wreck: notes are polite/empty, or the user says "it's fine" — it isn't.
- diverge/mutate → cluster: total presented options ≥ 8.
- cluster → diverge (one round): a gap note names unexplored territory — go get it.
- cluster/wreck → converge: clusters are stable or flaws are fixed; announce the gate in the prompt.
- converge → done: capture artifacts for every keep; offer `park` summary.

## Universal rules

- Narrate the phase shift in the board `prompt` ("The pool is full — time to triage").
- `axisValues` are taste calibration for ALL future rounds, not one-off data.
- `response.model` set → delegate next-round SVG generation to that model (subagent).
- `response.commands` non-empty → STOP, run `.claude/commands/<command>.md`.

## Changelog
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
