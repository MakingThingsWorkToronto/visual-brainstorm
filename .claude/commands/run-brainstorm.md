# /run-brainstorm — drive a full visual brainstorm session (any capable model, incl. Opus 4.8)

The complete operator procedure. Follow it literally; the skills carry the craft details.

## Procedure

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
   gapNotes) per the phase skill. If `response.model` is set, DELEGATE generation of the next
   round's SVGs to that model via a subagent; you keep orchestrating.
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
   discover-skills, stop brainstorming and run that command file immediately.
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
- 2026-07-06 — step 5: per-round decision blocks appended to brainstorm.md (interpretation,
  not just the server's mechanical record) so closeout can author the target-repo build
  plan; step 8 points finalize at closeout's build-plan hand-off (operator request)
- 2026-07-06 — step 3: fresh board id per present_board (bridge dedup swallows reused ids)
  (from phase-funnel-ux-2026-07-05)
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
- 2026-07-06 — journey-UX build: step 1 reads sketch/photo seeds from .seeds/ (open with
  anything); step 7 adds compose_poster to the finalize sequence
