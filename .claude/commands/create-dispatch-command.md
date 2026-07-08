---
model: sonnet
---

# /create-dispatch-command — scaffold a loopable build plan + its dispatcher

Simplified from the donor (`tp`) pattern: ONE plan file that carries its own phases AND
progress, plus ONE generated dispatcher command a fresh session can `/loop` until done.
This command produces the plan and the loop — it writes **no code**. The dispatcher it
emits enforces this repo's agentic loop (`wiki/Meta/agentic-loop.md`): every tick runs
BUILD → verify (rule 10) → commit (Ship discipline) → persist progress → learn.

Two modes:

1. **scaffold-new** — operator has an idea, no `plan.md` yet. Interview → write the plan →
   emit the dispatcher.
2. **wrap-existing** — a `plan.md` already exists (typically authored by `/plan-closeout`
   step 7 from a finished brainstorm). Read it back, confirm the phase rows, retrofit the
   Status column + Progress log if missing, emit the dispatcher only.

## The plan format (loopable — phases and progress live in ONE file)

`discussion/<slug>-<yyyy-mm-dd>/plan.md`:

```markdown
# <Title>
**Status:** open
**Goal:** one paragraph — what done looks like, verifiable.
**Source:** <brainstorm thread id / operator ask> — every phase must trace here.

## Phases
| # | Phase | Goal + exit criteria (intent, no code) | Owner | Status |
|---|---|---|---|---|
| 1 | <kebab-tag> | <what it delivers>; exit: <verifiable check> | svg-artisan / test-engineer / inline | todo |

## Progress log (append-only — every tick writes one line)
- <date HH:MM> — <phase-tag>: <what landed>; verify: <command → result>; commit <hash>
```

