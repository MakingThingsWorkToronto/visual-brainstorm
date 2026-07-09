# Conventions

## Wiki
- Plain markdown; edits are plain-file (Edit/Write). Authoritative per CLAUDE.md rule 1.
- **Ground via the `visual-brainstorm-wiki` MCP** (`wiki_search` → `wiki_outline` →
  `wiki_read(path, heading)`), not whole-page dumps — see
  [System/wiki-grounding.md](../System/wiki-grounding.md). Plain file tools are the fallback.
- **Reload after every edit.** The MCP index is a cache; after ANY wiki change call
  `mcp__visual-brainstorm-wiki__wiki_reload` so grounding isn't stale (binding for the
  wiki-librarian, `/plan-closeout`, `/wiki-maintenance`). Skip gracefully if the MCP is absent.
- Every edit appends one line to `wiki/log.md`: date — page — what — why.
- Pages state facts and guardrails, not narration. If it's a plan, it belongs in
  `discussion/`; if it's a hard-won gotcha, in `.agents/learnings.md`.
- Periodic cross-plan wiki lint/reconcile is `/wiki-maintenance`; per-plan wiki updates are
  `/plan-closeout` step 5; learnings compaction is `/compress-learnings` (separate homes).

## Discussion / plans
- Path: `discussion/<slug>-<yyyy-mm-dd>/plan.md`.
- Header block: Date, Scope, Authority (what mandates this work), Status.
- Completed sessions move (whole folder) to `discussion/_completed/`.

## Agentic learnings & commands
- `.agents/learnings.md`, newest first. One entry = one non-obvious fact + why it matters.
- `.claude/commands/` is the AUTHORITATIVE home of repeatable repo procedures (slash
  commands); `.claude/skills/` holds craft knowledge (SVG authoring, phase driving).
  Recurring manual work becomes a command via `/new-command` — asked twice = failure.
- Harness adapters (`.github/` today for GitHub Copilot; future CODEX/Cursor layers when
  support is real) are discovery/execution wrappers over the authoritative `.claude/` layer,
  not a second source of workflow truth. If a `.claude` workflow/skill/agent, protocol
  contract, or user-facing harness seam changes, reconcile the supported adapter files in the
  same cycle so harnesses stay outcome-comparable.
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
