---
model: sonnet
---

# /dispatch-comprehensive-human-testing-next-phase — one loop tick for "Comprehensive Human Testing — canonical data, API status matrix, UI human-simulation"

Plan: `discussion/comprehensive-human-testing-2026-07-07/plan.md` — the ONLY state. Read it fresh every tick;
trust the file, not memory or a prior tick's claim.

1. **Pick** — the first phase row with Status `todo` (skip `blocked`; if a row is
   `in-progress` from a dead session, resume it). If ALL rows are `done`: run
   `/plan-closeout` and STOP the loop.
2. **Build** — flip the row to `in-progress`, then do the phase through the specialized
   layers (CLAUDE.md rule 11 — delegate to the owning agent/skill/command). Tests ship
   WITH the work (rule 10). No fake success (rule 6). Parallelize INSIDE the tick: fan
   out independent subagents (core / UI / tests / docs) concurrently, giving each the
   EXACT contract — schema literals, props signatures, endpoint bodies, literal test
   markers — and disjoint file ownership; exact contracts merge mechanically, vague ones
   need a reconcile pass.
3. **Verify** — `npm run build` + `npm test`. Failure = the row STAYS `in-progress` with
   the honest reason appended to the Progress log; fix or mark `blocked: <reason>`.
4. **Ship** — first `git log --oneline -3`: a concurrent session's commit may have already
   swept this phase's files (shared working tree); if so, commit only your remaining delta
   and record BOTH hashes in the Progress log. Then `git commit --only <the exact paths
   this phase touched>` — never `-A` (Ship discipline, `wiki/Meta/agentic-loop.md`).
   Subject: `feat(comprehensive-human-testing-<phase-tag>): <one line>`.
5. **Persist** — flip the row to `done`, append the Progress log line
   (`what; verify: command → result; commit <hash>`), and commit the plan update:
   `git commit --only discussion/comprehensive-human-testing-2026-07-07/plan.md -m "chore(comprehensive-human-testing): tick <phase-tag>"`.
6. **Learn** — non-obvious discovery → `.agents/learnings.md` NOW, not at closeout.

One phase per tick, then end the response with one line:
`[dispatch comprehensive-human-testing HH:MM] <phase-tag>: done <hash> | in-progress <reason> | blocked <reason> | ALL PHASES COMPLETE → closeout`
