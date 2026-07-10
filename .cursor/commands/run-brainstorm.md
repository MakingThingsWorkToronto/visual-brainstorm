# /run-brainstorm — drive a full visual brainstorm session

Use the chat request as the brief or resume hint.

Read and follow these files in order:
- `.claude/agentic-surface-registry.json`
- `.cursor/agentic-surface-registry.json`
- `.claude/commands/run-brainstorm.md`
- `.claude/agents/brainstorm-orchestrator.md`
- `.claude/skills/brainstorm-phases/SKILL.md`
- `.claude/skills/svg-authoring/VALIDITY-SCAN.md` (compact judge reference — full SKILL.md is svg-artisan's load)

Treat `.claude` as the source of truth. Launch the **brainstorm-orchestrator** subagent to drive the session. Use the `visual-brainstorm/*` MCP tools for real workflows — never fake results.

For a quick demo with no topic, call `open_studio` to land the user on the New Discussion panel and wait for their brief.
