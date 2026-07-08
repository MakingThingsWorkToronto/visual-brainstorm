# Visual Brainstorm — User Guide

Brainstorm with Claude in pictures instead of paragraphs. Claude presents SVG options as an
interactive survey in your browser; you select, annotate, remix, and steer; every round and
artifact is cached to your repo forever.

![The collaboration loop](images/loop.svg)

## 1. Setup

```sh
npm install
npm run build
npm test          # 23 unit tests + integration smoke + UI render smoke — all must pass
```

**Connect Claude Code (the real engine).** In this repo, `.mcp.json` auto-loads the MCP
server — just start `claude` here. For any other project:

```sh
claude mcp add visual-brainstorm -- node C:/Code/svgbrainstorm/apps/mcp/dist/index.js
```

Tip: raise the tool timeout so boards can wait for humans: `MCP_TOOL_TIMEOUT=1800000`.

**Preview without Claude:** `npm run preview [phase]` serves static fixture boards for
looking at the UI — it has no generator and says so in the interface.

## 2. Starting a brainstorm, step by step

1. **Open a terminal in the project you want artifacts saved to.** In this repo the MCP
   server auto-loads via `.mcp.json`; in any other project register it first (see §1).
2. **Start Claude Code:** `claude`
3. **Check the connection (first time):** type `/mcp` — `visual-brainstorm` should be listed
   as connected. If it isn't, the register step didn't take; re-run it and restart `claude`.
4. **Say what you want, prefixed however feels natural:**
   - *"brainstorm: app icons for a note-taking tool — warm, hand-drawn, must read at 16px"*
   - *"let's visually brainstorm the architecture for our search feature"*
   - or invoke the procedure directly: `/run-brainstorm`

   A **bare `/run-brainstorm`** (no topic) skips the terminal interrogation: the studio
   opens directly on the **New Discussion** panel (via the `open_studio` tool) and Claude
   waits for whatever you submit there. If you already described the purpose to Claude in
   step 4, the brief box is **pre-filled** and you refine instead of retyping.
5. **Your browser opens automatically** at the studio (default `http://127.0.0.1:5199`) on
   the **New Discussion** panel. If no tab appears, the URL is in Claude's message.

**The intake journey — three stages that seed your brainstorm:**

![The intake journey](images/intake-journey.svg)

