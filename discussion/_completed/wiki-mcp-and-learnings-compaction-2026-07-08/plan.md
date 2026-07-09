# Wiki MCP + weekly learnings compaction

- **Date:** 2026-07-08
- **Scope:** Two deliverables from one operator brief. (A) A `/compress-learnings` command
  that weekly-compacts `.agents/learnings.md` (recent verbatim, older distilled to durable
  one-liners; full originals preserved in an archive), documented as a weekly maintenance
  step in the agentic loop. (B) A NEW `apps/wiki-mcp` MCP server — separate from the product
  MCP (`apps/mcp`) — ported and improved from the donor at `C:\Code\tp\apps\wiki-mcp`, pointed
  at THIS repo's authoritative `wiki/`, with search output shaped so it never floods the client
  and a granular per-heading read method to preserve context.
- **Authority:** Operator brief 2026-07-08. CLAUDE.md rule 3 (plan first), rule 11 (route
  through the `.claude` layer — new command), rule 1/2/12 (wiki authoritative + logged + guide),
  rule 9 (surgical, minimal deps), rule 6 (honest errors). Donor precedent
  `.agents/learnings.md` bootstrap entry ("wiki stays plain files" was scoped to NOT needing a
  wiki-MCP for the *product's* runtime; this adds a read-side MCP for AGENT context, which is a
  different concern — the agent still edits plain files, the MCP only reads).
- **Status:** closed 2026-07-09.

## Phases

| # | Phase | Status |
|---|---|---|
| 1 | `apps/wiki-mcp` app: loader + dependency-free search + granular read/outline + stdio MCP server | Done |
| 2 | Wire the app: `.mcp.json` second server, root build script, workspace install | Done |
| 3 | `/compress-learnings` command + registry (discover-skills) | Done |
| 4 | Tests: `tests/wiki-mcp.test.mjs` (real repo-wiki data; bounded search; granular read) | Done |
| 5 | Verify: `npm run build` + `npm test` green | Done |
| 6 | Docs: agentic-loop weekly step, system-architecture new app, user-guide n/a, CLAUDE.md map, log.md | Done |

## Design notes

### apps/wiki-mcp (improved from donor)
- **ESM / NodeNext / `@modelcontextprotocol/sdk` `McpServer`** — matches `apps/mcp` (donor used
  CommonJS + a hand-rolled JSON-RPC loop; we use the SDK the product MCP already depends on).
- **No `fuse.js` / `express` / `helmet` / `cors`.** Donor pulled four runtime deps; we ship a
  dependency-free relevance scorer (deterministic, testable) and stdio-only (the client is
  Claude Code — no browser HTTP mirror needed). Fewer deps = rule 9.
- **`WIKI_PATH`** resolves module-relative to the repo's own `wiki/` (`../../../wiki` from
  `dist/`), env-overridable. The server is READ-ONLY (no write tools; edits stay plain-file).
- **Search output shaping (don't flood the client):** default `limit` 8 (max 25), one bounded
  ~200-char snippet per hit, results carry `path/title/section/snippet/score/wordCount` — never
  page `content`. `wiki_list`/`wiki_toc` return metadata only.
- **Granular read (preserve context):** `wiki_outline(path)` returns the heading tree (level,
  title, line, section word count) cheaply; `wiki_read(path, heading?, maxChars?)` returns ONLY
  the requested heading's subsection when `heading` is given, else the full page — and a full
  read over `maxChars` (default 8000) is truncated with the outline + a hint to read by heading.
- Tools: `wiki_search`, `wiki_outline`, `wiki_read`, `wiki_list`, `wiki_toc`, `wiki_related`,
  `wiki_reload` (7 — donor's 6 + `wiki_outline`).

### /compress-learnings (weekly)
- Distills `.agents/learnings.md`: entries within the recency window stay verbatim; older
  entries collapse to durable one-line lessons (fact + why) under `## Compacted (archived)`;
  the full originals are appended to `.agents/learnings-archive.md` (nothing lost).
- Documented weekly step in `wiki/Meta/agentic-loop.md` + CLAUDE.md quick map (no auto-fire).

## Progress log
- 2026-07-08 — plan written; donor `apps/wiki-mcp` inspected (loader/search/mcp-tools/types).
- 2026-07-08 — BUILD: `apps/wiki-mcp` shipped (types/loader/search/read/index + package/tsconfig/CLAUDE);
  `.mcp.json` second server + root build script + `npm install` link; `/compress-learnings` command
  + discover-skills/CLAUDE.md registry; `tests/wiki-mcp.test.mjs`.
- 2026-07-08 — VERIFY (rule 10): `npm run build` clean (all 4 workspaces); `npm test` unit layer
  164/164 (incl. 7 new wiki-mcp), smoke PASS, ui-smoke PASS. Real stdio MCP probe: initialize →
  tools/list (7 tools) → wiki_search (8 hits, 197-char snippet, no body) → wiki_read(heading) (1467
  chars, only the requested subsection). `human-sim` layer intentionally skipped — this work adds an
  isolated app + config + one test and touches no studio/bridge/product-MCP path, so it adds no
  coverage here.
- 2026-07-08 — DOCUMENT: wiki-librarian updated `wiki/Requirements/system-architecture.md`,
  `wiki/Meta/agentic-loop.md`, `wiki/System/model-tiering.md` + `wiki/log.md` (3 lines); LEARN entry
  in `.agents/learnings.md`.
- 2026-07-08 — SHIP: operator authorized "commit and push all". My complete deliverable was swept
  into a concurrent session's `c99068d "Commit pending workspace updates"` (the documented
  files-swept-by-concurrent-commit pattern) before my own `git commit` ran; verified every file is
  in HEAD == origin/main with correct content. Pushed (origin already had c99068d).
- 2026-07-09 — CLOSEOUT: re-verified `npm run build` + `npm run smoke` green. No new learning (the
  wiki-mcp entry landed in BUILD; the commit-sweep reinforced existing shared-tree entries — no
  filler). IMPROVE: `build-check.md` (+step: prove a new stdio MCP over the protocol via a JSON-RPC
  probe; build order + new-workspace install note). Harness parity: registered `compress-learnings`
  in `.claude/agentic-surface-registry.json` + `.github/agentic-surface-registry.json` +
  `.github/prompts/compress-learnings.prompt.md` (prompts are thin pointers, so build-check/
  discover-skills content edits needed no adapter change; the wiki MCP is a `.mcp.json` server, not
  a `.claude` surface, so it is not in the registry). Steps 6/7 (target-repo hand-off, build-plan
  generation) skipped — engineering plan, not a brainstorm; no artifacts. Archived to `_completed/`.
</content>
</invoke>
