# Predicted Human-Journeys Registry

This file is the additive registry of every predicted human journey through Visual Brainstorm.

**The rule.** Predict EVERY human journey before you test it. Audit ADDITIVELY — new journeys are
APPENDED, existing rows are never removed (a walked-away journey becomes a documented coverage
gap, not a deletion). At EACH surface a journey walks, assert the SPECIFIC canonical DATA is
visibly in frame — not a 200, not a testid, not "N rows" (reject error/blank/spinner/empty-data
false-greens; helper: `scripts/lib/visual-honesty.mjs`). Every proof runs against the REAL
bridge/studio/browser and REAL MCP-tool pathways — NO mocks, NO preview/fixture harness. NEVER
fake the orchestrator to manufacture a surface: a test that calls a surface's producer itself
(e.g. `bridge.presentGallery`) proves nothing about a real run — the surface must arise from the
REAL path, reachable by REAL navigation. Mark each canonical-data assertion DONE or OWED.

| Journey | Surfaces walked | Canonical data asserted at each surface | Real-path proof (runnable command) | Faked-orchestrator risk |
|---|---|---|---|---|
| **1. Intake** | brief → concierge Q&A → Living Gallery → mind map canvas | Gallery shows the four method cards "Mind map / Funnel / Wreck / Cluster" + the recommended card's reason-chip text; canvas shows the tree node topics — **OWED** (see risk) | `npm run test:human` today only proves the studio CAN render a gallery | **HIGH — CURRENT `scripts/human-sim.mjs` FAKES the gallery via `bridge.presentGallery(...)` itself.** A real-orchestrator journey test (a session calling `ask_concierge` → `present_gallery` so the surface arises from the REAL path) is still **OWED**. |
| **2. Board round** | diverge board → select option → elaborate → submit | Board shows option labels "Alpha / Beta / Gamma" + the board title renders — **DONE** | `npm run test:human` (goal run, gated in `npm test`) | Low — board arrives via the real `present_board` path in the goal run; keep the gallery→board hand-off real, not injected. |
| **3. Artifact keep** | keep artifact → fullscreen viewer → pin | Kept artifact's title/label visible in the viewer; pinned state visibly reflected — **OWED** | (extends `npm run test:human`) | Medium — assert the artifact arises from a real capture, not a seeded state row. |
| **4. Archived thread reopen** | archived thread → read-only replay → reopen control | Seeded `_completed/` thread's canonical round labels visible in replay; reopen control reachable by real nav — **DONE** | `npm run test:human:archived` (`scripts/human-sim-archived.mjs`, gated in `npm test`) | Low — seeds a real `_completed/` thread on disk and drives the real studio; keep the reopen a real navigation, not direct state. |
