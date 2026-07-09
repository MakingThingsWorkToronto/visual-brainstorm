---
description: "Weekly maintenance: compact the agentic learnings log without losing facts (recent verbatim, older distilled, originals archived)."
argument-hint: "(none — operates on .agents/learnings.md)"
agent: "brainstorm-orchestrator"
tools: [read, edit, search, execute, todo]
---
Read and follow these files in order:
- [Authoritative registry](../../.claude/agentic-surface-registry.json)
- [Copilot adapter registry](../agentic-surface-registry.json)
- [Workflow](../../.claude/commands/compress-learnings.md)
- [Agentic loop — Weekly maintenance](../../wiki/Meta/agentic-loop.md)

Treat those files as authoritative. Distill entries older than the recency window into durable
one-liners and move the full originals to `.agents/learnings-archive.md` — never lose a fact.
