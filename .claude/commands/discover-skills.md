---
model: sonnet
---

# /discover-skills — interactively find (or web-discover) the skills that improve THIS brainstorm

Run when the operator clicks ✨ Discover skills in the studio, or whenever unsure which
procedure applies. This command is INTERACTIVE and can grow the repo's skill library from the
web — the goal is that brainstorm quality compounds every turn.

## Procedure

1. **Inventory** — list every file in `.claude/commands/` (repeatable procedures) and every
   `SKILL.md` under `.claude/skills/` (craft knowledge). Read the first heading + purpose
   line of each. Never invent capabilities — report only what exists.
2. **Ask, interactively** (AskUserQuestion, always):
   - *Question 1 — scope*: "Discover skills from where?" → options: **Local repo skills**
     (match what exists to the task) / **Web discovery** (research new techniques and ingest
     them as skills) / **Both (Recommended)**.
   - *Question 2 — target*: "What should improve?" → options derived from context, e.g.
     SVG craft for the current board kind / phase strategy for where the funnel is stuck /
     the domain itself (icon design, system architecture, color theory) / process (closeout,
     verification).
3. **Local branch** — present a short table: task → command/skill → what it will do.
   Recommend ONE primary.
4. **Web branch** — WebSearch for the chosen target (e.g. "icon grid optical balance
   techniques", "SCAMPER prompts product design", "C4 diagram conventions", "color palette
   accessibility heuristics"). Read the top credible sources. Then **ingest**:
   - Distill the durable, non-obvious techniques into a NEW skill:
     `.claude/skills/<topic>/SKILL.md` (frontmatter name/description, actionable rules, a
     checklist, source URLs at the bottom, `## Changelog` footer).
   - If it changes how boards should be authored or phases driven, ALSO append the delta to
     `svg-authoring` or `brainstorm-phases` with a changelog line.
   - Log one line in `.agents/learnings.md` naming the ingested skill.
   Quality bar: reject listicle fluff; ingest only techniques you can express as a testable
   rule ("do X, check Y"). 3 strong rules beat 20 vague ones.
5. **Apply immediately** — the NEXT `present_board` call must visibly use the discovered
   skill (say so in the board prompt: "applying <skill>: …"). Discovery that doesn't change
   the next round was wasted.
6. **Report** — what was found, what was ingested (file paths), what will change next round.

## Repo task map (keep current — closeout improves this)

| Task | Procedure |
|---|---|
| Run a visual brainstorm end-to-end | `run-brainstorm.md` + skill `brainstorm-phases` |
| Author SVG options that don't suck | skill `svg-authoring` |
| Improve craft mid-brainstorm from the web | this command, web branch |
| Finish/close a plan or thread | `plan-closeout.md` |
| Verify the repo works | `build-check.md` |
| Studio/preview/bridge "seems broken" | `diagnose-studio.md` |
| Add or ingest a UI theme | `add-theme.md` |
| Codify recurring work | `new-command.md` |
| Turn an accepted idea/brainstorm into a loopable build plan | `create-dispatch-command.md` (emits `/dispatch-<slug>-next-phase`; run via `/loop`) |

## Changelog
- 2026-07-06 — task map: registered `create-dispatch-command.md` (from
  ship-discipline-loopable-plans)
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
- 2026-07-05 — made interactive; added web-discovery branch that ingests findings as new `.claude/skills/` so quality compounds every turn (operator directive)