6. **Stage 1: Enter your brief.** The New Discussion panel collects your idea (see "New
   Discussion — open with anything" below for the full panel description). Refine the brief
   and click **Send & iterate** when ready.

7. **Stage 2: Concierge asks clarifying questions.** Claude moves to the **ConciergeIntake**
   surface and asks ONE question at a time — domain-tailored to your idea (audience,
   constraints, what "good" looks like, scope, liveness). Each question has tappable
   suggestion chips plus a free-text box. Answer and send; Claude asks the next. This loop
   runs as many rounds as it takes (not a fixed count; comprehensiveness pays off). Every
   answer lives in your thread's memory so Claude can weave them in.

8. **Stage 3: Pick a method.** Claude presents the **Living Gallery** — a set of method
   cards (Mind map, Funnel, Wreck, Cluster), each seeded with a tiny live SVG grown from
   your brief and answers. ONE card is highlighted with a **"Recommended"** ribbon and a
   reason chip quoting your answers (Claude's suggestion, not a mandate). Click any card to
   start that methodology.

9. **What happens next depends on your pick:**
   - **Mind map:** The studio opens a live co-edited **mind-elixir canvas**. Double-click any
     node to rename it, press Tab to add a child, drag to rearrange. As you edit, the tree
     updates live; your final structure returns to Claude as your brainstorm "response"
     (structure IS the response). The canvas stays open as long as you need to refine it.
   - **Funnel, Wreck, or Cluster:** The brainstorm continues into the standard funnel:
     diverge, expand, mutate, wreck, cluster, converge. You'll select options, move dials,
     add notes, and steer each round exactly as in a regular brainstorm (see §3).

10. **Finish** with **Accept** (capture the keepers) or **Finalize & close out** (crown THE
    one — this also runs plan closeout and archives the thread), or **Park** (in the
    composer's More Tools menu) to pause. If a target repo is set (the **Target Folder**
    button in the composer), Claude asks at closeout exactly where inside it the final
    artifacts should go and COPIES them there — the originals stay archived in the thread.

**Resume later:** in a new Claude session say *"resume brainstorm \<thread-id\>"* — the id is
shown in the studio's left nav (e.g. `2026-07-06-1902-visualize-5-…`). The whole history
reloads from the cache; nothing is regenerated.

**New Discussion — open with anything.** The button sits directly under the app title at
the top of the left nav; clicking it swaps the main timeline for the full brainstorm-intake
**chat panel**. An empty live session (no rounds, no active board) lands on this panel
automatically — it is also where a bare `/run-brainstorm` puts you. This is **Stage 1 of
the intake** (see above). Every intake box is a **collapsible card** (same shell, caret
toggle). Top to bottom:
- a Claude-side intro bubble (with the honest no-generator note on the preview harness);
- five **chip-group cards** — making (icons / a logo / a ui flow / a palette / a system
  map / new feature / comparison), vibe (calm / playful / bold / minimal / neon / formal /
  professional), range (stay close to convention / go wild), audience (just me / my team /
  customers / kids / executives), constraints (works tiny / monochrome-safe / high
  contrast / print friendly / square format) — each with an **other** chip that opens a
  free-text field whose value joins the brief;
- a **Colors** card: each theme carries a curated named 5-color palette; click a theme's
  NAME to make its whole palette the generation palette (click again to clear; leave empty
  for free choice); click any swatch to edit that color and its name, or **+** to add one;
- a full-width **Scribble a seed** pad that fills the remaining space (sketches are saved
  under `discussion/.seeds/` and Claude reads the file as part of the brief); photos and
  files now arrive via the composer's **+** menu, not a drop zone;
- a **composer** with full board-composer parity: **Mic** · **Cancel** (hidden when the
  panel is the landing surface) · **Send & iterate** · **Target Folder** · **+** (Attach
  file, Take a photo, Model for generation). Attachments show as removable chips; the brief
  box grows with its content, capped at 30% of the viewport, then scrolls internally.

**Send & iterate** is enabled by a prompt OR a sketch OR an attachment, and starts the
intake journey when the Claude engine is attached. You can also dictate the brief (the mic
button is honestly disabled where the browser has no speech recognition). Chosen model and
colors travel with the brief.

**The one-sitting journey** the studio is built around:

![The one-sitting journey](images/journey.svg)

## 3. The studio, control by control

![Studio anatomy](images/studio-anatomy.svg)

**Left nav** — the app's home base. At the top, the **brand block**: the lightbulb icon,
the "Visual Brainstorm" title, the session subtitle with its connection dot, and the **New
Discussion** button. Below that, every cached thread; click to reopen read-only. **Archive**
holds threads finished by plan closeout or finalize. Pinned to the nav's bottom: the
**Logs** button (bottom-left, live bridge logs) and the **theme picker** (bottom-right) —
picking a theme also binds it to the live discussion, so every discussion keeps its own
look (an archived thread reopens in ITS theme; without a discussion theme your local pick
applies, then the config default). On
small screens the nav is hidden behind a floating hamburger button at the top-left; command
status messages appear as a toast at the bottom-right.

**Intake surfaces** (New Discussion, ConciergeIntake, LivingGallery) — the three-stage
intake that seeds every brainstorm. **New Discussion** collects your brief (§2, Stage 1).
**ConciergeIntake** presents Claude's clarifying questions one at a time with tappable
suggestion chips and free-text input (§2, Stage 2). **LivingGallery** displays the method
cards — each with a live SVG preview of how that method would approach your brief — and
you pick one to start (§2, Stage 3).

**Mind map canvas** — when you pick Mind map in the Living Gallery, the studio opens a
live co-edited **mind-elixir canvas** instead of the phase funnel. Double-click any node to
rename, Tab to add a child, drag to rearrange. Your tree edits are the "response" that
returns to Claude (structure IS the feedback).

**Phase tabs** (Diverge · Expand · Mutate · Wreck · Cluster · Converge) — the funnel,
left-aligned liquid-chrome tabs sized to their labels, attached flush to the full-width
guide bubble beneath them. Claude picks a phase per round, but the tabs are CLICKABLE:
switch the mechanic instantly and your choice becomes the requested phase for the next
round. Each tab's guide bubble shows "how to work this surface" in numbered plain-language
steps. (These are used when you pick Funnel, Wreck, or Cluster in the Living Gallery, or
when you start a brainstorm that bypasses the intake.)

![The phase funnel](images/funnel.svg)

In short:

| Tab | You do | Next round |
|---|---|---|
| Diverge | select what has legs; remix pairs; notes | pure syntheses of your picks — rejected options never return |
| Expand | select what resonates (≥1) | pool GROWS with new syntheses; nothing removed |
| Mutate | view one option through distortion lenses; mark what "reveals something" | that distortion is leaned into |
| Wreck | write ≥3 flaws — brutal beats polite | each flaw returns as a fix candidate |
| Cluster | drag similar options together; click the pulsing ? gaps and name them | gap notes spawn hybrids; clusters teach Claude your taxonomy |
| Converge | every option is a card: its **Keep / Kill / Merge / Final** verdict buttons and a "why this verdict" note box sit right on it — verdict everything, crown ONE with **Final**, or let **Sudden death** duel 2–4 keeps down to an auto-crown | keeps are captured; kills are forever; **Finalize & close out** ends the brainstorm, composes the **decision poster** (winner + lineage + the notes that decided it, shareable as one SVG), and runs plan closeout |

**Judge deck** (toggle next to the grid in Diverge/Expand) — review the pool one card at
a time: **→ keeps, ← kills** (arrow keys work). When every card is judged, close calls are
dealt as head-to-head **duels** and a live ranking builds. The ranking, every flick, and
every duel reach Claude as preference data — top ranks lead the next round's synthesis.

**Wayfinder strip** (above the timeline) — one strip is the whole brainstorm: every round as
a clickable thumbnail (narrowing toward the winner; click = jump back), your **keeps hanging
beneath — drag one straight into your editor to export it, no export dialog, or click it to
open the artifact chat** — and a glowing **next-phase pill** at the right end. Once you've
judged, **Enter** sends and requests that phase; the composer shows "Enter sends & asks
for …" when it's armed.

**Artifact chat** — click any captured artifact (a keep on the wayfinder strip) to enlarge
it fullscreen with a dock on the right: a **Notes** panel on top — jot anything, **Save
notes** stores it with the artifact, and your notes stay in view even while Claude is
composing an answer — above the chat. The chat composer is deliberately simple:
one box, one **Send** — ask a question about the artifact or ask for a change in plain
words. Answers come from Claude (subagent-powered, so the main brainstorm keeps moving).
When Claude makes a change, it is **captured as a NEW version — the original artifact is
never overwritten** — and the open view switches to the revision (marked with a `revised`
badge; the strip picks it up too, since every capture lands there). The whole dialog is
saved with the thread, so reopening the artifact later shows the conversation that shaped
it. Artifacts in archived threads stay read-only — the saved conversation replays, but
there is no chat composer.

**Session activity strip** (in the live timeline) — while Claude works, real progress
events from the working session stream into the studio and persist with the thread: the
strip shows the latest event's note (it also replaces the shimmer's canned "drawing new
candidates…" line), with a count badge; click to expand the full recent list — each entry
timestamped, tagged with its source (orchestrator, agent, or hook), and, when known, its
token cost. Every thread also carries a **token meter**: all tokens reported for that
discussion — orchestrator and subagents alike, captured deterministically from session
transcripts — accumulate and persist with the thread. The running total shows as a
`Σ … tok` badge on the activity strip (there even before the first live event arrives), as
a per-thread `… tok` badge in the sidebar, and on an archived thread's banner as its `Σ`
total.

**Every gesture counts** — this is the core contract:
- **Dials** (min 5 per board, tailored to your topic): moving a dial and sending — with
  nothing else — is a complete instruction; the next round is visibly re-tuned. Moved dials
  show a ● and "steers next round".
- **Click any option's SVG** — on every phase surface, and on round-history thumbnails (on
  the cluster field, a click without a drag) — to open it full screen with wheel zoom, drag
  pan, and pinch on mobile — built for dense system diagrams. The preview also shows the
  option's tags and, on the live board, an editable **note** in a panel docked right of the
  artwork that ships with your response. On a **previous round's** option the note you sent
  with that round shows read-only, with a **chat** beneath it — ask about an earlier choice
  or request a change in plain words (answers persist with the thread; a change is captured
  as a new artifact). In archived threads those conversations replay read-only.
  (On the diverge/expand grid, select cards via the label/checkbox row — the image itself is
  the zoom affordance.)
- **Mic** (the first button in the composer row, a flat two-color microphone icon): dictate
  your reply — the transcript lands in the box, visible and editable; disabled honestly
  where the browser has no speech recognition.
- **Attachments**: **Attach file** / **Take a photo** (More Tools menu) add any file or a
  camera shot; they show as removable chips under the reply box, ship with your response,
  and are saved into the thread's `attachments/` folder for Claude to read. **Take a photo**
  asks for camera permission, shows a live preview, and snaps a PNG — with an honest error
  and a file-picker fallback when the camera is denied or absent.
- **Colors** (More Tools menu on boards; inline card on the New Discussion panel): each
  theme carries a curated named 5-color palette (a dark anchor, the accent, a supporting
  mid, a contrast pop, a grounding neutral — drop-in themes without one get a derived
  fallback). Click a theme's NAME to make its whole palette the generation palette — the
  next round's SVGs use ONLY those colors, and on a live board the pick also sets the
  discussion's theme, so the studio skin and the artifacts travel together (click again to
  clear). Click any **swatch** to change that color or rename it, or **+** to add a named
  color — edits are saved as a drop-in theme JSON, so your color names persist and you can
  refer to them by name in conversation.
