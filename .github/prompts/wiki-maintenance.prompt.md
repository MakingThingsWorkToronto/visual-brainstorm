---
description: "Cross-plan wiki lint/reconcile sweep: fix orphans/broken links/drift, keep log.md discipline, and reload the visual-brainstorm-wiki MCP index."
argument-hint: "lint (default) | update <page>"
agent: "wiki-librarian"
tools: [read, edit, search, execute, todo]
---
Read and follow these files in order:
- [Authoritative registry](../../.claude/agentic-surface-registry.json)
- [Copilot adapter registry](../agentic-surface-registry.json)
- [Workflow](../../.claude/commands/wiki-maintenance.md)
- [Grounding + reload contract](../../wiki/System/wiki-grounding.md)
- [Wiki conventions](../../wiki/Meta/conventions.md)

Treat those files as authoritative. Ground via the `visual-brainstorm-wiki` MCP before
editing, run this repo's lint checklist, keep `wiki/log.md` discipline, and call `wiki_reload`
after all edits (skip gracefully if the MCP is unavailable). Learnings compaction is
`/compress-learnings`; per-plan wiki updates are `/plan-closeout` — this is the cross-plan sweep.
