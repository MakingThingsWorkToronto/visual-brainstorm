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
**Explode** (IMMEDIATE deterministic 5-prompt fan via `addChild(el, generateNewObj())`; each prompt anchored on node topic + optional note, topic shape `<topic> · <note> — <facet>` where facets are core/variation/bold-take/risk/next-step; these are PROMPT placeholders for orchestrator enrichment, not fabricated ideas), **+5 ideas** (real `mind.addChild()` immediate generation, hardened to pass parent element), **Note** (free-text steering folded into `editedTree`), **Delete** (uses `removeNodes([findEle(id)])` API; root protected; v5.13.0's `removeNode?.()` optional-chain was a no-op; fixed to the real method). Node ops are logged to `round-NN/tree-ops.jsonl` (append-only intent log); `TreeOpSchema` ({explode|delete|add|note|rename|move, nodeId, topic, note?, count?, at?}) and `BoardResponse.treeOps` carry the ordered decision trail. Feedback digest now surfaces mind-map decisions: "Mind-map edited", "EXPLODE … [note: …]", "DELETE", "ADD", "NOTE" lines. Proven end-to-end in a real browser by the human-sim.

**Model-legible + chat-iterable (SHIPPED 2026-07-09, `discussion/mindmap-model-legible-2026-07-09/`).**
The tree is persisted in a form the ORCHESTRATOR reads without parsing JSON: `apps/mcp/src/tree-outline.ts`
`treeToOutline(tree)` writes a TRAVERSABLE markdown outline to `round-NN/tree.md` on present, response, AND
draft (header = node/branch/depth counts; indented bullets = the hierarchy; each node carries its `id` +
`note`; `— thin` flags a branch the user opened but never grew), folded into `brainstorm.md` and the feedback
digest (the FULL outline, not just a count). `.claude/commands/read-mindmap.md` turns `tree.md` /
`edited-tree.json` / `draft.json` (live) / `tree-ops.jsonl` into the user's INTENTION, which ANCHORS the next
tree, every artifact-chat answer, and the plan-closeout build plan (the tree's top branches → phases, notes →
requirements, deletes → out-of-scope, thin → open questions); `brainstorm-phases` + `run-brainstorm` +
`plan-closeout` invoke it. The live mind-map draft (`editedTree`) now persists continuously (`round-NN/draft.json`
+ `tree.md` refresh) for recall. The `MindmapCanvas` has a **maximize** control → the unified `ArtifactFullscreen`
(SVG + chat right, exact same as an artifact): the user iteratively improves the map via artifact-chat on its
snapshot (the non-destructive detour keeps the live tree; the orchestrator reads the live `tree.md`/draft to
improve). Proven by `tests/mindmap-outline.test.mjs` + `scripts/human-sim-mindchat.mjs` (real browser).
