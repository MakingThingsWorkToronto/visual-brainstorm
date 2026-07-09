# Visual Brainstorm Wiki

Authoritative facts and guardrails for this repo. When code and wiki disagree, reconcile —
the wiki wins until explicitly amended (and every amendment is logged in `log.md`).

## Index

- **[user-guide.md](user-guide.md)** — how humans use the tool, step by step, with diagrams (start here if you're new)
- **Requirements/**
  - [system-architecture.md](Requirements/system-architecture.md) — **architecture lock**: monorepo shape, data flow, ports, persistence layout
  - [interaction-protocol.md](Requirements/interaction-protocol.md) — the brainstorm loop, MCP tools, response actions, timeout strategy
- **Product/**
  - [vision.md](Product/vision.md) — what this is, the two polar use cases, mashup lineage
  - [board-modes.md](Product/board-modes.md) — the 8 board kinds + visionary roadmap
  - [phase-funnel.md](Product/phase-funnel.md) — **authoritative**: the five psychological routes as built interface mechanics
  - [intake-methodologies.md](Product/intake-methodologies.md) — DECIDED (open plan): Concierge → Living Gallery intake + mind map as a peer methodology; killed directions + taste dials
- **System/**
  - [testing-observability.md](System/testing-observability.md) — **authoritative**: the three test layers, conventions, logs/health/diagnosis
  - [wiki-grounding.md](System/wiki-grounding.md) — **authoritative**: how agents ground on the wiki via the `visual-brainstorm-wiki` MCP (seven tools, search→outline→read) + the reload-after-edit contract
  - [agents.md](System/agents.md) — specialized agent roster and when to use each
  - [model-tiering.md](System/model-tiering.md) — **authoritative**: `model:` tier per agent/command/skill (token efficiency; opus is the orchestrator+security+long-run carve-out)
  - [interface-coverage.md](System/interface-coverage.md) — **authoritative**: interface task → owner (zero unowned) + message → persistence recall audit
  - **Harnesses** (per-harness entry point + adapter map; one page per harness so none bloats another's read — add `harness-<name>.md` for a new harness):
    - [harness-claude-code.md](System/harness-claude-code.md) — native surface + authoritative SSOT (`.claude/`): agents, 15 commands, 2 skills
    - [harness-copilot.md](System/harness-copilot.md) — GitHub Copilot adapter (`.github/`): prompts/agents mapped to `.claude/`
    - [harness-codex.md](System/harness-codex.md) — Codex adapter (`.codex/` + `.agents/skills/`): config/hooks/agents/skills mapped to `.claude/`
- **Research/**
  - [visualization-engines.md](Research/visualization-engines.md) — engine evaluations (mindmapcn/mind-elixir)
- **Meta/**
  - [agentic-loop.md](Meta/agentic-loop.md) — **authoritative**: the build→learn→document→improve loop (with diagram) and the memory map
  - [conventions.md](Meta/conventions.md) — wiki editing rules, discussion/plan format, learnings format
- [log.md](log.md) — append-only edit log
