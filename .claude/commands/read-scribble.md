---
model: inherit
---

# /read-scribble — read an annotated-photo scribble off disk and turn it into user INTENTION

A scribble is the user marking up a photo (or a blank canvas) — arrows, boxes, highlights, pen,
and text notes over an image. It is INPUT (their intent), captured with provenance (rule 7), and
it ANCHORS the brainstorm: round 1, every clarification, and the build plan all build on it. Run
this the MOMENT a scribble seed is submitted (the `new-brainstorm` digest/seedNote points at a
`.seeds/seed-<stamp>/` folder), BEFORE the pre-phrase and round 1. Read what is ON DISK — the
composite the user actually saw — never infer marks you did not read (rules 6, 7).

## Inputs (all in the seed folder `<discussionRoot>/.seeds/seed-<stamp>/`, model-legible by design)

- **`composite.png`** — the photo WITH the user's marks, exactly as they saw it. **VIEW this
  FIRST** (Read gives you real vision on a PNG; an SVG read as text does NOT render). If it is
  absent (render failed), VIEW `photo.png` and reconstruct the marks from `scribble.json`.
- **`scribble.json`** — the STRUCTURED, traversable mark list: `viewBox`, `background.present`,
  the `palette` (names + values), and `items[]` — each `{ type, colorName, colorValue, coords,
  text? }`. This disambiguates what the composite only shows (which palette color, which gesture,
  the exact note text). Traverse it as the source of truth for the marks.
- **`README.md`** — the folder's own how-to-read summary + a one-line-per-mark list.
- `photo.png` — the clean background (subject detail); `scribble.svg` — the editable composite.

## Procedure

1. **Locate the folder.** The seedNote / `new-brainstorm` digest names it (`saved at <folder>`).
   For an archived thread, `load_discussion` first.
2. **VIEW `composite.png`** (vision) — take in the photo's subject AND where the marks sit on it.
3. **Read `scribble.json`** and map each item to what it SINGLES OUT on the photo:
   - **arrow** → points AT a target (the head end is the referent).
   - **box** → scopes/emphasizes a REGION (what's inside matters).
   - **highlighter** → marks-important (a translucent emphasis stroke).
   - **pen** → freehand — usually a circle-around, underline, or cross-out (read the gesture).
   - **note** → a LITERAL instruction the user typed — weight the WORDS highest; obey them.
   - Refer to each mark by its **palette color NAME** (the user speaks in those names).
4. **Synthesize the INTENTION** — a short structured statement, NOT a raw dump: the photo's
   subject, what each mark asks for (target/region/emphasis/instruction), and the through-line
   (what the user actually wants made). Delegate the read+synthesis to a subagent to keep
   orchestrator context free — it returns just this statement.
5. **Load the craft:** `.claude/skills/reading-scribbles/SKILL.md` (how to read marks honestly).
6. **Anchor everything on it.** Append an `🖼 Scribble intent` block to the thread's
   `brainstorm.md` (the re-synthesis source): the subject, the marks-as-intent, and the notes
   verbatim. Round 1's board rationale, the AskUserQuestion clarifications, every later round, and
   `/plan-closeout`'s build plan all reference it. The scribble is the seed the whole session grows
   from — treat a note's text as a requirement, an arrow's target as the focus, a box as scope.

## Rules

- Read on disk; never fabricate a mark (rules 6, 7). `scribble.json` is authoritative for WHAT the
  marks are; `composite.png` is authoritative for WHERE they sit.
- Note text is a literal instruction — quote it, don't paraphrase away its ask.
- A scribble is INPUT, not an artifact: it is NOT captured, NOT chat-answered — it seeds and anchors.
- Keep the output tight: an intention statement + the subject/targets/regions/notes, not a JSON dump.

## Changelog
- 2026-07-09 — created (scribble model-legibility: composite.png + scribble.json + this reader
  anchor the brainstorm; per discussion/scribble-legibility-2026-07-09/plan.md)
