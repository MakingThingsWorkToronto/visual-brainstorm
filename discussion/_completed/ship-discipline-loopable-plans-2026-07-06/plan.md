# Ship discipline + loopable plans (retroactive)
**Status:** closed 2026-07-06
**Goal:** the agentic loop commits and pushes its work, and the brainstorm funnel's output
is a loopable build plan — phases + progress persisted in the plan itself, generated into
the target repo via ITS create-dispatch-command when it has one.
**Source:** operator directives in-session, 2026-07-06 (two asks: "loop is missing git
commit/push"; "run-brainstorm's important output is a loopable plan"). Donor reference:
`c:\code\tp` (`create-dispatch-command.md`, `build-step.md`, `plan-closeout.md`).

> Retroactive: this work ran without a plan folder (rule-3 gap, caught at closeout).
> Recorded after the fact so the archive stays complete; phases below are as-executed.

## Phases
| # | Phase | Goal + exit criteria (intent, no code) | Owner | Status |
|---|---|---|---|---|
| 1 | ship-discipline | Loop commits + pushes: Ship discipline section in `wiki/Meta/agentic-loop.md` (commit `--only` per verified unit, push at closeout); plan-closeout gains Commit-and-push step; exit: both files state it, wiki edit logged | inline | done |
| 2 | create-dispatch-command | This repo's simplified donor command: plan.md carries phases + Status + append-only Progress log; emits `/dispatch-<slug>-next-phase` enforcing the 5-stage loop per tick; exit: command file exists, registered in CLAUDE.md quick map + discover-skills task map | inline | done |
| 3 | brainstorm-documents-itself | run-brainstorm appends per-round decision blocks to brainstorm.md (interpretation atop the server's mechanical record); exit: step 5 in the command, changelog line | inline | done |
| 4 | closeout-generates-build-plan | plan-closeout step 7: on finalized brainstorm, offer a no-code loopable build plan authored from brainstorm.md; target repo's create-dispatch-command wins on its turf; exit: step in command + wiki "a brainstorm ships a plan" | inline | done |

## Progress log (append-only — every tick writes one line)
- 2026-07-06 — ship-discipline: agentic-loop.md Ship discipline + stage 2/5 exit criteria; plan-closeout Commit-and-push step; verify: build+smoke PASS at closeout; commit: closeout commit (work was doc-only, committed at close per pre-discipline norm)
- 2026-07-06 — create-dispatch-command: command created (inline template, donor drops documented); registered in quick map + task map; verify: no placeholders, plan format + dispatcher template present; commit: closeout commit
- 2026-07-06 — brainstorm-documents-itself: run-brainstorm step 5 + finalize pointer; fixed self-inflicted duplicate Changelog footer; verify: single footer, steps renumbered cleanly; commit: closeout commit
- 2026-07-06 — closeout-generates-build-plan: plan-closeout step 7 + renumber 7-10→8-11; agentic-loop.md de-numbered its cross-ref ("Commit-and-push step") after the renumber went stale within the hour; verify: build+smoke PASS; commit: closeout commit
- 2026-07-06 — closeout: 3 learnings harvested (step-names-not-numbers; brainstorm.md's two writers; --only can't split hunks); improved new-command.md, plan-closeout.md, discover-skills.md
