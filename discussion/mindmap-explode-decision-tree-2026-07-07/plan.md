# Mind-map explode/delete + total decision persistence + decision-tree view

**Started:** 2026-07-07 · **Owner:** Matt / brainstorm-orchestrator lineage
**Slug:** `mindmap-explode-decision-tree-2026-07-07`
**Status:** REOPENED 2026-07-08 → FIXED 2026-07-09. Two real defects that real-use testing
surfaced are fixed & proven comprehensively on the real path (no fakes):
- **Explode was a no-op marker** → now IMMEDIATELY fans the node into 5 topic+note-anchored prompt
  children via the real engine (`addChild(el, generateNewObj())`); user witnesses ≥5, note-steered.
  The `explode` op still rides back so a live orchestrator ENRICHES each prompt.
- **Delete silently did nothing** — mind-elixir v5 has no `removeNode()`, so `mind.removeNode?.()`
  no-op'd. Fixed to `removeNodes([findEle(id)])` + root guard.
- **human-sim made comprehensive & non-faked:** the mind-map step now asserts, ALL from the live
  engine (`mind.getData()`), that +5 adds 5 real nodes, EXPLODE fans ≥5 note-steered children, and
  DELETE really removes a node (5→4). No fixture-orchestrator. Proven: `npm run test:human` 16 steps.

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

- [x] **P1 — Contracts & persistence backend** — MindNode.note, TreeOpSchema, BoardResponse.treeOps;
  tree-ops.jsonl + edited-tree.json + thinking.jsonl; digest EXPLODE/DELETE/ADD/NOTE + notes. Built.
- [x] **P2 — Decision-tree builder + endpoint** — decision-tree.ts (build + SVG), GET
  /api/decision-tree/:id, write on each response. Unit test (8) + smoke extension. **Green.**
- [x] **P3 — Studio UI** — MindmapCanvas node action bar (explode/+5/delete/note, notes folded
  into editedTree), DecisionTreeView overlay + WayfinderStrip 🌳 toggle. **Build green.**
- [x] **P4 — Human-pathway tests** — ui-smoke (node bar + toggle markers), **human-sim 16 steps
  live**: +5 creates 5 real nodes, note+explode ride back, decision-tree overlay opens. All green.
- [x] **P5 — Docs + wiki + learnings** — wiki-librarian updated board-modes, visualization-engines,
  system-architecture, user-guide (+ log.md); tests/journeys.md rows 5–6 (node controls, decision
  tree); .agents/learnings.md (mind-elixir selection binding + notes-out-of-band).
- [~] **P6 — `/run-brainstorm` live validation** — DECLINED by operator (skipped the live studio
  session). The real-path proof stands on `npm run test:human` (16 steps, live Chrome), which
  exercises +5 / note / explode / decision-tree end-to-end.
- [x] **P7 — `/plan-closeout`** — verify (build+smoke green) → learnings → commands improved
  (run-brainstorm step 4 + brainstorm-phases skill now interpret treeOps; .github inherits via
  its pointer) → wiki (P5) → archive → commit/push.

## Verification log
- unit: `npm run test:unit` → 145+ pass incl. 8 decision-tree tests.
- smoke: `node scripts/smoke.mjs` → PASS incl. mindmap node ops (tree-ops.jsonl, edited-tree.json
  note fold, digest EXPLODE/DELETE + steering note, decision-tree.json/svg, thinking.jsonl, endpoint).
- ui-smoke: `npm run smoke:ui` → PASS incl. node action bar (explode/add/note/delete testids) +
  decision-tree toggle.
- human-sim: `npm run test:human` → 16 steps PASS on real Chrome/CDP incl. the node-controls matrix.

## Progress
- 2026-07-07 — plan created; architecture mapped (MindmapCanvas, protocol, SessionStore,
  tree-svg, bridge endpoints, thinking is ephemeral, human-sim real-engine pattern).
