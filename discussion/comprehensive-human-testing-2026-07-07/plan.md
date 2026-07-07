# Comprehensive Human Testing — canonical data, API status matrix, UI human-simulation
**Status:** open
**Goal:** every API endpoint has every reachable status code tested and proven with its
response body asserted against canonical expectations; every UI surface survives a
simulated human accomplishing their goal AND a break-sweep iterating every button and
every input; all tests anchor to canonical data in `tests/canonical/` and are verifiable
(a command + observable output). Done looks like: `npm test` includes the human-sim layer
and all four layers are green.
**Source:** operator mandate 2026-07-07 (chat): "we are skipping prioritizing comprehensive
human testing in our plan generation… all status codes must be tested and proven… simulate
humans clicking through… iterate on every button and every input and try to break what was
created… anchor these tests to canonical test data (create in tests\canonical)… all tests
must be verifiable."

## Phases
| # | Phase | Goal + exit criteria (intent, no code) | Owner | Status |
|---|---|---|---|---|
| 1 | canonical-data | Establish `tests/canonical/` (README convention + first datasets: thread/session, boards per phase, responses, themes — protocol-shaped JSON proven via schema.parse); migrate existing unit-test inline fixtures that duplicate these shapes to import the canonical files; exit: `npm test` green with tests importing from `tests/canonical/` | test-engineer | done |
| 2 | api-status-matrix | Census every bridge HTTP endpoint + WS message (from `apps/mcp/src/bridge-server.ts`); for each, a test per REACHABLE status code asserting the response body against canonical expectations (not just the code); exit: coverage table printed by the test run (endpoint × codes, zero unproven), `npm test` green | test-engineer | done |
| 3 | human-sim-harness | A frameworkless human-simulation driver: headless Chrome/Edge via raw CDP over the repo's own `ws` (pattern proven in learnings 2026-07-07 crash-repro), loading the REAL built studio against a REAL bridge, scripting a full user goal (new discussion → respond to a board → capture); crash detection via unmounted root + `STUDIO CLIENT ERROR` log lines; exit: `npm run test:human` prints `HUMAN SIM PASS` | test-engineer | todo |
| 4 | ui-break-sweep | Extend the harness to iterate EVERY button and EVERY input per surface (census = `wiki/System/interface-coverage.md` Table 1): empty submits, oversized/invalid input, rapid double-clicks, mid-flow back/refresh; exit: sweep report listing each control exercised, zero unhandled crashes, honest failures filed as findings in the Progress log | test-engineer | todo |
| 5 | gate-and-docs | Wire the human-sim layer into `npm test` (fourth layer); update `wiki/System/testing-observability.md` layer table + conventions and `wiki/log.md`; exit: `npm test` runs all four layers green, wiki matches reality | test-engineer + wiki-librarian | todo |

## Progress log (append-only — every tick writes one line)
- 2026-07-07 — plan scaffolded with its dispatcher (`/dispatch-comprehensive-human-testing-next-phase`); policy carriers (test-engineer rules, create-dispatch-command mandatory human-verification phase, tests/canonical README, wiki guardrail) landed the same session
- 2026-07-07 — canonical-data: `tests/canonical/` populated (6 per-phase boards, 6 mechanic-exercising responses, thread/session + theme) with `load.mjs` + `tests/canonical-data.test.mjs` proving every file via schema.parse and failing on unregistered strays; feedback/protocol/config-themes tests migrated to canonical imports, poster + session-store fixtures deliberately kept (escaping / lineage edge cases); verify: `npm run build` clean, `npm test` → 73 unit pass + SMOKE PASS + UI SMOKE PASS; commit 1bcb22a; learning captured (Windows backslash path normalization in the stray-file walk)
- 2026-07-07 — api-status-matrix: `tests/api-status-matrix.test.mjs` (31 tests, real Bridge + real fetch + native WebSocket) proves 15 HTTP endpoints × every reachable code plus 4 WS behaviors, bodies asserted key-for-key against `tests/canonical/api/` (38 expected-body files, sentinel grammar in its README); final gate prints the endpoint×codes table and fails on unproven pairs or unconsumed canonical files. Findings (asserted as-is, not changed): no reachable 500 path anywhere; POST /api/respond 200s on duplicate/unknown-board responses (silent first-response-wins); artifact-svg 404 identical for unknown-slug vs deleted-file; WS unknown-type frames ignored without logging. Verify: `npm run build` clean, `npm test` → 104 unit pass + SMOKE PASS + UI SMOKE PASS; commit 7fa97cf; learnings appended (ZodError stringification, VIBR_STUDIO_DIST scoping, presentAndWait open=false) but left uncommitted in `.agents/learnings.md` — a concurrent session has an uncommitted hunk there and taking it as a rider would violate ship discipline; it rides the file's next natural commit
