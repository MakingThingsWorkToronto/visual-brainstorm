# Improve the New Discussion handoff to the studio UI

**Status:** closed 2026-07-09

**Ask (Matt):** On a plain *New Discussion* the panel's opening bubble text is fine.
But on a **run-brainstorm handoff** (Claude already knows what we're making), that
paragraph should be a *summary of the brainstorm* instead of the generic prompt — more
intuitive. Also the intake **questions should have answers pre-selected (recommended)**
so the human can hit *Send & iterate* without filling the form. "Improve the handoff to ui."

## Design (rule 5: protocol is SSOT)

Enrich the handoff carried on `StudioState.seedBrief` from a bare `string` to a `SeedBrief`:

```ts
interface SeedBrief {
  brief?: string;                        // pre-fills the textarea (existing behavior)
  summary?: string;                      // shown in the panel bubble in place of the generic prompt
  questions?: SurveyQuestion[];          // BESPOKE intake survey the orchestrator authors for THIS brief
  picks?: Record<string, string[]>;      // pre-selected answers by question id
}
```

**Follow-up (Matt):** don't pigeonhole the orchestrator into a preset. Promote `SurveyQuestion`
+ the preset (`DEFAULT_INTAKE_QUESTIONS`) into `packages/protocol`; on a Claude-Code
run-brainstorm the orchestrator AUTHORS creative questions anchored to the brief
(`SeedBrief.questions`, replacing the preset). The preset is only for a blank UI-started
New Discussion. The panel renders whichever set is active and chunks it two-per-row generically.

Flow: `open_studio(brief, summary, picks)` → `bridge.openStudio(SeedBrief)` → `state.seedBrief`
→ `hello` → `NewDiscussionPanel` renders the summary bubble + pre-selected answers.

## Steps

1. **protocol** — add `SeedBrief`; change `StudioState.seedBrief` to `SeedBrief | null`.
2. **bridge-server** — `seedBrief: SeedBrief | null`; `openStudio(seed?: SeedBrief)` normalizes/trims.
3. **mcp/index.ts** — `open_studio` gains `summary` + `picks` params (options enumerated for the model).
4. **studio/App.tsx** — pass `seedBrief={state.seedBrief}` to the panel.
5. **NewDiscussionPanel** — prop `seedBrief`; summary bubble; seed `answers` from `picks`
   (respect single/multi; unknown values → free-text "other").
6. **ui-smoke.ts** — update the handoff assertion; ADD summary-bubble + pre-selected-picks checks.
7. **Docs** — run-brainstorm.md step 0a + open_studio tool desc + wiki (rule 12/2).
8. **Verify** — `npm run build` + `npm test`.
