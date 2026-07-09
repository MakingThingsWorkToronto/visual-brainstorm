---
model: sonnet
---

# /plan-closeout — close the active plan and make the repo smarter

The self-improvement loop (donor pattern): a plan is not done until its learnings have been
harvested AND the slash commands have been improved by them. Run every step; report each as
done/skipped-with-reason.

## Procedure

1. **Identify the active plan** — the newest folder in `discussion/` (not `_completed/`)
   containing `plan.md` for the work just finished. Confirm with the operator if ambiguous.
2. **Verify reality** (CLAUDE.md rule 10): `npm run build` and `npm run smoke` must pass.
   If they fail, closeout STOPS — fix or report BLOCKED. Never archive a broken plan.
   **Attribute failures first**: with several sessions in one working tree, a failure may
   belong to ANOTHER plan's in-flight edits (check `git status` + open plans; an error
   whose line number drifts between runs means someone is editing that file NOW). Don't
   race them — wait for their loop to converge, re-verify, and only fix what traces to
   the plan being closed.
   **A crashed session's "verified" status is a claim, not proof.** When closing a plan
   whose verifying session died, run `/code-review` (high) over the plan's diff BEFORE
   archiving — tests prove only the paths they walk. The 2026-07-09 crash-resume review
   of two "IMPLEMENTED + verified" plans confirmed 8 real defects (StrictMode
   double-commit, async-send double-dispatch, cross-browser rasterization loss, dishonest
   generated README, live/reload attribution divergence…); fix what traces to the plan,
   file the rest as a follow-ups plan.
3. **Harvest learnings** — reread the session. Every non-obvious discovery (gotcha, API
   quirk, decision + rationale, failed approach) goes to `.agents/learnings.md` (newest
   first). If nothing was learned, write nothing — no filler.
4. **Improve the commands** — for each harvested learning, ask: *which file in
   `.claude/commands/`, `.claude/skills/`, or `.claude/agents/` would have prevented this
   or exploited it sooner?* Agent files with living sections count (e.g.
   `brainstorm-orchestrator`'s `## Orchestration learnings` — brainstorm-routine
   orchestration lessons land THERE, next to the procedure owner). Edit those files now.
   Append one line to the file's `## Changelog` footer:
   `- <date> — <improvement> (from <plan-slug>)`. This step is the point of closeout;
   skipping it silently is a rule violation.
  - **Harness parity is conditional but mandatory when touched.** If this plan changed an
    authoritative workflow entry point, `.claude` command/skill/agent contract,
    `packages/protocol` shape, or user-facing harness behavior, reconcile the supported
    harness adapters in the same cycle (today `.github/` for GitHub Copilot; future
    registered harness layers when they are real) so comparable results remain achievable
    across harnesses. If a surface is intentionally unadapted in a supported harness, record
    that in the harness exclusion mechanism so parity checks stay signalful. If nothing
    adapter-visible changed, explicitly skip this with reason.
5. **Update the wiki** — any fact or guardrail established by this plan moves to the
   relevant `wiki/` page; append the edit to `wiki/log.md` (rule 2). After the edits land,
   call `mcp__visual-brainstorm-wiki__wiki_reload` so the grounding index reflects them
   (`wiki/System/wiki-grounding.md` § reload contract); skip gracefully if the MCP is not
   registered in the session.
6. **Hand off final artifacts to the target repo** — resolve the thread's target
   repo/folder: `targetRepo` in the thread's `session.json` (set via the studio 📁 button),
   else `targetRepo` in `visual-brainstorm.config.json`. If neither is set, skip. If set:
   - ASK the operator (AskUserQuestion) exactly where inside the target the final artifacts
     go — offer its `wiki/`, its `discussion/`, an app images/assets folder, and custom
     path; also ask whether to include the thread's `brainstorm.md` narrative.
   - COPY — never move — each captured artifact's `.svg` AND its `.json` provenance sidecar
     from the thread's `artifacts/` to the chosen destination. Originals stay archived here
     (rule 7). Report every copied path.
