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
     THIS Claude Code session, hand it off via `open_studio`** — pass `brief` (pre-fills the
     composer), and on a real run-brainstorm ALSO pass: `summary` (a friendly one-liner shown in
     the panel's opening bubble in place of the generic "what do you want to explore?" prompt —
     so it reads as continuity); **`questions` — a BESPOKE intake survey YOU author, creative and
     anchored to THIS brief** (do NOT reuse the generic making/vibe/range preset — that preset is
     only for a blank UI-started New Discussion; invent the 3–6 high-signal questions this
     brainstorm actually needs, each with 3–6 tappable options and one `recommended` where you
     have a lean); and `picks` (your recommended answers, pre-selected, keyed by YOUR question
     ids, using exact option strings). Together they land the human ONE tap from Send & iterate
     instead of a blank form. Omit all of these ONLY when they truly said nothing about what to
     make. The submission arrives as a new-brainstorm command whose prompt/seed notes carry their
     brief; do NOT interrogate them in chat first. `{status:"waiting"}` timeout is not failure —
     call `open_studio` again.
   - **b. Concierge — clarify adaptively.** Call **`ask_concierge`** with ONE question + a few
     tappable `suggestions`, tailored to the brief. Ask AS MANY as it takes — not a fixed
     count; being comprehensive rewards the brainstorm (audience, constraints, what "good"
     looks like, scope, liveness). Each answer returns to you and is appended to the thread's
     `brainstorm.md` digest. Stop when you can confidently recommend a method. The return is
     STRUCTURED: `{answer, picked, typed}` — `picked` = suggestion chips the user TAPPED (they
     endorsed YOUR framing), `typed` = their OWN words (weight highest when the two diverge).
   - **c. Living Gallery — offer the methodologies.** Call **`present_gallery`** with the
     roster as cards, each carrying a LIVE mini **genuinely seeded from the brief + answers**
     (delegate the 4 minis to `svg-artisan` — never a generic icon). **Intake content economy:**
     the minis run on the best model but are MINIMAL IN CONTENT — one emblematic read per
     method, few elements (a mini is a glimpse, not a board option; fewer elements = fewer
     output tokens, and a spare mini reads BETTER at card size). Generate them ONCE: the tool
     caches the cards at the thread's `intake-gallery.json` (`cardsCachedAt`) — a re-present
     (timeout, resume) reuses the SAME cards; NEVER re-delegate the minis. One escape hatch:
     if the brief/answers MATERIALLY changed since the cards were drawn (e.g. new concierge
     answers after a timeout), regenerate and re-cache — stale minis that no longer reflect
     the intake are a quality bug, not a saving (the tool's `cacheNote` flags a divergent
     overwrite). Mark exactly ONE
     `recommended:true` with a `reason` that QUOTES the user's answers. The roster — mind map
     is a methodology BESIDE the others, never the centerpiece or the default:
       - **mindmap** — one co-edited structure; recommend when the shape is still forming or
         the user wants to arrange it directly (`tree` board → `response.editedTree`).
       - **funnel** — the classic diverge→converge option funnel (steps 3+ below); recommend
         for "show me options to choose among."
       - **wreck** — saboteur stress-test; recommend when an idea exists and needs pressure.
       - **cluster** — proximity field; recommend when there are many ideas to group into shape.
   - **d. Route the pick.** `present_gallery` returns the chosen `method` plus `{label,
     recommended, reason}` — `recommended:true` means the user took YOUR recommendation
     (calibrates future recs); note whether it was taken in `brainstorm.md`. Start there:
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
   in parentheses. **If the digest points at a `.seeds/seed-<stamp>/` FOLDER (an annotated-photo
   scribble — the user drew arrows/boxes/highlights/notes over a photo), FIRST run
   `.claude/commands/read-scribble.md`** — it VIEWs `composite.png` (real vision) + reads
   `scribble.json` and returns the user's INTENT (the arrow's target, the boxed region, the note
   text as a literal instruction). That intent ANCHORS round 1, your clarifications, and (at
   closeout) the build plan; the scribble is the seed the whole session grows from.
