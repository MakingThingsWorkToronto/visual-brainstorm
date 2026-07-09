---
name: reading-scribbles
description: How to read an annotated-photo scribble seed (arrows, boxes, highlights, pen, text notes over a photo) as the user's INTENT, and anchor the brainstorm on it. Load before running /read-scribble or interpreting a scribble seed.
model: inherit
---

# Reading Scribbles — an annotated photo IS the brief

A scribble is the user thinking in pictures: they took a photo (a screenshot, a competitor, a
sketch, a real object) and drew ON it to say *this part, not that; bigger here; point at this;
this is what I mean*. The marks are the message. Your job is to recover that message faithfully
and make it the anchor for the whole brainstorm — never to admire the photo and ignore the marks.

## Read the two layers separately, then fuse them

- **The photo (background)** = the subject / reference. What is it? A UI, a logo, a room, a chart?
- **The mark layer** = the INTENT laid over it. Read it from `scribble.json` (structured truth)
  while looking at `composite.png` (where the marks actually sit). Fuse: each mark points into the
  photo — resolve WHAT it points at.

## The mark vocabulary (what each gesture means)

| Mark | Reads as | How to honor it |
|---|---|---|
| **arrow** | "point AT this" — the **head** is the referent | Make the arrow's target the focus of the idea |
| **box** | "this REGION / scope" | Treat what's inside as in-scope; outside as context |
| **highlighter** | "important — emphasize" (translucent) | Elevate what's under it |
| **pen** (freehand) | circle-around / underline / cross-out — read the shape | Circle = focus; line-through = REJECT |
| **note** (text card) | a **literal instruction** the user typed | Quote it; obey the words; it outranks inference |

## Rules of honest reading

- **Notes are law.** A note's text is an explicit instruction — weight it above everything you
  infer from shapes. Quote it verbatim; don't soften "make the logo bigger" into "consider scale."
- **Refer to marks by palette color NAME.** `scribble.json` carries each mark's `colorName` (from
  the generation palette). The user speaks in those names ("the ultraviolet arrow") — so do you.
- **A cross-out is a rejection.** A pen stroke through something (or a note like "no") means
  DON'T — the mind-map `delete` analogue. Never reintroduce a struck-through element.
- **Don't invent marks.** Only what's in `scribble.json` is real (rules 6, 7). If `composite.png`
  is missing, say so and reconstruct from the JSON over `photo.png` — don't guess pixels.
- **Coordinates are in `viewBox` space** (top-left origin, `viewBox.w × viewBox.h`); use them to
  say WHERE ("top-left", "over the header"), not to over-quantify.

## Anchor the brainstorm on it

Synthesize a tight **intention** (subject + per-mark asks + the through-line) and append it to
`brainstorm.md` as the `🖼 Scribble intent` block. Then:
- **Round 1** diverges FROM the marked intent (the arrow's target / the boxed region is the brief),
  not from the photo in general.
- **Every clarifying question** builds on it — don't re-ask what a note already answered.
- **Later rounds & `/plan-closeout`** carry it forward: notes become requirements, the boxed
  region becomes scope, a cross-out stays rejected.

## Quality checklist (before you present round 1)

- [ ] Did I VIEW `composite.png` (real vision), not just read the SVG as text?
- [ ] Did every `scribble.json` item get an interpretation (target / region / emphasis / instruction)?
- [ ] Are note texts quoted verbatim and treated as requirements?
- [ ] Did I refer to marks by palette color name?
- [ ] Is the `🖼 Scribble intent` block in `brainstorm.md`, and does round 1 build on it?

## Changelog
- 2026-07-09 — created (scribble model-legibility: the reading craft behind /read-scribble;
  per discussion/scribble-legibility-2026-07-09/plan.md)