7. **Generate the build plan — the brainstorm's real deliverable.** If this closeout ends
   a brainstorm thread, ASK the operator (AskUserQuestion) whether they want a loopable
   build plan authored from it. Plans contain intent, phases, exit criteria, and a progress
   scaffold — **never code**. If yes:
   - **Target repo resolved (step 6)?** Look for the TARGET repo's own
     `.claude/commands/create-dispatch-command.md`. If it exists, READ it and FOLLOW it —
     its modes, templates, plan/progress conventions, and output locations — to scaffold a
     compliant plan in the target repo (the target's methodology wins on its own turf;
     ours does not leak into it). If the target has no such command, write our simple
     loopable format (see this repo's `/create-dispatch-command` § plan format) to a
     destination the operator picks.
   - **No target repo?** If the work is for THIS repo, run our `/create-dispatch-command`
     (wrap-existing if a plan.md exists, scaffold-new otherwise).
   - **Source material is the record, not memory**: the thread's `brainstorm.md`
     (mechanical rounds + the per-round decision blocks run-brainstorm step 5 appended),
     the captured artifacts, and the poster. Every phase in the generated plan must trace
     to something the human decided in the brainstorm — no invented scope.
   - **Mind-map threads: anchor the plan on the tree.** Run `.claude/commands/read-mindmap.md`
     on the final round FIRST — the tree's top branches become the plan's phases/sections, the
     node notes become requirements, killed branches are explicitly out of scope, and `— thin`
     gaps are flagged as open questions. The structure the user built IS the plan's spine.
8. **Mark the plan** — set `**Status:** closed <date>` in `plan.md`.
9. **Archive** — move the whole plan folder AND any brainstorm-thread folders belonging to
   this work into `discussion/_completed/`. Archived threads appear under the
   studio's Archive nav automatically.
10. **Commit and push** — `git commit --only <every path this closeout and its plan
    touched>` (never `git add -A` / `commit -a`: other sessions' in-flight edits may share
    this working tree — commit only what traces to the plan being closed, same attribution
    discipline as step 2). Subject: `chore(closeout-<plan-slug>): <one line>`. Then
    `git push`. If BUILD-stage work was committed as it landed (the normal case, see
    `wiki/Meta/agentic-loop.md` Ship discipline), this commit is just the closeout
    bookkeeping (learnings, command edits, wiki, archive moves); if not, commit the plan's
    verified work too. A push failure (auth/network) is reported honestly as
    BLOCKED-push — never claim closed-and-pushed without the push succeeding. (A build
    plan generated INTO a target repo in step 7 is committed/pushed under the TARGET
    repo's rules, not here — report what was left uncommitted there if its rules said to.)
    `--only` is file-level and cannot split hunks: if a file this plan touched ALSO
    carries another session's uncommitted edits, either wait for their loop to converge
    or commit it with the riders declared in the commit body — never present a mixed
    diff as single-plan. **Inspect the STAGED index before committing**
    (`git diff --cached --name-status`), not just `git status`'s working-tree view: a
    concurrent session's STAGED changes — most dangerously deletions (`D ` in column 1) —
    ride a plain `git commit` even when you only `git add` your own paths, contaminating the
    commit and possibly breaking HEAD. Confirm ONLY your paths are staged (or use
    `git commit --only <paths>`, which ignores the rest of the index).
    **Resuming a closeout after a crash / dead peers:** first attribute against HEAD, not
    `git status` — peer closeouts may have ALREADY committed parts of this plan as declared
    riders (`git grep <plan-symbol> HEAD -- <paths>`); commit only the residue. If crashed
    peers can't converge and the TS import graph fuses your pending diff with theirs
    (`tsc -p` typechecks the whole project — a file-level subset can commit a snapshot
    that doesn't build), include the minimal build-coupled closure as DECLARED riders and
    prove the exact committed snapshot builds+tests in a fresh `git worktree` of that
    commit before pushing.
11. **Report** — one summary: learnings count, commands improved (names), wiki pages
    touched, artifacts handed off (destination), build plan generated (target + path, or
    declined), folders archived, commit hash + pushed.

## Changelog
- 2026-07-09 — step 2: crash-resume closeouts run /code-review (high) over the plan's diff
  before archiving — a dead session's "verified" status line is a claim, not proof (from
  photo-scribble-annotation-2026-07-09 + scribble-legibility-2026-07-09)
- 2026-07-09 — step 7: mind-map threads anchor the build plan on the tree via /read-mindmap —
  top branches = phases, node notes = requirements, deleted branches = out of scope, `— thin`
  = open questions (from mindmap-model-legible-2026-07-09)
- 2026-07-09 — step 10: crash-resume attribution — check plan symbols against HEAD (peers may
  have committed your rounds as riders) and worktree-verify the committed snapshot when the
  TS import graph fuses pending diffs across dead peer sessions (from
  artifact-chat-everywhere-2026-07-09)
- 2026-07-09 — step 4: intentional harness gaps must be recorded in the harness exclusion
  mechanism; otherwise parity warnings go noisy and hide real new gaps (from
  copilot-slash-commands-2026-07-07)
- 2026-07-09 — step 5: call `wiki_reload` after wiki edits so the grounding MCP index isn't
  stale (from wiki-mcp-grounding-and-maintenance-2026-07-09)
- 2026-07-07 — step 10: inspect the STAGED index before committing (`git diff --cached
  --name-status`) — a concurrent session's staged changes/deletions ride a plain `git commit`
  even when you only `git add` your own files (from studio-survey-intake-2026-07-07)
- 2026-07-07 — step 4: conditional harness-parity rule — when authoritative workflows,
  protocol contracts, or harness-visible behavior change, reconcile supported adapter layers
  in the same cycle; otherwise skip with reason (Copilot support maintenance without making
  every plan pay the tax)
- 2026-07-07 — step 4: improvement targets now include `.claude/agents/` living sections
  (brainstorm-orchestrator's Orchestration learnings) — agent files are living memory
  surfaces too (from brainstorm-orchestrator-2026-07-07)
- 2026-07-06 — step 10: mixed-file rider rule — `--only` can't split hunks; converge or
  declare riders in the commit body (from ship-discipline-loopable-plans)
- 2026-07-06 — added step 7: build-plan generation as the brainstorm's deliverable —
  follow the TARGET repo's create-dispatch-command when it has one, else our simple
  loopable format; sourced from brainstorm.md decision records, no code, no invented
  scope (operator request; steps renumbered 7-10 → 8-11)
- 2026-07-06 — added step 9: commit (`--only`, plan-scoped) + push at closeout; report
  gains commit hash (operator request: loop was missing commit/push; donor `tp` discipline,
  simplified — one working tree, push goes straight to origin)
- 2026-07-06 — step 2: attribute verify-failures before fixing; don't race concurrent
  sessions' in-flight files (from docs-tests-agents-2026-07-06)
- 2026-07-06 — added step 6: target-repo artifact hand-off (copy, operator picks the
  destination) (from fullscreen-notes-target-repo-2026-07-06)
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
