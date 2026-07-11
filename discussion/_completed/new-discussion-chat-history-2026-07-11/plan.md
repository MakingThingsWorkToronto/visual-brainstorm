# New Discussion as chat history — intake must never disappear

**Status:** closed 2026-07-11

## Bug report (operator, 2026-07-11)

> After answering the New Discussion answers I was taken to the chat and entered a
> single answer, and when I clicked send & iterate I was taken back to the New
> Discussion panel and the question asked and my answer disappeared. Treat the New
> Discussion panel as a normal chat component — it should not disappear and should
> always be the first option in the filmstrip so the user can navigate back to it
> and change their answer or scroll up to remind themselves how they answered.
> User messages shall not disappear. Actually anything I click on seems to take me
> back to the new discussion.

## Root causes (found in code, 2026-07-11)

1. **Answered intake vanishes from the UI.** `Bridge.askConcierge` broadcasts
   `{type:'concierge', exchange:null}` the moment the answer lands and records the
   Q&A only into `brainstorm.md` (text memory). Nothing in `StudioState` retains
   answered concierge exchanges, the submitted New Discussion brief, or the gallery
   pick — the studio has no data to render them.
2. **Landing snap-back.** `App.tsx`'s `landing` flag replaces the ENTIRE main
   surface with `NewDiscussionPanel` whenever the live thread has no answered
   rounds AND no active surface (`!activeBoard && !thinking && !concierge &&
   !gallery && !intakeAwaiting`). The gap right after a concierge answer (and any
   later idle gap before round 1) satisfies it, so the whole timeline — including
   the question just answered — is swapped for the intake panel. The client-only
   `intakeAwaiting` veil resets as soon as the FIRST concierge question arrives, so
   it cannot cover the gaps between intake stages.

## Fix — the intake IS chat history (protocol-shaped, rule 5)

### Phase 1 — protocol
- `IntakeLogEntrySchema`: discriminated union `brief` (composed prompt, rawBrief,
  structured question→answers with survey ids, model) | `concierge` (question,
  answer, picked, typed) | `gallery-pick` (method, offered); all stamped `at`.
- `StudioState.intakeLog: IntakeLogEntry[]`; `ServerToStudio` gains
  `{type:'intake', entry}`.

### Phase 2 — MCP bridge + store
- `SessionStore`: `intake-log.json` in the thread dir (append + reload);
  `recordBrief(...)`, and `recordConcierge`/`recordGalleryPick` now ALSO append
  structured entries (brainstorm.md text memory unchanged). Answered entries only —
  timeouts stay text-only (honest, no fake user message).
- `Bridge.state()` carries `intakeLog`; every append broadcasts `{type:'intake'}`.
- `POST /api/command` (new-brainstorm) records the brief entry on the live empty
  thread (the landing `/run-brainstorm` flow continues on that same store); when
  the current thread already has rounds the entry is stashed and flushed into the
  next `attachStore`'d empty thread.
- `GET /api/discussions/:id` includes `intakeLog` so archived views replay it.

### Phase 3 — studio
- `useBridge`: reduce `intake` envelopes into `state.intakeLog` (dedupe on
  kind+at).
- New `IntakeHistory` timeline block (id `intake-history`): the brief as a user
  bubble (with the structured answers), each concierge exchange as Claude-question
  + user-answer bubbles, the gallery pick as a marker. Renders FIRST in the
  timeline, live and archived. The brief block offers "revise" → reopens the
  New Discussion panel prefilled from the log entry.
- `landing` additionally requires `intakeLog.length === 0` — once intake has
  begun the timeline NEVER yields to the panel again; gaps between intake stages
  show the working shimmer instead.
- The New Discussion panel becomes a timeline block (first position), not a
  surface takeover: when open, the rest of the timeline stays rendered below it.
- `WayfinderStrip`: a `🌱 brief` chip is ALWAYS the first slot once intake exists;
  clicking it scrolls to `intake-history`.

### Phase 4 — proof (rule 10)
- `tests/intake-log.test.mjs` on the real bridge harness: concierge answer →
  entry persisted + WS `intake` envelope + survives `SessionStore.open`; gallery
  pick entry; new-brainstorm brief entry; `/api/discussions/:id` carries the log.
- `npm run build` + `npm test` green; journey added to `tests/journeys.md`.

### Phase 5 — docs (rule 12)
- wiki: protocol/bridge contract pages + user-guide (intake history stays in the
  chat; brief chip in the filmstrip); log.md lines; `.agents/learnings.md`.

