# Plan — Studio journey UX: open → judge → navigate → crown

**Status:** closed 2026-07-06

**Origin:** brainstorm thread `2026-07-06-1939-studio-ux-faster-more-human` (3 rounds:
diverge → cluster → converge). All five round-3 keeps captured as artifacts in that thread's
`artifacts/` dir. The user's cluster arrangement WAS the roadmap: positions read left-to-right
as the journey — onboarding (x≈13) → judging (x≈39) → navigating (x≈55) → finalizing (x≈84).

**North star (the one-sitting journey):** a human goes from a blank page to a shared,
crowned winner in one sitting — start with a scribble/photo/voice ramble, flick-judge the
pool, steer by one strip, and end with a poster in chat. Zero typing required end to end.

**Decisions locked by the brainstorm:**
- Living shelf is DEAD as a standalone surface — its drag-out-with-no-export-dialog idea
  lives inside the Wayfinder strip (user's explicit merge instruction, round 2).
- Sudden-death crowning is the bridge between judging and finalizing (user's gap note:
  "cluster 1 is brainstorming, cluster 3 is elimination").
- Build order = the journey order below (user: "they need to be sequenced as noted").

---

## Milestone 1 — Open with anything (onboarding)

*The story: Matt has a half-formed idea. He drags a photo onto the studio (or scribbles a
blob, or holds space and rambles). Chips come back — he taps three. Board 1 appears before
his coffee cools.*

- **Protocol** (`packages/protocol/src/index.ts`): new `SeedIntake` shape — one of
  `{ kind: 'sketch', svgPaths }` | `{ kind: 'image', dataUri, mime }` | `{ kind: 'voice',
  transcript }`, plus `ClarifierChips` (question + tappable options) as a bridge message.
  Both consumers import; nothing redeclared (rule 5).
- **Studio** (`apps/studio/src`): new `components/OpenSurface.tsx` — one drop zone that
  accepts pointer-drawn strokes (record as SVG paths), a dropped image file, or Web Speech
  API dictation while space is held. Unsupported mic ⇒ honest "voice unavailable here"
  state, never a fake transcript (rule 6). Chips render as tap targets; taps compose the
  structured seed answer.
- **MCP/bridge** (`apps/mcp`): extend the ✚ New Brainstorm path so the seed payload
  (sketch SVG / image file saved into the thread dir / transcript) reaches the tool result
  digest for the driving model; chips flow back over the existing WS bridge. Uploaded
  images are seeds, never board options — options stay pure vector SVG.
- **Tests:** unit (SeedIntake schema round-trip), smoke (seed payload persists in
  session.json + thread dir), ui-smoke (drop a fixture image → chips render → tap → seed
  submitted).
- **Docs:** user-guide "Starting a brainstorm" section + diagram; wiki Product page for
  seed intake contract.

## Milestone 2 — Judge deck (board review)

*The story: eight options arrive. Instead of studying a grid, Matt flicks: keep, kill,
keep… The deck pauses — "too close to call" — and deals two cards face to face. He taps the
better one. A ranked stack builds on the right. The whole pool is judged in a minute.*

- **Protocol:** extend `BoardResponse` with `deckVerdicts: { optionId: 'keep'|'kill' }`,
  `duelResults: [{ pair: [a, b], winner }]`, and derived `ranking: optionId[]`.
- **Studio:** new `components/phases/JudgeDeck.tsx` — card-stack surface (one option large,
  count badge), flick/arrow-key gestures, auto-duel when two keeps need ordering (insertion
  by duel = the ranking mechanic), ranked stack rail. Offered as the review mode for
  diverge/expand boards; the classic grid remains available via toggle.
- **Driving-model contract:** ranking is taste signal — top-ranked selections define the
  synthesis vector; duels give pairwise preferences (update `.claude/skills/brainstorm-phases`
  with how to interpret `ranking`/`duelResults`).
- **Tests:** unit (ranking derivation from duel results is consistent/transitive-enough),
  ui-smoke (flick 4 fixture options → one duel → response carries verdicts + ranking).
- **Docs:** user-guide judging section rewrite + storyboard diagram.

## Milestone 3 — Wayfinder strip (navigation; absorbs Living shelf)

*The story: three rounds in, Matt glances up. One strip shows the whole brainstorm — round
thumbnails narrowing left to right, his keeps hanging beneath it. He drags a keep straight
into his editor. The strip's right end glows "next: converge". He presses Enter.*

- **Protocol:** `ThreadTimeline` shape (rounds with thumbnail option refs + phase), and a
  `phaseProposal` field ("pool full → cluster", derived from pool size / heuristics in the
  skill) carried on each board.
- **Studio:** new `components/WayfinderStrip.tsx` replacing/absorbing `PhaseBar.tsx` —
  round thumbnails (click = view that round read-only; responding to an old round is the
  `back` action), keeps pinned beneath (native HTML drag-out with `DownloadURL`/File so a
  drop in an editor or file manager lands the .svg — the shelf merge, no export dialog),
  right-end next-phase button with Enter as the accelerator.
- **MCP:** serve timeline from session persistence; keeps already exist as artifacts —
  expose them to the strip.
- **Tests:** unit (timeline builds from session.json fixtures), smoke (timeline endpoint),
  ui-smoke (strip renders rounds, Enter fires the proposed phase response).
- **Docs:** user-guide navigation section + diagram; wiki phase-funnel page gains the
  proposal heuristics.

## Milestone 4 — Sudden-death crowning + poster (finalize & share)

*The story: three keeps left. The studio deals them into a mini bracket — two quick duels.
The last card standing takes the crown, and before Matt reaches for anything, a poster has
composed itself: the winner large, its family tree beneath, the notes that decided it. He
drops it in the team channel. Everyone sees not just the winner but the journey.*

- **Protocol:** `finalize` already exists (`finalOptionId`); add `bracket` (duel sequence)
  and a `Poster` artifact shape (winner + lineage + notes refs).
- **Studio:** extend `components/phases/TriageGate.tsx` — when keeps ≤ 4, offer
  "sudden death": deal bracket, duel UI reused from Milestone 2, winner auto-crowned
  (fills `finalOptionId`).
- **MCP:** poster composer — pure-SVG contact sheet assembled from captured artifacts +
  brainstorm.md lineage (vector only, sanitized inputs, rule 8); saved via
  `capture_artifact` with provenance; copied to targetRepo when configured. Finalize still
  triggers `/plan-closeout` (finality IS the closeout trigger).
- **Tests:** unit (poster composition from fixture lineage), smoke (finalize → poster
  artifact exists), ui-smoke (bracket → crown → poster on shelf/strip).
- **Docs:** user-guide finale section + diagram; wiki artifact/poster contract.

## Cross-cutting

- **Order:** M1 → M2 → M3 → M4; each milestone ships WITH its tests (rule 10) and its
  user-guide/wiki updates (rule 12); `/build-check` green before each is called done.
- **Acceptance for the whole plan = the one-sitting journey:** a scripted ui-smoke run
  that goes seed-drop → judge-deck → strip-Enter → sudden-death → poster, no typing.
- **Path drift to reconcile (rule 1):** CLAUDE.md now says `discussion/` and
  `wiki/user-guide.md`, but code/runtime still write `.docs/discussion/` and the guide
  lives at `.docs/user-guide.md`. Reconcile (move dirs + update config/store paths, or
  revert the doc) as step 0 of M1 — do not let it drift silently.
- **Close:** via `/plan-closeout` only — harvest learnings, improve the two skills and
  `run-brainstorm.md` with what the thread taught, archive to `_completed/`.

## Status

- [x] M0 path reconcile (CLAUDE.md ↔ runtime dirs) — `discussion/` at root, guide at
      `wiki/user-guide.md`; this session's thread + this plan migrated; stale diagram
      labels fixed by the wiki librarian
- [x] M1 Open with anything — SeedIntake protocol union; OpenSurface (scribble / photo
      drop / 🎙 dictation with honest no-support fallback / clarifier chips); bridge
      persists non-text seeds to `discussion/.seeds/` and the digest points at the file
- [x] M2 Judge deck — deckVerdicts/duelResults/ranking in BoardResponse; JudgeDeck surface
      (flick + adjacent-pair duels + live ranking) as a grid toggle in diverge/expand;
      keeps join the synthesis vector; brainstorm-phases skill teaches the interpretation
- [x] M3 Wayfinder strip — derives from existing StudioState (deliberately no new protocol
      shape); round thumbs narrow toward the winner; keeps drag straight out via
      GET /api/artifact-svg (no export dialog); advisory phase proposal + Enter
      accelerator. Deviation: PhaseBar NOT absorbed — it remains the in-survey steering
      control (recorded in wiki/Product/phase-funnel.md)
- [x] M4 Sudden-death crowning + poster — ⚔ king-of-the-hill bracket in TriageGate
      (2–4 keeps, auto-crowns finalOptionId); compose_poster MCP tool (deterministic
      winner + lineage + notes SVG, rule-7 capture, targetRepo copy)
- [x] Verification — build clean; 46/46 unit tests; integration smoke (incl. seed intake
      + artifact serving); ui-smoke renders all six phase surfaces plus the four new
      surfaces and the deck/wayfinder pure helpers. Docs shipped with the change:
      user-guide (journey diagram + all four features), wiki (interaction-protocol,
      system-architecture, phase-funnel), both skills, run-brainstorm command

Ready for /plan-closeout after human sign-off in the studio.
