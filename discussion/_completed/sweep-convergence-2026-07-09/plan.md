# Plan — Sweep-commit the shared working tree (multi-plan convergence)

**Slug:** sweep-convergence-2026-07-09
**Status:** closed — swept in commit `0dc483a` (2026-07-09): live tree verified green
(build, test:unit 217/217, smoke PASS), staged `git add -A` (106 files, no deletions,
index==worktree so the earlier snapshot-verify race is moot with all peer sessions ended),
committed with per-plan attribution, pushed FF to origin/main.
**Owner:** operator-authorized sweep ("commit and push it is ok if you sweep", 2026-07-09).

## Context

- `artifact-chat-everywhere-2026-07-09` is CLOSED: commit `515ffd4` (snapshot-verified in a
  fresh worktree: build, test:unit 189/189, smoke) pushed to origin/main. A peer closed
  `mindmap-model-legible` on top (`61ec0dd`).
- The operator then authorized sweeping the REMAINING working tree (other plans' pending
  work) into one commit and pushing.
- The tree is shared with LIVE peer sessions actively editing (photo-scribble, token-economy,
  handoff-fidelity, review-followups, mindmap-chat-hardening — see open `discussion/` folders).

## What already happened this session

1. First sweep attempt: build was red mid-peer-edit (`scribbleReadme` 3→4 args, then
   `feedback.ts` `remixNotes`/`positionNarrative` half-landed). Waited via background poll;
   build went green after ~5 min.
2. Staged `git add -A` (76 files incl. rename `.github/agentic-surface-map.json` →
   `agentic-surface-registry.json`, finished the crashed `copilot-slash-commands` archive
   move). Snapshot-verified the STAGED tree in a fresh worktree (write-tree → commit-tree →
   `git worktree add --detach`): build green, smoke PASS, test:ts 13/13, **but test:unit
   191/196 — 5 red**.
3. Root cause of the 5 red: peer plan `handoff-fidelity-2026-07-09` changed
   `askConcierge`/`presentGallery` to resolve RICH objects (`{answer,picked,typed}` /
   `{method,label,recommended,reason}`) but `tests/api-status-matrix.test.mjs` still asserts
   the old scalars (lines ~1023/1078/1119 + the ZERO-UNPROVEN coverage row). The LIVE tree
   fails these too — the peer's test updates have not landed yet. NOT ours to fix (their loop).
4. A background poll is running: `npm run build && npm run test:unit` every 45s, up to 25
   attempts. Session ending at ~93% context — next session may need to take over.

## Resume procedure (for whoever picks this up)

1. Poll/verify: `npm run build && npm run test:unit` (and ideally `npm run smoke`) must be
   GREEN on the live tree — if red, the handoff-fidelity peer hasn't converged; wait, don't fix.
2. `git add -A` (re-stage; the index currently holds a STALE pre-convergence sweep).
3. `git diff --cached --name-status` — confirm no surprise deletions.
4. Best practice (learnings 2026-07-09): snapshot-verify the staged tree in a worktree
   (`tree=$(git write-tree); c=$(git commit-tree $tree -p HEAD -m v); git worktree add <tmp>
   --detach $c; npm ci; build+unit+smoke`) — tree≠index races are real here.
5. Commit subject: `chore(sweep-convergence): commit shared-tree residue across concurrent
   plans` with a body attributing per-plan (photo-scribble annotation seeds, token-economy
   caveman/VALIDITY-SCAN/model-tiering, harness registry rename + prompt updates,
   handoff-fidelity concierge/gallery shapes, new plan folders, wiki/docs residue).
   `git push`. Non-FF likely (peers commit too): `git pull --rebase` then re-verify quickly.
6. Mark this plan closed and archive it (it needs no /plan-closeout learnings pass of its
   own beyond what `.agents/learnings.md` already carries from this session).

## Progress log
- 2026-07-09 — sweep authorized; first snapshot verify caught handoff-fidelity's
  runtime/test skew (5 unit tests red in BOTH snapshot and live tree); waiting on the peer
  loop via background poll; session at 93% context — persisted this plan and stopped.
- 2026-07-09 (later) — poll went GREEN (build + test:unit; peer fixed
  api-status-matrix + added intake-gate test; peers archived photo-scribble +
  scribble-legibility plans). Re-staged `git add -A` (82 files, no deletions). BUT
  `npm run smoke` is RED: `scripts/smoke.mjs` still asserts the old scalar
  `askConcierge` resolution ("askConcierge resolves with the posted answer") while the
  runtime resolves the rich object — handoff-fidelity's smoke update hasn't landed.
  NOT ours to fix. Session ended at context limit with the sweep STAGED but
  UNCOMMITTED. Resume at step 1 of the procedure above: wait for smoke green
  (poll `npm run build && npm run test:unit && npm run smoke`), re-`git add -A`,
  then steps 3-6 (snapshot-verify, commit, push, close this plan).
