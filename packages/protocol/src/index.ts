import { z } from 'zod';

// ---------------------------------------------------------------------------
// Board kinds — rendering/authoring hints, not machinery (wiki/Product/board-modes.md)
// ---------------------------------------------------------------------------

export const BOARD_KINDS = [
  'icon-grid',
  'moodboard',
  'system-map',
  'storyboard',
  'mindmap',
  'matrix',
  'palette',
  'freeform',
] as const;

export const BoardKindSchema = z.enum(BOARD_KINDS);
export type BoardKind = z.infer<typeof BoardKindSchema>;

// ---------------------------------------------------------------------------
// Phases — the divergent-convergent funnel (wiki/Product/phase-funnel.md).
// The studio physically re-architects itself per phase.
// ---------------------------------------------------------------------------

export const PHASES = ['diverge', 'mutate', 'wreck', 'cluster', 'converge'] as const;
export const PhaseSchema = z.enum(PHASES);
export type Phase = z.infer<typeof PhaseSchema>;

// ---------------------------------------------------------------------------
// Survey configuration
// ---------------------------------------------------------------------------

export const AxisSchema = z.object({
  id: z.string(),
  label: z.string(),
  leftLabel: z.string(),
  rightLabel: z.string(),
  defaultValue: z.number().min(0).max(100).default(50),
});
export type Axis = z.infer<typeof AxisSchema>;

export const SurveyConfigSchema = z.object({
  multiSelect: z.boolean().default(true),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).optional(),
  elaborationPrompt: z
    .string()
    .default('Elaborate — what direction should the next round take?'),
  allowPerOptionNotes: z.boolean().default(true),
  allowRemix: z.boolean().default(true),
  axes: z.array(AxisSchema).default([]),
});
export type SurveyConfig = z.infer<typeof SurveyConfigSchema>;

// ---------------------------------------------------------------------------
// Board + options
// ---------------------------------------------------------------------------

export const BoardOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  /** Self-contained SVG markup: viewBox set, no external refs, no raster. */
  svg: z.string(),
  tags: z.array(z.string()).default([]),
  /** Option ids from earlier rounds this option descends from (lineage). */
  parents: z.array(z.string()).default([]),
});
export type BoardOption = z.infer<typeof BoardOptionSchema>;

export const BoardSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  round: z.number().int().min(1),
  kind: BoardKindSchema,
  /** Funnel phase — drives which interface mechanic the studio presents. */
  phase: PhaseSchema.default('diverge'),
  title: z.string(),
  /** Claude's narration for this round — shown as the round's chat bubble. */
  prompt: z.string(),
  options: z.array(BoardOptionSchema).min(1),
  survey: SurveyConfigSchema,
  createdAt: z.string(),
});
export type Board = z.infer<typeof BoardSchema>;

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export const ResponseActionSchema = z.enum(['iterate', 'accept', 'park']);
export type ResponseAction = z.infer<typeof ResponseActionSchema>;

export const BoardResponseSchema = z.object({
  boardId: z.string(),
  selectedOptionIds: z.array(z.string()).default([]),
  elaboration: z.string().default(''),
  perOptionNotes: z.record(z.string()).default({}),
  axisValues: z.record(z.number()).default({}),
  /** Pairs of option ids the user asked to mash up next round. */
  remixPairs: z.array(z.tuple([z.string(), z.string()])).default([]),
  action: ResponseActionSchema.default('iterate'),
  /** Model the user chose for the next round — the orchestrator delegates to it. */
  model: z.string().optional(),
  // --- per-phase fields (populated by the matching studio mechanic) ---
  /** converge: every option must be triaged before the gate opens. */
  triage: z.record(z.enum(['keep', 'kill', 'merge'])).default({}),
  /** mutate: lenses the user marked as "reveals something", per option. */
  mutations: z.record(z.array(z.string())).default({}),
  /** wreck: sabotage notes — what breaks, what's ugly, what lies. */
  flaws: z.record(z.string()).default({}),
  /** cluster: final drag positions in field percent coords — distance IS data. */
  positions: z.record(z.object({ x: z.number(), y: z.number() })).default({}),
  /** cluster: proximity-derived groupings of option ids. */
  clusters: z.array(z.array(z.string())).default([]),
  /** cluster: "what lives in the blank space" notes between cluster indexes. */
  gapNotes: z
    .array(z.object({ between: z.tuple([z.number(), z.number()]), note: z.string() }))
    .default([]),
  /** UI-invoked repo procedures (plan-closeout, discover-skills) to run now. */
  commands: z.array(z.string()).default([]),
  respondedAt: z.string(),
});
export type BoardResponse = z.infer<typeof BoardResponseSchema>;

// ---------------------------------------------------------------------------
// Session + artifacts
// ---------------------------------------------------------------------------

export const ArtifactSchema = z.object({
  slug: z.string(),
  name: z.string(),
  svgPath: z.string(),
  notes: z.string().default(''),
  provenance: z.object({
    boardId: z.string().optional(),
    optionIds: z.array(z.string()).default([]),
  }),
  capturedAt: z.string(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

export const SessionInfoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  startedAt: z.string(),
  dir: z.string(),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export interface RoundRecord {
  board: Board;
  response: BoardResponse | null;
}

export const DiscussionSummarySchema = z.object({
  /** Directory basename under the discussion root — stable thread id. */
  id: z.string(),
  title: z.string(),
  startedAt: z.string(),
  dir: z.string(),
  rounds: z.number().int(),
  artifacts: z.number().int(),
  /** True when the thread lives in _completed/ — shown under the Archive nav. */
  archived: z.boolean().default(false),
});
export type DiscussionSummary = z.infer<typeof DiscussionSummarySchema>;

// ---------------------------------------------------------------------------
// Themes — the style ingestion framework (built-ins + user JSON drop-ins)
// ---------------------------------------------------------------------------

export const ThemeVarsSchema = z.object({
  canvas: z.string(),
  surface: z.string(),
  surface2: z.string(),
  line: z.string(),
  ink: z.string(),
  inkDim: z.string(),
  accent: z.string(),
});
export type ThemeVars = z.infer<typeof ThemeVarsSchema>;

export const ThemeSchema = z.object({
  name: z.string(),
  label: z.string(),
  light: ThemeVarsSchema,
  dark: ThemeVarsSchema,
});
export type Theme = z.infer<typeof ThemeSchema>;

// ---------------------------------------------------------------------------
// Bridge ⇄ studio envelopes
// ---------------------------------------------------------------------------

export interface StudioState {
  session: SessionInfo | null;
  rounds: RoundRecord[];
  activeBoard: Board | null;
  artifacts: Artifact[];
  thinking: string | null;
  /** Available themes (built-ins + ingested user styles). */
  themes: Theme[];
  /** Default theme name from config. */
  theme: string;
  /** Models offered in the composer picker. */
  models: string[];
  defaultModel: string;
}

export type ServerToStudio =
  | { type: 'hello'; state: StudioState }
  | { type: 'board'; board: Board }
  | { type: 'thinking'; note: string | null }
  | { type: 'responded'; boardId: string; response: BoardResponse }
  | { type: 'artifact'; artifact: Artifact };

export type StudioToServer = { type: 'response'; response: BoardResponse };
