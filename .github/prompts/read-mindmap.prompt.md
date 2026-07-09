---
description: "Read a persisted Visual Brainstorm mind map off disk and synthesize the user's intent before the next tree, artifact-chat answer, or plan closeout."
argument-hint: "Discussion or round containing the mind map"
agent: "brainstorm-orchestrator"
tools: [read, search, execute, todo, visual-brainstorm/*]
---
Read and follow these files in order:
- [Authoritative registry](../../.claude/agentic-surface-registry.json)
- [Copilot adapter registry](../agentic-surface-registry.json)
- [Workflow](../../.claude/commands/read-mindmap.md)
- [Mind-map craft](../../.claude/skills/brainstorm-phases/SKILL.md)

Treat `.claude` and the persisted discussion files as authoritative. Read what is on disk, synthesize the user's intent tightly, and report any missing persisted artifacts honestly.