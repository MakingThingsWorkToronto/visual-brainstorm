# Interaction Protocol

The contract for how Claude Code, the MCP server, and the studio collaborate. This is what
makes it "brainstorming" rather than "generation".

## The funnel

Boards carry a `phase` (diverge → expand → mutate → wreck → cluster → converge); the studio
re-architects per phase and each phase adds response fields Claude must honor. The
authoritative theory→mechanic map is `wiki/Product/phase-funnel.md`; the driving recipe is
`.claude/skills/brainstorm-phases/SKILL.md`.

## The loop

1. **Pre-phrase (inside Claude Code).** Claude uses `AskUserQuestion` to clarify before
   burning a visual round: style, references, colors, constraints, board kind. The consensus
   — not the raw request — is what gets visualized.
2. **Present.** Claude calls `present_board` with a title, prompt, board kind, 2–12 options
   (each a self-contained SVG), and survey config. The bridge pushes it to the studio and the
   tool call blocks.
3. **Respond (in the studio).** The user multi-selects options, adds per-option notes, marks
   remix pairs ("mash these two up"), sets axis sliders, writes an elaboration, and picks an
   action:
   - `iterate` — take my selection + notes and produce the next round
   - `accept` — the selection is final; capture artifacts and wrap up
   - `park` — save everything, stop iterating for now
4. **Process.** The tool call returns the BoardResponse. Claude interprets selections/notes/
   axes, calls `capture_artifact` for anything accepted, and either loops to (2) or summarizes.

Every round is persisted before the user ever responds — a closed browser loses nothing.

## MCP tools

| Tool | Blocking | Purpose |
|---|---|---|
| `open_studio` | yes (timeout → `waiting`) | open the studio with NO board — the New Discussion landing panel — and block until the panel submits a brief (arrives as a new-brainstorm command with prompt/seed notes) or timeout returns `{status:"waiting"}` (the studio stays open; call again or check `session_status.pendingUiCommands`). **Handoff (`SeedBrief`, carried on `StudioState.seedBrief`):** `brief` pre-fills the composer; on a real run-brainstorm, `summary` replaces the panel's generic opening-bubble prompt with a friendly one-liner (reads as continuity), `questions` is a **bespoke intake survey the orchestrator authors anchored to the brief** (each `{ id, question, options[], multi?, recommended?, allowOther? }` — validated by `SurveyQuestionSchema`; replaces the panel's generic preset rather than appending), and `picks` (answers keyed by those question ids — or the default preset ids when no `questions` were handed off; exact option strings, unknown values fall back to free-text) pre-selects the intake so the human lands one tap from Send & iterate. A bare New Discussion (no handoff) leaves the panel generic, using `DEFAULT_INTAKE_QUESTIONS` (protocol-owned: making/vibe/range/audience/constraints). For a bare `/run-brainstorm` (its step 0): land the user on the panel and build AskUserQuestion clarifications on the submission. The placeholder "New discussion" thread is retitled by the first `present_board` (`SessionStore.retitle` — display title only, directory slug unchanged). Blocking: `discussionId` resumes a cached thread |
| `ask_concierge` | yes (timeout → `pending`) | adaptive concierge intake (wiki/Product/intake-methodologies.md): after the New Discussion brief, ask ONE clarifying question in the studio and block for the answer. Ask AS MANY as it takes — not a fixed count; comprehensiveness rewards the brainstorm. Provide tappable `suggestions` (user picks any/all/none, or types their own). Presented in ConciergeIntake surface. Each answer returns and appends to the thread's `brainstorm.md` digest. Returns `{status:"answered", answer, picked, typed}` or `{status:"pending"}` on timeout; `picked` = suggestion chips tapped (the user endorsed Claude's framing), `typed` = the user's own words (weight highest), `answer` = the assembled result. On timeout or process restart, the pending question persists to `<thread>/intake-pending.json` and re-calling returns the stored answer immediately (crash recovery) |
| `present_gallery` | yes (timeout → `pending`) | Living Gallery (wiki/Product/intake-methodologies.md): after the concierge Q&A, present the methodologies as method cards — Mind map, Funnel, Wreck, Cluster. Each card carries a LIVE mini SVG genuinely seeded from the brief + answers (delegate the 4 minis to `svg-artisan`). Mark exactly ONE `recommended:true` with a `reason` quoting user's answers; it is accent-ringed + ribboned in the studio's LivingGallery surface. Block until the user picks one. The pick routes to the starting mechanic (mindmap → tree board; funnel/wreck/cluster → that phase). Returns `{status:"picked", method, label, recommended, reason}` or `{status:"pending"}` on timeout; `recommended` flags whether the user took Claude's recommendation (calibrates future recs). On timeout, the pending pick persists to `<thread>/intake-pending.json` and re-calling returns the stored pick immediately (crash recovery) |
| `present_board` | yes (timeout → `pending`) | push a board (optionally with `questions`: 0–4 SurveyQuestion, rendered as a "Claude asks" box beside the options; answers return in response.questionAnswers keyed by qid; never gate on them). Await the survey response; `discussionId` resumes a cached thread. Each option may carry `rationale` (quoted user feedback driving this option — rendered under it so the human sees their feedback working). Returns the survey response incl. `questionAnswers`, `uncertainties` (options user flagged unsure), `optionAnnotations` (marks drawn on options in fullscreen Annotate mode — arrows/boxes/notes with palette color names, composite PNG in attachments), `remixNotes` (recipes for remix pairs keyed "a×b"), and `lineage` resolved from cached rounds |
| `peek_response` | no | recover a response after a client-side timeout |
| `capture_artifact` | no | persist an accepted SVG with provenance (+ copy to the EFFECTIVE targetRepo's `brainstorm-artifacts/` — thread override ?? config default); appears on the studio's artifact shelf. Optional `revises: <parent slug>` marks a revision (`Artifact.provenance.revises`) — a change is a NEW artifact linked to its parent, never an overwrite (rule 7) |
| `list_discussions` | no | enumerate the thread cache (`discussion`) |
| `load_discussion` | no | reload a full cached thread so a chat reinitializes without regenerating anything |
| `session_status` | no | thread dir, round count, artifact list, effective targetRepo, pendingUiCommands, and each board's in-progress `draft` (the user's live dials/selections/notes/model — read it to answer an artifact-chat referencing the dials they set) |
| `compose_poster` | no | DETERMINISTIC (no model) decision-poster composition: winner embedded large + lineage tree (parents/grandparents from cached rounds) + the notes that decided it (lineage perOptionNotes + elaborations) as ONE self-contained SVG; captured via the normal artifact path (rule 7 provenance) and copied to the effective targetRepo like any artifact; throws honestly if the optionId is in no cached round |
| `reply_artifact_chat` | no | Claude's answer channel for the artifact chat: `{artifactSlug, text, revisedSlug?, discussionId?}` — persists a `claude`-role `ArtifactChatMessage` to the owning thread's `artifacts/chat.jsonl` and broadcasts the `artifact-chat` WS envelope (carrying `discussionId`). `artifactSlug` may be an `option:<boardId>:<optionId>` slug (option chat, below) — used EXACTLY as delivered. Pass `discussionId` for an ARCHIVED thread so the reply records in place |