- **model** picker (in the composer's **More Tools** menu): the next round's generation is
  delegated to the model you choose.
- **Back**: this round didn't work — re-present the previous board (bypasses all gates).
- **⟲ return to this round** (hover any past round's separator in the timeline; always
  visible on touch): reopens that round's answers exactly as you sent them — change
  anything and **Send & iterate** to rewind the brainstorm to that round. Later rounds stay
  visible as history (nothing is erased); Claude rebuilds the funnel from your new steering.
- **Send & iterate / Accept**: continue, or capture and wrap up; **Park** (More Tools menu)
  pauses (the thread stays resumable).

**Composer button row** (beneath the reply box on the active board): **Mic** (voice input)
· **Back** · **Send & iterate** · **Accept** · **Target Folder** (folder icon; any plain
folder — set for
this thread or as the default; artifacts are copied there, and Claude reads that repo's wiki
for context) · **Finalize & close out** (appears in Converge once a Final is marked) · the
**+** button (**More Tools**), a pop-out menu holding **Attach file**, **Take a photo**,
**Colors** (the palette picker), the model picker, **Park**, **Discover skills** (match or
web-discover craft, ingested as repo skills), and **Plan closeout** (harvest learnings,
improve the repo's commands, archive the thread). **New Discussion** (start from your own
prompt or seed; needs the Claude engine), **Logs**, and the **theme picker** live in the
left nav (see **Left nav** above).

## 4. Where everything is saved

Each thread: `discussion/<stamp>-<slug>/` — `brainstorm.md` (readable text memory of
every round + response), `round-NN/` (board JSON + every SVG + your response),
`attachments/` (files/photos you attached in the composer), `artifacts/` (accepted SVGs
with provenance). Committable; nothing is ever regenerated.

## 5. Configuration

`visual-brainstorm.config.json` in your project root: `targetRepo` (default target folder —
artifacts also copied to its `brainstorm-artifacts/`; override per thread with the composer's
**Target Folder** button), `stylesDir` (drop-in theme JSONs — see `styles/sunset.json`; a
theme JSON may include an optional `palette` of named colors for the Colors picker, and
palette edits made in the studio are saved back to this folder — an edited built-in is
shadowed by its saved copy), `theme` (the default; each discussion can carry its own),
`models`, `defaultModel`, `discussionDir`. Themes are also switchable visually via the
picker at the bottom-right of the left nav.

## 6. When something looks broken

1. `curl http://127.0.0.1:5199/api/health` — who owns the port? (pid, session, engine)
2. The **Logs** button (bottom-left of the nav) or `GET /api/logs` or
   `discussion/.logs/*.log` — pid-tagged event trail.
3. Most common cause: a stale instance holding 5199 while yours fell back to another port —
   the startup output prints the REAL URL; trust it.
4. Full procedure: `.claude/commands/diagnose-studio.md`, or ask Claude to use the
   **devops-diagnostician** agent.
