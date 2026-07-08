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
| 2 | **Survey/forms module** | Item 3: a reusable `Survey`/`SurveyField` component in `apps/studio/src/components/Survey.tsx` — tappable single/multi answer pills (radio/checkbox semantics), free-text "other", recommended-answer accent + badge; `surveyWords` helper flattens answers for compose-to-brief. Studio-side presentation only (no protocol change). Adapted from the donor's shadcn Label/Checkbox/Input patterns, hand-rolled on the studio pill idiom. Built + typechecked (`tsc --noEmit` + vite build green). **ui-smoke coverage deferred to phase 3**: the component is inert until wired, and `ui-smoke.ts` is entangled with the concurrent ArtifactFullscreen refactor + a peer is checking out — the render test lands with the phase-3 integration into `NewDiscussionPanel` (a file we own). | done |
| 3 | **Repurpose intake boxes as questions** | Item 4: `CHIP_GROUPS` grid swapped for module-rendered `QUESTIONS` in `NewDiscussionPanel.tsx` (What are you making? / vibe / range / audience / constraints — same options as the old chips, single/multi per semantics), faithful to `concierge-living-gallery.svg` panel 2. compose-to-brief preserved via `surveyWords` (human-sim proves `(a logo)` still lands in the prompt). No protocol change; `ask_concierge` unification left as a future stretch (it already renders questions). ui-smoke markers updated to the survey. `user-guide.md` updated (rule 12). | done |
| 4 | **Comprehensive human-verification** (mandate) | No endpoint/protocol shape changed (studio-only), so no new canonical bodies. `npm run build` + full `npm test` green — unit, smoke, **ui-smoke** (survey-question markers), **human-sim** in real Chrome/CDP (drives the `a logo` survey pill → brief → send → concierge → gallery → mindmap → capture → pin) + archived human-sim. Studio loaded in a real browser satisfies the rule-10 UI clause. wiki + `wiki/log.md` line added; interface-coverage unchanged (same intake task, now rendered via the Survey module — no owner change). | done |

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
  the composer is driven and Send & iterate works). Committed 089d0b7 (NewDiscussionPanel + plan;
  the App.tsx scroll-fade hunk rides the concurrent ArtifactFullscreen refactor) + pushed.
- 2026-07-07 — **phase 2 DONE (module built + typechecked).** `Survey.tsx` — reusable
  single/multi question surface with recommended accent + `surveyWords` helper; `tsc --noEmit` +
  vite build green. ui-smoke coverage deferred to phase 3 integration (ui-smoke.ts entangled +
  peer checking out). Committed clean as a standalone module (9da8b9c).
- 2026-07-07 — **phases 3 + 4 DONE + verified.** `NewDiscussionPanel.tsx` now renders `QUESTIONS`
  via `<Survey>` in place of the chip grid; compose-to-brief preserved (`surveyWords`). ui-smoke
  markers updated; `user-guide.md` + `wiki/log.md` updated. `npm run build` + full `npm test`
  green incl. human-sim (real Chrome drives the survey pill, composes `(a logo)`, full journey to
  pin) + archived sim. Peer's closeout (eedece9) freed ui-smoke.ts so the test landed cleanly.
  ALL PHASES DONE — ready for closeout.
