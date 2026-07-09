# Wiki-MCP grounding + wiki-maintenance command

**Date:** 2026-07-09
**Scope:** Make the `visual-brainstorm-wiki` MCP (apps/wiki-mcp) authoritative as the agent
grounding surface for the wiki; make "reload after every wiki edit" a binding contract across
the agentic layer; import + refactor the donor `wiki-maintenance` command for this repo and
wire it to the existing commands (compress-learnings, plan-closeout).
**Authority:** Operator request (this session). CLAUDE.md rules 1, 2, 11, 12.
**Status:** closed 2026-07-09

## Problem

- The wiki-mcp app is documented at the architecture level (system-architecture.md) and named
  in the CLAUDE.md quick map, but agents are not told to GROUND on it, and no page/command
  makes "reload the MCP index after wiki edits" a binding rule — so the in-memory index goes
  stale after plain-file edits.
- There is no periodic wiki lint/reconcile procedure (donor has `wiki-maintenance`); the only
  wiki touch-point is per-plan updates inside `/plan-closeout`.

## Deliverables

1. **`wiki/System/wiki-grounding.md`** (new, authoritative) — the seven tools, the
   search→outline→read grounding workflow agents must use, and the reload-after-edit contract.
2. **`.claude/commands/wiki-maintenance.md`** (new) — donor command refactored for this repo:
   wiki at `wiki/`, delegates to `wiki-librarian`, this repo's lint checklist, `wiki_reload`
   after edits; explicitly hands learnings compaction to `/compress-learnings` and per-plan
   wiki updates to `/plan-closeout`.
3. **`plan-closeout.md`** step 5 — call `wiki_reload` after wiki edits.
4. **`wiki-librarian.md`** agent — grounding via the MCP + mandatory `wiki_reload` after edits;
   add the MCP tools to its `tools:` list.
5. **`wiki/Meta/conventions.md`** — reload-after-edit as a wiki convention.
6. **CLAUDE.md quick map** — wiki-maintenance row; reload note on the wiki-read row.
7. **`discover-skills.md`** task map + **`wiki/System/agents.md`** + **`wiki/System/model-tiering.md`**
   + **`wiki/README.md`** — register the new page/command; log every wiki edit in `wiki/log.md`.

## Verification

- `npm run build` + `npm run smoke` green.
- Call `mcp__visual-brainstorm-wiki__wiki_reload`; confirm the new page is indexed
  (`wiki_search "grounding"` / `wiki_list`).

## Progress

- [x] wiki-grounding.md page + README index + log
- [x] wiki-maintenance.md command
- [x] plan-closeout reload step
- [x] wiki-librarian grounding + reload + tools
- [x] conventions reload rule
- [x] CLAUDE.md quick map
- [x] discover-skills / agents.md / model-tiering
- [x] harness parity: `.github/` surface-map + registry + wiki-maintenance.prompt.md adapter
- [x] build + smoke + reload verify (17 pages indexed; new page ranks #1 on grounding search)
- [x] fresh-eyes pass: wove the wiki into `Meta/agentic-loop.md` as the loop's READ-guardrail
      (not just stage-4 output) — BUILD entry requires grounding + no unreconciled drift;
      DOCUMENT exit requires `wiki_reload`; new "wiki is the loop's guardrail" subsection;
      diagram hub + DOCUMENT node updated (rule 12); CLAUDE.md bootstrap step 2 now says
      ground-before-acting via the MCP. Logged + reloaded + read-back verified.
