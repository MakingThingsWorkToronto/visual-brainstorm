# The Phase Funnel — six interface phases organized as five psychological routes (AUTHORITATIVE)

The studio is neither a chatbot nor a canvas clone: it is a **phase-shifting survey
instrument**. Every board carries `phase`; the studio physically re-architects per phase.
Claude chooses the phase per board using `.claude/skills/brainstorm-phases/SKILL.md`.

## Theory → mechanic map (as built)

### 1. Divergent-Convergent Funnel → `diverge` + `expand` + `converge` + the PhaseBar
The PhaseBar renders the funnel itself (segments narrow toward converge; tabs are clickable
— the user steers). `diverge` is the unconstrained sandbox: airy grid, no ceilings, fast
spark notes; selections REPLACE the pool with syntheses (the synthesis vector). `expand` is
the amplifier: select what resonates (gate: ≥1) and the pool GROWS with multiple new
syntheses — nothing is removed. `converge` is the threshold mechanic: generation is over,
the **Triage Gate** — a card GRID, not rows: each card holds the option preview, its
Keep/Kill/Merge/Final verdict buttons, AND a per-option note textarea (ships as
`perOptionNotes`) — demands a verdict on EVERY option before send unlocks,
and one keep can be crowned **Final** — the **Finalize & close out** button then captures
THE answer and automatically
triggers `/plan-closeout` (the thread archives to the Archive nav). Finality is a first-class
action, not a convention.

**Judge deck** (diverge + expand): a grid-ALTERNATIVE review mode — flick each option
keep/kill (`deckVerdicts`); keeps join `selectedOptionIds`, so the synthesis-vector law
holds unchanged. One adjacent-pair duel pass then refines `ranking` (duel picks land in
`duelResults`).

**Sudden death** (converge, inside the Triage Gate): with 2–4 keeps, a king-of-the-hill
bracket resolves pairwise duels (`duelResults`) and auto-crowns the winner into
`finalOptionId` — the finalize contract above then applies.

**Wayfinder strip**: orientation only — derives ENTIRELY from existing StudioState
(rounds + artifacts); deliberately NO new protocol shape. Its next-phase proposal is a pure
client heuristic (`apps/studio/src/lib/wayfinder.ts`, mirroring the brainstorm-phases
transition table) and is ADVISORY — the orchestrator still decides the phase. Enter in the
composer sends AND requests the proposed phase only when the gate is open and the user
touched something. Deviation from plan, kept deliberately: the strip did NOT absorb the
PhaseBar — the PhaseBar remains the steering control inside the survey; the strip is
orientation / keeps / next-phase.

### 2. Deconstruction-Mutation (SCAMPER) → `mutate` / Mutation Lab
The big picture is hidden on purpose: ONE option fills the stage (‹ › to move). Distortion
lenses — flip, invert, stretch, compress, tilt, x-ray — apply real transforms live. The user
marks lenses that "reveal something"; `response.mutations` tells Claude which distortion to
lean into when regenerating. Structural friction is the feature.

### 3. Emotional Catharsis / Saboteur → `wreck` / Wreck Yard
Low-stakes by design: cards render tilted and cheap, the copy says "nothing here is
precious", and the only interaction is red flaw scribbles. Destroying is easier than
perfecting — the gate requires ≥3 flaws before sending. De-escalation is Claude's job:
each flaw returns next round as a methodical fix candidate (plus one variant that embraces
the flaw as a feature).

### 4. Associative Proximity → `cluster` / Proximity Field
The user just DRAGS thumbnails on a dotted field — no tags, no labels, no forms. Distance IS
the data: clusters are inferred from proximity (union-find, 22%-field threshold) and ringed
in color. **Gap ghosts** (pulsing `?` nodes) appear in the blank space between cluster
centroids — click one to name "what lives here". `positions`, `clusters`, and `gapNotes`
train Claude on the user's implicit mental model; gap notes are the highest-value signal.

### 5. Split-Cognition → the Scaffold panel (inside `cluster`)
Dual-zone architecture: the field is the pure-intuition zone; the **Scaffold** panel beside
it auto-names clusters (shared tags), lists members, and collects gap notes — structure
accretes in the background without ever interrupting a drag.

## Response contract per phase

| phase | fields Claude must honor |
|---|---|
| diverge | selectedOptionIds (→ pool REPLACED by syntheses), perOptionNotes, remixPairs, axisValues; deck mode: deckVerdicts, duelResults, ranking (ranking leads the synthesis vector) |
| expand | selectedOptionIds (→ pool GROWS with syntheses; nothing removed); deck mode: deckVerdicts, duelResults, ranking |
| mutate | mutations (lens ids per option) |
| wreck | flaws (→ fix candidates next round) |
| cluster | positions, clusters, gapNotes |
| converge | triage (keep → capture; kill → never again; merge → one synthesis); sudden-death duelResults; action `finalize` + finalOptionId → capture THE one, then run plan-closeout |

All phases: elaboration, perOptionNotes (editable in the fullscreen preview — click any
option's SVG on any surface — when `survey.allowPerOptionNotes`), axisValues (persistent
taste calibration), questionAnswers (answers to Board.questions mid-round clarifiers, keyed
by qid), uncertainties (options flagged unsure — never a silent kill), optionAnnotations
(marks drawn on options in fullscreen Annotate mode — arrows/boxes/notes with palette color
names), remixNotes (recipes for remix pairs keyed "a×b" — attribute-level comparison),
model (delegate), attachments (composer files/photos + annotated-<optionId>.png composites,
persisted by the bridge to the thread's `attachments/` and pointed at by the digest —
`Requirements/interaction-protocol.md` §Attachments), paletteColors (the selected theme's
RESOLVED palette — selection is by theme, and on a live board it also sets the discussion
theme; the digest instructs ONLY-these-colors — same page, §Generation palettes), commands
(run `.claude/commands/<command>.md` immediately).
