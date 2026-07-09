---
model: opus
---

# /run-brainstorm — drive a full visual brainstorm session (any capable model, incl. Opus 4.8)

The complete operator procedure. Follow it literally; the skills carry the craft details.

**Persona:** this procedure is executed as agent **`brainstorm-orchestrator`**
(`.claude/agents/brainstorm-orchestrator.md`) — its keep/delegate contract (generation →
`svg-artisan`, artifact chat → subagents, diagnosis → `devops-diagnostician`) and its
`## Orchestration learnings` section are binding parts of this procedure.

## This procedure IS the abstraction — advance the UI stage by stage, never à la carte

`run-brainstorm` is the single entry point. The studio's stages — **New Discussion brief →
concierge → Living Gallery → board(s)** — are a followed STATE MACHINE, and the MCP tools
(`open_studio`, `ask_concierge`, `present_gallery`, `present_board`) are the internal DISPATCH
STEPS that advance the UI from one stage to the next. They are NOT à-la-carte tools to reach
for individually: you never call `ask_concierge` or `present_board` "because it seemed useful"
— you call them ONLY as this procedure's next stage, in order. The procedure is what guarantees
the crowned methodology happens; a stage tool invoked out of sequence (a board before a gallery
pick, a gallery before the concierge) is a procedure violation, i.e. a bug. Run the procedure
top to bottom; each numbered step below dispatches the next UI stage.

## Procedure

