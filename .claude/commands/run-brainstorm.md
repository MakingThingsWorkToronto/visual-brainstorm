# /run-brainstorm — drive a full visual brainstorm session (any capable model, incl. Opus 4.8)

The complete operator procedure. Follow it literally; the skills carry the craft details.

## Procedure

1. **Pre-phrase** with AskUserQuestion (never skip): domain (icons? system? palette? flow?),
   style references/colors, constraints, and how divergent to go. The consensus — not the raw
   request — seeds the first board.
2. **Load the craft**: read `.claude/skills/svg-authoring/SKILL.md` (how to draw options)
   and `.claude/skills/brainstorm-phases/SKILL.md` (when to use which phase and how to
   interpret each response field).
3. **Round 1** — `present_board` with `phase:"diverge"`, 4–8 meaningfully divergent options,
   ≥5 axes tailored to the domain (ranges, never absolutes), a prompt that says what to judge.
4. **Interpret every response field** before generating the next round — selections, notes,
   remix pairs, axis values, and the phase fields (triage/mutations/flaws/positions/clusters/
   gapNotes) per the phase skill. If `response.model` is set, DELEGATE generation of the next
   round's SVGs to that model via a subagent; you keep orchestrating.
5. **Advance the funnel** deliberately (diverge → mutate/wreck/cluster as needed → converge).
   Do not stay in diverge forever; after ~2–3 divergent rounds, force a narrowing phase.
6. **Honor commands**: if `response.commands` or `orchestration` mentions plan-closeout or
   discover-skills, stop brainstorming and run that command file immediately.
7. **Capture** — on `accept`, call `capture_artifact` for every kept option (provenance:
   boardId + optionIds). On `park`, summarize state and stop; the thread resumes later via
   `discussionId`.
8. **Timeouts are not failures** — `{status:"pending"}` means the human is thinking; use
   `peek_response` later.

## Changelog
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
