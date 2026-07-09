# Plan — Annotate a photo in "Scribble a seed" (2026-07-09)

**Status:** closed 2026-07-09. Implemented + verified (build ✓, `npm test` EXIT=0 incl.
`composeSeedSvg` unit assertions and a 21-step real-browser `human-sim.mjs` journey), then
hardened by a post-crash adversarial code review (8 finder angles, per-candidate verify):
fixed the async Send double-dispatch (in-flight guard), a StrictMode double-commit of
arrow/box marks (pure updaters via a draft ref), the photo-aspect draw race (drawing blocked
until the photo measures), and the composite SVG's missing root width/height
(Firefox/Safari canvas rasterization). Tests extended for each fix.

## Context

The New Discussion panel's **Scribble a seed** pad only captures freehand pen strokes
as a `{ kind: 'sketch', svg }` seed; photos are a separate attachment channel and never
meet the pad. Users want to **mark up a photo** — draw, drop styled text notes, point with
arrows — so the seed carries intent about the photo. When any image is used as input, we
offer to open it in the pad as a background; annotations ride on top, colored from the
current palette. The photo **also** stays a plain attachment (vision-readable for Claude);
the annotated composite ships as the `sketch` seed with the photo embedded as
`<image href="data:image/…">` (the sanitizer already whitelists `data:image/`).

Confirmed decisions: **Keep both** (photo stays an attachment + embedded in seed);
**Any image input** triggers the offer; **Per-tool color** (pen/text/arrow each remember
their own palette color).

## Work

- **New** `apps/studio/src/components/PhotoScribble.tsx` — `composeSeedSvg` (pure),
  `PhotoScribble` (canvas + toolbar + text popover + arrows + clear/remove), `PhotoOfferBanner`.
- **Edit** `apps/studio/src/components/NewDiscussionPanel.tsx` — replace inline scribble +
  `strokesToSvg` with `<PhotoScribble/>`; add `bgPhoto`/`sketchSvg` state + photo-offer effect.
- **Edit** `scripts/ui-smoke.ts` — assert `composeSeedSvg` embeds `<image`, color hex,
  `<polygon` arrowhead, note `<rect`/`<text`.
- **Edit** `wiki/user-guide.md` + `wiki/log.md` (rule 12/2); add predicted journey to `tests/journeys.md` (rule 10).
- **No protocol change** — `SeedIntake.sketch` unchanged; `persistSeed` writes the svg verbatim.

## Verify

`npm run build` + `npm test` (composeSeedSvg assertions). Real UI: `npm run test:human`
or live studio — attach/capture image → accept offer → photo becomes pad background →
draw/text/arrow in palette colors → Send & iterate → `.svg` seed in `discussion/.seeds/`
embeds the `<image>` + colored annotations; raw photo also persists as an attachment.