0. **Intake — advance the UI: brief → concierge → gallery → route** (the mandatory front door,
   `wiki/Product/intake-methodologies.md`). This is the ONLY way the studio ever runs: this
   procedure driving the stage tools in order (no fixture/preview harness exists). Four
   dispatches, strictly in sequence — do not skip, do not reorder:
   - **a. Hand off the brief.** Call **`open_studio`** — it lands the user on the New
     Discussion panel (brief + voice, chips, colors, scribble, attachments, model, target
     folder) and blocks until they submit. **The panel's tappable questions and the concierge
     are complementary, not competing (survey-intake reconciliation):** the panel gathers a
     STRUCTURED brief (audience/vibe/constraints) in one pass; the concierge (0b) then does the
     ADAPTIVE deep-dive on top of it. The panel is step 0a of the ONE front door, never a second
     intake — after submit the studio holds a "preparing your questions" veil (never the bare
     panel again) until the concierge arrives. **If the human ALREADY described the purpose in
     THIS Claude Code session, pass it as `open_studio`'s `brief`** — it pre-fills the panel
     so they refine instead of retyping (the handoff; no rework). Omit `brief` ONLY when they
     truly said nothing about what to make. The submission arrives as a new-brainstorm command
     whose prompt/seed notes carry their brief; do NOT interrogate them in chat first.
     `{status:"waiting"}` timeout is not failure — call `open_studio` again.
   - **b. Concierge — clarify adaptively.** Call **`ask_concierge`** with ONE question + a few
     tappable `suggestions`, tailored to the brief. Ask AS MANY as it takes — not a fixed
     count; being comprehensive rewards the brainstorm (audience, constraints, what "good"
     looks like, scope, liveness). Each answer returns to you and is appended to the thread's
     `brainstorm.md` digest. Stop when you can confidently recommend a method.
   - **c. Living Gallery — offer the methodologies.** Call **`present_gallery`** with the
     roster as cards, each carrying a LIVE mini **genuinely seeded from the brief + answers**
     (delegate the 4 minis to `svg-artisan` — never a generic icon). Mark exactly ONE
     `recommended:true` with a `reason` that QUOTES the user's answers. The roster — mind map
     is a methodology BESIDE the others, never the centerpiece or the default:
       - **mindmap** — one co-edited structure; recommend when the shape is still forming or
         the user wants to arrange it directly (`tree` board → `response.editedTree`).
       - **funnel** — the classic diverge→converge option funnel (steps 3+ below); recommend
         for "show me options to choose among."
       - **wreck** — saboteur stress-test; recommend when an idea exists and needs pressure.
       - **cluster** — proximity field; recommend when there are many ideas to group into shape.
   - **d. Route the pick.** `present_gallery` returns the chosen `method` — start there:
       - **mindmap** → `present_board` with a `tree` (kind `"mindmap"`, no options) seeded from
         the brief+answers; the user co-edits, edits return in `response.editedTree`, continue
         from that tree.
       - **funnel** → proceed to step 1 (pre-phrase) then the diverge funnel as usual.
       - **wreck** → `present_board` at `phase:"wreck"` on the seeded option(s).
       - **cluster** → `present_board` at `phase:"cluster"` on the seeded options.
     A non-mindmap pick still flows through pre-phrase (step 1) and the funnel (steps 3+) — the
     gallery only chose the STARTING mechanic.
   - **The intake is MANDATORY — never skip it (operator: "the methodology is locked into the
     final artifact").** Every real run goes brief → `ask_concierge` (≥1 exchange) → `present_gallery`
     → route the pick, BEFORE the first `present_board`. There is no "jump straight to boards"
     shortcut: a session that presents a board without a preceding `present_gallery` pick has
     skipped the crowned methodology and is a BUG, not a shortcut. If the human says "just give
     me options," that IS the `funnel` methodology — still surface the gallery (recommend funnel)
     and let them pick it; do not bypass the front door. The studio's New Discussion panel is
     step 0a only (the brief hand-off); the concierge surface MUST follow the brief submit.
1. **Pre-phrase** with AskUserQuestion (never skip): domain (icons? system? palette? flow?),
   style references/colors, constraints, and how divergent to go. The consensus — not the raw
   request — seeds the first board. If this run was triggered by the studio's ✚ New
   Brainstorm button, the user's seed arrives in the tool result/digest — build the
   AskUserQuestion clarifications ON that seed, don't re-ask what it already says. The seed
   may be MORE than text ("open with anything"): a digest line can point at a saved sketch
   SVG or photo under `<discussionRoot>/.seeds/` — **Read that file first** (vision for
   photos) and riff on its shapes/subject; chips the user tapped arrive inside the prompt
   in parentheses.
2. **Load the craft**: read `.claude/skills/svg-authoring/SKILL.md` (how to draw options)
   and `.claude/skills/brainstorm-phases/SKILL.md` (when to use which phase and how to
   interpret each response field).
3. **Round 1** — `present_board` with `phase:"diverge"`, 4–8 meaningfully divergent options,
   ≥5 axes tailored to the domain (ranges, never absolutes), a prompt that says what to judge.
   **Every `present_board` gets a FRESH board id** — the bridge dedups responses
   first-response-wins per boardId, so a reused id (e.g. re-presenting round N-1 after
   ↩ back) silently swallows the user's new answer.
4. **Interpret every response field** before generating the next round — selections, notes,
   remix pairs, axis values, and the phase fields (triage/mutations/flaws/positions/clusters/
   gapNotes) per the phase skill. **Mind-map rounds:** honor `response.editedTree` (the final
   SHAPE, incl. per-node `note`) AND `response.treeOps` (the INTENT log). An `explode` op means
   the studio ALREADY fanned that node into 5 topic+note-anchored PROMPT children
   (`<topic> · <note> — <facet>`); on the next tree **REPLACE/refine each prompt into a genuinely
   relevant idea** (reshape the placeholder topics — don't just append more), steered by the op's
   `note` (a different note → a different set); `delete` drops that branch for good; `add` seeded
   blank ideas to help fill; `note` sets steering for a future explode.
   If `response.model` is set, DELEGATE generation of the next
   round's SVGs to that model via a subagent; you keep orchestrating.
   `response.attachments`: each entry's `savedPath` is a file the user attached mid-round —
   **Read it** (vision for images) and fold it in; an entry without `savedPath` failed to
   persist, tell the user. `response.paletteColors` (or a "Discussion theme" digest line):
   generate the round's SVGs using ONLY those named colors and refer to them BY NAME when
   narrating — the user speaks in those names. While generating, post REAL progress at
   meaningful moments (`node scripts/pipe-progress.mjs --note "drawing round N" --source
   orchestrator`): the studio's Session activity strip shows it live and it persists to
   the thread's `progress.jsonl` (hooks already post tool/turn events and token deltas
   automatically — add notes only where they help the waiting human).
5. **Document the decision, every round** — the server appends the mechanical record
   (options shown, raw response) to the thread's `brainstorm.md`; YOU append the
   interpretation right after it (append-only, never rewrite): a short
   `#### Round N — decision` block with the direction chosen and WHY, directions rejected
   and why, and any requirement/constraint that emerged from notes or axis readings.
   This is the raw material `/plan-closeout` step 7 turns into the target repo's build
   plan — a brainstorm that skips this step cannot produce one, and the brainstorm's most
   valuable output IS that loopable plan.
6. **Advance the funnel** deliberately (diverge → mutate/wreck/cluster as needed → converge).
   Do not stay in diverge forever; after ~2–3 divergent rounds, force a narrowing phase.
7. **Honor commands**: if `response.commands` or `orchestration` mentions plan-closeout or
   discover-skills, stop brainstorming and run that command file immediately. An
   `artifact-chat` command is a DETOUR, not a stop: run `.claude/commands/artifact-chat.md`
   (always a subagent), then resume the funnel where it was.
8. **Capture** — on `accept`, call `capture_artifact` for every kept option (provenance:
   boardId + optionIds). On `park`, summarize state and stop; the thread resumes later via
   `discussionId`. On **`finalize`** (`finalOptionId` set): capture the final artifact,
   call **`compose_poster`** with that optionId (the shareable decision poster — winner +
   lineage + notes, composed deterministically from the cached thread), then run
   `.claude/commands/plan-closeout.md` immediately — finality IS the closeout trigger,
   and closeout step 7 offers the human the brainstorm's real deliverable: a loopable
   build plan authored from `brainstorm.md` for the target repo (or this one).
9. **Timeouts are not failures** — `{status:"pending"}` means the human is thinking; use
   `peek_response` later.

## Changelog
- 2026-07-07 — step 0 rewritten as the concierge → Living Gallery intake (handoff brief to
  open_studio, adaptive ask_concierge, present_gallery with live method minis + one
  recommendation, route the pick — mindmap→tree board, others→their phase). Mind map is a
  peer methodology, never the default. Real-session flow (operator mandate) — concierge-living-gallery
- 2026-07-07 — persona header: procedure now owned/executed by agent brainstorm-orchestrator
  (delegation-to-preserve-context + orchestration-learnings surface) — operator mandate,
  discussion/brainstorm-orchestrator-2026-07-07/plan.md
- 2026-07-06 — step 4: interpret response.attachments (Read savedPath files; honest-fail
  entries have none) and response.paletteColors / discussion-theme digest lines (generate
  with ONLY the named colors, narrate by color name) (from ui-changes)
- 2026-07-06 — step 0: bare invocation lands on the studio's New Discussion panel via the
  new open_studio tool (ui-changes plan item 13); seed notes may now also carry attachments,
  a model choice, and a generation palette from the panel's composer
- 2026-07-06 — step 5: per-round decision blocks appended to brainstorm.md (interpretation,
  not just the server's mechanical record) so closeout can author the target-repo build
  plan; step 8 points finalize at closeout's build-plan hand-off (operator request)
- 2026-07-06 — step 3: fresh board id per present_board (bridge dedup swallows reused ids)
  (from phase-funnel-ux-2026-07-05)
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
- 2026-07-06 — journey-UX build: step 1 reads sketch/photo seeds from .seeds/ (open with
  anything); step 7 adds compose_poster to the finalize sequence
- 2026-07-07 — step 4: post real progress over the session pipe while generating; step 7:
  artifact-chat commands are a detour-and-resume, routed to /artifact-chat (from askaquestion)
- 2026-07-08 — step 4: interpret mind-map `response.treeOps` (explode → expand node into ≥5
  children relevant to its topic+note; delete/add/note) + per-node `editedTree.note` steering
  (from mindmap-explode-decision-tree-2026-07-07)
