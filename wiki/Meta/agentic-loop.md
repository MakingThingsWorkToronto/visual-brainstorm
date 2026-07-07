# The Agentic Loop — build · learn · document · improve (AUTHORITATIVE)

This repo's agentic architecture is load-bearing: every unit of work runs the loop below, and
every cycle must leave the repo smarter — better commands, sharper skills, truer wiki, more
tests. Skipping a stage is a process failure, not a shortcut.

![The agentic loop](agentic-loop.svg)

## The five stages

| Stage | Home | Entry | Exit criteria |
|---|---|---|---|
| 1 · PLAN | `discussion/<slug>-<date>/plan.md` | any multi-step task (rule 3) | scope, authority, phases written BEFORE implementation; the plan is **loopable** — phase table with Status + append-only Progress log in the same file (`/create-dispatch-command` scaffolds or retrofits it; its emitted `/dispatch-<slug>-next-phase` runs one phase per tick and persists progress back to the plan) |
| 2 · BUILD | agents (`.claude/agents/`) + skills (`.claude/skills/`) + commands (`.claude/commands/`) do the work (rule 11) | plan exists | features ship WITH tests; `npm run build` + `npm test` green (rule 10); verified units committed (see Ship discipline) |
| 3 · LEARN | `.agents/learnings.md` (newest first) | anything discovered the hard way | one entry per non-obvious fact + why it matters; nothing re-learned next session (rule 4) |
| 4 · DOCUMENT | facts → `wiki/` + `wiki/log.md` line (rules 1–2); human-facing → `wiki/user-guide.md` (rule 12); runtime evidence self-documents via logs/health (`System/testing-observability.md`) | facts or UX changed | wiki and code agree; every edit logged; guide matches the product |
| 5 · IMPROVE | `/plan-closeout` (`.claude/commands/plan-closeout.md`) | plan's work verified | each learning EDITS the command/skill it implicates (+ `## Changelog` footer line); plan + threads archived to `_completed/`; closeout commit **pushed to origin** |

## Ship discipline — a cycle ends on origin, not on "green"

- **Commit verified units during BUILD.** Once a unit passes its checks, commit it:
  `git commit --only <the exact paths this work touched>` — **never `git add -A` /
  `commit -a`** (donor rule: several sessions can share one working tree; `-A` captures
  someone else's WIP). Subject is one conventional line: `feat(<scope>): …`,
  `fix(<scope>): …`, `chore(<scope>): …`.
- **Push at closeout.** `/plan-closeout` ends with a closeout commit and `git push`
  (its Commit-and-push step). Uncommitted or unpushed work at the end of a cycle is a
  process failure, same as a skipped stage.
- **A brainstorm ships a plan.** When a brainstorm thread finalizes, its most valuable
  output is a loopable build plan (intent + phases + exit criteria, never code) authored
  from the thread's `brainstorm.md` decision records — into the TARGET repo via *its own*
  `/create-dispatch-command` when it has one, else in our simple format
  (`/plan-closeout` step 7).

## What makes it a loop, not a checklist

- **Commands and skills are living documents.** Closeout step 4 exists to feed learnings
  BACK into the procedures — the same task gets easier and safer every cycle. The
  `## Changelog` footers are the visible growth rings.
- **The studio participates.** Plan closeout (composer More Tools menu, the + button) and
  Finalize & close out trigger stage 5 from the UI; Discover skills (same menu, web branch)
  ingests
  brand-new skills mid-brainstorm, so craft
  compounds *inside* a session, not just between them.
- **Agents are the muscle memory** (`System/agents.md`): diagnosis, delegated generation,
  testing, and wiki-keeping each have an owner with the procedure embedded — a fresh chat
  doesn't improvise, it routes (CLAUDE.md rule 11 + the quick map).
- **Long-lived subagents replay stale context.** Resuming one agent across a work stream
  (e.g. the wiki-librarian across many UI waves) keeps its context and works well, but its
  repeated "standing flags" come from its OWN old transcript, not the current tree — the
  coordinator verifies a repeated flag against the file before acting and tells the agent
  explicitly when a flag is resolved.
- **Cold-start guarantee:** a brand-new session reads CLAUDE.md §Session bootstrap and is
  fully operational — wiki authority, plans, learnings, commands, skills, agents, tests,
  logs — without any chat history.

## Memory map (what persists where — never blur these)

```
wiki/                  facts & guardrails (authoritative; every edit logged)
discussion/      plans + brainstorm threads (boards, SVGs, responses, brainstorm.md)
wiki/user-guide.md    how humans use the tool (SVG-illustrated)
.agents/learnings.md   hard-won gotchas
.claude/commands/      repeatable procedures (self-improving)
.claude/skills/        binding craft
.claude/agents/        specialized roles
tests/ + scripts/      executable proof
discussion/.logs runtime evidence (+ /api/health, /api/logs)
```
