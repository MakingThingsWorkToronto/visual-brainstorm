# Visualization Engines — evaluations

## mindmapcn (github.com/SSShooter/mindmapcn) — evaluated 2026-07-05, operator-flagged

React wrapper around **mind-elixir** (same author's mind-map engine). MIT, TypeScript,
Tailwind, shadcn-compatible, light/dark aware, zoom/pan, export, styling via tags/icons/
colors/links. Stack-aligned with our studio almost exactly.

**Fit:** strongest candidate for upgrading the `mindmap` board kind and the system-design
pole from "pick among static SVG options" to **co-editing one living structure**:

- Claude sends ONE mind-elixir JSON tree instead of N SVG options; the user edits/rearranges
  nodes directly (mind-elixir is fully editable); the edited tree returns in the response —
  the ultimate feedback packaging (the artifact IS the feedback).
- Export path gives us SVG capture for the artifact ledger (rule 7 preserved).
- Complements, not replaces, the Proximity Field: cluster infers structure from raggedly
  dragged options; a mind map is for when structure is already explicit.

**Risks:** renders live DOM (not a pure SVG string), so it needs a new board payload type
(`tree` alongside `options`) and a response field (`editedTree`) in the protocol; wraps a
second engine into the bundle; export fidelity to be verified.

**Verdict:** adopt as a phase-2 mechanic behind a new board kind payload — plan it as its
own `discussion/` session (protocol change → rule: update packages/protocol first).

**SHIPPED 2026-07-07** (`discussion/_completed/concierge-living-gallery-2026-07-07/`): mind-elixir
5.13.0 is the `mindmap` methodology — `Board.tree` (mind-elixir-compatible) + `BoardResponse.editedTree`
in `packages/protocol`, the live co-edited `MindmapCanvas` (dynamically imported inside the mount
effect so ui-smoke's esbuild never touches its `.less`), and a deterministic server-side
`apps/mcp/src/tree-svg.ts` snapshot for the rule-7 artifact ledger (the browser export path is not
relied on for capture). Per-node action bar binds to mind-elixir's `selectNode` monkey-patch:
**Explode** (deferred generation request, steered by node topic + optional note), **+5 ideas** (real
`mind.addChild()` immediate generation), **Note** (free-text steering folded into `editedTree`),
**Delete** (node + subtree). Node ops are logged to `round-NN/tree-ops.jsonl` (append-only intent
log); `TreeOpSchema` ({explode|delete|add|note|rename|move, nodeId, topic, note?, count?, at?})
and `BoardResponse.treeOps` carry the ordered decision trail. Feedback digest now surfaces mind-map
decisions: "Mind-map edited", "Node note on …", "EXPLODE … [note: …]", "DELETE", "ADD", "NOTE"
lines. Proven end-to-end in a real browser by the human-sim.
