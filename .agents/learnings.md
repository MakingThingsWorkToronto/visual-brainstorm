# Agentic Learnings (newest first)

## 2026-07-08 — mind-elixir v5 API: it's `removeNodes([Topic])`, NOT `removeNode()` — the optional-chain hid a dead feature

- **`mind.removeNode?.()` silently did NOTHING** because mind-elixir 5.13.0 has no `removeNode`
  method at all — the delete method is `removeNodes(tpcs: Topic[])` (plural, takes an ARRAY of
  Topic elements). The optional chain `?.()` swallowed the missing method, so the Delete button
  appeared wired but was a no-op — and every green test missed it because none actually asserted a
  node was gone. Correct call: `mind.removeNodes([mind.findEle(id)])`, and guard the root
  (`mind.nodeData.id === id`) since mind-elixir won't remove it. **Lesson: optional-chaining a
  third-party method you're not 100% sure exists converts "typo/renamed-API" bugs into silent
  no-ops — verify the method name against the installed version's `.d.ts` first.** For adding
  children with a chosen topic: `const n = mind.generateNewObj(); n.topic = '…'; mind.addChild(el, n)`.
- **CDP mouse-clicks don't reliably select mind-elixir nodes** (it renders on a transformed/scaled
  canvas, so the element's viewport-rect center often isn't the hit target). Driving the engine's
  real `selectNode(mind.findEle(id))` is the honest harness pattern (it's the same method a human
  click invokes internally) — the ACTIONS stay real button-clicks and assertions read the real
  `getData()`, so nothing is faked. Also: gate a selection wait on the SPECIFIC node's topic showing
  in the action bar, never just "bar enabled" — a prior step's selection makes "enabled" false-pass.
- **Explode is now an immediate, deterministic expansion, not a deferred marker.** Clicking Explode
  fans the node into 5 topic+note-anchored PROMPT children (`<topic> · <note> — <facet>`) via the
  real engine, so the user witnesses ≥5 options instantly and a different note yields a different
  set — no model, no fake. The `explode` op still rides back so a live orchestrator ENRICHES each
  prompt into a real idea (reshape the placeholder), rather than generating from nothing.

## 2026-07-09 — studio liquid-chrome effects: global CSS over Tailwind, animated conic borders, aurora z-order, transient-UI screenshots

- **A global surface treatment over Tailwind utilities must set ONLY `background-image`, never
  `box-shadow`.** Tailwind's `shadow`/`shadow-md` set `box-shadow` via `--tw-shadow`; a plain
  `.bg-surface { box-shadow: … }` rule (same single-class specificity, later in source) silently
  clobbers those — e.g. the Send & iterate button loses its drop shadow. `background-image` layers
  over `background-color` on the SAME element (different property, no conflict), so the chrome
  gloss composes with every existing shadow. This is how you skin "all surfaces" with one rule
  and zero per-component edits.
- **Animating a conic-gradient's angle REQUIRES a registered `@property`.** You cannot animate
  `conic-gradient(from Xdeg, …)` in a keyframe directly. Register `@property --chrome-angle {
  syntax:"<angle>"; inherits:false; initial-value:0deg }`, drive it with `@keyframes { to {
  --chrome-angle:360deg } }`, and reference `from var(--chrome-angle)`. One registered angle +
  the `padding + mask (linear-gradient content-box, linear-gradient) + mask-composite:exclude`
  ring technique gives you a "star spinning around the border" for any element (nav edge glow AND
  the send-prompt reveal share it).
- **A `position:fixed; z-index:0` background paints OVER static siblings.** Positioned/z-indexed
  siblings need explicit `relative z-10`, but the real trap is a responsively-static element:
  App.tsx's nav wrapper is `fixed inset-0 … lg:static`, and on `lg` the static nav was painted
  under the fixed aurora. Fix: `lg:relative lg:z-10` (mobile stays `fixed z-30`). Aurora itself
  must be `pointer-events:none` so it never eats clicks.
- **Screenshot a transient in-flight UI state by PAUSING its request over CDP, not by racing it.**
  The "sending…" prompt reveal only exists during the `/api/respond` round-trip (~ms on
  localhost). `Fetch.enable({patterns:[{urlPattern:'*/api/respond*',requestStage:'Request'}]})` +
  capturing `Fetch.requestPaused` holds the request open so the real app renders the real state
  under a real (paused) request; screenshot, then `Fetch.continueRequest`. Honest proof, nothing
  faked (rule 10). Reusable for any optimistic/pending UI.
- **The effects are theme-driven by construction** — aurora, nav glow, chrome gloss, and the spin
  border all read `--accent`/`--surface(-2)` via `color-mix`, so a new theme re-skins them for
  free, and every animation is gated behind `@media (prefers-reduced-motion: reduce)`.

## 2026-07-08 — porting the donor wiki-mcp: ESM/SDK rewrite + dependency-free + granular read

- **The donor `apps/wiki-mcp` (`C:\Code\tp`) is CommonJS + a hand-rolled JSON-RPC stdio loop +
  `fuse.js`/`express`/`helmet`/`cors`.** This repo is ESM/NodeNext and already depends on
  `@modelcontextprotocol/sdk`, so the faithful port is a REWRITE, not a copy: `McpServer` +
  `StdioServerTransport` (matching `apps/mcp`), a dependency-free relevance scorer (title-weighted
  term coverage, content frequency saturating at 3), and stdio-only (no HTTP mirror — the client
  is Claude Code). Fewer deps than the donor, same tools.
- **A new workspace under `apps/*` must be `npm install`-linked BEFORE `tsc`** — adding the dir +
  package.json isn't enough; the build script (`-w apps/wiki-mcp`) and any `tests/*.mjs` importing
  its `dist/` fail until `npm install` registers the workspace. Sequence: write package.json →
  `npm install` → build → test.
- **`WIKI_PATH` resolves module-relative, not cwd-relative.** MCP servers launch with cwd = the
  invoking project, so cwd is unreliable for finding THIS repo's `wiki/`. Resolve from the module:
  `path.resolve(dirname(fileURLToPath(import.meta.url)), '..','..','..','wiki')` (three `..` from
  `apps/wiki-mcp/dist/`), env `WIKI_PATH` overrides. ESM has no `__dirname`.
- **Context-shaping is the whole point of a read MCP.** Two levers: (1) SEARCH returns one bounded
  ~200-char snippet + metadata per hit, never page bodies, default limit 8 / max 25; (2) GRANULAR
  READ — `wiki_outline` (heading tree only) → `wiki_read(path, heading)` returns ONLY that
  heading's subsection (proven: 1467 chars vs a ~4KB full page), and a full read over the char cap
  truncates WITH the outline attached so the caller can pull one heading. Prove the stdio path with
  a scratchpad JSON-RPC probe (initialize → tools/list → tools/call), not just unit-testing the
  pure functions.