2. **Load the craft — the judge's share only**: read
   `.claude/skills/brainstorm-phases/SKILL.md` (when to use which phase and how to interpret
   each response field) and `.claude/skills/svg-authoring/VALIDITY-SCAN.md` (the compact
   scan + what-good-looks-like + terse-brief contract). The FULL `svg-authoring/SKILL.md`
   is the artisan's load, not yours — you brief and judge, you do not draw (token economy:
   never carry craft you delegate away). **Resuming a thread? Read the ROLLING DIGEST, not the
   whole `brainstorm.md`**: the per-round `#### Round N — decision` blocks plus the LAST round's
   full record carry the running direction; a full re-read pays unbounded context for history
   the decision blocks already compress (context economy).
3. **Round 1** — `present_board` with `phase:"diverge"`, 4–8 meaningfully divergent options,
   ≥5 axes tailored to the domain (ranges, never absolutes), a prompt that says what to judge.
   **Every `present_board` gets a FRESH board id** — the bridge dedups responses
   first-response-wins per boardId, so a reused id (e.g. re-presenting round N-1 after
   ↩ back) silently swallows the user's new answer.
4. **Interpret every response field** before generating the next round — selections, notes,
   remix pairs, axis values, and the phase fields (triage/mutations/flaws/positions/clusters/
   gapNotes) per the phase skill. **Mind-map rounds: FIRST run `.claude/commands/read-mindmap.md`**
   — it reads the model-legible `round-NN/tree.md` outline (+ `edited-tree.json` / `draft.json` /
   `tree-ops.jsonl`) and returns the user's INTENTION (structure, node notes as steering, killed
   branches, `— thin` gaps). That intention ANCHORS the next tree, your narration, and (at
   closeout) the build plan. Then honor `response.editedTree` (the final SHAPE, incl. per-node
   `note`) AND `response.treeOps` (the INTENT log). An `explode` op means the studio ALREADY
   fanned that node into 5 topic+note-anchored PROMPT children (`<topic> · <note> — <facet>`); on
   the next tree **REPLACE/refine each prompt into a genuinely relevant idea** (reshape the
   placeholder topics — don't just append more), steered by the op's `note` (a different note → a
   different set); `delete` drops that branch for good (NEVER reintroduce); `add` seeded blank
   ideas to help fill; `note` sets steering for a future explode; `— thin` branches are gaps to
   grow. The user may also **maximize the map → the fullscreen chat** and improve it in words —
   that arrives as an artifact-chat on the mindmap snapshot; answer it by reading the LIVE
   `tree.md`/`draft` (read-mindmap), and iterate the tree.
   **Delegation is EXPLICIT and TERSE (token economy).** Every round's SVGs are generated by
   `svg-artisan` on an EXPLICITLY named model: the digest's "Model routing" line (the user's
   pick or the session's best-SVG default) — never an unnamed fallthrough. Your delegation
   brief carries ONLY the round's delta: direction chosen, palette by name, axis deltas,
   and a one-liner per option. Never re-teach craft the artisan's `svg-authoring` skill
   already carries (keep the description ratio — brief tokens ÷ artisan output — low); you
   keep orchestrating. **Tweak vs redirect:** when the digest says "TWEAK … MUTATE, don't
   redraw" (dials/notes/flaws only, no new direction), brief the artisan to MUTATE this
   round's captured `round-NN/option-<id>.svg` files with only the deltas — never a
   from-scratch re-authoring; a redirect (new direction, selections, phase change)
   authors fresh as usual.
   **Two optional authoring channels per round (never gating):** from round 2 on, every
   option carries a `rationale` (1–2 sentences QUOTING the user feedback it responds to —
   the studio renders it under the option so the human SEES their feedback driving the
   round; the artisan writes it, your brief names the feedback to quote). And when a signal
   was ambiguous, pass `questions` (0–4, SurveyQuestion shape) to `present_board` — the
   "Claude asks" box beside the options; answers return in `response.questionAnswers` as
   `Answer — "<question>"` digest lines.
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
   **Real chats reach you two ways — handle BOTH:** (a) while you BLOCK in `present_board`, a
   chat parks the board and returns it to you as a response carrying `commands:['artifact-chat']`
   (the question in `elaboration`/`seedNote`); (b) when NO board is live, the chat QUEUES —
   so whenever `present_board` returns `{status:"pending"}` (timeout), and again before you
   present the next round, **check `session_status.pendingUiCommands` and run
   `.claude/commands/artifact-chat.md` for every queued `artifact-chat`** before continuing.
   A queued chat left undrained is a real question the human asked that never gets answered —
   never leave the studio's chat spinning. (Answers only happen while THIS session is engaged;
   that is by design — a chat sent with no session running waits for the next one.)
