# Studio UX — faster, more human

Started 2026-07-06T23:39:37.229Z. Append-only text memory of every round — the re-synthesis source: what was shown, what the user did, and therefore what the next round must build on.


## Round 1 — diverge · storyboard

Round 1 · DIVERGE — eight storyboard concepts for making the studio simpler and faster for humans, two per territory: judging boards, moving through phases, taking outputs away, and starting sessions. Each tells a 3-beat story of a person actually using it. Judge the STORY: which of these would make you reach for the tool more often? Select the ones with energy, note what specifically clicks, remix pairs that belong together. Wildcards (sketch-a-seed, voice chips) are deliberately out there — kill them loudly if they miss.

### Options presented
- **Flick to judge** (`flick-triage`) — Options come one at a time, phone-card sized — flick right keeps, left kills; the whole pool is triaged in seconds from the couch. {board-review, speed, gesture}
- **Duel bracket** (`duel-ranking`) — Judging becomes pairwise duels — click the better of two, winners advance through a bracket, and a full ranking emerges from seven clicks with no dials. {board-review, ranking, game}
- **Filmstrip funnel** (`filmstrip-funnel`) — A persistent thumbnail strip of every round sits above the board — click any round to jump back, and the strip itself narrows visually toward the crowned winner. {flow, orientation, history}
- **Phase autopilot** (`phase-autopilot`) — The studio watches your judging and proposes the next phase as one big glowing button — pressing Enter advances the funnel; you never think about phase names. {flow, guidance, one-key}
- **Contact-sheet poster** (`contact-sheet`) — Crowning a final auto-composes a shareable poster — the winner large, its lineage tree beneath, the decisive notes alongside — so one artifact tells the whole journey in chat. {outputs, story, share}
- **Living shelf** (`artifact-shelf`) — Every kept option pins itself to a live shelf at the studio's edge; drag a card straight out into your editor or design tool — no export dialog exists. {outputs, drag, frictionless}
- **Sketch-a-seed** (`sketch-seed`) — Start a brainstorm by scribbling a blob instead of typing a brief — round 1 riffs on your sketch's shapes; zero keystrokes from doodle to board. (wildcard) {onboarding, drawing, wildcard}
- **Voice + chips kickoff** (`voice-chips`) — Hold space and ramble for fifteen seconds; clarifying questions come back as tappable chips, not text fields — the session is seeded before your coffee cools. (wildcard) {onboarding, voice, wildcard}

### User response (2026-07-07T00:04:53.617Z)
- Action: accept (round 1, phase diverge).
- Selected: Duel bracket, Filmstrip funnel, Phase autopilot, Contact-sheet poster, Living shelf, Sketch-a-seed, Voice + chips kickoff, Flick to judge.
- Elaboration: "All of these are brilliant"
- Note on "Sketch-a-seed": i like this we should also allow it to upload a photo to get started
- Model routing: delegate next-round generation to claude-fable-5.

## Round 2 — cluster · storyboard

Round 2 · CLUSTER — you kept all eight, so the pool is full and selections alone can't steer. Time for your hands to talk: drag concepts that belong together into groups. Distance IS data — the concepts you place side by side become one shippable direction, and the empty space between clusters tells me what hybrid to invent next. One change since round 1: per your note, Sketch-a-seed evolved into "Sketch or snap a seed" — a photo upload is now a first-class entry path alongside the scribble. Arrange, name clusters if you like, and drop a gap note for anything none of these eight covers.

### Options presented
- **Flick to judge** (`flick-triage`) — Options come one at a time, phone-card sized — flick right keeps, left kills; the whole pool is triaged in seconds from the couch. {board-review, speed, gesture}
- **Duel bracket** (`duel-ranking`) — Judging becomes pairwise duels — click the better of two, winners advance through a bracket, and a full ranking emerges from seven clicks with no dials. {board-review, ranking, game}
- **Filmstrip funnel** (`filmstrip-funnel`) — A persistent thumbnail strip of every round sits above the board — click any round to jump back, and the strip itself narrows visually toward the crowned winner. {flow, orientation, history}
- **Phase autopilot** (`phase-autopilot`) — The studio watches your judging and proposes the next phase as one big glowing button — pressing Enter advances the funnel; you never think about phase names. {flow, guidance, one-key}
- **Contact-sheet poster** (`contact-sheet`) — Crowning a final auto-composes a shareable poster — the winner large, its lineage tree beneath, the decisive notes alongside — so one artifact tells the whole journey in chat. {outputs, story, share}
- **Living shelf** (`artifact-shelf`) — Every kept option pins itself to a live shelf at the studio's edge; drag a card straight out into your editor or design tool — no export dialog exists. {outputs, drag, frictionless}
- **Sketch or snap a seed** (`sketch-snap-seed`) — Start a brainstorm from a scribble OR an uploaded photo — round 1 riffs on it with zero typing. [parents: sketch-seed] {onboarding, image, wildcard}
- **Voice + chips kickoff** (`voice-chips`) — Hold space and ramble for fifteen seconds; clarifying questions come back as tappable chips, not text fields — the session is seeded before your coffee cools. {onboarding, voice, wildcard}

