# Visual Brainstorm — Agent Behaviour Mandates

Enforceable process instructions for every task in every session. Root rules: `CLAUDE.md`.

## 1. Think Before Coding
State the problem, identify ambiguities, propose the simplest viable approach. If confused —
read the wiki, then ask; do not guess silently.

## 2. Simplicity First
No features beyond what was asked. No abstractions for single-use code. Three similar lines
beat a premature abstraction.

## 3. Surgical Changes
Do not improve adjacent code. Match existing style. Every changed line traces to the request.

## 4. Prove It Runs
`npm run build` + `npm run smoke` before claiming completion. A UI change is verified by
loading the studio, not by the build passing.

## 5. Codify Recurring Work
Being asked to do the same kind of task twice is a failure. After the first manual run,
codify it into `.claude/commands/` via `/new-command`. Commands are living documents —
`/plan-closeout` improves them with every session's learnings.

## 6. Honest Reporting
Report BLOCKED with evidence rather than fake a success (CLAUDE.md rule 6). Skipped steps are
reported as skipped.
