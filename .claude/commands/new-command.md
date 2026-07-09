---
model: sonnet
---

# /new-command — codify recurring work (AGENTS.md rule 5: asked twice = failure)

## Procedure

1. **Name it + set the model tier** — kebab-case verb phrase; file
   `.claude/commands/<name>.md`. Give it `model:` frontmatter picked per
   `wiki/System/model-tiering.md` (haiku = mechanical/routing · sonnet = reasoning/build ·
   opus = orchestrator/security/long-run/quality-critical · inherit = a sub-step that runs
   INSIDE a higher persona's turn and must not downgrade it). Unset = review defect.
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
5. **Register it** in TWO places, or the harness guard blocks you:
   - `discover-skills.md`'s repo task map (human/agent discovery), AND
   - the provider-neutral SSOT registry `.claude/agentic-surface-registry.json` — add a
     `surfaces` entry (`kind`/`name`/`path`/`model`/`purpose`/`workflow`). A durable command,
     skill, or agent that is on disk but absent here is a BLOCKING error from
     `scripts/check-agentic-surface.mjs` (the `Write|Edit` PostToolUse guard + `test:unit`).
     Generated per-plan dispatchers are the only exception — glob-list them under
     `exclusions.commands` instead (see the `dispatch-*-next-phase` pattern).
   - **Harness parity (rule 11):** if the command should be reachable from GitHub Copilot too,
     add a `.github/prompts/<name>.prompt.md` wrapper + entry in
     `.github/agentic-surface-registry.json`; if it is intentionally Claude-only, list it under the
     registry's `exclusions.copilot.commands` so the guard's parity warning stays quiet. Either
     way, update the harness pages (`wiki/System/harness-claude-code.md` /
     `harness-copilot.md`).
6. **Log it** — one line in `.agents/learnings.md` naming the new command and the recurring
   task that triggered it.

## Changelog
- 2026-07-09 — step 5: register new surfaces in the SSOT registry
  (`.claude/agentic-surface-registry.json`) — not just `discover-skills.md` — and reconcile the
  Copilot adapter / `exclusions.copilot`; enforced by the `scripts/check-agentic-surface.mjs`
  guard. Closes the drift where `add-theme`/`revisit-round` shipped unregistered (from
  harness-registry-guard-2026-07-09)
- 2026-07-07 — step 1 (Name it): now also sets the `model:` frontmatter tier per
  wiki/System/model-tiering.md — every authored command pins a tier (from agentic-model-efficiency)
- 2026-07-06 — steps 3–4: one Changelog footer per file (append, don't duplicate);
  cross-reference steps by name, never number (from ship-discipline-loopable-plans)
- 2026-07-05 — created (from phase-funnel-ux-2026-07-05)
