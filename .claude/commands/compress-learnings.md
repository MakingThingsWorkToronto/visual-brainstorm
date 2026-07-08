---
model: sonnet
---

# /compress-learnings — weekly compaction of the agentic learnings log

Keeps `.agents/learnings.md` cheap to load every session (rule 4 / CLAUDE.md §Session
bootstrap loads it in full) by distilling OLD entries into durable one-liners while keeping
RECENT ones verbatim. **Nothing is ever lost** — every full original moves to
`.agents/learnings-archive.md`. Run weekly (see `wiki/Meta/agentic-loop.md` — Weekly
maintenance). This is a LEARN/IMPROVE-stage housekeeping task, not a plan; it needs no
`discussion/` folder.

## Procedure

1. **Set the recency window.** Verbatim window = **14 days** back from today
   (`# currentDate` in context). Entries dated within the window stay untouched; older ones
   are compacted. (If nothing is older than the window, STOP and report "nothing to
   compact" — do not churn the file.)

2. **Read the log.** Read `.agents/learnings.md`. Each entry is a `## <yyyy-mm-dd> — <title>`
   block (newest first) with bullet sub-points. Split into two sets by date:
   **recent** (≥ today − 14d) and **old** (older). Any existing `## Compacted (archived …)`
   section counts as already-compacted — leave its lines in place and MERGE new compaction
   into it (don't create a second Compacted heading).

3. **Archive the originals first (never lose a fact — rule 6).** Prepend each OLD entry's
   FULL original block, unchanged, to `.agents/learnings-archive.md` (create it with a
   `# Agentic Learnings — Archive (full originals, newest first)` header if absent). Newest
   first, so the archive mirrors the live log's ordering. Verify the bytes landed
   (`git diff` / re-read) BEFORE step 4 deletes anything.

4. **Distill the old set into durable one-liners.** For each old entry, extract its
   load-bearing lesson(s) as terse lines under a single `## Compacted (archived <today>)`
   section placed at the BOTTOM of the live log (after the recent entries):
   `- <the durable rule> — <why it matters> ([[related-slug]] if apt).`
   Rules for distillation:
   - One line per *distinct* durable lesson. **Deduplicate aggressively** — recurring
     lessons (e.g. shared-tree commit hygiene, preview-is-not-proof, StudioState-field
     ripple) collapse to ONE line that cites the pattern, not one per occurrence.
   - Keep the *rule + the why*; drop the war story, filenames, and line numbers (those live
     in the archive and in the code). A future session must be able to act on the line alone.
   - Preserve `[[wiki-link]]` cross-references where they add navigation value.

5. **Rebuild the file.** `.agents/learnings.md` = the `# Agentic Learnings (newest first)`
   header + the RECENT entries verbatim (unchanged order) + the merged
   `## Compacted (archived <today>)` section at the end. Confirm every OLD entry is now
   represented either by a compacted line here OR verbatim in the archive — no orphan facts.

6. **Verify.** `git diff --stat .agents/` should show the live log shrank and the archive
   grew. Spot-check three compacted lines trace back to real archived entries. This command
   ships no code, so no build/test is required — but if the log referenced a since-deleted
   command/skill, note it for the next `/plan-closeout` rather than fixing it here.

7. **Commit.** `git commit --only .agents/learnings.md .agents/learnings-archive.md` with
   `chore(learnings): weekly compaction — distill entries older than <date>`. Never
   `git add -A` (shared working tree — donor rule).

## Changelog
- 2026-07-08 — created (from wiki-mcp-and-learnings-compaction-2026-07-08)
