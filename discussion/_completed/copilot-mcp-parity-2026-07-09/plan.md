# GitHub Copilot MCP startup and agentic parity

**Date:** 2026-07-09
**Scope:** Make the two repository MCP servers discoverable and startable by GitHub Copilot in VS Code; provide a GitHub-hosted Copilot configuration payload and cloud-agent setup; mirror the applicable agentic contract and hook outcomes without creating a second behavioral source of truth.
**Authority:** `CLAUDE.md` rules 1, 3, 6, 10, 11, and 12; `AGENTS.md` rules 1, 4, and 6; `wiki/Meta/conventions.md`; `wiki/System/harness-copilot.md`; official VS Code and GitHub Copilot MCP/hook configuration contracts.
**Status:** closed 2026-07-09

## Problem

The root `.mcp.json` uses the Claude-compatible `mcpServers` schema. VS Code GitHub Copilot
discovers workspace servers from `.vscode/mcp.json` using the `servers` schema, so it has no
durable workspace launch definition. GitHub Copilot cloud agent requires a built runtime and
either repository MCP settings or custom-agent `mcp-servers`; a local loopback studio cannot be
shown to a human from its ephemeral runner.

## Outcomes

1. Add `.vscode/mcp.json` for the local VS Code GitHub Copilot Chat path.
2. Add `.github/mcp.json` as the versioned GitHub-compatible `mcpServers` payload and configure
   the GitHub Copilot agents to use the same servers when their host supports agent MCP settings.
3. Add a cloud-agent setup workflow that installs dependencies and builds both server outputs.
4. Add native `.github/hooks/` equivalents for Claude's progress and agentic-surface outcomes,
   including a mirror guard that runs only when `CLAUDE.md` or `AGENTS.md` changes are relevant.
5. Make `.github/copilot-instructions.md` dynamically import the applicable authoritative
   `CLAUDE.md` and `AGENTS.md` mandates, with explicit host-specific exceptions.
6. Add deterministic tests, real stdio initialize probes, documentation, and a wiki log entry.

## Boundaries

- Do not claim that `.github/mcp.json` is auto-discovered by GitHub.com when the documented
  repository mechanism is repository settings or custom-agent frontmatter.
- Do not claim the full interactive studio works in a GitHub-hosted runner: it binds to that
  runner's `127.0.0.1`, not the human's browser.
- Preserve `.claude/` as behavioral SSOT; GitHub files are host adapters and checks only.

## Progress log

- 2026-07-09 — plan created after verifying the root Claude manifest, current Copilot adapter,
  Codex MCP/hook donor, official VS Code MCP/hook schema, and GitHub cloud-agent setup contract.
- 2026-07-09 — added both host-native manifests, GitHub setup workflow, dynamic instruction
  mirror, native hook dispatcher, parity guard, and real stdio contract tests. Hardened the
  hosted runner boundary at the MCP tool layer (`VIBR_COPILOT_HOSTED=1` rejects interactive
  studio calls) and added CI validation for parity-only changes. Focused validation is green;
  full build/test remains the final gate.
- 2026-07-09 — SCOPE NOTE (rule-3 audit trail): the implementing Copilot session extended this
  plan's harness-parity work to a full Cursor adapter (`.cursor/` manifests/rules/commands/
  hooks, `tests/cursor-adapter.test.mjs`, `scripts/cursor-demo.mjs`, `wiki/System/
  harness-cursor.md`, registry `exclusions.cursor`) and committed it as 6d108e5 ("all changes
  for cursor before limit") moments before hitting its usage limit. No separate plan folder
  was created; that work is recorded, reviewed, and closed under THIS plan.
- 2026-07-09 — resumed by a fresh session after the Copilot crash. Rule-2/11/12 audit repaired:
  missing wiki/log.md lines for harness-cursor.md + user-guide Cursor sections; CLAUDE.md
  reconciled (rule 11 names `.cursor/`, quick-map row, workspace appendix); testing-
  observability documents the cursor adapter test; duplicate cursor test invocation dropped
  from `npm test`.
- 2026-07-09 — crash-resume code review (plan-closeout step 2, high effort: 8 finder angles →
  grouped verify incl. Cursor-docs web check) over 8ec07ed + 6d108e5. CONFIRMED + FIXED:
  (1) `workspaceRelativePath` used `path.win32.isAbsolute`, which is true for rooted POSIX
  paths — the hosted-Copilot hook guard silently skipped every absolute path on Linux/macOS;
  now a drive-letter/UNC regex. (2) mirror-guard test hardcoded `C:\Code\svgbrainstorm` —
  would fail this repo's own ubuntu CI; now ROOT-derived. (3) `.cursor/mcp.json` used an
  unsupported `cwd` key — now `${workspaceFolder}`-interpolated absolute args + `VIBR_HOME`
  env pin. (4) `.cursor/hooks.json` matcher `"MCP: visual-brainstorm"` never matches (Cursor
  syntax is `MCP:<tool_name>`) and `StrReplace` is not a Cursor tool type — now per-tool
  matchers + `afterFileEdit`. (5) registry `exclusions.cursor` was read by nothing (test
  filtered by `exclusions.copilot`) — test now consumes it via the exported authoritative
  `globMatch` (also fixes its unescaped-regex weakness). (6) `cursor-demo` read `.hits` from a
  `{results, count}` response — `✓ 0 hits` false-green; now honest count + nonzero-exit on
  empty. Cleanups: three hand-rolled MCP stdio clients hoisted to `tests/lib/mcp-stdio.mjs`
  (fail-fast on child exit, stderr in errors, 30s ceiling — 15s flaked under multi-session
  load); dead duplicate substring dropped from checkWorkflow; inline-array-only tools regex
  documented. REFUTED by verify: "Cursor hooks vocabulary is wrong wholesale" (postToolUse/
  subagentStop/stop + matcher are real Cursor events) and the copilot-hook conservative-branch
  no-op claim. Handed to in-progress-feedback (their phases 2-4, actively being built): the
  producerless verdict/pending contract comments and the bridge inbound zod redeclaration
  (their session already harvested that learning).
- 2026-07-09 — FINAL GATE: full `npm test` chain ran this session — one failure attributed to
  a peer session's mid-edit codex guard (harness-codex.md mid-write; green on re-run), all
  other layers passed (unit, ts, smoke, ui-smoke, 5 human sims). Post-fix re-proof: build
  green, 287/287 unit, ts 13, smoke PASS, ui-smoke PASS, cursor-demo end-to-end against both
  real servers (search now returns real results). Human sims not re-run post-fix: peer
  sessions are actively rewriting them (real-routes-human-sim plan) and this plan's fixes
  touch no product path the sims drive. Closed via /plan-closeout: 3 learnings harvested,
  plan-closeout step 4 improved, wiki reconciled (harness-cursor corrected to Cursor-doc
  truth + reloaded), archived to _completed/.