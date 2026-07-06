# phase-funnel-ux — five psychological routes as interface mechanics + self-improving command system

**Date:** 2026-07-05
**Scope:** packages/protocol, apps/mcp, apps/studio, .claude/{commands,skills}, wiki, CLAUDE.md/AGENTS.md
**Authority:** operator mission brief (2026-07-05 late session); CLAUDE.md rules 1–3, 5, 7, 10
**Status:** implemented this session; close via /plan-closeout

---

## Part 1 — The five theories become PHASES, not decoration

The interface is neither a chatbot nor a canvas clone: it is a **phase-shifting survey
instrument**. Every board carries a `phase`; the studio physically re-architects itself per
phase. The funnel is the macro-structure (Theory 1); the other theories are phase mechanics.

| Phase | Theory | Interface mechanic (implemented) |
|---|---|---|
| `diverge` | 1 (expand) + 5 (intuition zone) | Airy low-chrome grid, no selection ceilings, fast spark notes. No gates. |
| `mutate` | 2 (SCAMPER) | **Mutation Lab**: ONE option at a time (big picture hidden), distortion lenses (flip/invert/stretch/compress/tilt/x-ray) applied live as real SVG transforms; user marks which lens "reveals something" → `response.mutations`. |
| `wreck` | 3 (Saboteur) | **Wreck Yard**: tilted low-stakes cards, red flaw scribbles, copy says "nothing here is precious". GATE: ≥3 flaws before send. Claude's next board converts flaws → fixes (methodical de-escalation). |
| `cluster` | 4 (proximity) + 5 (scaffold zone) | **Proximity Field**: drag thumbnails on a 2D field; distance IS the data — clusters derived by proximity (no labels needed), **gap ghosts** glow at the blank space between clusters (click → "what lives here?" note). A scaffold panel auto-names/structures clusters in the background while the user just drags. |
| `converge` | 1 (distill) | **Triage Gate**: generation is DONE; every option must be keep/kill/merge before Send unlocks (threshold mechanic). Narrow, critical, high-contrast layout. |

Response schema grows optional per-phase fields: `triage`, `mutations`, `flaws`,
`positions`, `clusters`, `gapNotes` — plus `commands` (UI-invoked procedures).

## Part 2 — Self-improving command system (donor pattern)

- `.claude/commands/` — authoritative repeatable slash commands: `plan-closeout`,
  `discover-skills`, `run-brainstorm`, `build-check`, `new-command`, `add-theme`.
- `.claude/skills/` — `svg-authoring`, `brainstorm-phases` (the recipes that let ANY capable
  model — explicitly including Opus 4.8 — drive the tool perfectly: exact SVG rules, phase
  transition table, response-interpretation table).
- **Plan closeout is the self-improvement loop**: harvest learnings → `.agents/learnings.md`
  → EDIT the commands the learnings implicate → wiki update + log → move discussion folder
  to `_completed/`. UI header gains a **Plan closeout** button; **Discover skills** button too.
  Buttons POST `/api/command`; if a board is awaiting response the wait resolves immediately
  (action `park` + `commands:[…]`), else the command queues and drains into the next tool
  result — either way Claude is told to run the matching `.claude/commands/*.md`.
- **Archive nav**: threads moved to `.docs/discussion/_completed/` appear under a top-level
  "Archive" section in the left nav, loadable read-only like any cached thread.

## Verification

build + smoke (extended: phase round-trip, per-phase response fields, /api/command queue,
archive listing) + demo per phase (`npm run demo -- wreck` etc.).
