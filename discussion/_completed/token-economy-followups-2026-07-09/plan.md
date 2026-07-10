# Token-economy follow-ups — deferred bugs & test gaps

**Status:** closed 2026-07-09 — all four phases landed + proven (see Progress log)
**Owner persona:** any capable session; test work → **test-engineer**
**Trigger:** operator — "run /plan-closeout … so i can fix bugs in a new chat"
**Provenance:** the three-reviewer fresh-eyes sweep of `_completed/token-economy-2026-07-07`
(reviewer findings 2, 5, 7, 8, 17 and doc nit N3). Baseline + A/B procedure:
`discussion/_completed/token-economy-2026-07-07/baseline.md` (the live A/B is FUTURE
verification, not a bug — do not fold it in here).

## Phases (loopable — one per tick; update Status + append Progress)

| # | Phase | Deliverable | Status |
|---|---|---|---|
| 1 | **Pipe cursor idempotency** (the real bug) | `scripts/pipe-progress.mjs`'s token cursor is per-event read-modify-write with no locking: two hooks firing close together (Stop + SubagentStop, parallel subagents) both read the same `prev` and double-post the overlap; separately, a bridge accept slower than the 1.5s abort re-posts an already-recorded delta. Fix with an idempotency key per delta (e.g. cursor-generation id the bridge dedupes in `recordProgress`) or an atomic write-then-rename cursor with monotonic check — WITHOUT breaking hook safety (the pipe must never fail/blockage a session; keep silent-exit-0). Prove with a concurrent-pipe race test (spawn two pipes on one cursor) + a slow-accept test. `baseline.md` § Known limits then drops its "measurement noise" caveat. | done |
| 2 | **Attribution edges + sidebar/meter divergence** | (a) `sumTokensFile` (sidebar totals) sums RAW lines while `SessionStore.open()` drops schema-invalid ones — a foreign/corrupt line counts in the sidebar but not the opened thread's meter; unify the skip rule. (b) Pin last-label-wins for two-boundaries-before-one-delta with a test (documented heuristic — pin it, don't redesign). (c) Test `useBridge`'s client-side `tokensBySink` increment reducer (`apps/studio/src/lib/useBridge.ts` progress branch) — currently only the server reduction is proven. | done |
| 3 | **TWEAK classifier test matrix** | Untested paths in `tests/feedback.test.mjs`: TWEAK suppressed for `action` park/accept/finalize with nudges present; structural negation via remix / ranking / duels / clusters / gapNotes / editedTree / treeOps (each alone should defeat TWEAK); annotations and mutations as nudge triggers. Table-drive it — the classifier is deterministic, the matrix is cheap. | done |
| 4 | **"Fix small validity defects inline" boundary** | `VALIDITY-SCAN.md` tells the orchestrator to fix small validity defects inline while the orchestrator persona says "never draws board SVGs inline" — the boundary is undefined. Define it: attribute-level repair (duplicate attr, missing xmlns/viewBox, stray quote) = inline OK; anything touching geometry/paths/content = artisan re-delegation. One sentence in VALIDITY-SCAN + mirror resync. | done |

## Exit criteria

- A concurrent-hook race test proves no double-counting; the slow-accept path proves no
  re-post; `baseline.md`'s noise caveat is deleted (the noise is gone, rule 6 honest).
- Sidebar token totals equal the opened thread's meter on a thread with a corrupt line.
- The classifier matrix is table-driven and green; every structural field proven to defeat TWEAK.
- The inline-fix boundary is written where the judge reads it; Codex mirror byte-identical.
- `npm run build` + `npm test` green; commits pushed (rider discipline — shared tree).

## Progress log (append-only)

- 2026-07-09 — plan created at the token-economy fresh-eyes closeout from the deferred
  reviewer findings; parent plan archived at `_completed/token-economy-2026-07-07/`
  (see its plan.md + baseline.md for full context).
- 2026-07-09 — all four phases landed in one session:
  - **Phase 1** (idempotency): chose the idempotency-key design over cursor locking — the
    pipe stamps each delta with a `tokenCursor` claim (ProgressEvent field: session-cursor
    id + generation + the cumulative transcript totals the delta ran up to); the store keeps
    a per-(id, gen) high-water mark and clamps overlap in `recordProgress` (ledger rebuilt in
    `open()`). Locking alone could not fix the slow-accept re-post; the ledger fixes both
    mechanisms with the pipe still a plain read/post (hook safety untouched, exit-0 kept).
    Compaction shrink bumps the generation so the mark resets (never eats real usage). The
    inbound zod whitelist in the bridge's POST /api/progress passes `tokenCursor` through
    (three-point protocol change per learnings 2026-07-09). Proven end-to-end with real pipe
    processes → real Bridge → real store: race, slow-accept, compaction
    (tests/pipe-progress.test.mjs) + unit ledger tests (tests/session-store.test.mjs).
    `baseline.md` § Known limits noise caveat superseded in place.
  - **Phase 2**: (a) `sumTokensFile` now schema-parses lines (same skip rule as `open()`),
    parity test green; (b) last-label-wins pinned by test; (c) client reducer extracted to
    `apps/studio/src/lib/progressTokens.ts` (pure) and proven in tests/progress-tokens.test.ts.
  - **Phase 3** (test-engineer): 12-row table-driven TWEAK matrix appended to
    tests/feedback.test.mjs — park/accept/finalize suppression, 7 structural negations each
    alone, annotations + mutations as lone nudge triggers. 41/41 green.
  - **Phase 4**: inline-fix boundary written into VALIDITY-SCAN.md (attribute-level repair
    inline OK; geometry/paths/content re-delegates) + changelog line; Codex mirror re-synced
    byte-identical (check-codex-parity OK).
