# Plan — brainstorm-orchestrator agent (2026-07-07)

**Status:** closed 2026-07-07

**Operator mandate:** create a `brainstorm-orchestrator` specialist agent: the primary
persona guiding the human through the collaborative brainstorm; creative in suggesting
options; delegates the brainstorming procedures to subagents to preserve context; its agent
file is the persistence surface for brainstorm-routine orchestration learnings; ensures the
agentic loop runs smoothly and honestly.

**Authority:** CLAUDE.md rules 1, 2, 9, 11; `wiki/System/agents.md`;
`wiki/Meta/agentic-loop.md`; `.claude/commands/run-brainstorm.md`.

**Reconciliation note (rule 1):** rule 11 said "orchestration is never delegated" — amended
to: orchestration has ONE named owner (`brainstorm-orchestrator`) which delegates heavy
procedures downward but is itself never re-delegated. CLAUDE.md and agents.md move together.

## Phases

| # | Phase | Exit criteria | Status |
|---|---|---|---|
| 1 | Author `.claude/agents/brainstorm-orchestrator.md` (persona + keep/delegate contract + creative & honesty duties + Orchestration learnings living section seeded from `.agents/learnings.md`) | file exists, matches roster conventions | done |
| 2 | Reconcile CLAUDE.md (quick-map row, rule 11, agents appendix) + `run-brainstorm.md` persona pointer + changelog | wiki and code agree | done |
| 3 | Wiki: `System/agents.md` roster row + delegation-flow amendment; `wiki/log.md` line (via wiki-librarian) | rule 2 satisfied | done |
| 4 | Verify: `npm run build` + `npm test` | green (rule 10) | done |
| 5 | Close via `/plan-closeout` | archived to `_completed/` | done |

## Progress log (append-only)

- 2026-07-07 — plan created; phases 1–4 executed this session (agent file, CLAUDE.md +
  run-brainstorm reconciliation, wiki-librarian delegation, build+test). Left open for
  `/plan-closeout` (rule 3) — no commit made this session (concurrent sessions hold
  uncommitted edits in CLAUDE.md / wiki; see .agents/learnings.md commit-riders entries).