Phase Status values: `todo` → `in-progress` → `done` (only after rule-10 verify AND the
commit exists — a phase whose work isn't committed is not done), or `blocked: <reason>`.
Progress persists to the plan itself — no separate progress file, no state in chat history.

## Procedure

1. **Mode + identity** (AskUserQuestion): scaffold-new vs wrap-existing; `<slug>`
   (kebab-case, becomes commit scope + filenames); title; plan folder (default
   `discussion/<slug>-<today>/`).
2. **Phases.**
   - *scaffold-new*: interview the phase rows (3–7 is the sweet spot). Each row needs a
     goal, a VERIFIABLE exit criterion (a command or observable, not "works"), and an
     owner routed per CLAUDE.md rule 11 (agent, skill, or inline). Phases state intent and
     acceptance — never code, never guessed file paths. Write `plan.md` per the format above.
     **Mandatory human-verification phase** (operator mandate 2026-07-07 — never skip,
     never merge into "write tests"): any plan that creates or changes an API gets a phase
     proving EVERY reachable status code with response bodies asserted against canonical
     expectations; any plan that creates or changes a UI gets a phase simulating a human
     clicking through to accomplish the goal PLUS a break-sweep iterating every button and
     every input. Both anchor to `tests/canonical/` (its README is the convention) and
     both exit criteria must be a runnable command with observable output. Owner:
     `test-engineer`. **Prove the REAL path, never the preview harness** (operator mandate
     2026-07-07 — "if it only works in preview the app is a brick"): the human-sim runs a real
     `Bridge` with `engine:'claude'`; a feature green only in `npm run preview`'s fixture player
     is NOT proven. Preview is a demo, not acceptance.
     **Mandatory agentic-wiring phase for any plan that adds an MCP tool or a studio surface**
     (from concierge-living-gallery-2026-07-07): building the surface + tool + tests is NOT
     enough to make it work in a real brainstorm — a phase must WIRE the `.claude` skills/commands
     (run-brainstorm / brainstorm-orchestrator / brainstorm-phases) to CALL the new tool, because
     the prompt→tool routing is a heuristic that lives there, not in harness code (rule 11). A
     surface Claude is never told to invoke is dead in real sessions no matter how green its tests.
   - *wrap-existing*: Read the plan, present the rows back for confirmation (no regex
     parsing), add the Status column and Progress log section if missing.
3. **Emit the dispatcher** — fill the inline template below (plain `<placeholder>`
   substitution) and write `.claude/commands/dispatch-<slug>-next-phase.md`.
4. **Sanity + report** — no `<placeholder>` left in the emitted file; plan has the phase
   table and Progress log heading. Report both paths. Do NOT auto-run the dispatcher —
   the operator starts it with `/loop /dispatch-<slug>-next-phase`.

## Inline dispatcher template

One tick = one phase through the agentic loop. Everything between the markers is emitted
verbatim after substitution.

```markdown
# /dispatch-<slug>-next-phase — one loop tick for "<title>"

Plan: `discussion/<plan-folder>/plan.md` — the ONLY state. Read it fresh every tick;
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
   need a reconcile pass. If a delegated agent dies mid-task (model/session limit), its
   files are usually COMPLETE on disk — `node --check` / Read them and run the verify
   yourself; re-delegate only if genuinely half-written.
3. **Verify** — `npm run build` + `npm test`. Failure = the row STAYS `in-progress` with
   the honest reason appended to the Progress log; fix or mark `blocked: <reason>`.
4. **Ship** — first `git log --oneline -3`: a concurrent session's commit may have already
   swept this phase's files (shared working tree); if so, commit only your remaining delta
   and record BOTH hashes in the Progress log. Then `git commit --only <the exact paths
   this phase touched>` — never `-A` (Ship discipline, `wiki/Meta/agentic-loop.md`).
   Subject: `feat(<slug>-<phase-tag>): <one line>`.
5. **Persist** — flip the row to `done`, append the Progress log line
   (`what; verify: command → result; commit <hash>`), and commit the plan update:
   `git commit --only <plan.md path> -m "chore(<slug>): tick <phase-tag>"`.
6. **Learn** — non-obvious discovery → `.agents/learnings.md` NOW, not at closeout.

One phase per tick, then end the response with one line:
`[dispatch <slug> HH:MM] <phase-tag>: done <hash> | in-progress <reason> | blocked <reason> | ALL PHASES COMPLETE → closeout`
```

## What was deliberately dropped from the donor

Copilot twin prompts, external template files, the learnings-registry substitution engine,
worktree/branch garbage collection, sibling-track HELD/BLOCKED protocol, per-phase
adversarial-review interviews. One working tree, one plan file, one dispatcher — if this
repo ever runs concurrent dispatchers, steal those pieces back from
`c:\code\tp\.claude\commands\create-dispatch-command.md` rather than reinventing them.

## Changelog
- 2026-07-07 — scaffold-new: human-verification must prove the REAL path (engine:'claude'/
  human-sim), never the preview fixture player ("preview ≠ acceptance"); + mandatory
  agentic-wiring phase for any plan adding an MCP tool/studio surface (wire the .claude skills
  to CALL it or it's a brick in real sessions, rule 11) (from concierge-living-gallery-2026-07-07)
- 2026-07-07 — dispatcher template Build step: delegated-agent-death recovery — a subagent
  killed by a model/session limit usually leaves complete files; verify them yourself
  rather than re-delegating (from comprehensive-human-testing-2026-07-07)
- 2026-07-07 — scaffold-new: mandatory human-verification phase (API = all status codes +
  canonical body assertions; UI = human-sim goal run + every-control break-sweep; anchored
  to tests/canonical) (operator mandate, from comprehensive-human-testing-2026-07-07)
- 2026-07-06 — created: simplified donor `tp` /create-dispatch-command — single plan.md
  carries phases + progress, inline dispatcher template, dispatcher enforces the 5-stage
  loop + Ship discipline per tick (operator request: brainstorm output must be a loopable plan)
- 2026-07-07 — dispatcher template: Build step gains in-tick parallel-wave guidance (exact
  contracts + disjoint file ownership); Ship step checks git log for concurrent-session
  sweeps before committing (from askaquestion)
