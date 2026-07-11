# Concierge → Living Gallery — methodology-driven intake (SHIPPED)

**Status: shipped; plan closed 2026-07-07.** Finalized by brainstorm
`discussion/_completed/2026-07-06-2358-methodology-driven-intake-mind-map-board/brainstorm.md`
(round-4 crown: `concierge-living-gallery`); build plan
`discussion/_completed/concierge-living-gallery-2026-07-07/plan.md` — all 7 phases done
(incl. phase 6 real-bridge human-sim proof + break-sweep, and phase 7 user-guide docs).
Implementation: (mind-tree board
payload + editedTree; live mind-elixir MindmapCanvas; adaptive concierge ConciergeIntake surface;
Living Gallery LivingGallery surface with method cards, recommended ribbon + reason chip; Claude
Code → studio handoff `open_studio` brief pre-fills the New Discussion panel; routing rules wired
in `.claude/commands/run-brainstorm.md` step 0, `.claude/agents/brainstorm-orchestrator.md`, and
`.claude/skills/brainstorm-phases/SKILL.md`). This page documents WHAT IS SHIPPED.

## The intake flow (four moves)

1. **Hand off the brief via `open_studio`** — lands the user on the New Discussion panel (brief
   + voice, chips, colors, scribble, attachments, model, target folder) and blocks until they
   submit. If the human already described the purpose in Claude Code, pass it as `brief`
   (pre-fills the panel; no rework). Submission arrives as a new-brainstorm command. The brief
   is logged as a structured `IntakeLogEntry` and rendered as a permanent bubble in the timeline.

2. **Adaptive concierge — call `ask_concierge` as many times as it takes** (no fixed-count cap;
   comprehensiveness rewards the brainstorm). Each question is presented in the studio
   (ConciergeIntake surface) with tappable suggestion chips + free text; answers return and
   append to the thread's `brainstorm.md` digest. Domain-tailored questions: audience,
   constraints, what "good" looks like, scope, liveness. Each answer is logged as an
   `IntakeLogEntry` and rendered as question/answer bubbles in the timeline (live or archived).

3. **Living Gallery — call `present_gallery`** with the roster as method cards, each carrying a
   LIVE mini SVG genuinely seeded from the brief + answers (delegate the 4 minis to `svg-artisan`
   — never generic icons). Mark exactly ONE `recommended:true` with a `reason` quoting the
   user's answers. The studio's LivingGallery surface ribbons the recommended card and collects
   the pick. The pick is logged as an `IntakeLogEntry` and rendered as a marker line in the
   timeline.

4. **Route the pick** — `present_gallery` returns the chosen `method` (routing key); start there:
   - **mindmap** → `present_board` with a `tree` (kind `"mindmap"`, no options); user co-edits
     live on the mind-elixir MindmapCanvas; edits return in `response.editedTree`.
   - **funnel** → proceed to the diverge funnel (steps 1–3 of run-brainstorm) as usual.
   - **wreck** → `present_board` at `phase:"wreck"` on the seeded option(s).
   - **cluster** → `present_board` at `phase:"cluster"` on the seeded options.

   Non-mindmap picks still flow through run-brainstorm's pre-phrase (step 1) and the funnel — the
   gallery only chose the STARTING mechanic.

## Intake persists as chat history (2026-07-11)

Once intake begins (the first message is submitted), the timeline is permanent — the studio never
swaps back to the New Discussion panel alone. Each step (brief, concierge exchange, gallery pick)
appears as structured bubbles at the TOP of the timeline and remains visible in the thread history
forever, including archived threads. Gaps between intake stages show a "preparing…" shimmer. The
user can **✎ revise the brief** (a button on the brief bubble, live threads only) to restart the
intake with a different prompt — sending a fresh new-brainstorm, leaving the old intake in history.
The WayfinderStrip gains a 🌱 **brief** chip (testid: `intake-chip`) as its FIRST slot when intake
history exists; clicking it scrolls the timeline back to the intake bubbles.

## The intake is STRUCTURALLY enforced, not just instructed (2026-07-08)

The methodology is not a prompt convention the orchestrator may skip — it is locked in two ways:

- **Server-side gate (harness-agnostic).** The `present_board` MCP tool REFUSES the first board of
  a fresh thread until a Living Gallery pick has been made (`bridge.intakeComplete`, set in the
  gallery resolver, reset on `attachStore`) — an honest error tells the orchestrator to run
  concierge→gallery first. A board before a gallery pick is a procedure violation, not a shortcut.
  Because it lives in the MCP server, every harness (Claude Code, `.github` Copilot) inherits it.
  (Harnesses that drive `bridge.presentAndWait` directly — the human-sim — bypass the tool guard by
  design, so they don't false-fail; the gate is proven by `tests/intake-gate.test.mjs`.)
- **Studio veil.** After a brief submit the studio holds a "preparing your questions…" surface
  (`intakeAwaiting`), never the bare New Discussion panel again, until the concierge/gallery/board
  arrives — the human is never stranded looking like the methodology was skipped.

`run-brainstorm.md` frames the four moves as a followed STATE MACHINE where `open_studio`/
`ask_concierge`/`present_gallery`/`present_board` are internal DISPATCH STEPS, never à-la-carte tools.

## Mind map: a peer methodology (not the default or centerpiece)

- Sits BESIDE funnel/wreck/cluster as an equally recommended choice — never the default.
- Implemented as a live co-edited **mind-elixir** canvas. User edits flow through the UI, then
  return in `response.editedTree` as the feedback for the next round (structure IS the response).
- Protocol (packages/protocol, rule 5): `Board.tree` (MindTreeSchema, optional), `BoardResponse.editedTree`
  (MindTreeSchema, optional), `MindNode` (id, topic, children, expanded, tags, style).
- SVG export via the normal artifact path preserves the artifact ledger (rule 7); SVG render is
  always sanitized (rule 8).

## Routing rules

The decision (which method to recommend, how to route a pick) is PURE ORCHESTRATION, never
hardcoded. Rules live in three `.claude` files (rule 11):

- `.claude/commands/run-brainstorm.md` **step 0** — the procedure: hand off brief, concierge
  loop, present gallery, route the pick.
- `.claude/agents/brainstorm-orchestrator.md` **What you keep vs. delegate** — concierge intake is
  orchestration (never delegate), including the call-count and comprehensiveness heuristic.
- `.claude/skills/brainstorm-phases/SKILL.md** **Intake & methodology routing** — recommendation
  heuristics (which method to mark `recommended` + reason quoting the answers); the table routing
  each pick to a starting mechanic.

## Killed directions (guardrail — do not resurrect)

- Automatic seed-shape inference — the sketch pad already covers rough input.
- Abstract explore↔build "structure dial".
- Round-zero "methods as a board" as the chooser.
- Quiet auto-routing into a method — recommendation stays a suggestion the user picks.
- Combined questions+previews split view (operator: "seems confused").

## Taste calibration (final dials from the thread — context for implementers)

| Dial | Value | Reading |
|---|---|---|
| Methodology visibility | 73 | named & explicit |
| Intake effort | 32 | low friction |
| Structure origin | 68 | system suggests |
| Liveness | 65 | lean live/co-edited where the method warrants |
| Recommendation strength | 50 | suggest, don't auto-route |
