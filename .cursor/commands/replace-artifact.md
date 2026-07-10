# /replace-artifact — regenerate a killed artifact's slot

Read and follow:
- `.claude/commands/replace-artifact.md`
- `.claude/agents/brainstorm-orchestrator.md`

Delegate the replacement SVG to **svg-artisan** (the kill note outranks everything), then `capture_artifact` with `replaces: <killed slug>` and the same boardId/optionIds provenance so the studio fills the killed slot.
