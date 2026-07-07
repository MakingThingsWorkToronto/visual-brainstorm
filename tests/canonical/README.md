# tests/canonical — the canonical test data (operator mandate 2026-07-07)

All tests anchor to the data in THIS directory. Inline fixture literals scattered through
test files drift and silently rot; canonical files are shared, named, and provable.

## Rules

1. **One domain per subfolder** — `threads/`, `boards/`, `responses/`, `themes/`,
   `api/` (canonical expected response bodies per endpoint × status code).
2. **Protocol-shaped JSON is proven, never trusted.** Every canonical file whose shape
   lives in `packages/protocol` is loaded through its zod schema
   (`Schema.parse(JSON.parse(...))`) in the test that uses it — a canonical file that no
   longer parses is a FAILING test, not stale data (same law as fixtures: schema-gained
   defaulted fields must never break silently).
3. **Tests import canonical data instead of declaring literals.** A new feature adds or
   extends canonical files IN THE SAME CHANGE as its tests.
4. **Verifiable means a command + observable output.** Every test anchored here runs under
   `npm test` (or `npm run test:human`) and proves its expectation against these files —
   "works on my machine" and unasserted console output don't count.
5. **Canonical ≠ frozen.** When the product legitimately changes a shape or body, the
   canonical file changes in the same commit, and the diff IS the review surface for what
   the change did to observable behavior.

Populated by `discussion/comprehensive-human-testing-2026-07-07/plan.md` phase 1;
extended with every feature after that.
