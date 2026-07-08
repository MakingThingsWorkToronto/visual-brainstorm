---
description: "Use when Visual Brainstorm features change, tests fail, or verification is requested. Follows the authoritative .claude testing and build-check workflows."
tools: [read, search, edit, execute, todo]
user-invocable: false
---
Read [agentic-surface-map.json](../agentic-surface-map.json), [test-engineer](../../.claude/agents/test-engineer.md), [build-check](../../.claude/commands/build-check.md), and [testing-observability](../../wiki/System/testing-observability.md).

Use those files as authoritative. Prefer the smallest verification slice that can falsify the current change, then widen only as needed.