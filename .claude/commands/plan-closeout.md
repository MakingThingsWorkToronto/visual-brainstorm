# /plan-closeout — close the active plan and make the repo smarter

The self-improvement loop (donor pattern): a plan is not done until its learnings have been
harvested AND the slash commands have been improved by them. Run every step; report each as
done/skipped-with-reason.

## Procedure

1. **Identify the active plan** — the newest folder in `.docs/discussion/` (not `_completed/`)
   containing `plan.md` for the work just finished. Confirm with the operator if ambiguous.
2. **Verify reality** (CLAUDE.md rule 10): `npm run build` and `npm run smoke` must pass.
   If they fail, closeout STOPS — fix or report BLOCKED. Never archive a broken plan.
3. **Harvest learnings** — reread the session. Every non-obvious discovery (gotcha, API
   quirk, decision + rationale, failed approach) goes to `.agents/learnings.md` (newest
   first). If nothing was learned, write nothing — no filler.
4. **Improve the commands** — for each harvested learning, ask: *which file in
   `.claude/commands/` or `.claude/skills/` would have prevented this or exploited it
   sooner?* Edit those files now. Append one line to the file's `## Changelog` footer:
   `- <date> — <improvement> (from <plan-slug>)`. This step is the point of closeout;
   skipping it silently is a rule violation.
5. **Update the wiki** — any fact or guardrail established by this plan moves to the
   relevant `wiki/` page; append the edit to `wiki/log.md` (rule 2).
6. **Mark the plan** — set `**Status:** closed <date>` in `plan.md`.
7. **Archive** — move the whole plan folder AND any brainstorm-thread folders belonging to
   this work into `.docs/discussion/_completed/`. Archived threads appear under the
   studio's Archive nav automatically.
8. **Report** — one summary: learnings count, commands improved (names), wiki pages
   touched, folders archived.

## Changelog
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
