# phase-funnel-ux — five psychological routes as interface mechanics + self-improving command system

**Date:** 2026-07-05
**Scope:** packages/protocol, apps/mcp, apps/studio, .claude/{commands,skills}, wiki, CLAUDE.md/AGENTS.md
**Authority:** operator mission brief (2026-07-05 late session); CLAUDE.md rules 1–3, 5, 7, 10
**Status:** closed 2026-07-06

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

## Addendum — operator UX-test feedback (same session)

Defects found by live testing and fixed:
1. **Dial-only response was a no-op** → "axis deltas are a complete instruction" enforced in
   tool description, `feedbackDigest`, phases skill, and the demo (dials re-render
   stroke/caps/accent visibly). Studio marks moved dials (● + "steers next round").
2. **Phase tabs not clickable** → PhaseBar is steerable; local mechanic switches instantly;
   `requestedPhase` returns to the orchestrator (protocol field added).
3. **No feedback while Claude works** → rotating progress strings under the shimmer marker;
   bridge gained `think()`.
4. **No full-cycle test path** → ✚ New Brainstorm button (`new-brainstorm` command) + demo
   rewritten as a five-phase self-driving orchestrator with dial-responsive regeneration.
5. **Feedback packaging contract** (operator directive): nothing dropped (touched mechanics
   always ship state), tool result carries labeled executable `feedbackDigest`. Wiki
   interaction-protocol §Feedback packaging is authoritative.
6. **Per-surface verification** → `npm run smoke:ui` server-renders all five mechanics.
7. mindmapcn/mind-elixir evaluated (operator link) → `wiki/Research/visualization-engines.md`,
   phase-2 adoption verdict.
8. **Synthesis vector + brainstorm.md** (operator): selections → next round is pure synthesis
   (2 picks → 5 compositions; 1 pick → spins); every round/response auto-appended to the
   thread's `brainstorm.md` (the re-synthesis memory); per-tab execution guides added.
9. **expand phase** (6-phase funnel): selections GROW the pool with syntheses, nothing removed.
10. **🏁 finalize** (operator): crown one keep in the Triage Gate → capture THE artifact +
    auto-trigger plan-closeout (demo simulates by archiving the thread to `_completed/`).
11. **Prompt-seeded ✚ New Brainstorm**: dialog asks "what are we brainstorming?"; seed rides
    the command (queued or via-board) into the digest; demo titles/seeds the new thread.
12. Bug found by live verify: board ids collided across demo cycles and the bridge's
    first-response-wins dedup swallowed new-cycle responses — ids now cycle-scoped and
    `attachStore` clears response state.
13. **↩ Back action** (operator): rejects the current round and re-presents the previous
    board; bypasses all gates; demo keeps per-round snapshots; digest instructs the
    orchestrator to recover round N-1 from cache and not advance.
14. **Synthesis by MEANING** (operator): overlaying parent SVGs is forbidden — combine what
    the parents MEAN and draw fresh (system-map: merge architectures into one diagram).
    Demo now ships hand-drawn semantic offspring for all 6 stock pairs; mechanical
    composites only as honestly-labeled fallback for offspring-of-offspring.
15. **Engine honesty + kickoff brief** (operator: "prompt was not respected — demo is
    hardcoded"): `StudioState.engine` (claude|demo) surfaces who is driving; the New
    Brainstorm dialog says so. On the demo engine a seeded brainstorm runs a KICKOFF BRIEF
    round — direction cards (literal/abstract/diagrammatic/playful) rendered from the
    user's own prompt — captures the response to the thread, and hands off to Claude
    (resume via discussionId; brief lives in brainstorm.md). No fake generation, ever.
16. **DE-SLOP: demo orchestrator deleted** (operator: "why hardcode anything demo? slop").
    All accreted pseudo-intelligence (pool engine, mechanical/semantic synthesis tables,
    dial-restyling, kickoff brief, kill list, cycle loop) removed with demo.ts. Replaced by
    `preview.ts`: fixtures-only surface exerciser, temp-dir threads, engine `'preview'`
    declared in the UI, `npm run preview [phase]` (`npm run demo` aliases to it).
    `diagnose-demo.md` → `diagnose-studio.md`. One engine: Claude + skills.