## Durability contract — the exchange survives crashes

The two-way Claude ⇄ studio handoff is durable: no UI gesture is ever lost to a bridge/MCP restart, and no pending question leaves the user stranded.

**Intake gate.** `SessionInfo.intake?: {complete, method?}` is persisted to `session.json` when a gallery pick is made (`recordGalleryPick`). `bridge.intakeComplete` reads memory ∪ session.json so a resumed session knows the intake is done — skipping the gate on re-entry.

**Pending concierge/gallery.** A concierge question or gallery awaiting an answer persists to `<thread>/intake-pending.json` (overwritten per question/gallery; cleared on success). When the MCP process restarts before the user answers, re-calling `ask_concierge` or `present_gallery` with the same inputs rehydrates the pending state and returns the stored answer immediately when it arrives (no re-presentation needed). The pending data is cleared after successful answer (not cleared on timeout — a second timeout+re-call still retrieves the stored answer). A crash during the wait is invisible to the user: the question stays live in the UI; when they answer, the answer persists and any MCP restart delivers it.

**Queued UI commands.** Commands queued from the UI (plan-closeout, discover-skills, new-brainstorm, artifact-chat) that arrive while no `present_board` or `open_studio` blocks are journaled to `<discussionRoot>/.logs/pending-commands.jsonl` (append-only: `{ command, at, prompt, seedNote, drained? }`). On MCP restart, the bridge reloads all undrained entries and re-queues them so no command is lost — they arrive in the next `present_board` / `open_studio` tool result as `commands` (routed to the orchestrator via `drainCommands()`).

**Pending intake brief.** The `open_studio` seedBrief (brief, summary, questions, picks) persists to `<discussionRoot>/.logs/pending-brief.json` until consumed on the first board (cleared on success). On MCP restart, the brief is preserved and the studio can re-present it to the user if they close and reopen the tab.

