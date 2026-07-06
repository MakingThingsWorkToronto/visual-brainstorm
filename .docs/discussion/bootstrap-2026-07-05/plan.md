# bootstrap — Visual Brainstorm repo founding

**Date:** 2026-07-05
**Scope:** entire repo (greenfield)
**Authority:** operator brief (2026-07-05 session); donor architecture `C:\Code\tp` (TradesPath); shadcn chat components changelog 2026-06 (UI inspiration)
**Status:** phases P0–P4 executed this session; P5 is the standing backlog

---

## 1. The brief (verbatim intent)

An SVG-based visual brainstorming tool that runs **beside Claude Code**. Instead of replying
with text, Claude replies with **SVG graphics presented in survey format** — like
AskUserQuestion, but far more diverse. Open source. Interactivity via an **MCP server**.
AskUserQuestion is used *inside Claude Code* to pre-phrase/clarify before anything is sent to
the visual app. The loop iterates like collaborative brainstorming and **captures every
artifact produced**.

Two polar use cases that must both work:

1. **Icon generation** — AskUserQuestion clarifies style/references/colors → consensus sent to
   the app → SVG option grid → user multi-selects, elaborates, clicks send → Claude iterates.
2. **System design** — AskUserQuestion clarifies requirements/inspiration → consensus sent →
   SVG visualization of system/product/requirements → same select/elaborate/send loop.

Inspirations: shadcn chat components (UI), 2000s maps-mashup culture (architecture — small
composable pieces glued over open protocols), Claude itself (intelligence).

## 2. Donor architecture adoption (and optimizations)

Adopted from `C:\Code\tp` — this is mandatory foundation, not formality:

| Donor piece | Here | Optimization |
|---|---|---|
| Root `CLAUDE.md` numbered mandates | `CLAUDE.md` (10 rules) | Trimmed to rules enforceable in a greenfield OSS tool; kept no-fake-success and proof-by-running verbatim in spirit |
| `AGENTS.md` behaviour mandates | `AGENTS.md` | Condensed to 6 |
| `apps/wiki-mcp/wiki/` MCP-served wiki | `wiki/` plain files | The MCP layer here IS the product; the wiki stays plain markdown read with `Read` — authority + `log.md` discipline kept, ceremony dropped |
| `.docs/discussion/<slug>-<date>/plan.md` + `_completed/` | identical | unchanged — it works |
| `.agents/` learnings + skills | identical | seeded with bootstrap learnings |

## 3. Architecture (locked in wiki/Requirements/system-architecture.md)

```
npm workspaces monorepo
├── packages/protocol   @visual-brainstorm/protocol — zod schemas + TS types, the single
│                       source of truth for Board / BoardOption / SurveyConfig / BoardResponse
├── apps/mcp            @visual-brainstorm/mcp — stdio MCP server for Claude Code.
│                       Owns a local "bridge" (http + WebSocket) that serves the built studio
│                       and relays boards/responses. Persists every round + artifact to
│                       <cwd>/.visual-brainstorm/sessions/<stamp>-<slug>/
└── apps/studio         @visual-brainstorm/studio — Vite + React + Tailwind v4 survey UI,
                        shadcn-chat-inspired (MessageScroller/Bubble/Marker patterns)
```

Data flow (the mashup): Claude Code ⇄ (stdio MCP) ⇄ bridge ⇄ (WS/HTTP) ⇄ studio in browser.
`present_board` **blocks** until the user responds in the studio (AskUserQuestion semantics,
but rendered as a rich SVG survey). Timeout returns `pending`; `peek_response` recovers.

## 4. Phases

- **P0 — agentic architecture** ✅ CLAUDE.md, AGENTS.md, wiki/, .docs/discussion/, .agents/
- **P1 — protocol package** ✅ zod schemas, WS envelopes
- **P2 — MCP server + bridge** ✅ tools: `present_board`, `peek_response`, `capture_artifact`,
  `session_status`; static serving; session persistence; browser auto-open
- **P3 — studio UI** ✅ timeline of rounds, option cards with per-option notes + remix marks,
  axis sliders, elaboration composer, artifact shelf, thinking shimmer, empty state
- **P4 — verification** ✅ full build + `scripts/smoke.mjs` (headless WS round-trip:
  present → select → respond → resolve → files on disk)
- **P5 — backlog** (see wiki/Product/board-modes.md § Roadmap): sketch-back annotations,
  idea lineage tree, exports (sprite sheet / symbol library), forked branches, voting rounds

## 5. Decisions log

- npm workspaces, no turbo — three packages don't need a task graph yet.
- ESM + NodeNext everywhere; Node ≥ 20.
- MCP stdio transport ⇒ **stderr-only logging** in apps/mcp (stdout is the protocol channel).
- Studio never trusts SVG: sanitized (scripts/event handlers/foreignObject stripped) before render.
- Session artifacts live in the *user's* cwd (`.visual-brainstorm/`), because the MCP server is
  launched by Claude Code from the project being brainstormed — artifacts belong to that repo.
- Default `present_board` timeout 1740 s (just under a 30-min MCP tool ceiling); operators can
  raise `MCP_TOOL_TIMEOUT` in Claude Code.
