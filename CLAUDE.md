# Visual Brainstorm — Root Agentic Mandates

## The 10 universal rules

1. **The wiki at `wiki/` is authoritative.** Facts and guardrails live there, not in chat
   history. The architecture lock is `wiki/Requirements/system-architecture.md`; the
   interaction contract is `wiki/Requirements/interaction-protocol.md`. When code and wiki
   disagree, stop and reconcile — never silently drift.
2. **Every wiki edit is logged** — append one line to `wiki/log.md` (date, page, what changed,
   why). No unlogged wiki changes.
3. **Plans live in `.docs/discussion/<slug>-<yyyy-mm-dd>/plan.md`.** Any multi-step task gets
   one before implementation. Plans close ONLY via `/plan-closeout`
   (`.claude/commands/plan-closeout.md`): verify → harvest learnings → **improve the slash
   commands the learnings implicate** → wiki update → archive to `.docs/discussion/_completed/`.
4. **Agentic learnings persist to `.agents/learnings.md`** — non-obvious discoveries only
   (gotchas, API quirks, decisions with rationale). If you learned it the hard way, write it
   down; the next session must not re-learn it.
5. **`packages/protocol` is the single source of truth for message shapes.** The MCP server
   and the studio import from it; neither redeclares a Board/Response type. A shape change is
   a protocol change: update the package, then both consumers, then the wiki.
6. **No fake-success.** No function shaped like a real provider that returns fabricated data.
   Honest errors (or explicit `pending`) over fake data — a fake success is worse than a
   failure because it hides the gap.
7. **Every SVG presented to the user is captured** to the session directory with provenance
   (session, round, parent options). Brainstorm artifacts are never ephemeral — capturing every
   artifact IS the product promise.
8. **Untrusted SVG is sanitized before render.** The studio strips scripts, event handlers,
   `foreignObject`, and javascript: hrefs. Never render raw model output into the DOM.
9. **Surgical changes, simplicity first.** No abstractions for single-use code, no unrequested
   flexibility, no refactors of things that aren't broken. Every changed line traces to the
   request.
10. **Proof is a run, not a claim.** Before declaring work done: `npm run build` passes and
    `npm run smoke` passes (headless present→respond round-trip). UI claims additionally need
    the studio actually loaded (`npm run demo`, open the printed URL).

## Appendix — workspace structure

```
packages/protocol/     zod schemas + types (Board, BoardOption, SurveyConfig, BoardResponse, WS envelopes)
apps/mcp/              stdio MCP server + local bridge (http/WS) + session persistence
apps/studio/           Vite + React + Tailwind survey UI (shadcn-chat-inspired)
wiki/                  authoritative facts & guardrails (plain markdown; log.md discipline)
.docs/discussion/      session plans AND the brainstorm thread cache (dirs with session.json);
                       _completed/ archive. Threads are committable — nothing is regenerated.
.agents/               learnings.md (hard-won facts only)
.claude/commands/      AUTHORITATIVE repeatable slash commands (plan-closeout, run-brainstorm,
                       discover-skills, build-check, new-command, add-theme) — living documents
                       improved on every plan-closeout
.claude/skills/        craft knowledge (svg-authoring, brainstorm-phases)
scripts/               smoke.mjs and repo tooling
styles/                ingested theme JSON drop-ins
.mcp.json              registers this repo's own MCP server (dogfooding)
visual-brainstorm.config.json   targetRepo / styles / theme / models / discussionDir
```

## Appendix — stdio discipline

`apps/mcp` speaks MCP over **stdout**. Nothing in that app may `console.log`; all diagnostics
go to `console.error` (stderr). One stray stdout write corrupts the protocol stream.
