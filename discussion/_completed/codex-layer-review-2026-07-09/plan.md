# Codex Layer Review — 2026-07-09

**Status:** closed 2026-07-09

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
- 2026-07-09 — Audit: the earlier `.Codex`-path and env-var bugs were already fixed and
  committed (config.toml, hooks.json, 4-test adapter suite, harness-codex.md all present;
  `.agents/skills` mirror byte-exact). Remaining drift found: (a) three of five
  `.codex/agents/*.toml` files inlined verbatim copies of `.claude/agents` bodies instead
  of pointing back (the wiki's stated contract), (b) AGENTS.md — Codex's actual entry
  point — documented Copilot parity but not Codex, (c) the harness-codex.md hooks table
  omitted two commands hooks.json actually runs, (d) no hook-time drift guard existed
  (Copilot has one; Codex drift was only caught at `npm test`).
- 2026-07-09 — Landed: all five agent TOMLs rewritten as thin pointer wrappers (match the
  `.github/agents` pattern; reference `.claude/agents/<name>.md` + their command/skill
  files); new deterministic guard `scripts/check-codex-parity.mjs`
  (`npm run check:codex-parity`) wired as a PostToolUse hook in BOTH `.claude/settings.json`
  and `.codex/hooks.json` (hook mode fires only on Codex-relevant paths); AGENTS.md §8
  "Codex Parity" added; `tests/codex-adapter.test.mjs` extended to 5 tests (pointer-back
  assertion + guard-clean assertion); wiki reconciled via wiki-librarian (+ log line +
  wiki_reload). Reused `hookPaths`/`workspaceRelativePath` from check-copilot-parity.mjs
  (one-word export change).
- 2026-07-09 — Verified: `check-codex-parity` OK, `check-copilot-parity` still OK,
  codex-adapter 5/5, `npm run build` clean, `npm run test:unit` 255/255,
  `npm run smoke` → SMOKE PASS. The live hook proved itself mid-build by flagging the
  wiki page before it was updated. Not run (honest skip): ui-smoke/human-sim layers —
  no UI surface changed in this plan; other sessions' WIP shares this tree.
