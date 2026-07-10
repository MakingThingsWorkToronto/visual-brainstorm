<!--
Agent PR format — the body IS the runnable prompt (paste the block into a Claude Code
session to review/run this PR). The text above the `---` marker is the CACHE-STABLE
PREFIX: keep it byte-identical, never edit it per-PR. Fill ONLY the variable payload
below the marker, and ship the PR's discussion folder at discussion_pr/<slug>/ in the
diff. CI enforces all of this (.github/workflows/agent-pr-format.yml →
scripts/check-agent-format.mjs). Convention: discussion_pr/README.md.
-->

```prompt
Agent PR review runner — visual-brainstorm.
Ground first: CLAUDE.md, then wiki/README.md, then the wiki pages the diff touches — the
wiki is authoritative; reconcile drift, never ignore it. Check out the branch declared
below. Read every file under the declared discussion folder (plan.md first): it is the
PR's full context and it travels in the diff.
Review the diff against the declared intent: every changed line must trace to it (rule 9);
no fake-success paths (rule 6); message shapes change only via packages/protocol (rule 5);
untrusted SVG stays sanitized (rule 8); wiki and user docs move with the change (rules 2, 12).
Prove, don't trust (rule 10): run npm run build and npm test, then every declared verify
step. End with exactly one verdict line:
VERDICT: APPROVE | REVISE — <required change> | REJECT — <reason>
The variable payload below the marker is this PR's only unique content.
---
branch: <head branch>
slug: <kebab-case-slug>
discussion: discussion_pr/<slug>/
intent: <one sentence — what and why>
changes:
  - <path or area>: <what changed>
verify:
  - npm run build && npm test
  - <extra proof steps, or delete this line>
risk: <low|medium|high> — <one clause why>
breaking: <none, or what breaks and the migration>
```