**peek_response fallback.** `peek_response` first checks in-memory cache, then falls back to `store.rounds[].response` (disk) when the live response is gone (e.g. MCP restarted after the user answered). To ensure the fallback works, resume the thread first (`present_board.discussionId` or `load_discussion`) so the store is attached.

**Atomic writes.** `SessionStore` uses atomic write (tmp + rename) for ALL JSON/SVG writes (`writeFileAtomic`). On reload, `open()` guards `board.json` / `response.json` parse-per-round: a corrupt round is skipped + logged honestly, never bricking the thread (partial writes from a crash are caught and omitted).

**Schema-drift tripwire.** `POST /api/respond` logs any unknown keys zod strips (fields present in the POST body but not in `BoardResponseSchema`), so schema drift between harnesses is visible immediately (not silent data loss).

**Reopen integrity.** When `POST /api/command {command:"reopen", discussionId}` is routed to the orchestrator, the bridge itself calls `SessionStore.unarchive(root, id)` to move the folder out of `_completed/` (honest fs move + logging; the orchestrator never performs a manual `git mv` — the bridge owns the move, seeding the response with "moved out of archive" so the orchestrator's procedure knows it happened).

## Artifact chat

Clicking a captured artifact (or a previous-round option) in the studio opens it fullscreen
with an interactive chat panel (simplified composer: one input + Send) — available on ANY
thread, live or archived, so the user can ask about any artifact whenever they want. The loop:

1. **Studio → bridge.** `POST /api/artifact-chat` `{artifactSlug, text, discussionId?}`.
   `discussionId` addresses an ARCHIVED (non-live) thread — absent means the live thread. The
   bridge resolves the owning thread (`resolveChatStore`: the live store, or an archived
   thread opened in place — a bad id → 404), persists the user message (append-only that
   thread's `artifacts/chat.jsonl` plus a `brainstorm.md` line), broadcasts an `artifact-chat`
   WS envelope **carrying the owning `discussionId`** (the studio routes it to the live state
   OR the archived view accordingly), and routes the request to Claude Code through the
   EXISTING UI-command plumbing as command `artifact-chat`: board awaiting response → synthetic
   park response with `commands:['artifact-chat']` and the question in `elaboration`/`seedNote`
   (the seedNote names the archived `discussionId` + `load_discussion` when non-live);
   otherwise queued into `pendingUiCommands` / the next tool result / `waitForCommand`. Unknown
   slug or thread → honest 404 (rule 6). The answerer is the live brainstorm orchestrator,
   which receives the chat TWO ways and must handle both (`run-brainstorm.md` step 7): the
   parked-board response while it blocks in `present_board`, AND `session_status.pendingUiCommands`
   when no board is live (drained on every `present_board` timeout and before each new round).
   There is NO fake/preview responder — a reply exists only when a real session authored it via
   `reply_artifact_chat`. **Honest pending (rule 6):** the composer shows "Claude is thinking…"
   only briefly; if no engaged session answers within ~25s it stops spinning and states the
   message is saved and will be answered when a brainstorm session is running — it never lies
   with a perpetual "thinking" state.
2. **Orchestrator → subagent, ALWAYS** (operator mandate). Procedure:
   `.claude/commands/artifact-chat.md`. Questions go to a general subagent (Reads the SVG +
   the thread's `brainstorm.md` for provenance); change requests go to `svg-artisan`
   (thread model override applies), which produces a full self-contained revised SVG. The
   orchestrator never answers or regenerates inline — it only routes and replies.
3. **Reply.** A change (LIVE thread): `capture_artifact` with `revises: <original slug>` (new
   artifact, original untouched — rule 7), then `reply_artifact_chat` with text + `revisedSlug`;
   the studio refreshes every display of the artifact. A question: `reply_artifact_chat` with
   the answer text only. On an ARCHIVED thread pass the `discussionId` so the reply records in
   place; a CHANGE request cannot be captured into an archived thread (`capture_artifact` writes
   the live store) — the orchestrator answers honestly that reopening is required to revise.
4. **Shapes** (packages/protocol, rule 5): `ArtifactChatMessage
   { artifactSlug, role: 'user'|'claude', text, at, revisedSlug? }` (the owning thread is its
   folder); `StudioState.artifactChat`; `ServerToStudio` `artifact-chat` envelope with optional
   `discussionId` (transport-level routing); `Artifact.provenance.revises?`.

**Optimistic echo.** The user's own message renders IMMEDIATELY (a local `pendingChats`
overlay in App, merged into the fullscreen dialog and de-duped by role+text), independent of
the WS round-trip — so the bubble never depends on the envelope's timing or routing to appear.
The server still persists + broadcasts the message (the single truth); the optimistic copy is
dropped as soon as its persisted twin arrives, and rolled back if the POST fails. Proven on the
real path by `scripts/human-sim-livechat.mjs` (type + Send → the user bubble is in frame and on
disk, for both artifact and `option:` slugs).

**Notes panel.** The fullscreen artifact view docks a **Notes** panel above the chat.
**Save notes** → `POST /api/artifact-notes` `{artifactSlug, notes}` (live thread only;
unknown slug → honest 404) → `SessionStore.updateArtifactNotes` rewrites
`artifacts/<slug>.json` in place — the note is metadata, not artwork; the SVG is untouched
(rule 7 protects the artwork, not the annotation) — and broadcasts the updated `artifact`
envelope; `useBridge` UPSERTS artifacts by slug so every display refreshes. Notes stay
visible while a chat reply is pending.

**Option chats.** A board OPTION — of ANY round AND of the CURRENT (live) board — carries the
same channel, addressed by the synthetic slug `option:<boardId>:<optionId>`
(`optionChatSlug`/`parseOptionChatSlug` in packages/protocol — rule 5). EVERY fullscreen (a
captured keep, a previous-round option, AND the live board's option preview inside
`BoardSurvey`) opens the SAME `ArtifactFullscreen` with the chat docked right — the composer is
available on the current option set so the user can ask about the artifacts as they are
generated. `POST /api/artifact-chat` resolves the slug against the thread's cached rounds
(unknown board/option → honest 404); `reply_artifact_chat` accepts it. A requested change is
captured as a NEW artifact with boardId/optionIds provenance — round options are never
overwritten (rule 7).

**Non-destructive detour + board drafts (dials persist through chat).** Chatting on the LIVE
board must not cost the user their in-progress answer. Two mechanisms guarantee it:
1. **Resume is first-class rearm** — when a chat arrives while `present_board` blocks, the bridge
   resolves the wait with an `action:'park', commands:['artifact-chat']` response BUT does not
   clear `activeBoard` or record a park response. The board stays live (the studio's
   `BoardSurvey` never unmounts, dials intact). The orchestrator answers, then calls
   `present_board {rearmBoardId: "<boardId>"}` (no options/tree/axes) to re-arm the resolver on
   the still-live board. The bridge's `rearmAndWait` first consults parked/recorded responses —
   a submit that landed MID-detour returns immediately instead of stranding until timeout
   (confirmed bug fixed). No new round is minted, no re-record happens; same board id so the
   studio's `BoardSurvey` reconciles in place (dials intact). Only artifact-chat is
   non-destructive — a real park / plan-closeout still goes through `acceptResponse`.
   `recordBoard` has no duplicate-id guard anymore (nothing ever re-records the same id).
2. **Board draft persistence** — the studio debounce-POSTs the in-progress answer (dials/
   selections/notes/elaboration/model — a `BoardResponse` snapshot) to `POST /api/board-draft`;
   `SessionStore.recordBoardDraft` writes `round-NN/draft.json` (last-write-wins, one per board,
   SEPARATE from the submitted `response.json`) and it rides `StudioState.drafts` + a `draft` WS
   envelope. Drafts restore dials, NOT file bytes — attachment `dataUri` payloads are blanked on
   the draft path at both ends (BoardSurvey's single `buildDraft()` spelling client-side;
   `recordBoardDraft` defensively server-side, which returns the stored draft and the bridge
   broadcasts THAT). The name survives for recall; only the REAL submit carries bytes
   (persistAttachment). This is "the generation meta" — it restores dials on a re-presented board
   and reloads with the thread (`session_status`/`load_discussion` surface it for recall).

Chat history persists in `artifacts/chat.jsonl` and reloads with the thread —
`GET /api/discussions/<id>` returns `artifactChat`. The chat is a detour — after replying, the
orchestrator resumes whatever the session was doing. Archived (completed) threads are
thread-addressed and remain interactive (answer-in-place; see the loop above).

**Pinned artifacts.** A captured artifact can be pinned from the fullscreen viewer's 📌 toggle (live threads only); pinned artifacts appear in a dedicated "📌 pinned" row beneath the WayfinderStrip. Pins persist per-thread in `session.json` (`SessionInfo.pinnedSlugs: string[]`) and reload with the thread. On completed/archived threads, pinned artifacts appear read-only (no pin toggle). The pin control sends `POST /api/pinned {slug}` (validates the slug is a live-thread artifact, 404 otherwise), which `SessionStore.togglePinned(slug)` toggles, rewrites `session.json`, appends a one-line brainstorm.md note, and broadcasts `hello`.

## Artifact keep/kill verdicts and live replacement

On the fullscreen viewer's header, captured artifacts carry **Keep** and **Kill** buttons (live threads only).

1. **Keep** — marks the artifact kept (stored as `verdict: 'keep'` in the sidecar + a `brainstorm.md` digest line). A kept artifact receives a **✓** badge in the shelf slot (WayfinderStrip). `POST /api/artifact-verdict {artifactSlug, verdict: 'keep'}` → 200 `{ok, artifact}`.

2. **Kill with intent-to-replace** — clicking **Kill** opens a note form (the form's text is optional, max 4000 chars; typically brief replacement guidance, e.g. "bolder strokes" or "use a different layout"). `POST /api/artifact-verdict {artifactSlug, verdict: 'kill', note?: string}` → 200 `{ok, artifact, pending, delivered}`. The response carries:
   - `pending`: a `PendingReplacement` entry `{replacesSlug, characteristic, note?, at}`. The **characteristic** is derived from the killed artifact's provenance board option label(s) + description (falling back to the artifact name) — it names what the slot IS; the user's **note** is the separate steering text (what to change). Both go into the regeneration brief.
   - `delivered`: `'via-board-response' | 'queued'` — which dispatch channel carried the `replace-artifact` command (a parked live board vs. the pending-commands queue).

   The bridge broadcasts two WS envelopes: first the updated `artifact` (verdict + verdictAt marked), then `artifact-pending` carrying the pending replacement. The killed artifact's chip is REMOVED from the shelf — its slot shows a shimmering **↻ replacing…** placeholder (testid: `pending-replacement`) while the replacement is drawn. The artifact itself stays on disk with its verdict (rule 7 — the shelf hides it, nothing deletes it).

3. **The orchestrator routes `replace-artifact` as a UI command** — dispatched the same way as `artifact-chat` (queued to `pendingUiCommands` or as a parked-board response). The orchestrator (`brainstorm-orchestrator`) ALWAYS delegates to `svg-artisan` (procedure `.claude/commands/replace-artifact.md`): the artisan reads the killed artifact's SVG as an **anti-reference** (what NOT to do), the characteristic + kill note as a **regeneration brief**, and draws a replacement. The anti-reference is for signal only — the killed artwork is never modified (rule 7).

4. **Capture with `replaces`** — when the artisan calls `capture_artifact {replaces: <killedSlug>}` (registering that the new SVG replaces the killed one):
   - The killed artifact's sidecar is rewritten: `replacedBy: <newSlug>` + verdict kept as context.
   - The pending-replacement entry is retired from `pending-replacements.json` (atomic rewrite).
   - The artifact `broadcast` is re-sent (so `useBridge` refreshes both the original and any UI state watching replacedBy chains).
   - The new artifact is a SEPARATE artifact with its own `provenance.replaces` link (rule 7: nothing is overwritten).

5. **Live status** — while the replacement is in-flight, the studio displays:
   - The killed artifact's original slot on the shelf shows the shimmer placeholder (testid: `pending-replacement`).
   - When capture completes, the placeholder is replaced by the new artifact (same slot, new SVG).
   - The killed artifact remains browsable in the history (never deleted); the `replacedBy` field is visible in metadata when you open the original.
   - A `replacedBy` chain can span multiple replacements if the user kills the first replacement and issues a new brief.

**Honest failure contract (rule 6).** If the replacement fails (e.g. `svg-artisan` returns an error, or the regeneration times out), the pending entry is cleared and a progress note is appended: "Could not replace <slug> — the killed artifact remains on the shelf; try asking again." The placeholder vanishes and the kept artifact slot shows the dead slot as-is (no crash). The user can retry the replacement by re-opening the killed artifact and clicking **Kill** again.

## Mind-map persistence (model-legible contract)

On `present_board` of a mindmap board, `SessionStore.recordBoard` writes `round-NN/tree.json` (presented tree), `round-NN/tree.md` (traversable markdown outline: header line carries a noted-node count ("N noted nodes — inline `note:` markers are the user's steering; read them as intent"), indented hierarchy, per-node `id` + inline `note: …` markers at each node where present — each note appears ONCE, the trailing "Node notes" roll-up is GONE), and AUTO-CAPTURES a snapshot artifact with explicit `provenance.kind: 'mindmap-snapshot'` — the maximize→fullscreen-chat target; no orchestrator action needed (rule 7). Legacy fallback: old threads cache the snapshot heuristic (boardId + zero optionIds).

On submit, `recordResponse` writes `response.json`, appends every op to `round-NN/tree-ops.jsonl` (append-only decision log), writes `edited-tree.json`, and refreshes `tree.md` ("Edited tree … (submitted)" heading).

On live edit, the studio debounce-POSTs the draft (`/api/board-draft`) and `recordBoardDraft` writes `round-NN/draft.json` + refreshes `tree.md` ("Live tree … (in progress)" heading). Maximizing the map flushes the draft first, so a fullscreen artifact-chat always reads the CURRENT tree.

Readers: `.claude/commands/read-mindmap.md` (prefers draft.json's live tree → tree.md), invoked by brainstorm-phases, run-brainstorm step 4, plan-closeout step 7, and now `.claude/commands/artifact-chat.md`'s mind-map branch (a chat improvement re-presents an improved TREE, never an svg-artisan SVG redraw of the snapshot).

## Reopen a completed thread

A completed (archived) thread can be brought back to life. The studio shows:
- An **↩ Reopen** button on the archived-thread banner (top of the main timeline).
- An **↩ reopen from here** action on each completed round's separator (on hover/always-visible on touch).

Clicking either confirms the user's intent, then posts `POST /api/command` with:
```json
{ "command": "reopen", "discussionId": "<id>", "round": <N> }
```

The bridge routes this to Claude via the UI-command plumbing (board-waiting or pending queue).
The procedure (`.claude/commands/reopen.md`):
1. `git mv` the thread's folder from `discussion/_completed/<slug>` back to `discussion/<slug>`.
2. Call `present_board` with the thread's `discussionId` to resume live at the given `round`.
3. Nothing is regenerated; the full history is preserved (rule 7).

The studio returns to the live view; the resumed board arrives over WebSocket and takes over.

## Seed intake — open with anything

`SeedIntakeSchema` (packages/protocol) is a discriminated union on `kind`:
`text` (string) | `sketch` (self-contained SVG markup; an annotated-photo scribble also carries
optional `photoDataUri`, `compositeDataUri` [a browser-rendered VISION-readable composite PNG],
and structured `annotations` [`ScribbleAnnotationsSchema`: viewBox, background, palette, items —
each mark's type, palette color NAME, coords, note text]) | `image` (uploaded raster) |
`voice` (speech-recognition transcript — only sent when recognition actually ran). A seed
rides `POST /api/command` (see system-architecture endpoints); non-text seeds are persisted
by the bridge and reach the orchestrator as a digest note pointing at the saved file (an
annotated scribble persists as a `.seeds/seed-<stamp>/` folder read via `/read-scribble`). A bad
or oversized image yields an honest failure note in the digest — never fake success (rule 6).

## Attachments — files ride the response

`ResponseAttachmentSchema` (packages/protocol): `{ name, dataUri, savedPath? }`;
`BoardResponse.attachments` (zod default `[]` — cached threads reload). The composer's
More Tools (+) menu offers **Attach file** (any file) and **Take a photo** (device camera);
attached files show as removable chips under the reply box and ship as data URIs (8 MB cap
in the studio). Before recording/broadcasting the response, the bridge
(`persistAttachment`) decodes each URI to `<thread dir>/attachments/`, blanks `dataUri`,
and sets `savedPath`; a malformed data URI or a payload over 10 MB gets NO `savedPath`.
The `feedbackDigest` then emits per file either
`Attachment "name" saved at <path> — Read it and fold it into the next round.` or an honest
`FAILED to persist` line (rule 6) — both land in `brainstorm.md` via recordResponse.

## Generation palettes — named colors constrain the SVGs

`PaletteColorSchema` (packages/protocol): `{ name, value }` (CSS color);
`BoardResponse.paletteColors` (zod default `[]`); `ThemeSchema.palette` (optional
`PaletteColor[]`). Each theme supplies one named 5-color palette in the studio's picker
(`themePalettes` in `PalettePicker.tsx`): the CURATED `Theme.palette` when present — every
built-in theme carries one in `apps/mcp/src/themes.ts`, anchored on the theme accent with
the composition rule *dark anchor + accent + supporting mid + contrast pop + grounding
neutral* (any subset still hangs together), tuned to 2026 color forecasts (sources: Pantone
Color of the Year 2026 "Cloud Dancer", pantone.com; Pinterest 2026 Palette,
newsroom.pinterest.com; Benjamin Moore COTY 2026 "Silhouette", benjaminmoore.com; LUXE 2026
interior color trends, luxesource.com) — else a derived light-variant fallback (accent,
ink, dim ink, surface, canvas; named "<Theme label> accent" etc.; `resolvePalette()` in
`PalettePicker.tsx`).

**Selection is BY THEME** (no individual multi-color picking): clicking a theme's NAME
makes its whole resolved palette the generation palette; clicking it again clears.
`BoardResponse.paletteColors` carries the resolved colors (board composer: **Colors** entry
inside the More Tools (+) menu — there the pick ALSO binds the theme to the live discussion
via `POST /api/session-theme`); the new-brainstorm `palette` field carries them from the
panel's inline Colors card. **Palettes are editable:** clicking any swatch opens a
color-edit dialog (HTML color picker + name field — every color keeps a name the user can
refer to in conversation); each row's **+** adds a new named color. Edits persist via
`POST /api/themes` as a drop-in theme JSON (`saveThemeFile` → `<stylesDir>/<name>.json`;
an edited built-in is shadowed by its saved copy from then on).

**Digest lines:** the `feedbackDigest` emits
`Palette: generate the next round's SVGs using ONLY these colors: Name (#hex), …` (the
new-brainstorm seed note carries the equivalent line). Additionally, when the thread has a
theme (`SessionInfo.theme`, optional — rule-5 shape), every `present_board` digest appends
`Discussion theme: <label>. Generate SVGs with its palette: Name (#hex), … The studio is
skinned with it; artifacts should harmonize.`

## Axes — minimum 5, tailored, never absolute

`present_board` REQUIRES ≥ 5 axes per board. Each axis is a **range** between two poles
(0–100), never an absolute value, and must be tailored to the initial prompt's domain:

- icons/branding: playful↔serious, flat↔glowing, geometric↔organic, monochrome↔colorful, literal↔abstract
- system design: low↔high cloud cost, simple↔complex, monolith↔distributed, managed↔self-hosted, build↔buy
- product/UX: dense↔minimal, guided↔expert, conservative↔novel, fast-to-ship↔polished, …

The point is to encourage multiple response signals per round beyond selection alone.

## Feedback packaging — the iterative-cycle contract

Visual brainstorming IS the packaging of UI feedback into the next round. The rules:

1. **Nothing is dropped.** Every gesture in the studio (selection, note, remix mark, dial
   move, lens mark, flaw, drag position, cluster, gap note, deck flick, duel pick,
   phase-tab click, model pick, file/photo attachment, palette-color pick, mid-round
   question answers, uncertainties, remix recipes, option annotations, command button)
   lands in `BoardResponse`. Mechanics the user touched ship their state
   even if a different phase tab is active at send time.
2. **The tool result is executable.** `present_board` returns a `feedbackDigest`: labeled,
   imperative instructions compiled from the response (option labels not ids, dial DELTAS
   with direction, per-verdict triage lists). A delegated model that never saw the board can
   execute the digest as-is. Digest lines include:
   - **Selected:** the chosen options (or "none — read the dials/notes/phase fields").
   - **Answer — "<question>":** responses to Claude's mid-round clarifying questions.
   - **Deck KEEP:** options flicked toward (resonate direction).
   - **Deck KILL:** options flicked away (drop direction).
   - **Annotated ON "<label>":** marks drawn directly on an option in fullscreen mode (mark count summary + "VIEW <savedPath>" when composite PNG available).
   - **UNSURE:** options flagged uncertain (never a silent kill — respond with clarifying variant or a mid-round question probing why it's hard to judge).
   - **Remix:** remix pairs + recipe (what to take from each side).
   - **Cluster geometry:** per-cluster tightness (welded/close/loose), closest cross-cluster neighbors (hybrid invitation), spatial outliers.
   - **RENAME / MOVE:** mind-map node structural edits (oldTopic→topic; move to new parent).
3. **Dial deltas are a complete instruction.** Moved axisValues with zero selections and no
   text MUST produce a visibly re-tuned next round — never a no-op. The studio marks moved
   dials (● + count) so the user knows the signal was captured; `requestedPhase` (clickable
   PhaseBar tabs) must likewise be honored on the very next board.
4. **Selections define the synthesis vector.** A round following selections consists of
   syntheses of the selected options (two picks → ~5 distinct compositions descended from
   both; one pick → spun variants). Unselected directions are dropped, never re-shown.
   `brainstorm.md` (auto-appended per round/response in the thread dir) is the text memory
   that makes re-synthesis provable across rounds and resumes.
   Three deck/duel fields refine the vector without changing the law:
   `deckVerdicts` (record optionId → keep|kill from the judge-deck flick — keeps join
   `selectedOptionIds`), `duelResults` (array `{pair:[a,b], winner}` — pairwise preferences
   from deck duels AND the converge sudden-death bracket), and `ranking` (the keeps ordered
   strongest-first, refined by duels). When `ranking` is present it LEADS the synthesis
   vector — weight the next round's syntheses toward the top of the order.
5. **Finalize hands artifacts to the target repo.** On a `finalize` response (or a
   plan-closeout command), the `feedbackDigest` appends the effective targetRepo and
   instructs Claude to ASK the operator exactly where inside it the final artifacts go (its
   wiki/, its discussion/, an app images folder, or custom) and to COPY — never move — the
   .svg + provenance .json sidecars; the originals stay archived here (rule 7). Procedure:
   step 6 of `.claude/commands/plan-closeout.md`.

## Model routing

The studio composer carries a model picker in its More Tools (+) menu (list from
`visual-brainstorm.config.json`).
`BoardResponse.model` returns the choice; the orchestrator (Claude Code) MUST delegate the
next round's generation to that model — e.g. spawn a subagent with the model override — and
may keep orchestrating in its own model.

**The picker only ever offers models usable on the live harness.** Each
`ModelCatalogEntry.engineIds` names the runtimes that can honestly delegate to it; the bridge
serves `state.models` filtered to entries whose `engineIds` include the active `runtime.id`
(`claude` today; Copilot/CODEX when built). This is enforced once, at the bridge (where the
runtime is authoritative), so both composer selects — new-discussion and per-round — are
correct without either knowing the runtime. Legacy string-configured models always match (they
are normalized with the live runtime's id); only explicitly cross-harness object entries (e.g.
a Copilot-only model in a Claude session) are withheld. Honesty guardrail (rule 6): never
offer a model the running harness cannot actually reach.

## Timeout strategy

Humans think slowly; brainstorming is the point. Default `present_board` timeout is 1740 s.
On timeout the tool returns `{ status: "pending", boardId }` — the board stays live in the
studio, the eventual response is persisted, and `peek_response` retrieves it. Claude should
treat `pending` as "check back", never as failure.

## Board-id uniqueness (response dedup)

The bridge keeps responses keyed by `boardId`, first-response-wins: a second response for a
known id is IGNORED — unless the id names a RECORDED round, which is a deliberate revisit
(§Return to a previous round). Therefore every `present_board` call must mint a fresh board
id — even when re-presenting "the same" board (Back, resume). Reusing an id silently
swallows the user's new answer.

## Return to a previous round (rewind)

Each history round's separator reveals a **⟲ return to this round** tag (on hover; always
visible on touch). It reopens that round's BoardSurvey prefilled from its recorded response
(`BoardSurvey`'s `initial` prop). Sending re-answers the OLD board:

- **Bridge** (`acceptRevisit`, bridge-server.ts): a response whose `boardId` matches an
  already-answered round is a revisit — that round's `response.json` is REWRITTEN with the
  new answer while `brainstorm.md` APPENDS the new digest; history is never erased (rule 7).
  Rounds after the rewound one stay on disk as superseded history.
- **Routing**: a wait blocked on the current board resolves NOW with the revisit response
  (its `boardId` names the rewound round); the `present_board` result digests against the
  REWOUND board so labels resolve and leads with a `REWIND:` instruction
  (apps/mcp/src/index.ts). With no wait blocked, a `revisit-round` command is queued for
  the next check-in.
- **Orchestrator procedure**: `.claude/commands/revisit-round.md` — rebuild the funnel from
  the rewound round's steering; never build on the superseded rounds.

## Authoring guidance for Claude (the intelligence layer)

- Options must be **meaningfully divergent** — 6 near-identical icons is a wasted round.
  Vary along the axes the user cares about; name each option after its idea, not "Option 3".
- Every option's SVG must be self-contained: `viewBox` set, no external refs, no raster.
- Use `axes` for taste dials ("playful ↔ corporate", "dense ↔ minimal") instead of asking in prose.
- Honor remix pairs literally: the next round must contain visible offspring of both parents.
- Between rounds, narrate briefly in the tool `prompt` what changed since last round — the
  studio shows it as the round's chat bubble.
