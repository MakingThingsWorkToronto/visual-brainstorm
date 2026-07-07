# Agentic Learnings (newest first)

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
