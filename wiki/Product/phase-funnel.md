# The Phase Funnel — five psychological routes as interface mechanics (AUTHORITATIVE)

The studio is neither a chatbot nor a canvas clone: it is a **phase-shifting survey
instrument**. Every board carries `phase`; the studio physically re-architects per phase.
Claude chooses the phase per board using `.claude/skills/brainstorm-phases/SKILL.md`.

## Theory → mechanic map (as built)

### 1. Divergent-Convergent Funnel → `diverge` + `converge` + the PhaseBar
The PhaseBar renders the funnel itself (segments narrow toward converge). `diverge` is the
unconstrained sandbox: airy grid, no selection ceilings, fast spark notes. `converge` is the
threshold mechanic: generation is over, the **Triage Gate** demands a keep/kill/merge verdict
on EVERY option before the send buttons unlock — the viewport physically stops expansion and
forces distillation.

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
| diverge | selectedOptionIds, perOptionNotes, remixPairs, axisValues |
| mutate | mutations (lens ids per option) |
| wreck | flaws (→ fix candidates next round) |
| cluster | positions, clusters, gapNotes |
| converge | triage (keep → capture; kill → never again; merge → one synthesis) |

All phases: elaboration, axisValues (persistent taste calibration), model (delegate),
commands (run `.claude/commands/<command>.md` immediately).
