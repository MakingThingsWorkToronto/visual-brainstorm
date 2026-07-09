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
| `opus` | **orchestrator + security + long-run** (the reserved carve-out): the brainstorm orchestrator, the full-session brainstorm driver, any security-sensitive agent/command | quality/judgment over a long horizon is worth the tokens; security must not be under-modeled |
| `fable` | **quality-critical user-facing generation — the best-SVG carve-out**: board-SVG authoring (`svg-artisan`). Reads as "the best available model on SVG quality", which today is Fable; if availability changes, the carve-out moves WITH the best available model (config `defaultModel`), never silently down | the board SVGs are the product the human judges — they always render on the best available model (token-economy decision 1); savings come from orchestration/context/mutation, never a cheaper drawing model |
| `inherit` | reference/craft **skills**, and command sub-steps that run *inside* a higher persona's turn | knowledge that informs the caller must never hijack or downgrade the caller's model |

## Rules

1. **Every `.claude/*.md` sets `model:` explicitly.** No implicit inheritance by omission —
   an unset model is a review defect. Reference skills and in-persona sub-steps set it
   *explicitly* to `inherit`.
2. **Opus is the reserved carve-out, not a default.** Only orchestrator, security, and
   genuinely long-running work earn it. Quality-critical user-facing generation (the board
   SVGs the human actually judges) is its OWN carve-out: the **best available model,
   explicitly named** (today `fable` — decision record in
   `discussion/token-economy-2026-07-07/plan.md`). If you reach for a heavy tier, name
   which reason applies in the frontmatter's neighbouring prose or the plan.
3. **Reference skills use `inherit`.** A skill (`SKILL.md`) is loaded for its knowledge and
   runs in the caller's turn; a `model:` other than `inherit` would switch the whole turn's
   model as a side effect of loading craft. `svg-authoring` and `brainstorm-phases` are
   `inherit` for exactly this reason.
4. **Command sub-steps of the orchestrator use `inherit`** so they don't downgrade an opus
   brainstorm mid-flow (e.g. `revisit-round`). Standalone command entry points pin their own
   tier.
5. **Dynamic routing still wins — and routing is ALWAYS explicit.** `BoardResponse.model`
   (user's composer pick) overrides the `svg-artisan` frontmatter per round. When the user
   made no pick, the digest/seed still names the best-SVG default (`defaultModel` in
   `visual-brainstorm.config.json`) by id — a `model:undefined` fallthrough that routes by
   omission is a defect (token-economy decision 4). See [agents.md](agents.md)
   model-delegation flow.
6. **Prefer delegation over a heavier model.** A cheap router/orchestrator that delegates the
   heavy step to the right-tier subagent beats running the whole flow on the heavy model —
   this is why `artifact-chat` is `haiku` (it routes) while its revision work goes to
   `svg-artisan` (`sonnet`).

## Current assignments

Agents: `brainstorm-orchestrator` opus · `svg-artisan` fable (best-SVG carve-out) ·
`test-engineer` sonnet · `devops-diagnostician` sonnet · `wiki-librarian` haiku.
Commands: `run-brainstorm` opus · `plan-closeout` / `create-dispatch-command` / `new-command`
/ `discover-skills` / `diagnose-studio` / `compress-learnings` / `wiki-maintenance` / both `dispatch-*-next-phase` sonnet ·
`artifact-chat` / `build-check` / `add-theme` haiku · `revisit-round` inherit.
Skills: `brainstorm-phases` / `svg-authoring` inherit.

Donor precedent (`C:\Code\tp\.claude`): agents carry `model:`; light ops agents are haiku,
the security engineer is opus, everything else sonnet — the same shape, tightened here to
push mechanical work down to haiku and to stamp commands/skills too.
