---
model: sonnet
---

# /wiki-maintenance — periodic wiki lint & reconcile sweep

The cross-cutting wiki housekeeping pass (donor pattern, refactored for this repo): lint the
whole `wiki/` for structural rot, reconcile wiki↔code drift, and reload the grounding index —
the sweep that runs BETWEEN plan closeouts, not per-plan. Delegates the actual edits to the
`wiki-librarian` agent. Like `/compress-learnings` this is LEARN/IMPROVE-stage housekeeping,
not a plan; it needs no `discussion/` folder — UNLESS the sweep surfaces a content decision
(a real wiki↔code contradiction someone must resolve), which gets a `discussion/<slug>-<date>/`
plan and stops here with that flagged.

## Arguments

- `$ARGUMENTS` — action: `lint` (default, whole-wiki structural + drift audit), or
  `update <page>` (refresh one page against current code/decisions).

## Boundaries — what this does NOT own

- **Learnings compaction** is `/compress-learnings` (`.agents/learnings.md`). This command
  never touches learnings; if a lint turns up a since-deleted command/skill referenced by the
  log, note it for `/compress-learnings` or the next `/plan-closeout` rather than fixing here.
- **Per-plan wiki updates** are `/plan-closeout` step 5 (facts a specific plan established).
  `/wiki-maintenance` is the periodic sweep for drift that accumulates ACROSS plans.
- **Content homes stay separate** (rule 1): plans → `discussion/`; gotchas →
  `.agents/learnings.md`; only durable facts/guardrails belong in `wiki/`. If a page has drifted
  into narration or plan-talk, that is a lint finding.

## Procedure

1. **Ground first.** Use the `visual-brainstorm-wiki` MCP to survey before editing:
   `wiki_toc` / `wiki_list` for the shape, `wiki_search` to spot-check. See
   `wiki/System/wiki-grounding.md`. Fall back to file tools only if the MCP is unavailable.
2. **Delegate to the `wiki-librarian`** (`.claude/agents/wiki-librarian.md`) with `$ARGUMENTS`.
   The librarian owns rule 1 authority + rule 2 log discipline and does the edits plain-file.
3. **Run the lint checklist** (below) for `lint`; for `update <page>`, diff that page against
   current code/decisions and refresh it.
4. **Reload the index (mandatory).** After ALL edits land, call
   `mcp__visual-brainstorm-wiki__wiki_reload` so grounding sees the new bytes
   (`wiki/System/wiki-grounding.md` § reload contract). Skip gracefully + note once if the MCP
   is not registered — never spam `log.md` with skip lines.
5. **Report** — what was linted, findings fixed vs. flagged, pages touched, whether a reconcile
   plan was opened, and the reloaded page count. No `discussion/` folder unless step-6 fires.
6. **Escalate content decisions.** If lint finds a genuine wiki↔code contradiction that needs a
   human call, open `discussion/wiki-reconcile-<yyyy-mm-dd>/plan.md` (header: Date/Scope/
   Authority/Status) capturing the conflict + evidence from both sides, and STOP — do not
   silently pick a winner (rule 1: reconcile, never drift).

## Lint checklist (this repo's conventions)

1. Every page linked from `wiki/README.md` exists on disk; no orphan pages (on disk but absent
   from the README index).
2. No broken cross-references between wiki pages; all relative links resolve.
3. All `![image]()` / diagram references resolve to existing files.
4. Every page states facts + guardrails tersely — no narration, no plan-talk, no duplication
   (link to the single source instead of copying). Plans/gotchas that leaked in move to their
   real home (`discussion/` / `.agents/learnings.md`).
5. `wiki/log.md` discipline holds: every content edit made by this sweep appends one line
   (`- <date> — <page> — <what> — reason: wiki-maintenance`), rule 2.
6. `**authoritative**` / architecture-lock markers still match reality; the LOCK page
   (`Requirements/system-architecture.md`) is unchanged unless an operator-approved plan exists.
7. File naming: descriptive kebab-case slugs, no numeric prefixes; do not rename existing files.
8. `wiki_reload` ran after edits (step 4).

## Changelog
- 2026-07-09 — created: donor `wiki-maintenance` refactored for this repo — `wiki/` root,
  `wiki-librarian` delegate, this repo's lint checklist, mandatory `wiki_reload`, explicit
  hand-offs to `/compress-learnings` (learnings) and `/plan-closeout` (per-plan updates)
  (from wiki-mcp-grounding-and-maintenance-2026-07-09)
