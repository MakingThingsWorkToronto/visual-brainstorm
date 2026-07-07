# docs-tests-agents — human docs, observable logging, test layer, specialized agents, wiki sweep

**Date:** 2026-07-06
**Scope:** .docs/, .claude/agents/, tests/, apps/mcp (log ring + /api/logs), apps/studio (log viewer), wiki, package.json
**Authority:** operator brief (2026-07-06 evening); CLAUDE.md rules 1–3, 10
**Status:** closed 2026-07-06

## Deliverables

1. **Human documentation** — `.docs/user-guide.md`: install → connect Claude → drive a
   brainstorm → every studio control → threads/caching → configuration → troubleshooting.
2. **Observable logging** — `FileLog` gains an in-memory ring (last 500 lines);
   `GET /api/logs` serves ring + file path; studio header gets a 🧾 log viewer modal.
   (Existing: pid-tagged dated files, crash handlers, /api/health.)
3. **Dev-ops agent** — `.claude/agents/devops-diagnostician.md`: embeds the diagnose
   procedure (health → process census → logs → stale tab), tools-limited, evidence-first.
4. **Testing layer** — `tests/*.test.mjs` on node:test (zero new deps), covering protocol
   schemas, session store (cache/archive/brainstorm.md/artifacts), config, theme ingestion,
   feedback digest. Layers: unit (`npm run test:unit`) + integration (`smoke`) + UI render
   (`smoke:ui`) = `npm test`. build-check updated.
5. **Specialized agents** — also `svg-artisan` (delegated option generation per
   svg-authoring skill), `test-engineer`, `wiki-librarian`.
6. **Wiki sweep** — new `System/testing-observability.md` + `System/agents.md`; conventions
   updated (features ship with tests); README/index updates; all edits logged.
7. **Follow-up directive (same day):** CLAUDE.md optimized as the cold-start bootstrap
   (Session bootstrap section + quick map + rules 11/12); user guide illustrated with
   hand-authored SVG diagrams (loop, funnel, studio anatomy in `.docs/images/`); the
   build→learn→document→improve loop made authoritative at `wiki/Meta/agentic-loop.md`
   (+ diagram).
