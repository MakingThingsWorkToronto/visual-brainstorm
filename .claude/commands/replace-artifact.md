---
model: haiku
---

# /replace-artifact — regenerate a killed artifact's slot (studio kill verdict)

The user opened a captured artifact fullscreen and clicked **✕ Kill** (with an optional
note). The bridge recorded the verdict, broadcast a live placeholder into the killed slot
(`artifact-pending`), and routed command `replace-artifact` to you — via a board response
(`commands:['replace-artifact']`), via `session_status.pendingUiCommands`, via the next
tool result, or via `open_studio`/`waitForCommand`. Like artifact-chat, this is a DETOUR,
not a phase change: the studio is showing a shimmering "↻ replacing…" chip until your
replacement streams in.

The seedNote carries everything: the killed artifact's name, slug, svgPath, its
**characteristic** (the board option label/description it came from), and the user's
**verdict note** — the note says what was WRONG or what to try instead.

## Procedure

1. **Read the killed SVG** (its svgPath) — it is the ANTI-REFERENCE: the replacement must
   serve the same slot (same board direction, same palette/theme rules in force) while
   abandoning what the note rejects. Read the thread's `brainstorm.md` rolling digest if
   you need the round's context (palette, theme, direction).
2. **Emit the structured status boundary** so the studio's activity line correlates to the
   slot (deterministic, no model):
   `node scripts/pipe-progress.mjs --source orchestrator --stage replacing --artifact <killed slug> --note "regenerating <name>"`
3. **ALWAYS delegate generation to svg-artisan** — never draw inline (rule 11). Brief it
   with: the characteristic (what the slot IS), the verdict note (what to change — this
   outranks everything), the killed SVG path (as anti-reference, never to patch), and the
   thread's palette/theme constraints. Any `BoardResponse.model` override in force for the
   thread applies here too. ONE replacement option, full self-contained SVG per
   `.claude/skills/svg-authoring`.
4. **Capture into the killed slot**: `capture_artifact` with `replaces: "<killed slug>"`
   plus the SAME provenance the seedNote names (`boardId`, `optionIds`). The bridge stamps
   the killed artifact's `replacedBy`, retires the placeholder, and every tab swaps the
   slot — no reply tool is involved (this is not a chat).
5. **Rules.** The killed artifact is never deleted or overwritten (rule 7) — it stays on
   disk with its verdict; only the shelf hides it. Replacement SVGs must be sanitize-safe
   (rule 8). If the artisan fails, emit an honest progress note
   (`--note "replacement failed: <why>"`) and leave the placeholder — never capture a
   fabricated result (rule 6).
6. **Resume.** Return to exactly what the session was doing. If this detour interrupted a
   blocked `present_board` (the park digest says so), resume with
   `present_board {rearmBoardId: "<the parked boardId>"}` — no options/tree; a submit that
   landed during the detour returns immediately. Siblings still generating keep
   generating — a kill never blocks the rest of the round.

## Changelog
- 2026-07-09 — created (in-progress-feedback-2026-07-09: fullscreen kill verdict → async
  slot regeneration guided by characteristic + note; mirrors the artifact-chat detour
  contract including the rearm resume)
