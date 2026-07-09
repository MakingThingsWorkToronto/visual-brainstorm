# Codex Layer Review — 2026-07-09

## Scope

Review the wiki, code, and agentic harness layers, then land the smallest Codex adapter layer
that keeps `.claude/` as the workflow source of truth.

## Ambiguities

- Codex has different native surfaces than Claude Code and GitHub Copilot: project config and
  hooks live under `.codex/`, custom agents live under `.codex/agents/`, and reusable skills
  live under `.agents/skills/`.
- This repo has many pre-existing modified files. This plan only owns Codex adapter docs/tests
  and the `.codex` / `.agents/skills` fixes made for this review.

## Approach

1. Audit `.claude`, `.github`, `.codex`, `.agents/skills`, and the wiki harness pages.
2. Fix broken Codex adapter references without duplicating workflow logic.
3. Add wiki coverage for the Codex harness.
4. Add a deterministic test for Codex adapter drift.
5. Run `npm run build` and `npm run smoke`; report any skipped or failing checks honestly.

## Progress

- 2026-07-09 — Started. Found the draft Codex layer exists but points to nonexistent
  `.Codex/...` paths and uses Claude-specific hook environment variables.
