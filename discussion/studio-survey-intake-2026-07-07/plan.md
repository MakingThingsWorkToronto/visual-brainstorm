# Studio intake as questions — survey/forms module + composer fixes

**Status:** open — 2026-07-07 (approval-gated: implement only after operator OKs)
**Owner persona:** inline coordinator delegating BUILD to studio work + test-engineer + wiki-librarian
**Trigger:** operator design-review during the token-economy session (2026-07-07): four studio items.

## Intent

Turn the New Discussion intake from a static chip grid into **adaptive questions with tappable
answers**, rendered by a reusable survey/forms module — the design crowned Final in
`discussion/_completed/2026-07-06-2358-methodology-driven-intake-mind-map-board/` (artifact
`concierge-living-gallery.svg`, panel 2 "As many questions as it takes"). Plus two composer UX
fixes the operator called out. Nothing here changes the brainstorm funnel or the token-economy work
(separate plan).

## Source of truth (the winning artifact)

Panel 2 of `concierge-living-gallery.svg` is the target pattern: a **question label + a row of
tappable answer pills**, one highlightable as recommended (accent ring), single- or multi-select,
with an adaptive "next question…" affordance (unbounded — "as many questions as it takes",
operator round-2 note). Free-text "other" stays (the panel already has it per chip group). The
recommended answer carries a quoted-reason chip ("because you said: team · strict · live").

## The four items

1. **Collapse "Scribble a seed" by default** (`NewDiscussionPanel.tsx:266`) — the `grow` section
   currently defaults open; seed `collapsed.scribble = true`.
2. **Anchor "Send & iterate" out from under the shadow** (`NewDiscussionPanel.tsx:315–449`) — the
   bottom composer is clipped/faded by the `scroll-fade` mask on `main` (see learnings
   2026-07-07 "fixed-position overlays paint-trapped by scroll-fade"). Anchor the composer to the
   viewport bottom so "Send & iterate" is always visible. Real-browser verify — a DOM-rect check
   lies here (mask clips paint, not geometry).
3. **Survey/forms module** — a reusable studio component rendering a list of questions (label +
   tappable single/multi answer pills + free-text "other" + recommended-answer accent + adaptive
   "next question" affordance), form-control patterns adapted from donor `C:\Code\tp\packages\ui\src`.
4. **Repurpose the New Discussion boxes as questions** — replace the static `CHIP_GROUPS` grid
   (making/vibe/range/audience/constraints) with survey questions rendered by the module, faithful
   to the winning artifact; preserve the compose-to-brief behavior so answers still seed the board.

## Decisions confirmed (operator, 2026-07-07 — "proceed with the recommendations")

1. **Donor form controls: adapt, not hard-import.** The studio is frameworkless Tailwind v4 with
   hand-rolled primitives (`primitives.tsx`); it mirrors shadcn rather than importing it. Donor
   `packages/ui/src` is a different stack (Next SPA). Study its form-control patterns (pills,
   radio/checkbox groups, field shells — index at `apps/preview-spa/src/app/components/forms/
   page.tsx`) and re-express them as studio primitives — dependency-clean, theme-aware.
2. **Fixed starter question set for the pre-session panel; adaptivity reserved for live
   `ask_concierge`.** The panel runs before Claude attaches, so its questions are static-authored;
   the live concierge is where Claude drives them adaptively.
3. **Chip→question mapping:** making→"What are you making?", vibe→"What's the vibe?",
   range→"How far should it push convention?", audience→"Who is it for?",
   constraints→"Any hard constraints?" (multi-select where today's chips are multi).

## Phases (loopable — one per `/loop` tick; update Status + append Progress)

| # | Phase | Deliverable | Status |
|---|---|---|---|
| 1 | **Composer UX fixes** | Items 1 + 2: scribble collapsed by default (`NewDiscussionPanel.tsx` — `collapsed:{scribble:true}`); the `scroll-fade` mask dropped from `main` for the new/landing form surface (`App.tsx` — the mask was the "shadow" obscuring Send & iterate; removing it beats a paint-trapped `position:absolute`). Verified: build + full test suite green incl. human-sim driving the real composer in headless Chrome (Send & iterate interactable, fade gone). | done |
| 2 | **Survey/forms module** | Item 3: a reusable `Survey`/`Question` component in `apps/studio` — tappable single/multi answer pills, free-text "other", recommended-answer accent + quoted-reason chip, adaptive "next question" affordance. Form-control patterns adapted from donor `packages/ui/src` (per the decision above). If any answer shape crosses the bridge, it lands in `packages/protocol` first (rule 5) — but default scope is a studio-side presentation component reused by the panel. ui-smoke renders it with marker assertions. | pending |
| 3 | **Repurpose intake boxes as questions** | Item 4: swap the static `CHIP_GROUPS` grid for module-rendered questions faithful to `concierge-living-gallery.svg` panel 2 (question + tappable answers, comprehensive/adaptive, recommended accent). Preserve compose-to-brief so answers seed the first board exactly as chips do today. Consider unifying the live `ask_concierge` surface to render through the same module (stretch — only if clean). user-guide updated (rule 12). | pending |
| 4 | **Comprehensive human-verification** (mandate) | API status codes + bodies proven for any changed/added endpoint or protocol shape (+ canonical bodies in `tests/canonical`); UI human-sim drives the survey (tap answers, "other", send) + break-sweep; `npm run build` + `npm test` (unit/smoke/ui-smoke) green; studio loaded for the UI clause (rule 10). wiki + `wiki/log.md` lines; interface-coverage updated if a task's owner changed. | pending |

## Exit criteria

- New Discussion intake presents adaptive questions with tappable answers matching the winning
  artifact; answers still compose into the brief that seeds the first board.
- Scribble collapsed by default; "Send & iterate" always visible (real-browser proof).
- Survey module is reusable and covered by ui-smoke; donor-pattern provenance noted.
- `npm run build` + `npm test` green; wiki/user-guide match the product; no code/wiki drift.

## Open questions for the operator

- All three prior open questions resolved (see Decisions confirmed). None outstanding for phase 2.

## Progress log (append-only)

- 2026-07-07 — plan created from operator design-review (four studio items). Grounded in the
  winning artifact `discussion/_completed/2026-07-06-2358-methodology-driven-intake-mind-map-board/
  artifacts/concierge-living-gallery.svg` (panel 2), `NewDiscussionPanel.tsx`, donor
  `C:\Code\tp\packages\ui\src`.
- 2026-07-07 — operator "proceed with the recommendations": three decisions confirmed (adapt donor
  patterns; fixed panel questions + adaptive live concierge; chip→question mapping).
- 2026-07-07 — **phase 1 DONE + verified.** Scribble collapsed by default; `scroll-fade` mask
  removed from the new/landing form surface (the "shadow" over Send & iterate). `npm run build` +
  full `npm test` green (unit, smoke, ui-smoke, human-sim + archived human-sim in real Chrome/CDP —
  the composer is driven and Send & iterate works). Not yet committed (awaiting operator).
