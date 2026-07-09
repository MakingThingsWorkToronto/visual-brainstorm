# Plan — Make the scribble legible to the model + anchor the brainstorm on it (2026-07-09)

**Status:** closed 2026-07-09. Implemented + verified (build ✓; smoke folder-persistence +
read-scribble note, ui-smoke highlighter/box/`toScribbleAnnotations`, protocol test,
human-sim journeys all green), then hardened by a post-crash adversarial code review:
the seed folder's README/seedNote no longer claim a photo background on blank-canvas
scribbles (honesty fix + smoke assertions), the VIEW-fallback chain is resolved once and
shared by README + seedNote, and persistSeed's image branch reuses `decodeImageDataUri`.
`wiki/Requirements/system-architecture.md` reconciled to document the seed-FOLDER form.

## Context

The annotate-a-photo scribble persisted as one `.svg` with the photo embedded as base64 — the
Read tool returns XML text, not a rendered image, so the model could not SEE the user's marks.
This makes the scribble genuinely legible: the studio renders a **vision-readable composite PNG**,
the bridge persists a **rich traversable folder**, and a new `/read-scribble` command + a
`reading-scribbles` skill let the orchestrator interpret the marks and **anchor the whole
brainstorm** on them.

## What shipped

- **Human usability:** Highlighter + Box tools, undo-last, theme-styled note font, photo keeps aspect, **Maximize → fullscreen input view** (input-only; no artifact-chat).
- **Protocol (`packages/protocol`):** `sketch` seed gains `photoDataUri` / `compositeDataUri` / `annotations` (`ScribbleAnnotationsSchema`).
- **Studio (`PhotoScribble.tsx`):** unified ordered annotations; `composeSeedSvg` (highlighter/box), `toScribbleAnnotations` (structured, palette color NAMES), `renderCompositePng` (canvas → PNG). `NewDiscussionPanel` builds the enriched seed on send.
- **Bridge (`persistSeed`):** writes `.seeds/seed-<stamp>/` → composite.png, photo.png, scribble.svg, scribble.json, README.md + a `/read-scribble` seedNote; legacy single-`.svg` fallback.
- **Command/skill:** `.claude/commands/read-scribble.md` + `.claude/skills/reading-scribbles/SKILL.md`; wired into run-brainstorm step 1, orchestrator front door, brainstorm-phases; registered (registry + `.github` map + prompt + discover-skills + CLAUDE.md + learnings).

## Verify

`npm run build` + `npm test`; ui-smoke (highlighter/box/`toScribbleAnnotations`); protocol test;
smoke.mjs (folder persistence + read-scribble note); human-sim (new tools + fullscreen + composite
PNG bytes + `scribble.json` on disk); journeys.md #7/#8; wiki + user-guide + log.
