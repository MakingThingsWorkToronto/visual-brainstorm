# The Agentic Loop — build · learn · document · improve (AUTHORITATIVE)

This repo's agentic architecture is load-bearing: every unit of work runs the loop below, and
every cycle must leave the repo smarter — better commands, sharper skills, truer wiki, more
tests. Skipping a stage is a process failure, not a shortcut.

![The agentic loop](agentic-loop.svg)

## The five stages

| Stage | Home | Entry | Exit criteria |
|---|---|---|---|
| 1 · PLAN | `.docs/discussion/<slug>-<date>/plan.md` | any multi-step task (rule 3) | scope, authority, phases written BEFORE implementation |
| 2 · BUILD | agents (`.claude/agents/`) + skills (`.claude/skills/`) + commands (`.claude/commands/`) do the work (rule 11) | plan exists | features ship WITH tests; `npm run build` + `npm test` green (rule 10) |
| 3 · LEARN | `.agents/learnings.md` (newest first) | anything discovered the hard way | one entry per non-obvious fact + why it matters; nothing re-learned next session (rule 4) |
| 4 · DOCUMENT | facts → `wiki/` + `wiki/log.md` line (rules 1–2); human-facing → `.docs/user-guide.md` (rule 12); runtime evidence self-documents via logs/health (`System/testing-observability.md`) | facts or UX changed | wiki and code agree; every edit logged; guide matches the product |
| 5 · IMPROVE | `/plan-closeout` (`.claude/commands/plan-closeout.md`) | plan's work verified | each learning EDITS the command/skill it implicates (+ `## Changelog` footer line); plan + threads archived to `_completed/` |

## What makes it a loop, not a checklist

- **Commands and skills are living documents.** Closeout step 4 exists to feed learnings
  BACK into the procedures — the same task gets easier and safer every cycle. The
  `## Changelog` footers are the visible growth rings.
- **The studio participates.** 📦 Plan closeout and 🏁 Finalize trigger stage 5 from the UI;
  ✨ Discover skills (web branch) ingests brand-new skills mid-brainstorm, so craft
  compounds *inside* a session, not just between them.
- **Agents are the muscle memory** (`System/agents.md`): diagnosis, delegated generation,
  testing, and wiki-keeping each have an owner with the procedure embedded — a fresh chat
  doesn't improvise, it routes (CLAUDE.md rule 11 + the quick map).
- **Cold-start guarantee:** a brand-new session reads CLAUDE.md §Session bootstrap and is
  fully operational — wiki authority, plans, learnings, commands, skills, agents, tests,
  logs — without any chat history.

## Memory map (what persists where — never blur these)

```
wiki/                  facts & guardrails (authoritative; every edit logged)
.docs/discussion/      plans + brainstorm threads (boards, SVGs, responses, brainstorm.md)
.docs/user-guide.md    how humans use the tool (SVG-illustrated)
.agents/learnings.md   hard-won gotchas
.claude/commands/      repeatable procedures (self-improving)
.claude/skills/        binding craft
.claude/agents/        specialized roles
tests/ + scripts/      executable proof
.docs/discussion/.logs runtime evidence (+ /api/health, /api/logs)
```
