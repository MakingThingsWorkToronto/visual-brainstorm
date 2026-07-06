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
| `capture_artifact` | no | persist an accepted SVG with provenance (+ copy to `targetRepo` if configured); appears on the studio's artifact shelf |
| `list_discussions` | no | enumerate the thread cache (`.docs/discussion`) |
| `load_discussion` | no | reload a full cached thread so a chat reinitializes without regenerating anything |
| `session_status` | no | thread dir, round count, artifact list |

## Axes — minimum 5, tailored, never absolute

`present_board` REQUIRES ≥ 5 axes per board. Each axis is a **range** between two poles
(0–100), never an absolute value, and must be tailored to the initial prompt's domain:

- icons/branding: playful↔serious, flat↔glowing, geometric↔organic, monochrome↔colorful, literal↔abstract
- system design: low↔high cloud cost, simple↔complex, monolith↔distributed, managed↔self-hosted, build↔buy
- product/UX: dense↔minimal, guided↔expert, conservative↔novel, fast-to-ship↔polished, …

The point is to encourage multiple response signals per round beyond selection alone.

## Feedback packaging — the iterative-cycle contract

Visual brainstorming IS the packaging of UI feedback into the next round. Three rules:

1. **Nothing is dropped.** Every gesture in the studio (selection, note, remix mark, dial
   move, lens mark, flaw, drag position, cluster, gap note, phase-tab click, model pick,
   command button) lands in `BoardResponse`. Mechanics the user touched ship their state
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

## Model routing

The studio composer carries a model picker (list from `visual-brainstorm.config.json`).
`BoardResponse.model` returns the choice; the orchestrator (Claude Code) MUST delegate the
next round's generation to that model — e.g. spawn a subagent with the model override — and
may keep orchestrating in its own model.

## Timeout strategy

Humans think slowly; brainstorming is the point. Default `present_board` timeout is 1740 s.
On timeout the tool returns `{ status: "pending", boardId }` — the board stays live in the
studio, the eventual response is persisted, and `peek_response` retrieves it. Claude should
treat `pending` as "check back", never as failure.

## Authoring guidance for Claude (the intelligence layer)

- Options must be **meaningfully divergent** — 6 near-identical icons is a wasted round.
  Vary along the axes the user cares about; name each option after its idea, not "Option 3".
- Every option's SVG must be self-contained: `viewBox` set, no external refs, no raster.
- Use `axes` for taste dials ("playful ↔ corporate", "dense ↔ minimal") instead of asking in prose.
- Honor remix pairs literally: the next round must contain visible offspring of both parents.
- Between rounds, narrate briefly in the tool `prompt` what changed since last round — the
  studio shows it as the round's chat bubble.
