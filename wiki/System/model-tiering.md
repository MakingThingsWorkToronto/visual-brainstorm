# Model tiering & token efficiency (authoritative)

The agentic layer is token-efficient by construction: every `.md` in `.claude/`
(agents, commands, skills) carries an explicit `model:` frontmatter field so work runs
on the **cheapest model that can do the job well**, and never on a heavier model by
accident. This page is the guardrail — pick a tier deliberately when adding or editing any
agent, command, or skill.

## The four tiers

Use tier **aliases**, not pinned IDs — an alias auto-tracks the best current model in its
tier, so efficiency improves for free as models ship. Values accepted: `haiku`, `sonnet`,
`opus`, `fable`, `inherit`, or a full model ID.

| Tier | Use for | Why |
|---|---|---|
| `haiku` | mechanical / deterministic / routing work: run build+test and report, recipe-driven config edits, transcribe facts, route a message to a subagent | no deep reasoning needed → don't pay for it |
| `sonnet` | reasoning, generation, and build work: writing correct tests, authoring SVG options, root-causing from evidence, multi-step procedures, build-phase ticks | the capable workhorse; the default when in doubt for real work |
| `opus` | **orchestrator + security + long-run + quality-critical user-facing generation** (the reserved carve-out): the brainstorm orchestrator, the full-session brainstorm driver, any security-sensitive agent/command, and board-SVG authoring (`svg-artisan`) | quality/judgment over a long horizon is worth the tokens; security must not be under-modeled; the board SVGs are the product the human sees, so they run on the best model |
| `inherit` | reference/craft **skills**, and command sub-steps that run *inside* a higher persona's turn | knowledge that informs the caller must never hijack or downgrade the caller's model |

## Rules

1. **Every `.claude/*.md` sets `model:` explicitly.** No implicit inheritance by omission —
   an unset model is a review defect. Reference skills and in-persona sub-steps set it
   *explicitly* to `inherit`.
2. **Opus is the reserved carve-out, not a default.** Only orchestrator, security,
   genuinely long-running work, and quality-critical user-facing generation (the board SVGs
   the human actually judges) earn it. If you reach for opus, name which reason applies in
   the frontmatter's neighbouring prose or the plan.
3. **Reference skills use `inherit`.** A skill (`SKILL.md`) is loaded for its knowledge and
   runs in the caller's turn; a `model:` other than `inherit` would switch the whole turn's
   model as a side effect of loading craft. `svg-authoring` and `brainstorm-phases` are
   `inherit` for exactly this reason.
4. **Command sub-steps of the orchestrator use `inherit`** so they don't downgrade an opus
   brainstorm mid-flow (e.g. `revisit-round`). Standalone command entry points pin their own
   tier.
5. **Dynamic routing still wins.** `BoardResponse.model` (user's composer pick) overrides the
   `svg-artisan` frontmatter per round — the frontmatter is only the default when no route is
   given. See [agents.md](agents.md) model-delegation flow.
6. **Prefer delegation over a heavier model.** A cheap router/orchestrator that delegates the
   heavy step to the right-tier subagent beats running the whole flow on the heavy model —
   this is why `artifact-chat` is `haiku` (it routes) while its revision work goes to
   `svg-artisan` (`sonnet`).

## Current assignments

Agents: `brainstorm-orchestrator` opus · `svg-artisan` opus (best board-SVG quality) ·
`test-engineer` sonnet · `devops-diagnostician` sonnet · `wiki-librarian` haiku.
Commands: `run-brainstorm` opus · `plan-closeout` / `create-dispatch-command` / `new-command`
/ `discover-skills` / `diagnose-studio` / both `dispatch-*-next-phase` sonnet ·
`artifact-chat` / `build-check` / `add-theme` haiku · `revisit-round` inherit.
Skills: `brainstorm-phases` / `svg-authoring` inherit.

Donor precedent (`C:\Code\tp\.claude`): agents carry `model:`; light ops agents are haiku,
the security engineer is opus, everything else sonnet — the same shape, tightened here to
push mechanical work down to haiku and to stamp commands/skills too.