### User response (2026-07-07T00:19:54.199Z)
- Action: iterate (round 2, phase cluster).
- Selected: none — read the dials/notes/phase fields for the actual signal.
- Elaboration: "The ideas are all good they need to be sequenced as noted, I am not sure we need the living shelf as it duplicates the filmstrip funnel please merge any living shelf concepts into filmstrip."
- Proximity clusters (the user's implicit taxonomy): cluster 1: [Flick to judge, Duel bracket]; cluster 2: [Filmstrip funnel, Phase autopilot, Living shelf]; cluster 3: [Contact-sheet poster]; cluster 4: [Sketch or snap a seed, Voice + chips kickoff].
- Gap between cluster 1 and 3: "cluster 1 is brainstorming cluster 3 is elimination" — generate the hybrid living there (highest-value signal).
- Gap between cluster 1 and 4: "onboarding before board-review then cluster 2 allows the human to navigate the brainstorm and contact-sheet allows the human to finalize the brainstorm" — generate the hybrid living there (highest-value signal).
- Model routing: delegate next-round generation to claude-fable-5.

## Round 3 — converge · storyboard

Round 3 · CONVERGE — your map became the product. Pool changes since round 2: Living shelf is gone as a standalone (merged into Wayfinder strip per your instruction — keeps now hang grabbable beneath the strip). Each of your four clusters was synthesized by meaning into one shippable concept, in your stated sequence: Open with anything (onboard) → Judge deck (review) → Wayfinder strip (navigate) → Sudden-death crowning (finalize — this one is the hybrid your gap note asked for, where brainstorming becomes elimination). The fifth option, The one-sitting journey, is all four beats as one end-to-end story. The gate is open: KEEP what ships, KILL what doesn't, MERGE what belongs together — or crown 🏁 a final if one of these IS the roadmap.

### Options presented
- **Judge deck** (`judge-deck`) — Flick-fast card triage that auto-deals a duel when two keeps are too close to call, building a live ranking as you go. [parents: flick-triage, duel-ranking] {judging, speed, ranking}
- **Wayfinder strip** (`wayfinder-strip`) — One strip along the studio's top edge IS the brainstorm — thumbnails narrow toward the winner, keeps hang grabbable beneath, and the right end is the glowing next-phase button. [parents: filmstrip-funnel, phase-autopilot, artifact-shelf] {navigation, orientation, one-key}
- **Sudden-death crowning** (`sudden-death`) — The final few keeps enter a short elimination bracket; the last card standing is auto-crowned and the shareable poster composes itself in the same motion. [parents: duel-ranking, contact-sheet] {finalize, elimination, share}
- **Open with anything** (`open-with-anything`) — One welcoming drop zone starts the session — scribble, dropped photo, or held-space voice — answered with tappable clarifier chips, then board 1 inside a minute. [parents: sketch-snap-seed, voice-chips] {onboarding, zero-typing}
- **The one-sitting journey** (`one-sitting-journey`) — The whole product as one story — drop anything to open, flick-judge with a duel, steer by the wayfinder strip, and end crowned and shared, all in one sitting. [parents: open-with-anything, judge-deck, wayfinder-strip, sudden-death] {journey, end-to-end, story}

### User response (2026-07-07T00:30:00.949Z)
- Action: accept (round 3, phase converge).
- Selected: Judge deck, Wayfinder strip, Sudden-death crowning, Open with anything, The one-sitting journey.
- Elaboration: "all of these ship. generate a plan to build all of these now."
- Triage KEEP (capture as artifacts): Judge deck, Wayfinder strip, Sudden-death crowning, Open with anything, The one-sitting journey.
- Model routing: delegate next-round generation to claude-fable-5.
