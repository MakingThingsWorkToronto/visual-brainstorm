# Visual Brainstorm — Agent Behaviour Mandates

Enforceable process instructions for every task in every session. Root rules: `CLAUDE.md`.

## 1. Think Before Coding
State the problem, identify ambiguities, propose the simplest viable approach. If confused —
read the wiki, then ask; do not guess silently.

## 2. Simplicity First
No features beyond what was asked. No abstractions for single-use code. Three similar lines
beat a premature abstraction.

## 3. Surgical Changes
Do not improve adjacent code. Match existing style. Every changed line traces to the request.

## 4. Prove It Runs
`npm run build` + `npm run smoke` before claiming completion. A UI change is verified by
loading the studio, not by the build passing.

## 5. Codify Recurring Work
Being asked to do the same kind of task twice is a failure. After the first manual run,
codify it into `.claude/commands/` via `/new-command`. Commands are living documents —
`/plan-closeout` improves them with every session's learnings.

## 6. Honest Reporting
Report BLOCKED with evidence rather than fake a success (CLAUDE.md rule 6). Skipped steps are
reported as skipped.

## 7. GitHub Copilot Parity
For local GitHub Copilot Chat, `.vscode/mcp.json` is the workspace MCP entry point and
`.github/hooks/visual-brainstorm.json` is the native hook layer. `.github/mcp.json` is the
versioned GitHub-compatible payload; GitHub-hosted Copilot starts it only through an
agent-scoped `mcp-servers` declaration or repository MCP settings, after
`.github/workflows/copilot-setup-steps.yml` builds the server outputs.

`.github/copilot-instructions.md` dynamically imports the applicable rules from `CLAUDE.md` and
this file instead of copying a competing policy. The Copilot parity guard runs after changes to
these source files or Copilot-owned configuration and rejects a broken adapter. A GitHub-hosted
runner can start the stdio servers but cannot expose its `127.0.0.1` studio to the human; report
that limitation and route interactive brainstorms through local VS Code Copilot Chat.

## 8. Codex Parity
Codex reads this file plus the trusted-project config under `.codex/`: `.codex/config.toml`
registers the same two stdio MCP servers as `.mcp.json`, and `.codex/hooks.json` mirrors the
Claude hooks with Codex-safe commands (no `CLAUDE_*` environment variables).
`.codex/agents/*.toml` are thin pointer wrappers over the five authoritative `.claude/agents`
personas — they carry no workflow logic and point back to `.claude/commands` for procedures;
`.agents/skills/` mirrors `.claude/skills/` byte-for-byte so Codex discovers the same craft.
`.claude/` stays the workflow source of truth: Codex gets no separate command copies. The Codex
parity guard (`npm run check:codex-parity`, hooked after file edits on both harnesses) and
`tests/codex-adapter.test.mjs` reject a drifted adapter. Docs: `wiki/System/harness-codex.md`.