8. **Capture** — on `accept`, call `capture_artifact` for every kept option (provenance:
   boardId + optionIds). On `park`, summarize state and stop; the thread resumes later via
   `discussionId`. On **`finalize`** (`finalOptionId` set): capture the final artifact,
   call **`compose_poster`** with that optionId (the shareable decision poster — winner +
   lineage + notes, composed deterministically from the cached thread), then run
   `.claude/commands/plan-closeout.md` immediately — finality IS the closeout trigger,
   and closeout step 7 offers the human the brainstorm's real deliverable: a loopable
   build plan authored from `brainstorm.md` for the target repo (or this one).
9. **Timeouts are not failures** — `{status:"pending"}` means the human is thinking; use
   `peek_response` later. It is CRASH-SAFE: after memory it falls back to the persisted
   `round-NN/response.json` on disk, so an answer that landed just before an MCP restart is
   still recoverable — resume the thread first (`present_board` with `discussionId` /
   `session_status`) so the store is attached, then peek.

## Changelog
- 2026-07-09 — step 0c: stale-cache escape hatch (materially changed brief/answers →
  regenerate + re-cache; `cacheNote` flags divergence) + step 2: the rolling-digest resume
  rule now lives in the command BODY, not only the orchestrator persona (fresh-eyes review
  of token-economy-2026-07-07)
- 2026-07-09 — handoff fidelity: step 4 authors per-option `rationale` from round 2 on
  (quoting the feedback it responds to) + optional mid-round `questions` (the "Claude asks"
  box); step 0b notes ask_concierge's structured {answer, picked, typed} return (typed =
  their own words, weight highest); step 0d notes present_gallery returns {method, label,
  recommended, reason} — record whether the recommendation was taken in brainstorm.md;
  step 9 notes peek_response is crash-safe (disk fallback to round-NN/response.json —
  resume the thread so the store attaches) (from handoff-fidelity-2026-07-09)
- 2026-07-09 — step 0c: intake content economy — gallery minis are minimal in CONTENT (one
  emblematic read, few elements) on the best model, generated ONCE and cached at the thread's
  `intake-gallery.json`; re-presents reuse the same cards, never re-delegate (from
  token-economy phase 5)
- 2026-07-09 — step 4: mind-map rounds run /read-mindmap FIRST — the persisted `round-NN/tree.md`
  outline (+ edited-tree/draft/ops) becomes the user's INTENTION and anchors the next tree, the
  narration, and the closeout build plan; a maximize→fullscreen chat on the map is answered from
  the LIVE tree.md/draft (from mindmap-model-legible-2026-07-09)
- 2026-07-09 — step 2: orchestrator loads the compact svg-authoring/VALIDITY-SCAN.md (judge
  share) instead of the full craft SKILL.md — never carry craft you delegate away; resume
  reads the rolling digest (decision blocks + last record), not the whole brainstorm.md
  (from token-economy phase 4)
- 2026-07-09 — step 4: tweak vs redirect — a digest-flagged TWEAK (dials/notes/flaws, no new
  direction) MUTATES this round's captured option SVGs (only the deltas paid for; liked
  geometry survives verbatim), never re-authors from scratch (from token-economy phase 3)
- 2026-07-09 — step 4: delegation is EXPLICIT (the digest's "Model routing" line — user pick
  else best-SVG default; never an unnamed fallthrough) and TERSE (round delta only; never
  re-teach the artisan's craft; keep the description ratio low) (from token-economy phase 2)
- 2026-07-09 — step 7: real chats reach the orchestrator TWO ways — the parked-board response
  AND `session_status.pendingUiCommands` when no board is live; drain queued artifact-chats on
  every present_board timeout and before each new round so no real question is left unanswered
  (from artifact-chat-everywhere)
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
- 2026-07-09 — step 0a: on a real run-brainstorm, hand off via `open_studio` not just `brief`
  but a `summary` (panel bubble), a BESPOKE `questions` survey YOU author anchored to the brief
  (replaces the generic preset — never reuse it), and pre-selected `picks` — human lands one tap
  from Send & iterate (from seed-brief-handoff-2026-07-09)
- 2026-07-09 — step 1: an annotated-photo scribble seed (`.seeds/seed-<stamp>/` folder) is read
  FIRST via `/read-scribble` — VIEW composite.png + read scribble.json — and its intent anchors
  round 1, clarifications, and the build plan (from scribble-legibility-2026-07-09)