## 2026-07-07 — mind-elixir: a per-node action bar must bind to the engine's OWN selection, not the bus

- **`mind-elixir`'s `selectNode(el)` called PROGRAMMATICALLY does NOT fire the `selectNode` bus
  event, and does not reliably fire it on click either across versions.** A React action bar that
  enables itself when a node is "selected" will therefore never light up if it only listens to
  `bus.addListener('selectNode', …)`. This bit the human-sim node-controls step: the test did
  `mind.selectNode(mind.findEle('c1'))` and the bar stayed disabled → 15s timeout.
- **How to apply:** derive selection from the engine's own state, three ways belt-and-suspenders:
  (1) monkey-patch `instance.selectNode` to run a `readSelection()` on a `setTimeout(…, 0)` after
  the original (covers programmatic selection, incl. test drivers); (2) add a real `click` listener
  on the engine container that re-reads selection a tick later (covers human clicks); (3) keep the
  `selectNode`/`selectNodes` bus listeners as a bonus. `readSelection()` reads
  `mind.currentNode ?? mind.currentNodes?.[0]`, then the data via `el.nodeObj ?? el`. The human-sim
  driver's real CDP mouse `click` on `…mindmap-engine.mind.findEle(id)` then flows through path (2).
- **Node notes must live OUT-OF-BAND and be folded into `editedTree` on emit.** mind-elixir does not
  round-trip arbitrary custom fields through `getData()`, so a per-node note kept only on the engine
  node can vanish. Keep notes in a `Record<nodeId,string>` ref and walk+attach them onto the tree in
  the `onEdit` emitter, so the note always rides back even when no structural edit fired.

## 2026-07-07 — shared-state schema widening: normalize legacy bridge/test callers at the boundary, not at every callsite

- **When a protocol/config field widens from a scalar to a structured object, older bridge callers in `tests/` and `scripts/` will keep constructing the old shape long after the main app path is updated.** In this slice, `models: string[]` became a structured catalog and `runtime` became explicit metadata. The least-destructive rollout was to normalize legacy strings and missing runtime metadata at the `Bridge` boundary, while keeping the studio's `EMPTY` state seeded for version skew. That let `/api/state` and `hello` become authoritative immediately without forcing every smoke/human-sim helper to learn the new shape in the same edit.
- **How to apply:** for a provider-aware schema change, update `packages/protocol` first, then add compatibility normalizers at the first shared boundary (`config.ts`, `BridgeOptions`, `useBridge` defaults) before touching all test helpers. After that, update only the explicit assertions/canonical fixtures that care about the emitted shape. This keeps the rollout local, preserves older harness callers, and avoids a repo-wide edit burst for a single contract change.

## 2026-07-07 — shared-tree commit trap: a plain `git commit` grabs another session's STAGED changes

- **In a shared working tree, `git add <my-files>` then `git commit` will ALSO commit whatever a
  concurrent session left STAGED — most dangerously staged DELETIONS (`D ` in column 1 of
  `git status --short`).** I staged my two clean files and committed; the commit swept in a peer's
  staged `ArtifactChat.tsx`/`PreviewModal.tsx` deletions (their ArtifactFullscreen refactor),
  contaminating my commit AND breaking HEAD (the old committed `App.tsx` still imported the now-
  deleted files). `git status` working-tree view hides this — you must inspect the INDEX. Rule:
  before committing in a shared tree, run `git diff --cached --name-status` and confirm ONLY your
  paths are staged; if foreign changes are staged, either `git restore --staged .` first then
  re-add only yours, or use `git commit --only <exact paths>` (which ignores the rest of the index).
  Recovery from a contaminated commit: `git reset --soft HEAD~1` → `git restore --staged .` →
  re-add only your files → recommit.
- **The entangled-shared-file "leave it to ride their commit" pattern works in practice.** My
  one-line `App.tsx` scroll-fade hunk (entangled with a peer's big in-flight refactor of that file)
  and my `ui-smoke.ts` marker change were both unblocked when the peer's closeout committed those
  files — the scroll-fade hunk landed inside their `eedece9` closeout (verified via
  `git grep <hunk> HEAD -- App.tsx`), and ui-smoke.ts became clean-editable once they committed it.
  In a hot tree, origin/main advances between your own pushes; each `git push` just fast-forwards
  your stacked commit — check the `A..B` range to see what a peer landed in between.

## 2026-07-07 — the preview/fixture harness was a false-confidence second path — deleted; real pathways only

- **A fixture "preview" harness that renders the studio's surfaces without a real session is a
  trap, not a safety net.** `apps/mcp/src/preview.ts` (`npm run preview`/`demo`, `engine:'preview'`)
  played both ends with static fixtures, so a surface could look "verified in preview" while the
  REAL agentic path (a live Claude session calling `open_studio`/`ask_concierge`/`present_gallery`/
  `present_board`) was never exercised. The operator's rule: "if it only works in preview the app
  is a brick." We deleted the harness AND its sole reason to exist — the `StudioState.engine`
  `'claude'|'preview'` discriminator (protocol + bridge + studio + all harnesses + canonical
  `state-200.json`). Sessions are now always the real Claude engine; the `enginePreview` "no
  generator" banner in `NewDiscussionPanel` went with it.
- **How to apply:** never add a fixture player as a proof surface. UI/behaviour is proven by the
  REAL pathways ONLY — `npm run test:human` (real `Bridge`, real built studio dist, real browser
  over CDP), `npm run test:human:sweep`, `npm run smoke` (real transport), or a live Claude session
  for eyeballing. When you catch yourself building a second, generator-less path "just to see the
  UI," stop — drive the real one. The `engine` field's deletion is the pattern: a discriminator
  whose only values are "real" and "fake" means the fake path shouldn't exist ([[rule 6 no-fake-success]]).
- **Verification gotcha (confirmed live):** removing a shared protocol field touches ~15 files —
  the field's producers (bridge `state()`, studio `EMPTY`), every in-test `Bridge` construction,
  and canonical bodies (`state-200.json`) — plus the `NewDiscussionPanel` prop threaded through
  `App.tsx` + `ui-smoke`. Grep the field name across `apps/packages/scripts/tests` and strip the
  property lines with a one-liner; then `node -e JSON.parse` the canonical JSON so a dangling comma
  doesn't slip through. Product "preview" UI (`SvgPane`, `ArtifactFullscreen`, option/artifact
  previews) is unrelated — do NOT touch it when deleting the preview HARNESS.

