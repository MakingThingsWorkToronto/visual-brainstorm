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
| `ask_concierge` | yes (timeout → `pending`) | adaptive concierge intake (wiki/Product/intake-methodologies.md): after the New Discussion brief, ask ONE clarifying question in the studio and block for the answer. Ask AS MANY as it takes — not a fixed count; comprehensiveness rewards the brainstorm. Provide tappable `suggestions` (user picks any/all/none, or types their own). Presented in ConciergeIntake surface. Each answer returns and appends to the thread's `brainstorm.md` digest. Returns `{status:"answered", answer}` or `{status:"pending"}` on timeout |
| `present_gallery` | yes (timeout → `pending`) | Living Gallery (wiki/Product/intake-methodologies.md): after the concierge Q&A, present the methodologies as method cards — Mind map, Funnel, Wreck, Cluster. Each card carries a LIVE mini SVG genuinely seeded from the brief + answers (delegate the 4 minis to `svg-artisan`). Mark exactly ONE `recommended:true` with a `reason` quoting user's answers; it is accent-ringed + ribboned in the studio's LivingGallery surface. Block until the user picks one. The pick routes to the starting mechanic (mindmap → tree board; funnel/wreck/cluster → that phase). Returns `{status:"picked", method}` or `{status:"pending"}` on timeout |
| `present_board` | yes (timeout → `pending`) | push a board, await the survey response; `discussionId` resumes a cached thread |
| `peek_response` | no | recover a response after a client-side timeout |
| `capture_artifact` | no | persist an accepted SVG with provenance (+ copy to the EFFECTIVE targetRepo's `brainstorm-artifacts/` — thread override ?? config default); appears on the studio's artifact shelf. Optional `revises: <parent slug>` marks a revision (`Artifact.provenance.revises`) — a change is a NEW artifact linked to its parent, never an overwrite (rule 7) |
| `list_discussions` | no | enumerate the thread cache (`discussion`) |
| `load_discussion` | no | reload a full cached thread so a chat reinitializes without regenerating anything |
| `session_status` | no | thread dir, round count, artifact list, effective targetRepo, pendingUiCommands, and each board's in-progress `draft` (the user's live dials/selections/notes/model — read it to answer an artifact-chat referencing the dials they set) |
| `compose_poster` | no | DETERMINISTIC (no model) decision-poster composition: winner embedded large + lineage tree (parents/grandparents from cached rounds) + the notes that decided it (lineage perOptionNotes + elaborations) as ONE self-contained SVG; captured via the normal artifact path (rule 7 provenance) and copied to the effective targetRepo like any artifact; throws honestly if the optionId is in no cached round |
| `reply_artifact_chat` | no | Claude's answer channel for the artifact chat: `{artifactSlug, text, revisedSlug?, discussionId?}` — persists a `claude`-role `ArtifactChatMessage` to the owning thread's `artifacts/chat.jsonl` and broadcasts the `artifact-chat` WS envelope (carrying `discussionId`). `artifactSlug` may be an `option:<boardId>:<optionId>` slug (option chat, below) — used EXACTLY as delivered. Pass `discussionId` for an ARCHIVED thread so the reply records in place |

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
1. **Non-destructive park** — when a chat arrives while `present_board` blocks, the bridge
   resolves the wait with an `action:'park', commands:['artifact-chat']` response BUT does not
   clear `activeBoard` or record a park response. The board stays live (the studio's
   `BoardSurvey` never unmounts, dials intact); the orchestrator answers, then re-enters
   `present_board` on the SAME board (`recordBoard` is idempotent by id) to re-arm the resolver.
   Only artifact-chat is non-destructive — a real park / plan-closeout still goes through
   `acceptResponse`.
2. **Board draft persistence** — the studio debounce-POSTs the in-progress answer (dials/
   selections/notes/elaboration/model — a `BoardResponse` snapshot) to `POST /api/board-draft`;
   `SessionStore.recordBoardDraft` writes `round-NN/draft.json` (last-write-wins, one per board,
   SEPARATE from the submitted `response.json`) and it rides `StudioState.drafts` + a `draft` WS
   envelope. This is "the generation meta" — it restores dials on a re-presented board and
   reloads with the thread (`session_status`/`load_discussion` surface it for recall).

Chat history persists in `artifacts/chat.jsonl` and reloads with the thread —
`GET /api/discussions/<id>` returns `artifactChat`. The chat is a detour — after replying, the
orchestrator resumes whatever the session was doing. Archived (completed) threads are
thread-addressed and remain interactive (answer-in-place; see the loop above).

**Pinned artifacts.** A captured artifact can be pinned from the fullscreen viewer's 📌 toggle (live threads only); pinned artifacts appear in a dedicated "📌 pinned" row beneath the WayfinderStrip. Pins persist per-thread in `session.json` (`SessionInfo.pinnedSlugs: string[]`) and reload with the thread. On completed/archived threads, pinned artifacts appear read-only (no pin toggle). The pin control sends `POST /api/pinned {slug}` (validates the slug is a live-thread artifact, 404 otherwise), which `SessionStore.togglePinned(slug)` toggles, rewrites `session.json`, appends a one-line brainstorm.md note, and broadcasts `hello`.

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
   phase-tab click, model pick, file/photo attachment, palette-color pick, command button)
   lands in `BoardResponse`. Mechanics the user touched ship their state
   even if a different phase tab is active at send time.
2. **The tool result is executable.** `present_board` returns a `feedbackDigest`: labeled,
   imperative instructions compiled from the response (option labels not ids, dial DELTAS
   with direction, per-verdict triage lists). A delegated model that never saw the board can
   execute the digest as-is.
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
