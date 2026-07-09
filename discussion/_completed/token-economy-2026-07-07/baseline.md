# Token-economy baseline + live-session A/B procedure

The plan closed 2026-07-09 with ONE piece of future verification outstanding: a live human
brainstorm measured against this baseline. This file is that baseline — written down so the A/B
is runnable by whoever drives the next real session, without archaeology.

## Baseline numbers (measured, with honest provenance)

| Metric | Value | Provenance / caveat |
|---|---|---|
| **Fresh 4-option board, Fable** | **≈ 27.7k subagent tokens** | Phase-6 bake-off (2026-07-09): real delegated generation, same terse brief. THE number a TWEAK round must beat — a mutation round paying ~27k has saved nothing. (Opus 24.0k, Sonnet 42.3k on the same brief.) |
| **Description ratio** | **≈ 0.15** | ~95-token orchestrator brief ÷ ~650-token per-option SVG output (bake-off). Guardrail: stay ≤ 0.2 — above that the orchestrator is re-teaching craft the artisan's skill already owns. |
| **Whole-session reference** | input 871,528 / output 2,963,944 / **total 3,835,472** over 31 turn-deltas | The 2026-07-08 "New discussion" thread (`discussion/2026-07-08-0010-new-discussion/progress.jsonl`), 2026-07-08→09. **Weak control**: a mixed dev+brainstorm Claude Code session with no round structure and NO per-sink categories (pre-instrumentation). Order-of-magnitude reference only. |
| **Per-sink split** | none exists pre-change | Instrumentation landed WITH this plan — there is no clean pre-change per-sink baseline, by construction. The A/B therefore leans on the per-board and ratio baselines above, not on a sink-vs-sink diff. |

## A/B procedure (run during the NEXT real human brainstorm)

1. **Run the brainstorm normally** (studio + `/run-brainstorm`). Instrumentation is automatic:
   the `.claude/settings.json` hooks pipe turn deltas via `scripts/pipe-progress.mjs`, tool
   boundaries declare sinks, `SessionStore` attributes (boundary → next delta, consume-once,
   else `orchestration`).
2. **During the session**, the studio's Session activity panel shows "Where the tokens went"
   live — sanity-check that board rounds move the `generation` bar, not `orchestration`.
3. **After the session**, from the thread folder compute:
   - per-sink totals (`progress.jsonl` `category` sums — or read the studio panel);
   - **generation tokens per board round**, split fresh vs TWEAK (TWEAK rounds are the digest
     lines saying MUTATE in `brainstorm.md`);
   - **regeneration waste avoided** = TWEAK-round count × (27.7k − actual TWEAK cost);
   - **description ratio** for a couple of delegations (brief tokens ÷ artisan output tokens).
4. **Compare against the table above** and record the verdict in `ab-results.md` in this
   folder: TWEAK rounds materially under 27.7k? ratio still ≤ 0.2? orchestration share sane?
   SVG quality unchanged (same model — spot-check boards against
   `.claude/skills/svg-authoring/VALIDITY-SCAN.md`)?
5. If the verdict changes the model ranking or exposes an attribution bug, update
   `wiki/System/model-tiering.md` / `wiki/System/testing-observability.md` (+ `wiki/log.md`).

## Known limits (disclosed, rule 6)

- Attribution is a heuristic (what was being done when the turn ended); the token deltas are real.
- Subagent token usage is under-counted by the pipe (SubagentStop events carry no usage) — the
  bake-off measured subagent cost out-of-band; per-sink bars understate generation accordingly.
