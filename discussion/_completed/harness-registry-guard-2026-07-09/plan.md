# Harness registry guard — keep the agentic layer honest across harnesses

- **Date:** 2026-07-09
- **Scope:** A deterministic guard (no model — rule 11) that blocks adding a durable
  `.claude/{commands,skills,agents}` file without registering it in the provider-neutral SSOT
  registry (`.claude/agentic-surface-registry.json`), and surfaces missing GitHub Copilot
  adapters. Prevents the drift found during `/wiki-maintenance` 2026-07-09 (`add-theme` +
  `revisit-round` existed on disk but were absent from the registry).
- **Authority:** operator directive ("ensure there is a hook preventing agentic files from being
  added without appearing in all harness registries ... keep agents honest").
- **Status:** closed 2026-07-09.

## Decisions (resolving the Task #1 design questions)

1. **Hard-block vs warn:** HARD-BLOCK (exit 2) on SSOT-registry gaps (unregistered durable file)
   and dangling registry entries (registry names a file that doesn't exist). WARN (non-blocking)
   on missing Copilot adapters — some surfaces are intentionally unadapted, so parity is a
   nudge, not a gate.
2. **Intentional exclusions:** a documented `exclusions` block in the registry. Generated
   per-plan `dispatch-*-next-phase` dispatchers (scaffolded by `create-dispatch-command`,
   archived on closeout) are glob-excluded so they never trip the guard.
3. **Reverse check:** YES — a registry entry whose file is missing is also a hard error (catches
   renames/deletions).
4. **Close the found gap honestly:** register the two durable missing commands (`add-theme`,
   `revisit-round`) in the SSOT registry rather than excluding them.

## Phases

| # | Phase | Status | Exit criteria |
|---|---|---|---|
| 1 | Registry: add exclusions block + `add-theme`/`revisit-round` surfaces | done | registry lists all 15 commands accounted-for (13 surfaces + 2 excluded dispatchers) |
| 2 | `scripts/check-agentic-surface.mjs` — pure `evaluateSurface()` + fs `checkAgenticSurface()` + CLI (exit 2 on errors) | done | runs clean against the repo; exits 0 |
| 3 | `tests/agentic-surface.test.mjs` (auto-globbed by `test:unit`) — real-repo clean + synthetic drift/exclusion negatives | done | `npm run test:unit` green; negative test proves the guard fires |
| 4 | Wire PostToolUse hook (Write\|Edit) → the guard | done | `.claude/settings.json` runs the guard after edits |
| 5 | Verify + doc the guard in the harness pages | done* | guard's own layers green (`test:unit` 181, `test:ts` 13, CLI exit 0); harness-claude-code.md documents the guard. *Full `npm run build` is RED from PRE-EXISTING, unrelated PhotoScribble WIP (see note) — not this change. |

## Progress log
- 2026-07-09 — CLOSEOUT status: **verified green, value-add done, commit+archive HELD pending concurrent convergence.**
  - Verify (rule 10): `npm run build` exit 0, `npm run smoke` PASS (transient ECONNRESET on first try; passed on retry — a port/process race, not code), guard exit 0 with **0 Copilot warnings**, `test:unit` 181, `test:ts` 13. The earlier PhotoScribble build break was a separate in-flight plan and self-resolved.
  - Learnings (Harvest step): added the commit-entanglement gotcha to `.agents/learnings.md`; the harness-parity-encoding learning was already recorded by a peer session.
  - Command improvement (Improve step): `new-command.md` step 5 now mandates registering new surfaces in the SSOT registry + reconciling the Copilot adapter/`exclusions.copilot` (the guard enforces it). Peer session encoded add-theme/revisit-round under `exclusions.copilot.commands`.
  - **Commit HELD:** peers concurrently added `read-mindmap`/`read-scribble` command entries to the shared registry while their `.md` files remain untracked (`??`). Committing the registry now ships dangling entries → the committed guard test would be RED on a fresh clone. Per the Verify-reality/attribution discipline, wait for those loops to converge (their `.md` files tracked), then commit + archive. Did NOT clobber peer entries or force a mixed commit.
- 2026-07-09 — plan created; decisions locked; building phases 1–4.
- 2026-07-09 — phases 1–5 built. Registry: added `exclusions` block + registered add-theme & revisit-round (drift closed). Guard `scripts/check-agentic-surface.mjs` (pure `evaluateSurface` + fs wrapper + `--hook` quiet mode) + `tests/agentic-surface.test.mjs` (real-repo clean + 4 synthetic negatives proving it fires). Hook wired: `Write|Edit|MultiEdit` PostToolUse → guard `--hook`. Docs: harness-claude-code.md updated (registry now 13 surfaces + 2 excluded; guard described).
- 2026-07-09 — VERIFICATION: `npm run test:unit` 181/181 (incl. 5 new), `npm run test:ts` 13/13, `node scripts/check-agentic-surface.mjs` exit 0 (2 non-blocking Copilot warnings: add-theme/revisit-round unadapted). `npm run build` FAILS in apps/studio `PhotoScribble.tsx`/`NewDiscussionPanel.tsx` — a discriminated-union narrowing error in the separate in-flight PhotoScribble feature (`discussion/photo-scribble-annotation-2026-07-09/`); pre-existing, unrelated to this change (touched only .mjs/.json/.md). NOT fixed here (rule 9). Heavier smoke/human-sim layers are blocked by that same unrelated build break.
