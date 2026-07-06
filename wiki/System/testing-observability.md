# Testing & Observability (AUTHORITATIVE)

## Test layers — all three green before any completion claim (rule 10)

| Layer | Where | Runs | Covers |
|---|---|---|---|
| Unit | `tests/*.test.mjs` (node:test, zero deps) | `npm run test:unit` | protocol schemas (defaults + rejections), session store (cache, brainstorm.md, artifacts, archive listing, resolveDir), config, theme ingestion/shadowing, feedback digest (labels, dial deltas, phase fields, finalize, back, model, commands) |
| Integration | `scripts/smoke.mjs` | `npm run smoke` | real Bridge on ephemeral port: WS hello/board push, HTTP respond, phase-field round-trip, disk cache, thread list/reload/resume, themes, model routing, UI command dispatch (queued + via-board), artifacts |
| UI render | `scripts/ui-smoke.ts` (tsx + jsdom) | `npm run smoke:ui` | all six phase surfaces server-render with signature markers |

`npm test` = all three. Conventions:
- Unit tests import BUILT output (`dist/`) — build first; `node --test` needs the QUOTED
  glob `"tests/*.test.mjs"` (bare dirs don't glob on Windows).
- Temp dirs only (`vibr-test-` prefix in os.tmpdir); never touch `.docs/discussion`.
- Features ship WITH tests at the lowest layer that catches their regression; new surfaces
  need a ui-smoke EXPECT entry. No mocks, no fake success — real Bridge, real fs, real zod.
- Manual eyeballing: `npm run preview [phase]` (fixtures only).

## Observability

- **File logs**: `<discussionRoot>/.logs/{mcp,preview}-<yyyy-mm-dd>.log` — every line
  timestamped + pid-tagged; events: startup/config, port conflicts (with holder pid),
  boards presented (incl. connected-client count), response summaries, WS connects,
  UI commands, `FATAL` crash stacks (uncaughtException/unhandledRejection handlers).
- **Live ring**: last 500 lines in memory → `GET /api/logs` → studio 🧾 modal.
- **`GET /api/health`**: pid, port, startedAt, engine, session id/dir, active board,
  awaiting-response, connected clients, studio-dist existence. First question, always.
- **Diagnosis**: procedure `.claude/commands/diagnose-studio.md`; agent
  `devops-diagnostician` (evidence-first; most reports are a port-conflict ghost).
