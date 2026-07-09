# Plan — Mind-map review: harden the chat-iteration loop end to end

**Slug:** mindmap-chat-hardening-2026-07-09
**Status:** closed

## Operator ask (2026-07-09)

> Code review the mind map functionality, look for implementation gaps, validate the full
> screen option exists and artifact chat is enabled (may have been lost in the previous
> chat). Assume nothing works — make improvements to code, tests, user guide, wiki, and any
> related agentic commands.

## Review verdict (evidence, not claims)

CONFIRMED WORKING (real run + code read):
- Maximize control EXISTS: `MindmapCanvas` `data-testid="mindmap-maximize"`, shown once the
  snapshot artifact exists; snapshot is auto-captured inside `SessionStore.recordBoard`
  (never orchestrator-dependent). Maximize flushes the live draft then opens
  `openArtifactChat(mindmapArtifact)` → the unified `ArtifactFullscreen` (SVG + chat right).
- Artifact chat ENABLED: fullscreen chat `onSend` is always interactive; revision replies
  swap the viewer image (`revisedSlug`). PROOF: `scripts/human-sim-mindchat.mjs` PASS 4/4
  (real msedge over CDP) during this review; unit 194/194 green.
- Persistence chain: present → `tree.json` + `tree.md` + snapshot artifact; submit →
  `response.json` + `tree-ops.jsonl` (append-only) + `edited-tree.json` + `tree.md` refresh;
  draft → `draft.json` + `tree.md` refresh ("Live tree" heading).
- `/read-mindmap` exists, matches the on-disk contract, wired into brainstorm-phases,
  run-brainstorm step 4, plan-closeout step 7.

GAPS FOUND:
1. **`.claude/commands/artifact-chat.md` has NO mind-map branch** — a chat on the mindmap
   snapshot follows the generic procedure: subagent reads the STALE snapshot SVG (presented
   shape, not the user's current edits) and a change request routes to `svg-artisan` to
   redraw an SVG — the WRONG revision channel for a tree (the improvement loop is: read the
   live tree, present an improved TREE).
2. **No mindmap-aware chat hint** — the fullscreen chat `emptyHint` is undefined for
   artifacts; the user isn't told Claude reads their CURRENT tree (latest edits included)
   and can present an improved map. Also the honest-stale-snapshot cue lives only in the
   artifact notes.
3. **Flush-on-maximize is untested** — human-sim-mindchat never EDITS the tree before
   maximizing, so the "draft flushed → tree.md says Live tree with the new node" loop
   (what the orchestrator actually reads mid-chat) is unproven.
4. **Wiki gap (rule 1)** — the mind-map persistence contract (tree.md / draft.json /
   tree-ops.jsonl / auto-captured snapshot / maximize→chat) exists only as `wiki/log.md`
   entries, not on an authoritative page (`Requirements/interaction-protocol.md`).
5. Noted, no change (scope rule 9): a REVISITED past mindmap round has no maximize — its
   snapshot is reachable from the artifact shelf/wayfinder, same viewer + chat.

## Changes

1. `artifact-chat.md`: mind-map branch — identify the snapshot (provenance boardId +
   optionIds []), run `/read-mindmap` FIRST (prefer `draft.json` live tree), answer
   questions from the CURRENT tree; an improvement request presents an IMPROVED TREE
   (reply, then `present_board` a new mindmap board grown from the live tree) — never an
   svg-artisan SVG redraw.
2. `App.tsx`: mindmap-aware `emptyHint` on the fullscreen chat when the open artifact is
   the live board's mindmap snapshot.
3. `human-sim-mindchat.mjs`: new step — real engine edit (container.mind addChild) →
   maximize → assert `draft.json.editedTree` carries the new node and `tree.md` refreshed
   to "Live tree" containing it.
4. Wiki: interaction-protocol mind-map persistence contract subsection (+ log + reload);
   user-guide line if the "Claude reads your latest edits" promise is missing.

## Verification
- `npm run build`; `npm run test:unit`; `node scripts/human-sim-mindchat.mjs` (now 5 steps).

## Progress log
- 2026-07-09 — review complete (verdict above); plan written.
- 2026-07-09 — IMPLEMENTED: artifact-chat.md mind-map branch (+changelog); App.tsx
  mindmap-aware emptyHint; human-sim-mindchat extended (real engine addChild → maximize
  flush → draft.json + tree.md "Live tree" assertions + the new hint asserted in-page);
  wiki-librarian added "Mind-map persistence (model-legible contract)" to
  Requirements/interaction-protocol.md + user-guide sentence + log lines + wiki_reload.
- 2026-07-09 — verification WAITING on a peer: a live session added four BoardResponse
  fields (remixNotes/questionAnswers/uncertainties/optionAnnotations) to protocol at 16:27
  without yet updating BoardSurvey.buildResponse — studio typecheck transiently red on
  THEIR wave (attributed, not raced; watcher polls for green).
- 2026-07-09 — VERIFIED (this plan's surfaces): full `npm run build` green;
  `tests/mindmap-outline.test.mjs` 0 fail; `human-sim-mindchat` **PASS 5/5** — the new step
  proves a REAL mind-elixir addChild edit, maximize flushing the LIVE tree to draft.json +
  tree.md ("Live tree" heading with the edit), the mindmap-aware chat hint in-page, and chat
  persistence with the board staying live. `api-status-matrix` concierge/gallery 200-paths +
  smoke are transiently red on the SAME peer wave (bridge-server.ts written 16:38, their
  intake lane — attributed, not this plan's surface; their loop re-verifies before commit).
- 2026-07-09 — SESSION STOPPED at operator request (session limit). RESUME STATE:
  - ALL implementation + docs DONE and verified on this plan's surfaces (see above):
    artifact-chat.md mind-map branch (+changelog), App.tsx mindmap-aware emptyHint,
    human-sim-mindchat 5-step (PASS), wiki Requirements/interaction-protocol.md
    "Mind-map persistence (model-legible contract)" + user-guide sentence + log lines +
    wiki_reload, learnings entry "a NEW artifact KIND must be routed in every command
    that handles artifacts generically" (top of .agents/learnings.md).
  - NOT YET COMMITTED: a peer session's 76-file mega-commit (their intake/protocol wave)
    is STAGED and includes this plan's files as riders; HEAD is still 61ec0dd. My newer
    worktree deltas on top of their staged snapshots: the learnings entry, this plan.md's
    verification/progress log, and any peer App.tsx churn.
  - TO RESUME: wait for the peer commit to land (or confirm their session is dead), then
    `npm run build` + `npm test` (their concierge/gallery lane must be green again),
    mark this plan `**Status:** closed`, move the folder to `discussion/_completed/`,
    `git commit --only` the residue (this plan folder + any of the files above whose
    diffs did not ride the peer commit — check `git diff --cached --name-status` FIRST,
    per plan-closeout step 10), push. No code work remains.
- 2026-07-09 (resume) — peer wave LANDED (0dc483a sweep-convergence rider-committed this
  plan's implementation + docs; HEAD e638600 at resume). Full `npm run build` green.
  `npm test` chain green through boardchat; mindchat step 3 flaked ONCE under three
  concurrent sessions ("no engine instance on the container") — root cause: MindElixir is
  a lazy chunk, the container renders before `.mind` lands, and the step sampled once.
  HARDENED: step 3 now waits for the instance (`waitInPage` on `.mind`, 15s). Re-runs
  PASS 5/5 twice (pre- and post-hardening). Learnings entry added (lazy-engine wait +
  PIPESTATUS false-green). Plan closed, archived to `_completed/`.
