# Agentic PR Loop (AUTHORITATIVE) — Phase 1: Templates + Enforcement

Agent-submitted PRs and issues follow a format contract that chains them to runnable prompts, cache-stable prefixes, and validated folder moves. Phase 1 (active) enforces templates and validates format. Phase 2 (pending) will add post-merge orchestration (currently manual).

## Phase 1: PR and issue format contract

**Single source of truth:** `scripts/check-agent-format.mjs` (dependency-free, shape-only — rule 11).

### PR format (`.github/pull_request_template.md`)

- **Title:** Conventional type(scope)?: summary (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`)
- **Body:** Exactly one ````prompt` fenced block
  - **Stable prefix** (above `---` marker): Cache-stable prompt text, byte-identical across all PRs (keeps the operator's Anthropic prompt cache hot); enforced by CI
  - **Payload** (below `---` marker): Per-PR variables only — `branch`, `slug` (kebab-case), `discussion` (must equal `discussion_pr/<slug>/`), `intent`, `changes` (list), `verify` (list), `risk`, `breaking`
- **Folder contract:** The diff MUST touch `discussion_pr/<slug>/` (plan moved from `discussion/<slug>-<date>/`, not copied). CI fails PRs missing the folder.

### Issue format (`.github/ISSUE_TEMPLATE/agent-task.yml`)

- **Title:** Conventional prefix (`task:`, `bug:`, `chore:`) followed by summary
- **Body:** Exactly one ````prompt` fenced block
  - **Stable prefix** (above `---` marker): Cache-stable task-runner text, byte-identical across all issues
  - **Payload** (below `---` marker): Per-issue variables only — `slug` (kebab-case), `intent`, `acceptance` (list, observable proofs), `pointers` (optional, list of references)
- **Enforcement:** CI labels invalid issues `agent:invalid-format`, posts a one-time marker comment with the fix, clears both on edit success; blank issues disabled (config.yml)

### Canonical prefixes — single source of truth

Both `.mjs` constants export the exact prefixes; the templates embed them byte-for-byte; `tests/agent-format.test.mjs` fails any drift. This prevents operators from needing to maintain two separate specs.

## Phase 2: Post-merge orchestration (pending local step)

When a PR merges, the plan folder (`discussion_pr/<slug>/`) will move to `discussion/_completed/<slug>-<date>/` via `/plan-closeout` in an agent-driven loop (not yet built). Until then, closeout is manual.

## discussion_pr/ folder structure

One folder per open PR, named by kebab-case slug. Holds `plan.md` (first), plus any supporting notes, baselines, or decision records. See `discussion_pr/README.md`.

## Enforcement

- **PR format:** `.github/workflows/agent-pr-format.yml` runs on open/edit/reopen/synchronize; fails if title is malformed, body is not a single prompt block, prefix drifts, or `discussion_pr/<slug>/` is not touched. Outputs one `::error` per violation.
- **Issue format:** `.github/workflows/agent-issue-format.yml` runs on open/edit; labels `agent:invalid-format` + posts idempotent comment on failure; clears both on success. Fails the workflow on invalid format.
- **Template drift guard:** `tests/agent-format.test.mjs` enforces that `.github/pull_request_template.md` and `.github/ISSUE_TEMPLATE/agent-task.yml` embed the canonical prefixes exactly (rule 2 accountability).

## Cross-reference

- **Harness entry point:** [harness-copilot.md](harness-copilot.md) — GitHub Copilot adapter (prompts route to agents)
- **Rules framing:** CLAUDE.md rules 3 (plans), 6 (no fake success), 9 (surgical), 10 (proof), 12 (docs with code)
- **Discussion folder homes:** `discussion/` = locally-active plans; `discussion_pr/` = in-review; `discussion/_completed/` = archived (rule 3)
