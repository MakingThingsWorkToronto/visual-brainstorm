# Delete the preview harness → real pathways only

**Status:** open 2026-07-07.
**Trigger (operator, 2026-07-07):** Review the crowned `concierge-living-gallery` artifact; evaluate whether the NON-preview UI presents its method-card options and whether the mind map works via **actual human-sim**; then — "the preview scaffolding is a limitation and we should be using real pathways to test; delete any preview test functionality immediately."

## Evaluation verdict (recorded first — the ask before the change)
- **Does the real (non-preview) UI present the gallery options?** YES. `App.tsx` renders `<LivingGallery>` from `state.gallery` (the `gallery` WS envelope the bridge sends via `presentGallery`) — a pathway independent of the preview harness. The canonical gallery carries all four method cards (Mind map [recommended, ribboned + reason chip], Funnel, Wreck, Cluster).
- **Does the mind map work, proven by actual human-sim?** YES. `npm run test:human` (real `Bridge` `engine:'claude'` — never the fixture player — real built studio dist, real Chrome over raw CDP) is green: **14/14 steps**, including brief → concierge Q&A → gallery pick (Mind map card + recommended ribbon render live) → live mind-elixir engine mounts real DOM → a genuine `mind.addChild()` edit rides back as `editedTree`. Break-sweep: 0 findings.
- **Conclusion:** no product failure. The failure the operator is pointing at is a *doctrine* failure — the preview harness exists as a second, non-real "proof" path (and CLAUDE.md rule 10 still names `npm run preview` as UI proof). That crutch is what we delete.

## Scope
Remove the preview fixture harness and its now-vestigial `engine` discriminator (its ONLY purpose was to tell preview from a real session). **Keep** all product SVG/artifact *preview* UI (`SvgPane`, `ArtifactFullscreen`, phase previews) — that is product, not test scaffolding.

### Code (owned inline — build must stay green)
- Delete `apps/mcp/src/preview.ts`.
- Remove `preview` + `demo` scripts from root `package.json` and `apps/mcp/package.json`.
- Remove `engine` from `packages/protocol` (`StudioState`), `apps/mcp/src/bridge-server.ts` (`BridgeOptions` + `state()` + hello), `apps/mcp/src/index.ts` (real entry no longer passes it), studio (`useBridge.ts` default, `App.tsx` `enginePreview`, `NewDiscussionPanel.tsx` banner + prop).
- Scrub `engine:'claude'` from harness/test bridge constructions: `scripts/{smoke,ui-smoke,human-sim,human-sim-archived,ui-break-sweep}`, `tests/{api-status-matrix,bridge-port-file,bridge-revisit,client-log,target-repo}`; drop `engine` from `tests/canonical/api/state-200.json`.

### Doctrine (owned inline — "so this never happens again")
- CLAUDE.md rule 10: UI proof = real pathways (`npm run test:human` + a live Claude session), not `npm run preview`.
- `.claude/commands/{build-check,create-dispatch-command,run-brainstorm,diagnose-studio}.md`: strike preview-as-proof; point at human-sim / real bridge.
- `.agents/learnings.md`: one bullet — preview was a false-confidence second path; real pathways only.

### Wiki + .github mirror (delegated → wiki-librarian; rule 11 adapter-reconcile clause)
- wiki: `System/testing-observability.md`, `System/interface-coverage.md`, `Requirements/system-architecture.md`, `user-guide.md`, `Product/intake-methodologies.md`, `Requirements/interaction-protocol.md`; one `wiki/log.md` line per page.
- `.github/`: `copilot-instructions.md`, `prompts/*`, `agents/*`, `agentic-surface-map.json` — no lingering preview harness / `engine:'preview'` references.

## Verify
`npm run build` + `npm test` (unit/smoke/ui-smoke/human/archived) + `npm run test:human:sweep` → exit 0.

## Closeout
`/plan-closeout` discipline: verify → learnings harvested → commands/skills improved → wiki reconciled → archive to `_completed/`.

## Progress log
- 2026-07-07 — plan scaffolded; evaluation verdict recorded (real UI presents options + mind map green via human-sim); excision begins.
