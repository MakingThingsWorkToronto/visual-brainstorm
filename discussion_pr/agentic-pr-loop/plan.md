# Agentic PR loop — GitHub templates + format enforcement (phase 1 of the loop)

**Status:** in review — submitted as PR (this folder travels in that PR's diff,
dogfooding the convention it introduces)
**Owner persona:** any capable session; tests → **test-engineer**; wiki → **wiki-librarian**
**Trigger:** operator — agent-only issue/PR management: efficient prompt-first formats
with a cache-stable prefix, plus a `discussion_pr/` home for each PR's discussion folder;
GitHub templates and workflows NOW, local orchestration loop in a SUBSEQUENT step.

## Scope (this PR)

| # | Deliverable | What |
|---|---|---|
| 1 | `scripts/check-agent-format.mjs` | Single source of truth for both canonical cache-stable prompt prefixes + dependency-free validators for PR and issue bodies (shape only — dumb harness, rule 11) |
| 2 | `.github/pull_request_template.md` | The PR body IS a runnable review prompt: byte-stable prefix above `---`, per-PR payload (branch/slug/discussion/intent/changes/verify/risk/breaking) below |
| 3 | `.github/ISSUE_TEMPLATE/agent-task.yml` + `config.yml` | Issue form with the runnable task prompt (same stable-prefix design; payload: slug/intent/acceptance/pointers); blank issues disabled |
| 4 | `.github/workflows/agent-pr-format.yml` | Fails any PR that isn't a single valid prompt block, whose prefix drifted, or whose diff omits `discussion_pr/<slug>/` |
| 5 | `.github/workflows/agent-issue-format.yml` | Validates issues on open/edit; labels `agent:invalid-format` + one idempotent marker comment; clears both on fix |
| 6 | `discussion_pr/README.md` | The convention: plan folder MOVES from `discussion/` to `discussion_pr/<slug>/` at PR time; archived to `discussion/_completed/` at post-merge closeout |
| 7 | `tests/agent-format.test.mjs` | Drift guard (templates embed the canonical prefixes byte-for-byte) + validator accept/reject matrix |
| 8 | `wiki/System/agentic-pr-loop.md` + `wiki/log.md` line | The contract captured authoritatively (rules 1, 2) |

## Design decisions

- **Cache-effective = byte-stable prefix.** Every submission is one ```` ```prompt ````
  block; all text above the `---` marker is identical across submissions and CI rejects
  any drift, so the operator's runner keeps a hot Anthropic prompt cache and only pays
  for the small variable payload.
- **No template/validator drift by construction:** the canonical prefixes live once in
  `scripts/check-agent-format.mjs`; the unit test fails the build if a template stops
  embedding them byte-for-byte.
- **All PRs are agent PRs** — the format workflow runs on every `pull_request`, per the
  operator's "agent-only" mandate.
- **Adapter reconciliation (rule 11):** GitHub issue/PR templates are GitHub-native
  surfaces with no Codex/VS Code counterpart; nothing to mirror. The parity checker
  reads only `prompts/`, `agents/`, and `copilot-setup-steps.yml` — untouched.

## Exit criteria

- `npm run build` + `npm test` green with the new test file in the suite.
- This PR's own body passes `validatePr` (dogfood) and its diff carries this folder.
- Wiki page exists and `wiki/log.md` has the rule-2 line.

## Follow-up (NOT this PR — explicit operator sequencing)

- **Phase 2 — local orchestration loop:** the runner that picks up `agent:task` issues,
  executes their prompt, and drives PRs (open → review via the PR prompt → merge →
  `/plan-closeout` archival of `discussion_pr/<slug>/` to `discussion/_completed/`).
  To be planned and built locally in a subsequent step per the operator.

## Progress log (append-only)

- 2026-07-10 — plan created with the implementation; all scope items authored in one
  cycle; submitted directly in `discussion_pr/` (the folder's first occupant is the PR
  that defines it).
