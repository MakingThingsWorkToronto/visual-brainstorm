# Vision

**Visual Brainstorm** is an SVG-based visual brainstorming tool that runs beside Claude Code.
Instead of replying with paragraphs, Claude replies with **pictures presented as a survey** —
like AskUserQuestion, but the answers are graphics you can select, annotate, remix, and steer.

## Lineage

- **Maps mashups, 2000s.** Small pieces loosely joined over open protocols. Here the pieces
  are: Claude Code (intelligence), an MCP server (glue), and a local React app (surface).
  Nothing is a platform; everything is a component another tool could reuse.
- **shadcn chat components (2026-06).** Composable chat primitives — MessageScroller, Message,
  Bubble, Marker, shimmer — that own behavior without owning your state. The studio's timeline
  is built in that image: rounds as messages, boards as bubbles, round breaks as markers.
- **AskUserQuestion.** The proof that structured surveys beat free-text for converging fast.
  Visual Brainstorm is AskUserQuestion with an unbounded answer space: SVG.

## The two polar use cases (both must stay first-class)

1. **Icon generation.** Clarify style/references/colors via AskUserQuestion → present an
   icon-grid board of divergent SVG candidates → user multi-selects, notes, remixes →
   iterate → accepted icons captured as artifacts with full lineage.
2. **System design.** Clarify requirements/inspiration via AskUserQuestion → present
   system-map / storyboard / matrix boards visualizing the architecture or product → same
   loop. The deliverable is a shared picture of the system, plus every intermediate picture.

Anything between the poles (logos, palettes, user flows, data models, slide sketches, garden
layouts) should fall out of the same 8 board kinds rather than needing new machinery.

## Principles

- **Every artifact is captured.** A brainstorm you can't replay didn't happen. Sessions are
  files in the user's repo, diffable and committable.
- **The human is the selection pressure.** Claude generates divergence; the user applies
  taste through selection, notes, remix pairs, and axis dials. Neither replaces the other.
- **Blocking is a feature.** `present_board` waits like a colleague at a whiteboard waits.
- **Open by construction.** MIT, plain protocols (MCP, WS, HTTP, SVG), no accounts, no cloud.