## Status
- [x] Plan written
- [x] Phase 1 protocol (`IntakeLogEntrySchema`, `StudioState.intakeLog`, `{type:'intake'}`)
- [x] Phase 2 bridge/store (intake-log.json; recordBrief/recordConcierge/recordGalleryPick
      append+broadcast; held-brief flush on attachStore; /api/discussions/:id replay)
- [x] Phase 3 studio (IntakeHistory timeline block; landing requires empty intakeLog;
      panel is a timeline block; 🌱 brief chip first in the filmstrip; working shimmer;
      ✎ revise-this-brief prefill via rawBrief + survey ids)
- [x] Phase 4 tests (tests/intake-log.test.mjs ×5; human-sim step "answered intake STAYS
      in the chat"; journeys.md row 17; full `npm test` green incl. all 6 human sims)
- [x] Phase 5 docs (wiki: interaction-protocol, intake-methodologies, testing-observability,
      user-guide + log.md lines + wiki_reload; .agents/learnings.md entry; one librarian
      fabrication caught + corrected in the post-delegation literal audit)

## Adversarial review (2026-07-11, operator-requested fresh-eyes pass)

Nine parallel finder angles (line-scan, removed-behavior, cross-file, reuse,
simplification, efficiency, altitude, conventions, New-Discussion flow trace)
over the diff. Confirmed findings, all FIXED in the same cycle:

1. **useBridge reducer had no `default` case** — an unknown WS envelope type
   (newer bridge, older tab) returned `undefined` from the setState updater and
   blanked the whole app; the new `intake` envelope was the first to expose it.
   → `default: return prev`.
2. **Held-brief flush was production-dead code** — `attachStore` has zero
   production callers (tests only); a brief over a busy thread was held in
   memory forever (or leaked stale into an unrelated future thread). → hold
   deleted; a busy-thread brief travels with the command and the fresh
   brainstorm's own landing loop records it (logged honestly, proven in test).
3. **Corrupt intake-log entry destroyed the tail** — whole-loop catch truncated
   everything after a bad entry and the next whole-array rewrite made the loss
   permanent. → per-entry validation via a shared `loadJsonArray` (also fixes
   the same latent flaw in pending-replacements.json loading).
4. **Rule 5 violation** — IntakeBriefAnswer was declared three times (protocol,
   bridge zod, studio interface). → protocol schema (with transport caps) is
   now the single source; both consumers import it.
5. **Duplicate wayfinding-pulse targets** — panel open over a live board emitted
   two `data-guide="input"` composers; the pulse steered users to the wrong one.
   → board guide suppressed while `newOpen` (same treatment as revisit).
6. **Panel mounted off-screen** — opening New Discussion (or ✎ revise) from a
   long scrollback changed nothing in the viewport. → scroll-to-panel on open;
   and closing with Cancel no longer scroll-yanks to the bottom (newOpen read
   via ref, not an effect dep).
7. **Silent destruction of a live round** — sending a new brainstorm while a
   board awaited answers force-parked it, discarding half-set dials with no
   warning. → explicit confirm before dispatch.
8. **Blocking question invisible behind the open panel** — a concierge/gallery
   arriving while composing sat unseen at the bottom until timeout. → notice
   banner on the panel with a "Take me there" jump.
9. **Revise prefill dropped bespoke handoff answers** (picks keyed by ids not in
   the default question set were discarded) and lost the model pick; a second
   revise click was a no-op (content-derived React key). → the logged answers
   BECOME the panel's question set, the model restores via defaultModel, and a
   nonce keys the remount.
10. **Dishonest eternal shimmer** — "Claude is working on the next step…" was
    asserted from disk state with no liveness signal (rule 6). → honest copy
    ("waiting for the next step…"), single variant (the "Got your brief" bubble
    branch was reachable only in a sub-second race — removed).
11. Cleanups: `announceIntake` single wire point, shared `wsCollect` test
    helper, `jumpTo` scroll helper, full-content intake dedupe identity +
    index-stable React keys, derived `surfaceLive`/`threadStarted` predicates
    replacing the twin negation lists (the original bug's root shape).

Docs reconciled (user-guide revise wording, testing-observability test row,
journeys row 17); false "fresh brainstorm in a new thread" claim removed.

Ready for /plan-closeout (verify: full `npm test` green after the review fixes).
