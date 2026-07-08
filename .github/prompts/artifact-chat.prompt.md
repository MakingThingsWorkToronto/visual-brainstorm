---
description: "Handle Visual Brainstorm artifact chat the repo-native way. Use for artifact questions, revision requests, or option-chat follow-up from the studio."
argument-hint: "Artifact slug, option slug, or the user's artifact request"
agent: "visual-brainstorm-operator"
tools: [read, search, execute, agent, visual-brainstorm/*]
---
Read and follow these files in order:
- [Agentic surface map](../agentic-surface-map.json)
- [Workflow](../../.claude/commands/artifact-chat.md)
- [Persona](../../.claude/agents/brainstorm-orchestrator.md)
- [SVG delegate](../../.claude/agents/svg-artisan.md)
- [SVG craft](../../.claude/skills/svg-authoring/SKILL.md)

Treat `.claude` as authoritative. Always delegate the thinking/revision step, then answer through the existing artifact-chat flow when the request came from the studio.