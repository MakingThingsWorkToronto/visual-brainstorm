# Interaction Protocol

The contract for how Claude Code, the MCP server, and the studio collaborate. This is what
makes it "brainstorming" rather than "generation".

## The funnel

Boards carry a `phase` (diverge → mutate → wreck → cluster → converge); the studio
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
| `present_board` | yes (timeout → `pending`) | push a board, await the survey response; `discussionId` resumes a cached thread |
| `peek_response` | no | recover a response after a client-side timeout |
| `capture_artifact` | no | persist an accepted SVG with provenance (+ copy to the EFFECTIVE targetRepo's `brainstorm-artifacts/` — thread override ?? config default); appears on the studio's artifact shelf. Optional `revises: <parent slug>` marks a revision (`Artifact.provenance.revises`) — a change is a NEW artifact linked to its parent, never an overwrite (rule 7) |
| `list_discussions` | no | enumerate the thread cache (`discussion`) |
| `load_discussion` | no | reload a full cached thread so a chat reinitializes without regenerating anything |
| `session_status` | no | thread dir, round count, artifact list, effective targetRepo, pendingUiCommands |
| `open_studio` | yes (timeout → `waiting`) | open the studio with NO board — the New Discussion landing panel — and block until the panel submits a brief (arrives as a new-brainstorm command with prompt/seed notes) or timeout returns `{status:"waiting"}` (the studio stays open; call again or check `session_status.pendingUiCommands`). For a bare `/run-brainstorm` (its step 0): land the user on the panel and build AskUserQuestion clarifications on the submission. The placeholder "New discussion" thread is retitled by the first `present_board` (`SessionStore.retitle` — display title only, directory slug unchanged) |
| `compose_poster` | no | DETERMINISTIC (no model) decision-poster composition: winner embedded large + lineage tree (parents/grandparents from cached rounds) + the notes that decided it (lineage perOptionNotes + elaborations) as ONE self-contained SVG; captured via the normal artifact path (rule 7 provenance) and copied to the effective targetRepo like any artifact; throws honestly if the optionId is in no cached round |
| `reply_artifact_chat` | no | Claude's answer channel for the artifact chat: `{artifactSlug, text, revisedSlug?}` — persists a `claude`-role `ArtifactChatMessage` to `<thread dir>/artifacts/chat.jsonl` and broadcasts the `artifact-chat` WS envelope |

## Artifact chat

Clicking a captured artifact in the studio opens it fullscreen with a chat panel
(simplified composer: one input + Send). The loop:

1. **Studio → bridge.** `POST /api/artifact-chat` `{artifactSlug, text}`. The bridge
   persists the user message (append-only `<thread dir>/artifacts/chat.jsonl` plus a
   `brainstorm.md` line), broadcasts an `artifact-chat` WS envelope, and routes the request
   to Claude Code through the EXISTING UI-command plumbing as command `artifact-chat`:
   board awaiting response → synthetic park response with `commands:['artifact-chat']` and
   the question in `elaboration`/`seedNote`; otherwise queued into `pendingUiCommands` /
   the next tool result / `waitForCommand`. Unknown slug → honest 404 (rule 6).
2. **Orchestrator → subagent, ALWAYS** (operator mandate). Procedure:
   `.claude/commands/artifact-chat.md`. Questions go to a general subagent (Reads the SVG +
   the thread's `brainstorm.md` for provenance); change requests go to `svg-artisan`
   (thread model override applies), which produces a full self-contained revised SVG. The
   orchestrator never answers or regenerates inline — it only routes and replies.
3. **Reply.** A change: `capture_artifact` with `revises: <original slug>` (new artifact,
   original untouched — rule 7), then `reply_artifact_chat` with text + `revisedSlug`; the
   studio refreshes every display of the artifact. A question: `reply_artifact_chat` with
   the answer text only.
4. **Shapes** (packages/protocol, rule 5): `ArtifactChatMessage
   { artifactSlug, role: 'user'|'claude', text, at, revisedSlug? }`; `StudioState.artifactChat`;
   `ServerToStudio` `artifact-chat` envelope; `Artifact.provenance.revises?`.

Chat history persists in `artifacts/chat.jsonl` and reloads with the thread. The chat is a
detour — after replying, the orchestrator resumes whatever the session was doing.

## Seed intake — open with anything

`SeedIntakeSchema` (packages/protocol) is a discriminated union on `kind`:
`text` (string) | `sketch` (self-contained SVG markup) | `image` (uploaded raster) |
`voice` (speech-recognition transcript — only sent when recognition actually ran). A seed
rides `POST /api/command` (see system-architecture endpoints); non-text seeds are persisted
by the bridge and reach the orchestrator as a digest note pointing at the saved file. A bad
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

## Timeout strategy

Humans think slowly; brainstorming is the point. Default `present_board` timeout is 1740 s.
On timeout the tool returns `{ status: "pending", boardId }` — the board stays live in the
studio, the eventual response is persisted, and `peek_response` retrieves it. Claude should
treat `pending` as "check back", never as failure.

## Board-id uniqueness (response dedup)

The bridge keeps responses keyed by `boardId`, first-response-wins: a second response for a
known id is IGNORED. Therefore every `present_board` call must mint a fresh board id — even
when re-presenting "the same" board (Back, resume). Reusing an id silently swallows the
user's new answer.

## Authoring guidance for Claude (the intelligence layer)

- Options must be **meaningfully divergent** — 6 near-identical icons is a wasted round.
  Vary along the axes the user cares about; name each option after its idea, not "Option 3".
- Every option's SVG must be self-contained: `viewBox` set, no external refs, no raster.
- Use `axes` for taste dials ("playful ↔ corporate", "dense ↔ minimal") instead of asking in prose.
- Honor remix pairs literally: the next round must contain visible offspring of both parents.
- Between rounds, narrate briefly in the tool `prompt` what changed since last round — the
  studio shows it as the round's chat bubble.
