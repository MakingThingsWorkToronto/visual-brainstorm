# Guided pulse wayfinder

**Status:** closed 2026-07-09

A single glowing "pulse" (same chrome-star look as the nav `.nav-edge-glow` border)
that drives the user through the UI: it laps the nav box, then flies to the closest
point on each **not-yet-completed** actionable card, laps it twice, and continues down
the surfaces, finishing by circling the composer ("input chat dialog box") twice before
flying back to the nav to repeat. Only one box is ever active. While a response is
pending it circles the nav box only.

## Decisions (confirmed with Matt)

- **Targets:** every visible actionable card, top-to-bottom, then the composer, then nav.
- **Dirty flag:** each card/box carries a completion flag; once answered — or **prefilled**
  — the pulse stops traversing it. Board mechanic uses `touched` (already true when a
  response is prefilled via `initial`). Concierge/gallery cards unmount on answer, so
  their mere presence = actionable.
- **Look:** keep the existing chrome-star pulse aesthetic (bright core + accent glow).

## Approach

There is **no single "generic box" CSS class** (boxes are Tailwind utilities) and a single
pulse must cross the *gaps between* boxes and hand off — which per-box conic gradients
cannot do. So: tag boxes with a `data-guide` attribute (`hub` | `step` | `input`) plus an
optional `data-guide-done`, and one full-viewport SVG overlay (`GuidePulse`) reads those
elements each frame, traces each rounded-rect perimeter, computes the closest entry point
on the next box, and animates one comet along the whole journey.

- `apps/studio/src/components/GuidePulse.tsx` — the overlay + rAF engine (perimeter
  sampling, closest-point links, 2-lap loops, busy=nav-only, reduced-motion + tab-hidden
  guards).
- Tagging: `Sidebar` nav (`hub`), `ConciergeIntake`/`LivingGallery` wrappers (`step`),
  `BoardSurvey` mechanic (`step`, done=`touched`) + composer (`input`),
  `NewDiscussionPanel` prompt (`input`, done when prompt/seed present).
- `App.tsx` renders `<GuidePulse busy={…} active={noModalOpen} />`; CSS glow in `styles.css`.

## Phases

- [x] P1 — GuidePulse component (engine + render). Geometry extracted to `lib/guidePath.ts`.
- [x] P2 — Tag boxes with data-guide + dirty flags (nav hub, concierge/gallery/board step, composer/new-discussion input).
- [x] P3 — Wire into App + glow CSS (`busy` = thinking/intakeAwaiting; paused behind modals).
- [x] P4 — Verify: **GREEN**. Production `npm run build` clean; full `npm test` exit 0 —
  169 unit + `tests/guide-path.test.ts` (10, new `test:ts`) + smoke + `smoke:ui` (asserts
  `data-guide="step"/"input"` ship in the real BoardSurvey render) + all THREE real-`chrome.exe`
  human-sim journeys (live / livechat / archived) with the `GuidePulse` overlay mounted, zero
  exceptions / zero STUDIO CLIENT ERROR. (Operator's parallel `SurveyQuestion`→protocol WIP
  landed, unblocking the build.) The moving-pixels aesthetic is the operator's subjective call —
  no repo harness can assert an rAF animation's pixels (jsdom lacks rAF/getBoundingClientRect),
  so the geometry is proven by `test:ts` instead.

## Closeout

- Learnings: `.agents/learnings.md` (2026-07-09 — overlay-not-per-box; prove geometry where pixels can't).
- Wiki: `user-guide.md` (§3 Wayfinding pulse), `System/testing-observability.md` (Unit-geometry layer +
  data-guide render assertion + refreshed `npm test` chain), `log.md` ×2, index reloaded.
- Docs move with product (rule 12): done in-cycle.

## Verification

`npm run build` + `npm test`; drive the real studio (live board + landing) and confirm the
pulse renders, sequences nav→cards→composer→nav, skips answered cards, and collapses to
nav-only while `state.thinking`. Reduced-motion renders nothing.

## Follow-up (2026-07-09) — green-glow-instead-of-skip + adversarial review

Operator refinement: the pulse now **traverses every card** and turns **green** while circling
a completed one (accent = still needs you), instead of skipping it. Segment carries `kind`+`done`;
`collectBoxes` records `done` (hub forced un-done) and folds it into the signature; `frame()`
toggles `.is-complete` on a loop over a done box. `data-guide-done` = `gate.ok && touched` (green
means actually sendable). New geometry tests + a `smoke:ui` assertion (revisit dedup + fresh-board
not-done). User-guide §3 updated; logged.

An adversarial review workflow (3 lenses → verify) found **8 real bugs**, all fixed:
double-rAF-on-hidden-mount leak (guarded single loop), rebuild-teleport (re-anchor clock only on
key-set change), revisit double-box (new `BoardSurvey guide` prop; App passes `guide={revisitId===null}`),
green-while-gate-blocked (`gate.ok && touched`), reduced-motion-live-change (`matchMedia('change')`),
composer green inconsistency (both composers stay accent). Mobile busy-no-hub accepted as graceful
degradation. A second review workflow over the patches confirmed **zero regressions**. Full `npm test`
green incl. all three real-Chrome journeys. Learnings harvested (`.agents/learnings.md`, top entry).
