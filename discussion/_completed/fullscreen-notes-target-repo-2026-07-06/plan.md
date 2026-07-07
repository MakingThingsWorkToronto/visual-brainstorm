# Plan: fullscreen-on-click everywhere + target repo/folder button

**Status:** closed 2026-07-06

## Request

1. In ALL screens, clicking the SVG opens the full-screen view (zoom/pan matters for dense
   system-architecture boards). Notes (and read-only tag display) available on the
   visualization same as what exists today — including inside the full-screen view.
2. A target repo/folder button: connect the tool to a different repo (any plain Windows
   folder) so Claude can read that repo's wiki / generate plans for it, and so
   `/plan-closeout` hands the final selected artifacts to it.

## Operator decisions (asked 2026-07-06)

- Closeout hand-off: **COPY, never move** — originals stay archived in `discussion/_completed/`.
- Destination inside the target: **ask the human at closeout time** (likely `wiki/` or
  `discussion/`, possibly an app images folder).
- Persistence: **both** a config-file default (set via the bridge) **and** a per-thread
  override. Target may be any standard Windows folder, not necessarily a git repo.
- User tags: **notes only** — tags stay read-only (model-authored).

## Changes

### A. Fullscreen + notes on every surface (apps/studio)

- `PreviewModal.tsx` — optional `tags` (read-only chips in header) and `note`/`onNoteChange`
  (docked textarea; writes into the same `perOptionNotes` flow that already ships with every
  response regardless of phase).
- `BoardSurvey.tsx` — owns its own preview state + renders `PreviewModal` with note editing
  (gated on `survey.allowPerOptionNotes`); passes `onPreview(option)` into every phase
  mechanic; diverge/expand card: SVG pane click = fullscreen (replaces the ⛶ button),
  label/checkbox row = select.
- `MutationLab` / `WreckYard` / `TriageGate` — SVG pane click → `onPreview(option)`.
- `ProximityField` — click-vs-drag disambiguation on chips (pointerup with <4px movement =
  preview).
- `App.tsx` — history previews pass `tags` (read-only, no notes: round is closed); drop the
  now-unused `onPreview` prop into `BoardSurvey`.

### B. Target repo/folder (protocol + mcp + studio)

- `packages/protocol` (rule 5): `StudioState.targetRepo: string | null` (effective value);
  `SessionInfoSchema.targetRepo?: string` (per-thread override, persisted in session.json).
- `apps/mcp/src/config.ts`: `saveTargetRepo()` — surgical read-modify-write of
  `visual-brainstorm.config.json` preserving other keys.
- `session-store.ts`: `setTargetRepo()` — updates `session.json`, logs to `brainstorm.md`.
- `bridge-server.ts`: `POST /api/target-repo` `{ path: string|null, scope: 'thread'|'default' }`
  — validates the folder exists (honest 400 otherwise, rule 6), thread scope → store,
  default scope → new `BridgeOptions.setDefaultTargetRepo` callback (absent in the preview
  harness → honest error). `state()` exposes effective target (thread ?? default).
- `apps/mcp/src/index.ts`: wires the callbacks; `copyToTargetRepo` uses thread ?? default;
  `session_status` reports `targetRepo`; finalize/plan-closeout digests append the target +
  the ask-the-human copy instruction.
- Studio: `TargetRepoPicker.tsx` header popover (📁, beside ThemePicker): path input, "set
  for this thread" / "set as default" / clear, inline error display.
- `.claude/commands/plan-closeout.md`: new step — read the thread's target repo; if set,
  ASK the human exactly where inside it the final artifacts go (offer wiki/, discussion/,
  app images, custom), then COPY artifact `.svg` + `.json` sidecars (+ `brainstorm.md` on
  request). Never move.

### C. Proof + docs

- Tests via `test-engineer`: `/api/target-repo` endpoint (validation, both scopes, preview
  fallback), session targetRepo persistence/reload, effective-value resolution; ui-smoke
  renders for PreviewModal-with-notes and TargetRepoPicker.
- Wiki via `wiki-librarian`: `Requirements/system-architecture.md` (lock page — this plan is
  the approval), `Requirements/interaction-protocol.md`, `user-guide.md`, `wiki/log.md`.
- `npm run build` + `npm test` before any completion claim (rule 10).
