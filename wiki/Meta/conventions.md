# Conventions

## Wiki
- Plain markdown, read with normal file tools. Authoritative per CLAUDE.md rule 1.
- Every edit appends one line to `wiki/log.md`: date — page — what — why.
- Pages state facts and guardrails, not narration. If it's a plan, it belongs in
  `discussion/`; if it's a hard-won gotcha, in `.agents/learnings.md`.

## Discussion / plans
- Path: `discussion/<slug>-<yyyy-mm-dd>/plan.md`.
- Header block: Date, Scope, Authority (what mandates this work), Status.
- Completed sessions move (whole folder) to `discussion/_completed/`.

## Agentic learnings & commands
- `.agents/learnings.md`, newest first. One entry = one non-obvious fact + why it matters.
- `.claude/commands/` is the AUTHORITATIVE home of repeatable repo procedures (slash
  commands); `.claude/skills/` holds craft knowledge (SVG authoring, phase driving).
  Recurring manual work becomes a command via `/new-command` — asked twice = failure.
- Commands are living documents: `/plan-closeout` harvests session learnings and EDITS the
  commands they implicate, appending to each file's `## Changelog` footer.
- Plans close ONLY via `/plan-closeout` (verify → harvest → improve commands → wiki → archive
  to `_completed/`). The studio invokes it via **Plan closeout** in the composer's More
  Tools (+) menu (and via **Finalize & close out**).

## Code
- ESM everywhere, TypeScript strict, NodeNext resolution (studio uses bundler resolution).
- Message shapes only in `packages/protocol` (CLAUDE.md rule 5).
- **Schema evolution: cached threads must always reload.** New invariants are enforced at
  the tool boundary (e.g. ≥5 axes checked in `present_board`'s handler, not `BoardSchema`);
  new response fields get zod `.default(...)`; fixtures go through `Schema.parse`, never
  hand-built object literals.
- apps/mcp logs to stderr only (plus the FileLog ring/file — System/testing-observability.md).
- **Features ship with tests** at the lowest layer that catches their regression
  (unit `tests/` → smoke → ui-smoke); `npm test` green before any completion claim.
- All orchestration/generation lives in Claude + `.claude/{commands,skills,agents}` —
  harness code stays dumb (fixtures only). Human-facing docs live in `wiki/user-guide.md`.
