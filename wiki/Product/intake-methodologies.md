# Concierge → Living Gallery — methodology-driven intake (BUILT)

**Status: built (phases 1–5); plan OPEN.** Finalized 2026-07-07 by brainstorm
`discussion/2026-07-06-2358-methodology-driven-intake-mind-map-board/brainstorm.md` (round-4
crown: `concierge-living-gallery`); plan `discussion/concierge-living-gallery-2026-07-07/plan.md`
still open — phases 6 (human-verification, real-bridge e2e) and 7 (docs) remain, and the plan
closes only via `/plan-closeout`. Implementation built: phases 1–5 of the concierge-living-gallery plan (mind-tree board
payload + editedTree; live mind-elixir MindmapCanvas; adaptive concierge ConciergeIntake surface;
Living Gallery LivingGallery surface with method cards, recommended ribbon + reason chip; Claude
Code → studio handoff `open_studio` brief pre-fills the New Discussion panel; routing rules wired
in `.claude/commands/run-brainstorm.md` step 0, `.claude/agents/brainstorm-orchestrator.md`, and
`.claude/skills/brainstorm-phases/SKILL.md`). This page documents WHAT IS SHIPPED.

## The intake flow (four moves)

1. **Hand off the brief via `open_studio`** — lands the user on the New Discussion panel (brief
   + voice, chips, colors, scribble, attachments, model, target folder) and blocks until they
   submit. If the human already described the purpose in Claude Code, pass it as `brief`
   (pre-fills the panel; no rework). Submission arrives as a new-brainstorm command.

2. **Adaptive concierge — call `ask_concierge` as many times as it takes** (no fixed-count cap;
   comprehensiveness rewards the brainstorm). Each question is presented in the studio
   (ConciergeIntake surface) with tappable suggestion chips + free text; answers return and
   append to the thread's `brainstorm.md` digest. Domain-tailored questions: audience,
   constraints, what "good" looks like, scope, liveness.

3. **Living Gallery — call `present_gallery`** with the roster as method cards, each carrying a
   LIVE mini SVG genuinely seeded from the brief + answers (delegate the 4 minis to `svg-artisan`
   — never generic icons). Mark exactly ONE `recommended:true` with a `reason` quoting the
   user's answers. The studio's LivingGallery surface ribbons the recommended card and collects
   the pick.

4. **Route the pick** — `present_gallery` returns the chosen `method` (routing key); start there:
   - **mindmap** → `present_board` with a `tree` (kind `"mindmap"`, no options); user co-edits
     live on the mind-elixir MindmapCanvas; edits return in `response.editedTree`.
   - **funnel** → proceed to the diverge funnel (steps 1–3 of run-brainstorm) as usual.
   - **wreck** → `present_board` at `phase:"wreck"` on the seeded option(s).
   - **cluster** → `present_board` at `phase:"cluster"` on the seeded options.

   Non-mindmap picks still flow through run-brainstorm's pre-phrase (step 1) and the funnel — the
   gallery only chose the STARTING mechanic.

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
