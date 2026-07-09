---
model: sonnet
---

# /compress-learnings — harvest learnings into the agentic layer (and compact the log)

The PRIMARY job of this command is to make the **agentic layer** (commands, skills, agents,
wiki) absorb what `.agents/learnings.md` has recorded — so a lesson lives where it will be
ENFORCED next session, not just written down once. Compacting the log to keep it cheap to load
(rule 4 / CLAUDE.md §Session bootstrap loads it in full) is a SECONDARY, trigger-gated step.

**Run cadence:** every **two weeks**, OR any time `.agents/learnings.md` exceeds **700 lines**
(see `wiki/Meta/agentic-loop.md`). And run the harvest step (§A) **every time it is invoked
manually** — a manual invocation is a request to improve the agentic layer NOW, so it never
early-exits with "nothing to do". This is a LEARN/IMPROVE-stage housekeeping task, not a plan;
it needs no `discussion/` folder.

## A. Harvest — persist learnings into the agentic layer (ALWAYS runs)

This is the point of the command. Do it on every manual invocation regardless of log size or age.

1. **Read the log.** Read `.agents/learnings.md` (newest first; each entry is a
   `## <yyyy-mm-dd> — <title>` block with bullets). Focus on entries added since the last run
   (the previous `## Changelog` date below is the watermark), but scan the whole file for any
   durable rule that is NOT yet enforced somewhere in the agentic layer.

2. **For each load-bearing lesson, ask "which file would have PREVENTED this?"** (the closeout
   step-4 question). The lesson belongs in whichever authoritative surface a fresh session
   actually reads before acting:
   - a **command** (`.claude/commands/`) — a procedure gained a new step/guardrail;
   - a **skill** (`.claude/skills/`) — binding craft (svg-authoring, brainstorm-phases);
   - an **agent** (`.claude/agents/` — e.g. `brainstorm-orchestrator`'s own
     `## Orchestration learnings` section) — role muscle-memory;
   - the **wiki** (`wiki/`) — an authoritative fact/guardrail: delegate to the
     **`wiki-librarian`** agent (it logs to `wiki/log.md` and reloads the MCP index; rule 2).
   Make the edit surgically (rule 9). If a lesson is already enforced, note it and move on —
   do NOT duplicate it.

3. **When a lesson implies a MISSING command/skill/agent, surface it via `AskUserQuestion`.**
   If the same class of work has now been done ad-hoc more than once (CLAUDE.md rule: "asked
   twice = failure"), or a learning explicitly says a procedure is unowned, propose creating or
   extending the owning layer — present the concrete candidate(s) with `AskUserQuestion` (option
   1 = your recommendation, labelled "(Recommended)"). Do NOT scaffold a new command unilaterally;
   let the operator choose. If they accept, follow up with `/new-command` (new procedure) or
   `/create-dispatch-command` (loopable build plan) as appropriate. If nothing is missing, say so.

4. **Record what you harvested.** For each learning you acted on, note the target file in your
   summary so the compaction step (§B) and future runs can see it's now enforced. An edit to a
   command/skill/agent this run is itself a candidate for a one-line follow-up in the log if it
   introduced a new guardrail worth remembering — but avoid recursion; prefer the changelog note.

## B. Compact — keep the log cheap to load (runs only when TRIGGERED)

Run this section only if **either** trigger holds: (a) it has been ≥ two weeks since the last
compaction (previous `## Changelog` date), **or** (b) `.agents/learnings.md` is over **700 lines**
(`wc -l`). If neither holds, SKIP §B and report "harvest done; no compaction triggered" — do not
churn the file.

1. **Set the recency window.** Verbatim window = **14 days** back from today (`# currentDate` in
   context). Entries dated within the window stay untouched; older ones are compacted. (If a
   trigger fired on SIZE but every entry is still inside the 14-day window, the log is genuinely
   dense-and-recent: report that and leave it verbatim — compacting recent entries loses fidelity
   the sessions still need. Prefer to let it grow a few days over distilling fresh lessons early.)

2. **Split the log.** **recent** (≥ today − 14d) stays verbatim; **old** (older) is compacted. Any
   existing `## Compacted (archived …)` section counts as already-compacted — leave its lines in
   place and MERGE new compaction into it (don't create a second Compacted heading).

3. **Archive the originals first (never lose a fact — rule 6).** Prepend each OLD entry's FULL
   original block, unchanged, to `.agents/learnings-archive.md` (create it with a
   `# Agentic Learnings — Archive (full originals, newest first)` header if absent). Newest first,
   so the archive mirrors the live log's ordering. Verify the bytes landed (`git diff` / re-read)
   BEFORE step 4 deletes anything.

4. **Distill the old set into durable one-liners** under a single `## Compacted (archived <today>)`
   section at the BOTTOM of the live log (after the recent entries):
   `- <the durable rule> — <why it matters> ([[related-slug]] if apt).`
   - One line per *distinct* durable lesson. **Deduplicate aggressively** — recurring lessons
     (shared-tree commit hygiene, preview-is-not-proof, StudioState-field ripple) collapse to ONE
     line that cites the pattern, not one per occurrence.
   - Keep the *rule + the why*; drop the war story, filenames, and line numbers (those live in the
     archive and in the code). A future session must be able to act on the line alone.
   - Preserve `[[wiki-link]]` cross-references where they add navigation value.
   - A lesson already fully harvested into a command/skill/agent/wiki in §A can compact to an even
     terser pointer (e.g. `- <rule> — now enforced in <file>`), since the enforcement is the memory.

5. **Rebuild the file.** `.agents/learnings.md` = the `# Agentic Learnings (newest first)` header +
   the RECENT entries verbatim (unchanged order) + the merged `## Compacted (archived <today>)`
   section at the end. Confirm every OLD entry is now represented either by a compacted line here
   OR verbatim in the archive — no orphan facts.

## C. Verify & commit

1. **Verify.** If §B ran, `git diff --stat .agents/` should show the live log shrank and the
   archive grew; spot-check three compacted lines trace back to real archived entries. If only §A
   ran, `git diff` shows edits to the harvested `.claude/**`/`wiki/**` files. This command ships no
   product code, so no build/test is required — but if the log referenced a since-deleted
   command/skill, note it for the next `/plan-closeout` rather than fixing it here.

2. **Commit.** `git commit --only` the exact files you changed (never `git add -A` — shared working
   tree, donor rule). Include the log/archive if §B ran, plus any harvested `.claude/**` files
   (delegate wiki commits to `wiki-librarian`, which owns `wiki/log.md`). Message:
   `chore(learnings): harvest into agentic layer` + `; compact entries older than <date>` if §B ran.

3. **Update the changelog watermark** below so the next run knows where to start.

## Changelog
- 2026-07-09 — reframed: harvest into the agentic layer is now the PRIMARY step and always runs on
  manual invocation; new-command needs surfaced via `AskUserQuestion`; compaction gated on
  every-two-weeks OR >700-line triggers (was: weekly compaction only).
- 2026-07-08 — created (from wiki-mcp-and-learnings-compaction-2026-07-08)
