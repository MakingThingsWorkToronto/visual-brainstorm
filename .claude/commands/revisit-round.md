---
model: inherit
---

# /revisit-round — the user returned to a previous round and re-answered it

The studio's return-to-round control (the ⟲ tag on a round separator) re-opened a previous
round's answers; the user changed them and sent again. The bridge re-recorded that round's
`response.json` (brainstorm.md appended the new digest — history is never erased) and routed
the rewind to you one of two ways:

- **You were blocked in `present_board`** — the wait resolved with the revisit response;
  its `boardId` names the REWOUND round (not the board you presented) and the digest leads
  with a `REWIND:` instruction.
- **You were between rounds** — a `revisit-round` command arrives (queued into the next
  tool result / `session_status.pendingUiCommands`) whose seedNote points at the updated
  `round-NN/response.json`.

## Procedure

1. **Read the rewound round's steering.** The revisit response IS the new instruction set:
   selections, notes, dials, triage, elaboration — same contract as any board response
   (`wiki/Requirements/interaction-protocol.md`). If it arrived as a queued command, Read
   the named `response.json` and the tail of `brainstorm.md`.
2. **Rewind the funnel state.** Rounds AFTER the rewound one are superseded history: never
   delete them (rule 7 — nothing is erased), but do not build on them. Note the rewind in
   your working context: the funnel now continues from the rewound round.
3. **Regenerate from that steering.** Present the next board as if the rewound round had
   just been answered this way — same phase rules as `.claude/skills/brainstorm-phases`
   (respect `requestedPhase`, dial deltas, triage verdicts, model routing). Delegate
   generation to `svg-artisan` as always.
4. **Narrate honestly.** The next board's `prompt` says it rebuilds from round N with the
   changed steering — the user must see the rewind acknowledged.

## Changelog
- 2026-07-07 — created (return-to-round feature, discussion/ui-changes plan item 4)
