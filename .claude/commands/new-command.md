---
model: sonnet
---

# /new-command — codify recurring work (AGENTS.md rule 5: asked twice = failure)

## Procedure

1. **Name it** — kebab-case verb phrase; file `.claude/commands/<name>.md`.
2. **Write the procedure** as numbered, literal steps a fresh session can follow with zero
   context: exact paths, exact commands, decision points as explicit questions. If craft
   knowledge is needed (not steps), put it in `.claude/skills/<name>/SKILL.md` instead and
   reference it.
3. **End with a `## Changelog` footer** seeded with `- <date> — created (from <plan-slug>)`.
   Plan-closeout appends improvements here — commands are living documents. A file gets
   exactly ONE Changelog footer, at the end — when editing an existing command, append to
   the footer that's there (check before adding a heading).
4. **Cross-reference other commands' steps by NAME, never by number** ("plan-closeout's
   Commit-and-push step", not "step 9") — living documents renumber, and a stale number
   is silent drift (rule 1).
5. **Register it** in `discover-skills.md`'s repo task map.
6. **Log it** — one line in `.agents/learnings.md` naming the new command and the recurring
   task that triggered it.

## Changelog
- 2026-07-06 — steps 3–4: one Changelog footer per file (append, don't duplicate);
  cross-reference steps by name, never number (from ship-discipline-loopable-plans)
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
