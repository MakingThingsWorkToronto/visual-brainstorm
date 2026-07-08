# apps/wiki-mcp — Agentic Rules

Read-only wiki MCP server, separate from the product MCP (`apps/mcp`). It exposes the repo's
authoritative `wiki/` to Claude Code so agents can pull context without dumping whole pages.

1. **Read-only.** Seven tools: `wiki_search`, `wiki_outline`, `wiki_read`, `wiki_list`,
   `wiki_toc`, `wiki_related`, `wiki_reload`. There are NO write tools — wiki edits stay
   plain-file through the wiki-librarian (CLAUDE.md rule 1/2). This server only reads.
2. **stdout is the MCP channel.** Nothing here may `console.log`; all diagnostics go to
   `console.error` / `process.stderr` (root CLAUDE.md stdio-discipline appendix). One stray
   stdout write corrupts the protocol stream.
3. **Wiki path.** `WIKI_PATH` env var overrides; default resolves module-relative to the repo
   root `wiki/`. The in-memory index is cached; `wiki_reload` (or a restart) re-reads disk.
4. **Search must not flood the client.** `wiki_search` returns ranked hits with ONE bounded
   ~200-char excerpt each and metadata — never page bodies. Default limit 8, max 25.
5. **Granular reads preserve context.** `wiki_outline` returns the heading tree only;
   `wiki_read(path, heading)` returns ONLY that heading's subsection. A full `wiki_read` over
   the char cap is truncated with its outline attached — pull a single heading instead.
6. **Dependency-light.** Deterministic dependency-free relevance search (no fuse.js) and
   stdio-only (no express/helmet/cors) — improvements over the donor at `C:\Code\tp\apps\wiki-mcp`.
7. Registered in the repo's `.mcp.json` as the `visual-brainstorm-wiki` server; built by the
   root `npm run build`.
