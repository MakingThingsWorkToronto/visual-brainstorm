# Wiki grounding via the `visual-brainstorm-wiki` MCP (authoritative)

The wiki at `wiki/` is authoritative (CLAUDE.md rule 1). Agents read it **cheaply and
context-shaped** through the read-only `visual-brainstorm-wiki` MCP server (`apps/wiki-mcp`),
NOT by dumping whole pages into context. This page is the binding contract for how the wiki is
GROUND on and kept fresh. The server's architecture/shape is in
[system-architecture.md](../Requirements/system-architecture.md); this page is the practice.

## The seven tools

Read-only — there are **no write tools**. Wiki edits stay plain-file (Edit/Write) via the
`wiki-librarian`; this server only reads and re-indexes.

| Tool | Returns | Use for |
|---|---|---|
| `wiki_search(query, limit?)` | ranked hits, one bounded ~200-char excerpt + metadata each (never bodies; default 8, max 25) | first hop — find the page/heading that answers the question |
| `wiki_outline(path)` | heading tree only | see a page's shape before pulling any prose |
| `wiki_read(path, heading?)` | ONLY that heading's subsection (full page truncated with outline attached if over the char cap) | pull the single subsection you need |
| `wiki_list()` | pages by section | enumerate what exists |
| `wiki_toc()` | full table of contents | map the whole wiki |
| `wiki_related(path)` | related pages via the link graph | follow cross-references |
| `wiki_reload()` | re-reads disk into the in-memory index; returns the page count | **after any wiki edit** (see below) |

## Grounding workflow — every agent, before answering from the wiki

**`wiki_search` → `wiki_outline` → `wiki_read(path, heading)`.** Search to locate, outline to
target, read one heading. Never `wiki_read` a whole page when a heading will do — a full read
over the char cap is truncated anyway. This keeps orchestration/agent context small (rule 9,
surgical). Fall back to plain file tools only if the MCP is unavailable in the session; a full
`Read` of a wiki page is the last resort, not the first hop.

Who grounds here: the `brainstorm-orchestrator` and every subagent it spawns
(`svg-artisan`, `devops-diagnostician`, `test-engineer`, `wiki-librarian`), and any command
step that needs an authoritative fact. When a task touches a wiki-documented contract, ground
first — do not answer from chat memory (rule 1).

## The reload contract — binding

The in-memory index is a cache; plain-file edits do **not** update it. After ANY change to a
`wiki/` file — create, edit, delete, rename — call `mcp__visual-brainstorm-wiki__wiki_reload`
so the next `wiki_search`/`wiki_read` sees the current bytes. This is mandatory for:

- the `wiki-librarian` agent (every capture/reconcile), and
- every command that edits the wiki: `/plan-closeout` (step 5), `/wiki-maintenance`, and any
  future command that writes `wiki/`.

If the MCP is not registered in the session, skip `wiki_reload` gracefully and note it once —
a restart re-reads disk anyway. Do NOT spam `wiki/log.md` with reload-skip lines; the log
records wiki-content edits, not tooling state.

## Wiring — scoped agents must list the tools

An agent whose frontmatter `tools:` is an explicit allowlist gets ONLY those tools; MCP tools
are **not** included implicitly. To ground or reload from such an agent, its `tools:` must name
the exact tools — e.g. `mcp__visual-brainstorm-wiki__wiki_search`,
`mcp__visual-brainstorm-wiki__wiki_read`, `mcp__visual-brainstorm-wiki__wiki_reload`. The
`wiki-librarian` is wired this way. Agents with `tools: All tools` (or `*`) get them for free.
A grounding/reload duty written in an agent's prose is a dead letter until its tool list can
satisfy it — widen the list in the same edit.

## Boundaries

- Grounding does not replace `wiki/log.md`: every content edit is still logged (rule 2). The
  MCP reload keeps the READ index fresh; the log keeps the human-auditable edit trail.
- Plans belong in `discussion/`, gotchas in `.agents/learnings.md` — the MCP indexes `wiki/`
  only, so those homes stay separate by construction.

## See also

- [system-architecture.md](../Requirements/system-architecture.md) — the app shape + `.mcp.json` registration
- [agents.md](agents.md) — the agent roster (all ground here)
- [conventions.md](../Meta/conventions.md) — the reload-after-edit convention
- `.claude/commands/wiki-maintenance.md` — the periodic lint/reconcile sweep
