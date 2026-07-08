# Mind-map explode/delete + total decision persistence + decision-tree view

**Started:** 2026-07-07 · **Owner:** Matt / brainstorm-orchestrator lineage
**Slug:** `mindmap-explode-decision-tree-2026-07-07`

## The ask (verbatim intent)

1. On the mind map, add an **icon button per leaf (voice-button style)** to **explode brainstorm
   for this leaf** — expand it into options *relevant to that node*, reflecting the node's
   **topic + any notes** applied to it.
2. Add a **delete button** per node so it is eliminated.
3. Add a **"+" affordance** on a node set that creates **5 additional brainstorm nodes**.
4. **Persist all mind-map activity** (explode / delete / add / note / rename / move) to the plan.
5. **Review each round** so *all* decisions, notes, and feedback are persisted for later
   synthesis (audit the digest + `brainstorm.md` coverage — today `editedTree` is invisible to
   the digest).
6. **Persist all chains of thought** (the `thinking` stream) and artifacts to the plan folder.
7. Use **jsonl/json** where structure & decisions matter.
8. **Decision-tree view for every discussion** — a visual of the decision-making across rounds.
9. Get creative. **Test all human pathways.** Then `/run-brainstorm` to validate live.

### Design decisions (from Matt, 2026-07-07)

- **Explode = expand-in-place.** The leaf is marked as an explode target and sent with the
  response; the orchestrator returns **≥5 children relevant to that node**, reflecting the
  node's **topic + its notes**. Same living tree grows — no sub-thread spawning.
- **Notes are first-class per node** and *steer* the expansion: a note that materially changes
  a node's meaning must yield a *different* set of children on the next explode.
- **Validation matrix (canonical synthetic mind map):**
  - a. Explode a node → expansion to **≥5** child options.
  - b. Add a note that changes meaning → explode → a **different** set of children appears
    (proves the note reached the decision point).
  - c. Click the **"+"** on a node set → **5** additional brainstorm nodes are created.

## Contracts (rule 5 — protocol is SSOT)

`packages/protocol/src/index.ts`:
- `MindNode.note?: string` — per-node note that steers expansion. Added to `MindNodeSchema`.
- `TreeOpSchema` — one mind-map decision: `{ op: 'explode'|'delete'|'add'|'note'|'rename'|'move',
  nodeId, topic?, note?, count?, at }`. `explode` carries the node's topic + note so any model
  (incl. a delegated subagent) can regenerate relevantly.
- `BoardResponse.treeOps: TreeOp[]` (default `[]`) — the ordered mind-map decision log for the
  round. `editedTree` still carries the final shape (now including `note` per node).

## Persistence (rule 7 — nothing regenerated; jsonl/json for structure)

`apps/mcp/src/session-store.ts` + `bridge-server.ts`:
- `recordResponse` already writes `round-NN/response.json` (now carries `treeOps` + noted
  `editedTree`). Additionally append each op to `round-NN/tree-ops.jsonl`.
- **Thinking stream:** `SessionStore.recordThinking(note)` → append to `thinking.jsonl`; called
  from `Bridge.think()`. Chain-of-thought becomes durable + reloadable.
- **Digest gap (rule: all feedback synthesizable):** `feedback.ts` gains lines for `editedTree`
  (root, node delta, per-node notes) and every `treeOp` (EXPLODE "topic" [note] → generate ≥5
  relevant children; DELETE; ADD; NOTE). Today the digest is silent on mind-map edits.
- **Decision tree:** derived, written on each response to `decision-tree.json` +
  `decision-tree.svg` at thread root (a derived index, safe to overwrite).

## Decision-tree view (every discussion)

- `apps/mcp/src/decision-tree.ts`: `buildDecisionTree(rounds): DecisionTree` and
  `decisionTreeToSvg(tree)` (deterministic, XML-escaped — rule 8, mirrors `tree-svg.ts`).
  Root = title; each round a node (phase/kind); children = chosen ✓ / rejected / action
  (back·accept·finalize) / explode·delete ops / notes. Chosen path accent-highlighted.
