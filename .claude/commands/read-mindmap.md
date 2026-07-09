# /read-mindmap — read a mind map off disk and turn it into user INTENTION

The mind map is a methodology whose artifact IS the feedback (rule 7). This command turns the
persisted tree into a structured understanding of what the human MEANS — the anchor for the
next round, every artifact-chat answer, and the build plan. Run it BEFORE generating a next
mindmap tree, when answering a mind-map artifact-chat, and at plan-closeout for a mindmap
thread. Read what is ON DISK — never infer a tree you did not read (rule 7).

## Inputs (all in `<thread dir>/round-NN/`, model-legible by design)

- **`tree.md`** — the TRAVERSABLE markdown outline (read this FIRST; it is the fast legible
  form). Header line = node/branch/depth counts; indented bullets = the hierarchy; each node
  carries its `id` and its `note`; a `— thin` flag marks a branch the user opened but never
  grew. It reflects the LATEST tree (presented → live draft → submitted).
- **`edited-tree.json`** — the exact submitted structure (traverse when you need ids/shape
  precisely). `draft.json` (`.editedTree`) is the LIVE in-progress tree if the user is mid-edit.
- **`tree-ops.jsonl`** — the ordered DECISION LOG (append-only): the intent behind the shape.
- `tree.json` — the originally presented tree (for diffing what the user changed).
- `brainstorm.md` — the thread's running memory (the tree outline is folded in per round).

## Procedure

1. **Locate the mindmap round.** `session_status` lists each round + its live `draft`; a chat/
   seedNote names the board. For an archived thread, `load_discussion` first.
2. **Read `tree.md`** (or `edited-tree.json` for a live/precise read). If a `draft.json` with an
   `editedTree` exists, prefer it — that is the tree the user is actually looking at.
3. **Traverse it as intent:**
   - **root** = the subject; **top branches** = the dimensions the user is organizing around;
     **depth/leaves** = the detail they care about.
   - **node notes** = EXPLICIT steering — weight these highest; they say what a topic must mean.
   - **`— thin` branches** = gaps the user opened but did not grow — where they want help / the
     highest-value place to propose next.
4. **Read `tree-ops.jsonl` as the decision log:** `explode` = "expand here (into ≥5 relevant to
   topic+note)"; `add` = "seeded blanks — help fill"; `delete` = "REJECTED — never reintroduce
   this branch"; `note` = steering; `rename`/`move` = structural intent. Order matters — later
   ops supersede earlier.
5. **Synthesize the INTENTION** (a short structured statement, NOT the raw tree): what they're
   building, the structure they imposed, the steering notes, the directions they killed, and the
   thin gaps. Delegate the read+synthesis to a subagent when you want to keep orchestrator
   context free — it returns just this statement.
6. **Anchor everything on it:** the next tree GROWS from this structure (reshape thin/exploded
   nodes, honor notes, never reintroduce deletes); every artifact-chat answer references it; the
   plan-closeout build plan is organized by the tree's top branches with the notes as
   requirements. When the user SUBMITS a mindmap round, this intention is the digest you build on.

## Rules
- Read on disk; never fabricate a tree (rules 6, 7). The submitted `edited-tree.json` is
  authoritative for what was answered; `draft.json` is the live pre-submit tree.
- A `delete` op is permanent intent — a reintroduced branch is a bug.
- Keep the output tight: an intention statement + the branch/notes/kills/gaps, not a JSON dump.

## Changelog
- 2026-07-09 — created (mind-map model-legibility: tree.md outline + this reader anchor
  conversation + plan; per discussion/mindmap-model-legible-2026-07-09/plan.md)
