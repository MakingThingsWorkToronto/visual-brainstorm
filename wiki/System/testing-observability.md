# Testing & Observability (AUTHORITATIVE)

## Test layers — all three green before any completion claim (rule 10)

| Layer | Where | Runs | Covers |
|---|---|---|---|
| Unit | `tests/*.test.mjs` (node:test, zero deps) | `npm run test:unit` | protocol schemas (defaults + rejections, incl. SeedIntake + judge-deck response fields + paletteColors + optional Theme.palette + optional SessionInfo.theme), session store (cache, brainstorm.md, artifacts, archive listing, resolveDir), config, theme ingestion/shadowing, curated built-in palettes (`tests/config-themes.test.mjs` — 5 named hex colors per theme, values unique across palettes, theme accent included), feedback digest (labels, dial deltas, phase fields, finalize, back, model, commands, deck ranking/kills/duels, sudden-death finalize, palette ONLY-these-colors line), poster composer (`tests/poster.test.mjs` — winner label, lineage, notes, XML escaping, unknown-id throw), target repo (`tests/target-repo.test.mjs` — saveTargetRepo key preservation, per-thread override persistence + reload, `POST /api/target-repo` both scopes + honest 400s, thread-over-default resolution) |
| Integration | `scripts/smoke.mjs` | `npm run smoke` | real Bridge on ephemeral port: WS hello/board push, HTTP respond, phase-field round-trip, disk cache, thread list/reload/resume, themes, model routing, UI command dispatch (queued + via-board), artifacts (capture + `GET /api/artifact-svg` 200/404), seed intake (sketch → `.seeds/`, bad image data URI → honest failure note), attachment persistence (valid data URI → savedPath + file on disk; malformed → no savedPath), paletteColors round-trip, new-brainstorm with attachments/model/palette seed notes, waitForCommand landing flow, `POST /api/themes` (writes the styles drop-in JSON; state palette reflects renamed + added colors), `POST /api/session-theme` (persists to session.json; unknown name → 400) |
| UI render | `scripts/ui-smoke.ts` (tsx + jsdom) | `npm run smoke:ui` | all six phase surfaces server-render with signature markers; JudgeDeck, WayfinderStrip (proposal pill), NewDiscussionPanel (chip "other", audience + constraints groups, Colors card, theme palette, "Add a color" affordance, "Scribble a seed" section, full composer), TriageGate sudden-death, TargetRepoPicker (unset + set), PreviewModal (tags + editable note, read-only variant); pure helpers `lib/deck` (applyDuel/adjacentDuels) + `lib/wayfinder` (proposeNextPhase) |

`npm test` = all three. Conventions:
- Unit tests import BUILT output (`dist/`) — build first; `node --test` needs the QUOTED
  glob `"tests/*.test.mjs"` (bare dirs don't glob on Windows).
- Temp dirs only (`vibr-test-` prefix in os.tmpdir); never touch `discussion`.
- Features ship WITH tests at the lowest layer that catches their regression; new surfaces
  need a ui-smoke EXPECT entry. No mocks, no fake success — real Bridge, real fs, real zod.
- Manual eyeballing: `npm run preview [phase]` (fixtures only).

## Observability

- **File logs**: `<discussionRoot>/.logs/{mcp,preview}-<yyyy-mm-dd>.log` — every line
  timestamped + pid-tagged; events: startup/config, port conflicts (with holder pid),
  boards presented (incl. connected-client count), response summaries, WS connects,
  UI commands, `FATAL` crash stacks (uncaughtException/unhandledRejection handlers).
- **Live ring**: last 500 lines in memory → `GET /api/logs` → studio Logs modal (Logs
  button, bottom-left of the left nav).
- **`GET /api/health`**: pid, port, startedAt, engine, session id/dir, active board,
  awaiting-response, connected clients, studio-dist existence. First question, always.
- **Diagnosis**: procedure `.claude/commands/diagnose-studio.md`; agent
  `devops-diagnostician` (evidence-first; most reports are a port-conflict ghost).