- `GET /api/decision-tree/:id` builds from the reloaded thread (live + archived).
- Studio: a **"Decision tree"** toggle in `WayfinderStrip` overlays the timeline (mirrors the
  `fullscreen` axis in `App.tsx`; no view-enum refactor). Renders the SVG + a legend.

## Studio UI — mind-map node controls (`MindmapCanvas.tsx`)

mind-elixir renders nodes to the DOM and re-renders on edits. Approach: a **floating action bar
bound to the selected node** (subscribe to the `selectNode`/`operation` bus), positioned over the
canvas, with stable `data-testid`s:
- `node-explode` (voice-style icon button) — tags the node as an explode target, pushes a
  `treeOp{explode, nodeId, topic, note}`, lifts `editedTree`.
- `node-add` ("+") — `mind.addChild()` ×5 (5 seed children), pushes `treeOp{add, count:5}`.
- `node-delete` — `mind.removeNode()`, pushes `treeOp{delete}`.
- `node-note` — textarea → node note (kept in a React `nodeId→note` map, folded into `editedTree`
  and pushed as `treeOp{note}` so it steers the next explode).
Notes are folded into `editedTree` on send (walk tree, attach `node.note`) so they always ride back.

## Test matrix (rule 10 — real path only)

- **Unit** (`tests/tree-svg.test.mjs` / new `tests/decision-tree.test.mjs`): `buildDecisionTree`
  + `decisionTreeToSvg` well-formed, escaped, self-contained; chosen path marked.
- **Canonical** (`tests/canonical/boards/mindmap-synthetic.json`, `.../responses/*`): synthetic
  mind map + explode responses (with & without note → different children).
- **HTTP smoke** (`scripts/smoke.mjs`): POST synthetic mindmap board; POST response with
  `treeOps:[explode]` → assert `tree-ops.jsonl`, digest EXPLODE line, `decision-tree.{json,svg}`
  written; `thinking.jsonl` grows on `think()`.
- **human-sim** (`scripts/human-sim.mjs`) — the real engine, Matt's matrix:
  - explode a node → returned tree has ≥5 children under it;
  - add note (materially different) → explode → **different** child set (two fixtures keyed on
    note presence — harness stays dumb, rule 11);
  - click "+" → 5 children created (engine-sourced `mind.getData()` assertion).
- **ui-smoke** (`scripts/ui-smoke.ts`): static wrapper asserts the node action bar + decision-tree
  toggle render; **ui-break-sweep** includes the new controls.

## Docs (rule 2 / rule 12)

- `wiki/Product/board-modes.md` (mind-map explode/delete/notes), `wiki/Research/visualization-engines.md`
  (node ops + steering), a new decision-tree note, `wiki/user-guide.md` (+ diagram), one
  `wiki/log.md` line per edit. `.agents/learnings.md` for mind-elixir gotchas.

## Phases (progress log)

- [ ] **P1 — Contracts & persistence backend** (protocol, session-store, feedback digest,
  thinking.jsonl, tree-ops.jsonl) + build.
- [ ] **P2 — Decision-tree builder + endpoint** + unit tests + smoke extension. `npm test` green.
- [ ] **P3 — Studio UI**: MindmapCanvas node action bar (explode/add/delete/note) + Decision-tree
  view/toggle. `npm run build` green.
- [ ] **P4 — Human-pathway tests** (canonical fixtures + human-sim matrix + ui-smoke/break-sweep).
- [ ] **P5 — Docs + wiki + learnings.**
- [ ] **P6 — `/run-brainstorm` live validation** of explode/delete/+/notes/decision-tree.
- [ ] **P7 — `/plan-closeout`.**

## Progress
- 2026-07-07 — plan created; architecture mapped (MindmapCanvas, protocol, SessionStore,
  tree-svg, bridge endpoints, thinking is ephemeral, human-sim real-engine pattern).
