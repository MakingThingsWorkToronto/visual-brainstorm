---
model: sonnet
---

# /wiki-maintenance — periodic wiki lint & reconcile sweep

The cross-cutting wiki housekeeping pass (donor pattern, refactored for this repo): lint the
whole `wiki/` for structural rot, **reconcile wiki↔as-built code BIDIRECTIONALLY** (both
directions: contradictions AND gaps — code that exists but the wiki never documented), keep the
**agentic scaffolding fully documented**, and reload the grounding index — the sweep that runs
BETWEEN plan closeouts, not per-plan. Delegates the actual edits to the `wiki-librarian` agent.
Like `/compress-learnings` this is LEARN/IMPROVE-stage housekeeping, not a plan; it needs no
`discussion/` folder — UNLESS the sweep surfaces a content decision (a real wiki↔code
contradiction someone must resolve), which gets a `discussion/<slug>-<date>/` plan and stops
here with that flagged.

**Why this exists:** agents sometimes ship code without updating the wiki, and the default
lint (structural + touched-page spot-check) does not catch what was silently NOT written down.
This sweep exists to close that hole — it must actively hunt for wiki GAPS against the as-built
code and the `.claude` / `.github` scaffolding, not just verify the pages that already exist.

**Gap-handling rule (applies to every checklist item below).** When the sweep finds the wiki
missing or wrong versus as-built reality: **fix the obvious ones directly** (a new command that
is simply undocumented, a renamed file, a shape the wiki plainly lags) via the `wiki-librarian`,
logging each per rule 2. For anything **ambiguous** — where the correct wiki content is a
judgment call, two sources genuinely conflict, or documenting it would assert a decision nobody
made — **ask the operator with `AskUserQuestion`** rather than guessing, and only then write the
answer. Never silently drift (rule 1).

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
   current code/decisions and refresh it. The checklist now has THREE parts: (A) structural
   lint, (B) as-built reconciliation, (C) agentic-layer coverage. B and C are mandatory every
   `lint` run — do not skip them because A came back clean.
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

### Part A — structural lint

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

### Part B — as-built reconciliation (BIDIRECTIONAL, mandatory)

The wiki must match the code that actually shipped — both when it CONTRADICTS the code and when
it is SILENT about it. Sweep code→wiki, not just wiki→code:

9. **Protocol shapes** (rule 5): every message shape / enum / exported contract in
   `packages/protocol/src/index.ts` that the wiki describes is current, and any shipped shape
   the wiki should describe (per `Requirements/interaction-protocol.md`) is present. A shape in
   code but absent/stale in the wiki is a gap → fix obvious, ask on ambiguous.
10. **MCP tool surface**: the tool set exposed by `apps/mcp` (server `index.ts` +
    `bridge-server.ts`) matches what `Requirements/interaction-protocol.md` documents — no tool
    added/removed/renamed without the wiki reflecting it.
11. **Studio surfaces & user-facing behavior**: phases, board kinds, and studio surfaces in
    `apps/studio/src` reconcile with `Product/phase-funnel.md`, `Product/board-modes.md`, and
    `user-guide.md` (rule 12: docs move with the product).
12. Spot-check recently-changed code (git status / recent commits) as the highest-yield place to
    find drift, but do NOT limit Part B to touched files — the point is catching gaps left by
    prior sessions that never touched the wiki.

### Part C — agentic-layer coverage (the `.claude` + `.github` scaffolding, mandatory)

The wiki must PERFECTLY document the agentic scaffolding and give an authoritative starting
point per harness. Enumerate the real files on disk and reconcile against the wiki:

13. **`.claude/agents/`** — every agent is in the `System/agents.md` roster with model tier +
    when-to-use; no roster entry points at a deleted agent. New/removed/renamed agent → fix.
14. **`.claude/commands/` and `.claude/skills/`** — the wiki authoritatively enumerates every
    command and skill with its owner/purpose (not only CLAUDE.md's quick map). A command or
    skill on disk but absent from the wiki index is a gap → fix obvious, ask on ambiguous.
15. **`.github/` adapter surface** — the wiki documents the Copilot adapter layer: its agents
    (`.github/agents/*.agent.md`), prompts (`.github/prompts/*.prompt.md`),
    `agentic-surface-registry.json`, and that these are thin wrappers over the authoritative
    `.claude/` layer (rule 11), NOT parallel workflow definitions. Adapter files added/removed
    without the wiki reflecting the mapping is a gap.
16. **Per-harness authoritative starting points** — the wiki states, per supported harness
    (Claude Code → `.claude/` + this CLAUDE.md; GitHub Copilot → `.github/`; future
    CODEX/Cursor when built), where an agent on that harness starts and which layer is the
    behavioral SSOT. Missing/ambiguous → fix obvious, else `AskUserQuestion`.
17. **Reconcile obligation is bounded (rule 11).** Every `.claude`↔`.github` pair should stay
    outcome-comparable; if the sweep finds an adapter that has diverged from its `.claude`
    source in a way that changes behavior, FLAG it (it may be a real reconcile decision), don't
    silently rewrite the adapter here.

## Changelog
- 2026-07-09 — hardened per operator: added Part B (bidirectional as-built reconciliation —
  hunt code→wiki GAPS, not just contradictions on touched pages) and Part C (agentic-layer
  coverage — wiki must perfectly document `.claude/{agents,commands,skills}` + the `.github`
  adapter surface + per-harness authoritative starting points). New gap-handling rule: fix
  obvious gaps directly, `AskUserQuestion` on ambiguities. Reason: default lint missed silently
  undocumented scaffolding/code (operator: "if agents skip wiki documentation it leads to wiki
  gaps ... wiki also needs to perfectly document the .claude and .github agentic scaffolding")
- 2026-07-09 — created: donor `wiki-maintenance` refactored for this repo — `wiki/` root,
  `wiki-librarian` delegate, this repo's lint checklist, mandatory `wiki_reload`, explicit
  hand-offs to `/compress-learnings` (learnings) and `/plan-closeout` (per-plan updates)
  (from wiki-mcp-grounding-and-maintenance-2026-07-09)