## 2026-07-07 — leaked headless browsers = silent token/time drain when iterating human-sim

- **A subagent that re-runs the CDP human-sim many times (iterating on test authoring)
  accumulates leaked headless `msedge`/`chrome` processes that compound into a large token
  AND wall-clock burn** — not a hang, but it *looks* like "consuming tokens with no results":
  each launch that times out on contention retries, and a 5-minute job stretches to 40+ min /
  300k+ tokens. Root cause: `killProfileStragglers` (`scripts/lib/cdp.mjs`) sweeps only the
  CURRENT run's profile path, so headless browsers from PRIOR runs (each with its own
  `vibr-*`/Temp `--user-data-dir`) survive and pile up (see the ui-break-sweep entry below for
  the orphaned-child mechanism).
- **How to apply:** when an agent will run `test:human`/`test:human:archived`/`test:human:sweep`
  repeatedly, sweep ALL leaked headless browsers between runs, not just the current profile's.
  Targeted census (never kill the user's normal browser — headless is only ever the harness):
  `Get-CimInstance Win32_Process | ? { $_.Name -match 'chrome|msedge' -and $_.CommandLine -match '--headless' -and $_.CommandLine -match 'vibr|Temp' }`
  then `Stop-Process -Force` (kill the whole tree; renderer/GPU children outlive the root on
  Windows). A single `npm test` from a clean process table is fine — the drain is from *looped*
  runs. This manual all-headless sweep is safe ONLY for a single agent that owns the machine.
- **Do NOT auto-kill every `vibr-*` browser at harness startup** — the harnesses are documented
  concurrency-safe (per-run `mkdtemp` profiles + ephemeral ports; `wiki/System/testing-observability.md`),
  and a blanket sweep would murder a *concurrent* session's `npm test` browser. The leak is
  because the per-run cleanup (`killBrowserTree` + `killProfileStragglers(profileDir)`) sits in a
  `finally` that a SIGINT/SIGTERM/SIGKILL of the node process skips — exactly what an agent
  restarting runs mid-iteration triggers. The concurrency-safe durable fix is to register that
  SAME per-run cleanup (its OWN `profileDir` only) on `SIGINT`/`SIGTERM` before exit; SIGKILL
  still can't be caught, so the manual sweep above remains the recovery path.
- **Coordinator hygiene:** a completed subagent cannot still burn tokens — if consumption
  "won't stop", it already finished; the live cost is the leaked OS processes, so census +
  kill them rather than trying to cancel an agent that is already done.

## 2026-07-07 — ui-changes wave (Completed nav, archived chat, reopen, slider tag, pin + unified viewer)

- **Widening a component from live-only to archived audits EVERY by-slug fetch it triggers.**
  Rendering `WayfinderStrip`/the fullscreen viewer for archived threads exposed a latent
  `GET /api/artifact-svg` gap: it only searched `this.store` (the one live thread), so a
  completed thread's captured SVG 404'd and the modal hung on "loading…" (a *soft* failure —
  the fetch was `.catch()`'d, so no crash, no test caught it). Fix: `resolveArtifactSvgPath`
  now falls back across live + `_completed` thread dirs (`path.basename` guards traversal).
  Lesson: when a surface stops being `viewingLive`-gated, trace every endpoint it hits for an
  archived-thread fallback — the sibling `GET /api/discussions/:id` already had one; the
  svg route didn't.
- **"Works in preview but not in a real run" is usually a `viewingLive` state gate, not
  preview-only slop.** The "missing divider button" was the revisit-round `⟲` action gated
  `viewingLive &&` — it only *appeared* to work in the preview harness because that harness
  makes every answered round the LIVE round. There was no preview conditional to delete.
  Check the live-state gate before hunting for harness slop.
- **Consolidating a component: grep the IMPORT, not just the obvious render sites.** An
  explore that mapped "two fullscreen click paths" (keeps→ArtifactChat, round-history
  options→PreviewModal) MISSED a third: `BoardSurvey.tsx` imported `PreviewModal` for the
  live-board option preview (editable per-option note, no chat). Deleting the component broke
  the build there. `grep -rn "import.*PreviewModal"` finds every consumer; render-site
  reasoning does not. (The unified `ArtifactFullscreen` had to grow an `onChange` live-note
  mode + optional `chat` to absorb that third path.)
- **A new `SessionInfo`/`StudioState` field with `.default([])` ripples to canonical bodies
  AND the constructor.** Adding `pinnedSlugs` broke 5 unit tests: every `tests/canonical/api/`
  body embedding `session` failed its key-set assertion (assertMatches checks keys exactly),
  and the `SessionStore` constructor literal needed `pinnedSlugs: []` (the `.default` makes
  the OUTPUT type require the key). Checklist for a new session field: schema + constructor
  literal + every canonical body carrying it + the coverage table.

## 2026-07-07 — agentic-model-efficiency (model-tiering the .claude layer)

- **`model:` frontmatter is honored on ALL THREE `.claude` file types** — agents, slash
  commands, AND skills — accepting tier aliases (`haiku`/`sonnet`/`opus`/`fable`), full IDs,
  or `inherit`. Prefer aliases: they auto-track the best current model per tier, so efficiency
  improves for free. The guardrail + per-file assignments live in `wiki/System/model-tiering.md`.
- **For commands and skills the override lasts only the current turn** (agents get their own
  context). The load-bearing consequence: a **reference/craft skill must be `model: inherit`**,
  else merely LOADING it (e.g. svg-authoring, brainstorm-phases) silently switches the whole
  turn's model as a side effect. Same for a command that runs as a **sub-step inside a higher
  persona's turn** (revisit-round inside an opus orchestrator round) — `inherit` so it never
  downgrades the caller. Only standalone entry points pin a concrete tier.
- **Delegate-don't-upsize beats a heavier model.** A haiku router that hands the heavy step to
  the right-tier subagent (artifact-chat → svg-artisan) is cheaper AND better than running the
  whole flow on the heavy model. Opus is a reserved carve-out (orchestrator + security +
  long-run + quality-critical user-facing generation), never a default.
- **Donor precedent** (`C:\Code\tp\.claude`): model frontmatter on AGENTS ONLY (light ops →
  haiku, security-engineer → opus, rest → sonnet); commands/skills carried none. We kept the
  shape and extended it to stamp commands + skills too, pushing mechanical work down to haiku.
- **`.claude` files can be swept into a commit by a concurrent loop/hook mid-task** — during
  this plan another session committed all 24 of my working files under my plan slug
  (`feat(agentic-model-efficiency)…`) before I reached closeout. `git status` then showed my
  work "gone" though `git ls-files`/`git diff HEAD` proved it committed and clean. In a shared
  working tree, check `git log -- <path>` before assuming lost work; closeout becomes
  bookkeeping-only when BUILD already landed.

## 2026-07-07 — concierge-living-gallery (phase 6, real-session human-sim)

- **A live-DOM engine (mind-elixir) is only exercised in a REAL browser — renderToString/
  jsdom never runs its effect, so ui-smoke proves the static wrapper, NOT the engine.** The
  human-sim (real chrome/CDP) is the first and only place the genuine engine mounts; asserting
  `[data-testid="mindmap-engine"].childElementCount > 0` is the real proof it rendered.
- **To drive a real edit on a canvas engine honestly, expose the instance and call its OWN
  mutation method — don't fake the result.** MindmapCanvas assigns `elRef.current.mind =
  instance` (idiomatic mind-elixir interop); the human-sim does `mind.selectNode(mind.findEle(
  mind.nodeData.id)); await mind.addChild()`, which fires the engine's real `operation` event →
  the component's `onEdit` → `editedTree`. Clicking the real Send then round-trips it. That's a
  genuine engine edit through the genuine React path, not a POSTed fixture. Keyboard-driving
  mind-elixir headlessly is fragile; the instance handle is reliable AND honest.
- **The break-sweep's blocking surfaces need a long timeout + a re-present in `restore`.**
  `askConcierge`/`presentGallery` clear on resolve OR timeout; a break gesture that clicks
  "Send answer"/a card RESOLVES them (surface vanishes), and their timeout would also clear them
  mid-sweep. Present them with a long timeout and re-present in `restore` (same pattern as a
  submitted board). Also: concierge/gallery never populate `history`, so a resolved-but-not-yet-
  re-presented surface transiently shows the New Discussion landing — skip census re-admission
  unless the surface's own signature is present, or its controls bleed into the wrong surface.

## 2026-07-07 — concierge-living-gallery (phase 5, real-session routing)

- **"Works in `npm run preview`" is answered by wiring the SKILLS, not the harness.** The
  intake surfaces (concierge, gallery, mindmap) were fully built + smoke-green for two phases
  yet would never fire in a real brainstorm, because `run-brainstorm.md` / `brainstorm-orchestrator.md`
  / `brainstorm-phases/SKILL.md` didn't tell Claude to CALL `ask_concierge`/`present_gallery`/
  `open_studio(brief)`. Rule 11 is literal: the prompt→method recommendation and the pick→phase
  routing are HEURISTICS that live in the `.claude` markdown, not in code. Phase 5's whole
  deliverable was editing those three files (+ reconciling the wiki) — no product code except a
  preview-harness demo of the route.
- **Prove a real-session flow with a throwaway scratchpad script against the real bridge, then
  fold it into a runnable command.** For "brief→mindmap end-to-end" I ran a ~40-line
  `verify-route.mjs` importing the built `Bridge` (`engine:'claude'`), driving present_gallery→
  POST gallery-pick→present tree board→POST editedTree, asserting `activeBoard.kind==='mindmap'`
  and the returned `editedTree`. This is the `/verify` pattern (drive the flow, observe behavior)
  and is far stronger evidence than a build-check — the preview harness (interactive, opens a
  browser, loops forever) can't be asserted on directly.
- **Committing a stalled peer session's FINISHED work on its behalf is OK when: (a) its plan
  shows all steps done + verified, (b) the diff is coherent (spot-check 2 files), (c) the operator
  authorizes it, and (d) you attribute it clearly ("committed on behalf of <session>").** The
  `agentic-model-efficiency` session's `.claude` model-tiering work was complete but uncommitted,
  blocking phase 5's edits to the same files; the operator said commit it, so it shipped as its
  own attributed commit — NOT folded into my phase commit. Never do this for half-written work.

## 2026-07-07 — concierge-living-gallery (phase 4 + operator real-session mandate)

- **A studio surface working in `npm run preview` is NOT proof it works in a real brainstorm.**
  Preview (`apps/mcp/src/preview.ts`, `engine:'preview'`) is a fixture player with no Claude and
  no orchestration; real sessions run through the MCP tools (`open_studio`/`ask_concierge`/
  `present_gallery`/`present_board`) driven by the `.claude` skills+commands. Two separate gates:
  (a) transport works → prove with `scripts/smoke.mjs`, which builds a REAL `Bridge` with
  `engine:'claude'` and exercises the actual channels; (b) Claude actually CALLS the tools →
  lives in `run-brainstorm`/`brainstorm-orchestrator`/`brainstorm-phases`. A feature can be
  fully built + preview-visible + smoke-green and STILL never fire in a real session because no
  skill tells Claude to call its tool. Operator's words: "if it only works in preview the app is
  a brick." Wire the skills (that's the routing phase) and prove the real path with human-sim on
  a real bridge — never treat the preview demo as the acceptance test.
- **The blocking-channel pattern now has three instances** (`presentAndWait`, `askConcierge`,
  `presentGallery`) — all identical shape: set pending state, broadcast envelope, store ONE
  resolver, POST resolves it, timeout → null, clear + re-broadcast null on settle, record to
  brainstorm.md. Each new one is +1 `StudioState` field (breaks `state-200.json` canonical body —
  append the key in `bridge.state()` order), +1 `ServerToStudio` case in `useBridge` (or the app
  blanks), +1 endpoint (add 200/404/400 to the api-status-matrix — tests ship with features).

## 2026-07-07 — comprehensive-human-testing closeout (multi-loop working tree)

- **A delegated agent killed mid-task by a model/session limit usually leaves its files
  COMPLETE on disk — recover by verifying, not re-delegating.** The phase-4 test-engineer
  hit the Fable 5 limit during its own verify pass; the code it had written was whole. The
  cheap recovery: `node --check` each JS file, Read the new files for structural
  completeness, then run the phase's verification YOURSELF (build + the harness) rather
  than re-spawning an agent that would duplicate work or clobber finished files. Re-delegate
  only if the artifacts are genuinely half-written.
- **For SHARED append-only files (`wiki/*`, `.agents/learnings.md`) entangled with a
  concurrent session's uncommitted hunks, don't fight the tree — leave your edits
  uncommitted and let them ride that session's next natural commit.** Across phases 2–5 my
  wiki + learnings edits sat uncommitted (foreign hunks at the top); the ui-changes closeout
  commit (`1feb781`) swept them all in cleanly. `git commit --only <file>` can't split
  hunks, so committing shared files yourself rides THEIR work — the inverse violation.
  Verify your content actually landed with `git show <hash> -- <file>` and record BOTH
  hashes in the progress log. Commit only files you solely own (here: `package.json`).

## 2026-07-07 — ui-break-sweep harness (phase 4)

- **On Windows `proc.kill()` terminates only the browser ROOT — renderer/GPU/network
  children survive orphaned.** Across repeated CDP harness runs that leaked ~100 headless
  chrome/msedge processes, enough contention to time out the NEXT launch. Kill the whole
  tree: `taskkill /pid <pid> /T /F` (POSIX gets plain SIGKILL). Edge's launcher handoff
  also leaves a hidden process holding the FIRST profile dir that is never a child of the
  proc you spawned — sweep those by command-line match against the profile path
  (`killProfileStragglers` in `scripts/lib/cdp.mjs`). Give every launch attempt its own
  profile dir.
- **Enumerate break-sweep controls from the LIVE DOM every surface, never from a static
  census.** Querying `button, input, textarea, select, [role=button]` at gesture time
  makes control drift impossible to miss — but a transient control (e.g. converge's
  "sudden death: duel" button) can vanish between enumeration and its gesture. Record that
  as `vanished (transient control)`, NOT a crash: the sweep proved 404 controls / 486
  gestures with zero unhandled crashes precisely because it treats disappearance as data,
  not failure. A disabled control clicked is `inert by design`, also not a finding.

## 2026-07-07 — ui-changes wave (converge cards, option chat, revisit, token pipe)

- **The token meter silently recorded NOTHING since it shipped — no thread on disk had a
  progress.jsonl.** Two stacked causes, both invisible: (a) `pipe-progress.mjs` posted to
  port 5199 only, while a port-conflicted bridge falls back to a random port; (b) the
  transcript token cursor was committed BEFORE the POST, so any failed delivery destroyed
  that delta forever. Fix pattern for any deterministic pipe: the server writes a
  discovery file with its REAL port (`<discussionRoot>/.logs/bridge-port.json`), and
  cursors commit only after confirmed delivery (`res.ok`) so missed deltas ride along on
  the next event. Absence-of-data bugs need an existence check in tests — an assertion
  that the artifact file EXISTS after a real flow, not just unit math.
- **`spawnSync` a child that HTTP-POSTs a server living in the parent process = deadlock
  by construction.** The parent's event loop is blocked, so the TCP request is accepted
  and buffered by the OS but never answered until the child dies; the child's `fetch`
  hangs (AbortError at its timeout) while the event still "arrives" afterwards — which
  made the old commit-before-post look correct in smoke. Any harness testing
  delivery-confirmation logic must `spawn` async and await 'close'.
- **A response for an already-answered board is a REVISIT, not a duplicate.** The bridge
  resolves the CURRENT pending wait with it (boardId names the rewound round), so
  `present_board` must digest against the board named by `response.boardId` — digesting
  against the presented board silently mislabels every option id. Rewind never deletes
  rounds; response.json is rewritten, brainstorm.md appends.

## 2026-07-07 — concierge-living-gallery (phase 3, intake + handoff)

- **A new `ServerToStudio` envelope MUST get a `case` in `useBridge`'s switch — the switch
  has no `default`, so an unhandled type makes the setState updater return `undefined` and
  blanks the whole app.** Adding a WS message type is a THREE-file change: the protocol
  union, `bridge.state()`/broadcast, AND `useBridge`'s reducer + the `EMPTY` default (so a
  bridge built before the field degrades gracefully via `{...EMPTY, ...msg.state}`). Miss the
  reducer case and the studio goes blank the moment the envelope arrives.
- **Adding a field to `StudioState` breaks the canonical `/api/state` + `ws-hello` body
  assertions** (`tests/api-status-matrix.test.mjs` compares key-for-key against
  `tests/canonical/api/state-200.json`; `ws-hello.json` references it by sentinel). Append
  the new key to `state-200.json` in the SAME order `bridge.state()` emits it. Expect this
  every time StudioState grows — it's not a regression, it's the contract test doing its job.
- **The Claude Code → studio handoff was a one-liner gap with a real UX cost:** `open_studio`
  took no brief, so a purpose the human already typed in the terminal was lost and they
  retyped it in the New Discussion panel. Fix pattern for any async-seeded form field: carry
  it in `StudioState` (`seedBrief`), pre-fill via `useState(initialProp)` AND a ref-guarded
  effect (`seededRef`) that fills only when the prop first arrives over WS and the field is
  still untouched — never clobber what the user has since typed.
- **A blocking studio channel = present_board's shape reused:** `askConcierge` mirrors
  `presentAndWait` (broadcast a pending item, store a single resolver, POST answers it,
  timeout resolves null, clear + re-broadcast null on settle). For an adaptive/multi-turn
  loop the tool blocks per turn and Claude decides whether to call again — no fixed count in
  the harness (the count lives in Claude's judgement, rule 11).

## 2026-07-07 — concierge-living-gallery (phase 2, mind-elixir)

- **A browser engine that imports CSS/`.less` (mind-elixir) must be DYNAMICALLY
  imported inside the mount effect, never statically at module top.** ui-smoke runs the
  studio `.tsx` through tsx/esbuild with no `.less` loader and no real layout; a static
  `import 'mind-elixir'` anywhere in BoardSurvey's import graph would crash the whole
  render pass on the `.less` import. `await import('mind-elixir')` inside `useEffect`
  (which renderToString never runs) keeps the static graph clean AND code-splits the
  engine into its own chunk that only loads when the canvas mounts. Assert the STATIC
  wrapper markers in ui-smoke; the live engine gets real proof in the human-sim phase.
- **mind-elixir 5.13 API pinned:** `new MindElixir({el, direction, editable, theme})` →
  `.init({nodeData, direction})`; edits arrive via `instance.bus.addListener('operation',
  cb)`; read back with `.getData()` (returns `{nodeData, direction}`); `.exportSvg()`
  returns a Blob; light/dark = `MindElixir.THEME` / `MindElixir.DARK_THEME`; `direction`
  is typed `0|1|2` (cast our `number`). Our MindTree (`{nodeData, direction?}`) is
  structurally its data format — no adapter needed.
- **Rule 7 for a live-DOM engine = a deterministic SERVER-side snapshot, not the engine's
  own export.** mind-elixir renders in the browser; the server can't run it. `recordBoard`
  captures the presented tree via `apps/mcp/src/tree-svg.ts` (a plain recursive SVG layout,
  XML-escaping topics for rule 8) at present time — deterministic, testable, independent of
  whether the client ever exports. The browser engine is the editing surface; the snapshot
  is the archival still.

## 2026-07-07 — concierge-living-gallery (phase 1)

- **Concurrent dispatch loops share ONE working tree — a red `npm test` may belong to the
  OTHER plan's uncommitted diff.** Attribute before reacting: `git diff <suspect files> |
  Select-String '<failing string>'` — if the failing assertion's strings are `+` lines in
  someone else's in-flight diff, your phase didn't break it. Then (a) commit your own
  disjoint paths immediately to protect them from sweeps, (b) do NOT "fix" the other
  plan's canonical expectations mid-flight (their diff isn't final), (c) leave the row
  in-progress with the attribution and re-verify next tick.

## 2026-07-07 — mindmap-methodology brainstorm (4 rounds to finality)

- **Delegated SVG JSON can be invalid XML — scan before present_board.** svg-artisan
  emitted a `<text>` carrying two `x=` attributes (round 3); DOMParser rejects duplicate
  attributes, which would have crashed/blanked the option. The orchestrator owns a
  pre-present validity scan of delegated SVG (duplicate attributes, unclosed tags,
  double quotes when the brief demanded single).
- **The merge→crown two-step is the clean funnel ending.** Triage `merge` verdicts →
  next round presents exactly ONE synthesis at converge → the user crowns it Final.
  Diverge(6) → synthesis-diverge(5) → converge(3, merge+kill) → converge(1, crown) went
  brief-to-poster in 4 rounds with zero wasted boards; don't pad the pool once notes
  start converging on ordering instructions ("1 and 2 are perfect, X comes after").

## 2026-07-07 — human-sim harness (phase 3)

- **Windows Edge (`msedge.exe`) can exit 0 IMMEDIATELY with empty stderr when launched
  `--headless=new --remote-debugging-port=0` — a launcher/startup-boost handoff, even with a
  fresh `--user-data-dir`.** No error, no DevTools line, nothing. A CDP harness must treat
  "process exited (or 20s passed) without `DevTools listening on ws://…`" as launch failure
  and fall back to the next installed chromium-family browser (Chrome worked first try on
  the same machine). Give each attempt its OWN profile dir — a handoff may leave a hidden
  process holding the first one.
- **`document.body.innerText` reflects CSS `text-transform` — the studio's `uppercase`
  markers/titles render as `YOUR TURN`, so `innerText.includes('your turn')` never matches.**
  Assert page text via `textContent` (DOM truth); reserve innerText/screenshots for
  visibility questions. (Cost 15 minutes of "board never rendered" when the screenshot
  plainly showed it rendered.)
- **A concurrent session's `npm run build` clears `apps/studio/dist` mid-run — and the
  bridge's static file streaming (`fs.createReadStream(...).pipe(res)` with no `error`
  handler) then CRASHES the whole node process on the ENOENT** (unhandled stream 'error'
  event), not just that request. Open finding for bridge-server.ts static serving.

- **`String(ZodError)` never contains the word "ZodError"** — zod v3 stringifies to the
  bare issues JSON, so canonical 400-body expectations must anchor on issue codes
  (`invalid_type`, `invalid_enum_value`, `too_small`), never the class name. Non-JSON
  bodies DO yield `SyntaxError:` in the message.
- **`VIBR_STUDIO_DIST` is read inside `Bridge.start()`**, not at construction — per-test
  dist overrides must scope the env var tightly around `start(0)`; safe only because
  node:test runs one file's tests sequentially in one process.
- **`presentAndWait`'s third arg `open` defaults to `true`** — any test presenting a board
  must pass `false` or every test run pops a real browser window.
- Proving "silently ignored" over WS: send the ignored frame, then a garbage frame, and
  wait for the garbage's log line — in-order socket processing guarantees the ignored
  frame was consumed without side effects.

## 2026-07-07 — fixed-position overlays paint-trapped by `scroll-fade` (mask-image)

- **`mask-image` on an ancestor (main's `scroll-fade`) makes it a paint group that
  clips even `position: fixed` descendants — while `getBoundingClientRect()` still
  reports full-viewport geometry.** A `fixed inset-0` modal rendered inside
  `main.scroll-fade` painted inset to main's box, faded at the mask edges, and sat
  visually behind the sidebar/wayfinder ("fullscreen isn't fullscreen, appears behind
  the nav"). Measure-based debugging lies here: the DOM rect is correct, only PAINT is
  clipped — screenshot the page, don't trust rects. Fix: fullscreen dialogs portal to
  `document.body` (`BodyPortal` in `primitives.tsx`; inline fallback keeps
  `renderToString` ui-smoke working since the server renderer has no portals). Any new
  `fixed inset-0` surface must either mount at App root or wrap in `BodyPortal`.
- **CDP `Page.captureScreenshot` on a backgrounded tab can return a stale composited
  frame** that contradicts the live DOM — `Page.bringToFront` first, then capture.

## 2026-07-07 — canonical test data (phase 1)

- **A recursive directory walk on Windows yields backslash separators that never match
  forward-slash map keys.** `tests/canonical-data.test.mjs` guards against unproven stray
  canonical files by `deepEqual`-ing walked JSON paths against its explicit file→schema
  map; that only works with `path.relative(...).replaceAll('\\', '/')`. Any test that
  compares relative paths from `readdirSync` recursion to literal keys needs the same
  normalization.

## 2026-07-07 — studio blank-page crash (version skew)

- **A long-running bridge process serves the NEW studio bundle but sends OLD state
  shapes — and `hello`'s wholesale `return msg.state` made that a blank page.** The
  bridge process outlives rebuilds (it's spawned per Claude Code session); its compiled
  `state()` lacked fields the freshly-built client dereferences (`state.progress`), React
  unmounted the root, and the only server evidence was connect/disconnect pairs ~200ms
  apart. Fix pattern: the client merges every `hello` over its typed defaults
  (`{ ...EMPTY, ...msg.state }`). Treat "connected then disconnected within ~1s,
  repeatedly" in the bridge log as the client-crash signature.
- **ui-smoke (JSDOM renderToString) structurally cannot catch browser-runtime crashes** —
  useBridge/WebSocket/effects never run there. Repro cheaply without Playwright: headless
  Edge/Chrome + raw CDP over the repo's own `ws` package (`--remote-debugging-port`,
  `Runtime.exceptionThrown`, then `document.getElementById('root').childElementCount` —
  0 children = unmounted root). Script pattern: scratchpad `crash-repro.mjs`, 2026-07-07.
- **`/api/health` `awaitingResponse` tracks the BLOCKING present_board wait, not the
  board's liveness.** After the 1740s tool timeout it flips false while the board stays
  live and answerable (peek_response still `pending`). Don't monitor it to detect a user
  submission — poll `activeBoard: null` (set only when a response is accepted) instead.

## 2026-07-07 — brainstorm-orchestrator plan

- **Agent files can be living memory surfaces, same as commands.** The
  `brainstorm-orchestrator` agent persists brainstorm-routine orchestration lessons in its
  own `## Orchestration learnings` section — role memory lives next to the procedure owner,
  so spawning the agent loads it for free. Consequence for closeout step 4 ("which file
  would have prevented this?"): candidate files now include `.claude/agents/*` living
  sections, not just commands/skills. Repo-wide lessons still mirror to THIS file; wiki
  facts still go through wiki-librarian.

## 2026-07-07 — askaquestion plan

- **Parallel agent waves work when the contract is written down, not described.** Three
  waves (progress pipe, token meter, artifact chat) ran core + studio-UI + tests + docs as
  concurrent subagents building against code that had not landed yet — zero drift, because
  every prompt carried the EXACT zod schema literals, component props signatures, endpoint
  bodies/status codes, and the literal renderToString marker strings tests would match.
  Vague contracts ("add a chat panel") would have needed a reconcile pass; exact ones made
  the merge mechanical. Corollary: name which agent owns which files — two agents editing
  ui-smoke.ts would have conflicted.
- **Windows/libuv: `process.exit(0)` racing WebSocketServer teardown asserts
  `!(handle->flags & UV_HANDLE_CLOSING)` and clobbers the exit code AFTER your PASS line
  printed.** In scratch drivers, trust the printed assertions, not the exit code — or skip
  explicit exit and let the loop drain (smoke.mjs's pattern, which never hits this).
- **A concurrent /plan-closeout can sweep YOUR in-flight phase into ITS commit.** The
  token-meter tick's files showed clean at ship time because another session's closeout
  commit had taken them as riders minutes earlier. Before shipping a tick, `git log
  --oneline -3`: if your hunks are already in someone else's commit, commit only your
  remaining delta and record BOTH hashes in the Progress log — never re-stage or revert
  to "own" the work. (Mirror of the commit-riders learning, seen from the other side.)

## 2026-07-06 — ui-changes plan (studio restructure, 6 waves)

- **The scroll gutter must live INSIDE the `overflow-y-auto` element.** Padding on the
  scroll container's PARENT sits outside the scrollbar, so content ends flush against it
  and right borders "disappear". Put the right padding on the scrolling element itself and
  give fixed siblings (wayfinder strip) a matching margin. Same family: percentage heights
  (`min-h-full`) resolve to nothing inside a `min-h-screen` flex column — symptom is
  duplicate scrollbars (body + inner) AND fill-remaining-space silently failing. Fix:
  `h-screen` root, `flex-1` to fill, overflow on exactly one inner element.
- **Zod strips unknown keys: a UI-added response field silently vanishes** unless its shape
  lands in `packages/protocol` FIRST. The bridge parses every response through
  `BoardResponseSchema`; a studio-only field never reaches Claude and nothing errors.
  Rule 5 is not just governance — the parse enforces it destructively.
- **A resumed subagent's "standing flags" replay stale context.** The wiki-librarian
  (resumed via SendMessage across 6 waves) kept re-flagging a CLAUDE.md issue for hours
  after the coordinator fixed it — a resumed agent reasons from its own old transcript,
  not the current tree. Verify any repeated flag against the file before acting, and tell
  the agent explicitly to drop resolved flags. (The pattern itself was excellent: one
  persistent librarian per work stream, fed a concrete changed-facts brief per wave,
  instructed to verify against source.)
- **`capture="environment"` on desktop silently degrades to a file-open dialog.** Real
  camera capture needs `getUserMedia` + a preview/snap modal; keep the file-input fallback
  for denied/absent cameras and label it honestly (rule 6).
- **"Edit a built-in" features should shadow, not mutate.** Studio palette edits persist as
  `styles/<name>.json` — the exact drop-in files `loadThemes` already lets shadow built-ins
  by name. Zero code mutation, restart-safe, user-ownable, and deletion restores the
  built-in. Reuse this write-path for any future built-in-customization feature.
- **Studio rebuilds need only a browser refresh; server-side changes need a restart.** The
  bridge streams `apps/studio/dist` per-request, but themes, config, and endpoints load at
  process start. After editing `apps/mcp` or `packages/protocol`, restart the preview; a
  second instance falls back to a random port and logs PORT CONFLICT with the holder's pid.

## 2026-07-06 — ship-discipline-loopable-plans plan

- **Never cross-reference another command's step by NUMBER — use the step's name.**
  `wiki/Meta/agentic-loop.md` said push happens at plan-closeout "(its step 9)"; within
  the hour a new step 7 renumbered it to 10 and the wiki was silently wrong. Living
  documents renumber; names ("its Commit-and-push step") survive. Same family: before
  appending a `## Changelog` footer to a command, check one already exists — footers live
  at the END, and a blind append creates a duplicate heading mid-file.
- **`brainstorm.md` has two writers with distinct duties.** The MCP server auto-appends
  the mechanical record (rounds shown, raw responses, captures — `SessionStore.appendMd`,
  apps/mcp/src/session-store.ts); it will never contain WHY. Interpretation (direction
  chosen/rejected + rationale, emerged requirements) must be appended by the orchestrator
  per run-brainstorm step 5 — that layer is what makes a target-repo build plan authorable
  from the record instead of from chat memory.
- **File-level `git commit --only` cannot split hunks: a shared file already carrying
  another session's uncommitted edits commits THEIR hunks with yours.** Either wait for
  their loop to converge and commit, or declare the riders in the commit body — never
  pretend the commit is single-plan when the diff isn't.

## 2026-07-06 — studio-journey-ux plan

- **A live MCP server keeps writing to the discussionDir it loaded at startup** — config
  loads once at process start. When `discussionDir` moved (`.docs/discussion` →
  `discussion/`), the still-running server kept writing threads/artifacts to the OLD path;
  the strays had to be migrated by hand. After any config/path change: check
  `GET /api/health` → `session.dir` to see which root the running server ACTUALLY uses,
  and expect strays until it restarts. (`SessionStore.open()` self-heals a stale `dir`
  field inside session.json, so moved thread folders reload fine.)

- **Hand-built response fixtures break every time the schema gains a defaulted field.**
  Two session-store tests died on `response.ranking.length` because their fixture object
  literal predated the field. Fixtures must go through `BoardResponseSchema.parse` like
  every production caller (bridge HTTP/WS/synthetic-park and disk reload all parse) — then
  new defaulted fields can never re-break them.
- **Two Claude sessions can edit this repo concurrently and it works — IF both re-read
  before every edit.** This build landed while another session shipped fullscreen-preview +
  target-repo; merges met in BoardSurvey/TriageGate/JudgeDeck. The Edit tool's
  modified-since-read guard is the safety net: on conflict, grep the current state first —
  the other session may have already made your fix (onPreview wiring, twice).

## 2026-07-06 — fullscreen-notes-target-repo plan

- **ui-smoke markers must not span adjacent JSX expressions.** `renderToString` emits a
  comment node between neighboring text expressions (`{value}%` renders as
  `100<!-- -->%`), so a literal marker like `'100%'` never matches. Assert on a glyph or
  string that lives inside ONE expression/text node (e.g. the `⟲` button label).

## 2026-07-06 — docs-tests-agents plan + its closeout

- **Restructuring paths under a live MCP session splits the working set.** The discussion
  root is read from config at server launch; promoting `.docs/discussion/` to top-level
  `discussion/` while a session was live left that session writing to the OLD path. Rule:
  after any storage-path change, census live node processes first, migrate straggler
  threads only after their session ends, and never delete the old root while one runs.
- **Rule-10 verification races concurrent sessions in one working tree.** During closeout,
  `npm run build` failed three times with three DIFFERENT errors — all in another plan's
  in-flight files (JudgeDeck wiring), none from the plan being closed. Attribute failures
  before fixing: check open plans + `git status`, and don't edit a file another session is
  actively changing (the error's line number drifting between runs is the tell). Wait for
  their loop to converge, then re-verify.

## 2026-07-06 — de-slop of the demo orchestrator

- **Test harnesses accrete intelligence one "improvement" at a time until they impersonate
  the product.** The demo started as a surface exerciser; across iterations it grew pool
  evolution, mechanical synthesis, hand-drawn "semantic" tables, dial-restyling, and a
  kickoff brief — ~500 lines duplicating orchestration that belongs ONLY to Claude + the
  skill files, and it misled the operator ("prompt was not respected"). Rule: the harness
  stays dumb (fixtures in, responses logged); when a harness gap tempts you to add cleverness,
  the fix is wiring the REAL engine, not teaching the fake one. Deleted, replaced by
  `preview.ts` (fixtures only, temp-dir threads, `engine:'preview'` declared in the UI).

## 2026-07-05 — phase-funnel-ux plan (harvested at closeout 2026-07-06)

- **Board ids must be unique per presentation — the bridge dedups responses
  first-response-wins.** `bridge-server.ts` keeps `responses` keyed by boardId and ignores
  any later response for a known id, so re-presenting a board under a reused id (new cycle,
  ↩ back re-present) silently swallows the user's answer. Mint a fresh board id every
  `present_board`, even when showing "the same" board again. (Bit the demo as
  cross-cycle collisions before the demo was deleted; the dedup is still live.)

## 2026-07-05 — feedback-packaging session (operator UX test)

- **A dial-only response produced a no-op — the cardinal sin of this tool.** The operator
  moved two sliders, sent, and got a clever phase pivot instead of visibly re-tuned options.
  Fixed at three layers: tool description ("axis deltas are a complete instruction"),
  feedbackDigest (dial deltas rendered as imperative lines with direction), demo (dials
  literally re-render stroke-width/caps/accent). Interpretation cleverness never beats
  doing the obvious thing the user asked with their hands.
- **Every mechanic ships its state regardless of active tab** — phase tabs are clickable
  now, so users arrange clusters then switch tabs; conditional field-sending silently
  dropped that work. Send everything touched (`clusterTouched` pattern).
- **tsx (esbuild) needs a root tsconfig.json with `jsx:"react-jsx"`** to run studio TSX in
  scripts — nearest-tsconfig lookup doesn't reach apps/studio for files under scripts/.
- **jsdom + renderToString gives cheap per-surface render tests** (`npm run smoke:ui`) —
  only DOMParser/XMLSerializer globals needed since effects don't run server-side.

## 2026-07-05 — persistence/styles session

- **Schema evolution rule: cached threads must ALWAYS reload — tighten at the tool
  boundary, loosen the base schema.** The ≥5-axes invariant is enforced in `present_board`'s
  handler, NOT in `BoardSchema`, so round-1 threads cached before the rule still parse.
  Corollary: new BoardResponse fields get zod `.default(...)` so old disk data (and
  fixtures — see studio-journey entry) never break. New invariant → boundary check;
  new field → defaulted. (Harvested at closeout 2026-07-06.)
- **Two bridges can't share port 5199 — and on Windows, killing an `npm run` wrapper can
  orphan the node child, leaving the port held.** The bridge now falls back to an ephemeral
  port on EADDRINUSE (stderr warning) instead of crashing; the printed/returned `studioUrl`
  is the source of truth, never assume 5199. (Bit us twice: an orphaned OLD demo on 5199
  silently answered API probes meant for the new build — a ghost serving stale code. When
  testing a rebuilt demo, first `Get-CimInstance ... -match 'demo\.js'` → Stop-Process, and
  launch demos via `node apps/mcp/dist/demo.js` directly so a task stop kills the real
  process, not just the npm wrapper.)

## 2026-07-05 — bootstrap session

- **stdio MCP servers must never write to stdout.** The MCP protocol IS stdout; one stray
  `console.log` corrupts the stream and Claude Code drops the server. All apps/mcp logging
  goes through `console.error`. (Codified as CLAUDE.md appendix.)
- **`present_board` blocking + timeout recovery is the crux design.** MCP tool calls can block
  for long periods but clients enforce timeouts (Claude Code: `MCP_TOOL_TIMEOUT`). Design:
  block up to `timeoutSeconds` (default 1740s), return `{status:"pending"}` on expiry, persist
  the late response, recover via `peek_response`. Never treat timeout as failure.
- **Artifacts belong to the brainstormed project, not this repo.** Claude Code launches MCP
  servers with cwd = user's project, so `.visual-brainstorm/` lands where the user can commit it.
- **Donor architecture (C:\Code\tp) mapping:** root CLAUDE.md numbered mandates + AGENTS.md
  behaviour mandates + `discussion/<slug>-<date>/plan.md` + `_completed/` + authoritative
  wiki with append-only `log.md` + `.agents/` learnings/skills. Optimization taken here: wiki
  stays plain files (no wiki-MCP ceremony) because this repo's MCP layer is the product itself.
- **shadcn 2026-06 chat components** (UI north star): MessageScroller (scroll behaviors),
  Message/Bubble (rows/surfaces), Marker (status/separators), Attachment, plus `scroll-fade`
  and `shimmer` CSS utilities. Studio mirrors these patterns hand-rolled on Tailwind v4.
