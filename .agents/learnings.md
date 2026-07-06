# Agentic Learnings (newest first)

## 2026-07-05 — persistence/styles session

- **Two bridges can't share port 5199 — and on Windows, killing an `npm run` wrapper can
  orphan the node child, leaving the port held.** The bridge now falls back to an ephemeral
  port on EADDRINUSE (stderr warning) instead of crashing; the printed/returned `studioUrl`
  is the source of truth, never assume 5199.

## 2026-07-05 — bootstrap session

- **stdio MCP servers must never write to stdout.** The MCP protocol IS stdout; one stray
  `console.log` corrupts the stream and Claude Code drops the server. All apps/mcp logging
  goes through `console.error`. (Codified as CLAUDE.md appendix.)
- **`present_board` blocking + timeout recovery is the crux design.** MCP tool calls can block
  for long periods but clients enforce timeouts (Claude Code: `MCP_TOOL_TIMEOUT`). Design:
  block up to `timeoutSeconds` (default 1740s), return `{status:"pending"}` on expiry, persist
  the late response, recover via `peek_response`. Never treat timeout as failure.
- **Artifacts belong to the brainstormed project, not this repo.** Claude Code launches MCP
  servers with cwd = user's project, so `.visual-brainstorm/` lands where the user can commit it.
- **Donor architecture (C:\Code\tp) mapping:** root CLAUDE.md numbered mandates + AGENTS.md
  behaviour mandates + `.docs/discussion/<slug>-<date>/plan.md` + `_completed/` + authoritative
  wiki with append-only `log.md` + `.agents/` learnings/skills. Optimization taken here: wiki
  stays plain files (no wiki-MCP ceremony) because this repo's MCP layer is the product itself.
- **shadcn 2026-06 chat components** (UI north star): MessageScroller (scroll behaviors),
  Message/Bubble (rows/surfaces), Marker (status/separators), Attachment, plus `scroll-fade`
  and `shimmer` CSS utilities. Studio mirrors these patterns hand-rolled on Tailwind v4.
