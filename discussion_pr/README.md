# discussion_pr/ — PR-submitted discussion folders

One folder per open pull request, named by the PR's `slug` (kebab-case, matching the
`slug:` in the PR prompt payload): `discussion_pr/<slug>/`. It holds the plan and
supporting artifacts that motivated the PR — `plan.md` first, plus any brainstorm
notes, baselines, or decision records the reviewer needs.

## The contract

- **A PR ships its discussion folder in its own diff.** When work is proven and
  PR-ready, the agent MOVES the plan folder from `discussion/<slug>-<date>/` to
  `discussion_pr/<slug>/` (a move, not a copy — one home, no drift) and opens the PR
  in the agent PR format (`.github/pull_request_template.md`).
- **CI enforces it.** `.github/workflows/agent-pr-format.yml` fails any PR whose diff
  does not touch `discussion_pr/<slug>/`, whose body isn't a single `prompt` block, or
  whose prompt prefix drifts from the canonical cache-stable prefix
  (`scripts/check-agent-format.mjs` is the format's single source of truth).
- **The PR body is a runnable prompt.** Everything above the `---` marker is
  byte-identical across all PRs so the operator's review loop keeps a hot prompt
  cache; only the payload below the marker is unique per PR.
- **After merge** the orchestration loop (local; being built in a subsequent step)
  closes the folder out via `/plan-closeout` and archives it to
  `discussion/_completed/<slug>-<date>/`. Until that loop exists, closeout is manual.

`discussion/` remains the home of plans still being worked locally (AGENTS.md rule 3);
`discussion_pr/` is the in-review stage of the same folder. This README is the only
file that lives here permanently.
