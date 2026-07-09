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

export const PHASES = ['diverge', 'expand', 'mutate', 'wreck', 'cluster', 'converge'] as const;
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

// ---------------------------------------------------------------------------
// Mind tree — the live co-edited structure behind mindmap boards
// (wiki/Research/visualization-engines.md). Claude sends ONE tree instead of
// N SVG options; the user edits it directly and the edited tree returns in
// BoardResponse.editedTree — the artifact IS the feedback.
// ---------------------------------------------------------------------------

/** One node of a mind tree — mind-elixir-compatible (id + topic + children). */
export interface MindNode {
  id: string;
  topic: string;
  children?: MindNode[];
  /** Collapsed/expanded state — mind-elixir persists it through edits. */
  expanded?: boolean;
  tags?: string[];
  style?: { color?: string; background?: string; fontSize?: string };
  /**
   * Free-text note the user attached to THIS node. It is steering data: an
   * `explode` on the node must generate children relevant to the topic AND this
   * note, so changing the note materially changes the expansion.
   */
  note?: string;
}

export const MindNodeSchema: z.ZodType<MindNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    topic: z.string(),
    children: z.array(MindNodeSchema).optional(),
    expanded: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    style: z
      .object({
        color: z.string().optional(),
        background: z.string().optional(),
        fontSize: z.string().optional(),
      })
      .optional(),
    note: z.string().optional(),
  }),
);

/**
 * One mind-map decision the user made this round — the ordered node-op log that
 * rides back in BoardResponse.treeOps (persisted to round-NN/tree-ops.jsonl and
 * folded into the feedback digest). `editedTree` carries the final SHAPE; treeOps
 * carry the INTENT, so a delegated model that never saw the canvas can act:
 *  - explode: expand this node into ≥5 children relevant to `topic` + `note`.
 *  - add:     the user seeded `count` blank child ideas under the node.
 *  - delete:  the node (and its subtree) was eliminated.
 *  - note:    the user attached/changed `note` on the node (steers future explodes).
 *  - rename / move: structural edits, kept for the decision record.
 */
export const TreeOpSchema = z.object({
  op: z.enum(['explode', 'delete', 'add', 'note', 'rename', 'move']),
  /** mind-elixir node id the op targets. */
  nodeId: z.string(),
  /** The node's topic at op time — labels the op for any model reading the digest. */
  topic: z.string().default(''),
  /** The node's note at op time — the steering text for `explode`/`note`. */
  note: z.string().default(''),
  /** `add`: how many child ideas were seeded (default 5). */
  count: z.number().int().min(1).optional(),
  /** ISO timestamp — the studio stamps it when the user acts. */
  at: z.string(),
});
export type TreeOp = z.infer<typeof TreeOpSchema>;

export const MindTreeSchema = z.object({
  nodeData: MindNodeSchema,
  /** mind-elixir layout: 0 = left, 1 = right, 2 = both sides. */
  direction: z.number().int().min(0).max(2).optional(),
});
export type MindTree = z.infer<typeof MindTreeSchema>;

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
  /**
   * SVG options. May be empty ONLY when `tree` carries the board's content —
   * "options or tree" is enforced at the tool boundary (present_board), not
   * here, so cached threads always reload (wiki/Meta/conventions.md).
   */
  options: z.array(BoardOptionSchema).default([]),
  /** Mindmap boards: the live co-edited tree presented instead of options. */
  tree: MindTreeSchema.optional(),
  survey: SurveyConfigSchema,
  createdAt: z.string(),
});
export type Board = z.infer<typeof BoardSchema>;

// ---------------------------------------------------------------------------
// Seed intake — "Open with anything": a session can start from a scribble, an
// uploaded image, a voice transcript, or plain text. Zero typing required.
// ---------------------------------------------------------------------------

export const SeedIntakeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), text: z.string() }),
  /** Pointer-drawn scribble captured as self-contained SVG markup. */
  z.object({ kind: z.literal('sketch'), svg: z.string() }),
  /** Dropped/uploaded image as a data URI (persisted to disk by the bridge). */
  z.object({ kind: z.literal('image'), dataUri: z.string(), name: z.string().default('') }),
  /** Speech-recognition transcript (honest: only sent when recognition ran). */
  z.object({ kind: z.literal('voice'), transcript: z.string() }),
]);
export type SeedIntake = z.infer<typeof SeedIntakeSchema>;

// ---------------------------------------------------------------------------
// Intake survey — the New Discussion panel's tappable questions. The DEFAULT
// set below drives a BLANK (UI-started) New Discussion; a run-brainstorm
// handoff from Claude Code instead carries a BESPOKE, brainstorm-anchored set
// on SeedBrief.questions — the orchestrator authors questions specific to the
// brief rather than reusing a preset.
// ---------------------------------------------------------------------------

export const SurveyQuestionSchema = z.object({
  /** Stable id — answers and pre-selected picks are keyed by it. */
  id: z.string(),
  /** The prompt, shown as the box title + the group's aria-label. */
  question: z.string(),
  /** Tappable answer options. */
  options: z.array(z.string()),
  /** Multi-select (checkbox semantics); default single (radio semantics). */
  multi: z.boolean().optional(),
  /** One option accented + badged as the recommendation (the artifact's ribbon). */
  recommended: z.string().optional(),
  /** Show a free-text "other" input (default true). */
  allowOther: z.boolean().optional(),
});
export type SurveyQuestion = z.infer<typeof SurveyQuestionSchema>;

/**
 * The intake questions for a BLANK New Discussion started from the studio UI
 * (no orchestrator handoff). A run-brainstorm launched from Claude Code does
 * NOT reuse these — it hands off a bespoke, brainstorm-anchored set via
 * SeedBrief.questions (do not pigeonhole a real brief into this preset).
 */
export const DEFAULT_INTAKE_QUESTIONS: SurveyQuestion[] = [
  { id: 'making', question: 'What are you making?', options: ['icons', 'a logo', 'a ui flow', 'a palette', 'a system map', 'new feature', 'comparison'], multi: true },
  { id: 'vibe', question: "What's the vibe?", options: ['calm', 'playful', 'bold', 'minimal', 'neon', 'formal', 'professional'], multi: true },
  { id: 'range', question: 'How far should it push convention?', options: ['stay close to convention', 'go wild'] },
  { id: 'audience', question: 'Who is it for?', options: ['just me', 'my team', 'customers', 'kids', 'executives'] },
  { id: 'constraints', question: 'Any hard constraints?', options: ['works tiny', 'monochrome-safe', 'high contrast', 'print friendly', 'square format'], multi: true },
];

/**
 * Orchestrator → studio handoff for the New Discussion panel. When Claude Code
 * already knows what the human wants to make (a real run-brainstorm), it hands
 * off not just the raw brief but a friendly SUMMARY (shown in the panel's
 * opening bubble in place of the generic prompt), a BESPOKE set of intake
 * QUESTIONS anchored to this brainstorm (replacing the generic preset), and
 * PRE-SELECTED answers, so the human starts one tap from "Send & iterate"
 * instead of facing a blank form. A bare New Discussion (no handoff) leaves
 * this null and the panel uses DEFAULT_INTAKE_QUESTIONS.
 */
export interface SeedBrief {
  /** Pre-fills the New Discussion textarea — the raw brief/prompt. */
  brief?: string;
  /**
   * A short, human-friendly summary of the brainstorm being started, shown in
   * the panel's opening bubble instead of the generic "What do you want to
   * explore?" prompt. Present only on a real run-brainstorm handoff.
   */
  summary?: string;
  /**
   * A bespoke intake survey the orchestrator authored for THIS brainstorm —
   * creative, specific questions (not the generic preset). When present it
   * replaces DEFAULT_INTAKE_QUESTIONS in the panel; `picks` are keyed by these
   * questions' ids.
   */
  questions?: SurveyQuestion[];
  /**
   * Pre-selected survey answers keyed by question id (the handoff's own
   * questions, or the default ids when none were handed off). Values SHOULD be
   * exact option strings; any value not among a question's options falls back
   * to its free-text "other".
   */
  picks?: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export const ResponseActionSchema = z.enum(['iterate', 'accept', 'park', 'finalize', 'back']);
export type ResponseAction = z.infer<typeof ResponseActionSchema>;

/**
 * A file or photo attached in the composer. On the wire from the studio it
 * carries the content as a data URI; the bridge persists it to the thread
 * directory, blanks dataUri, and sets savedPath. A missing savedPath after
 * the bridge processed it means persistence failed (reported honestly).
 */
export const ResponseAttachmentSchema = z.object({
  name: z.string().default(''),
  dataUri: z.string().default(''),
  savedPath: z.string().optional(),
});
export type ResponseAttachment = z.infer<typeof ResponseAttachmentSchema>;

/**
 * A named generation color. Themes carry curated palettes of these (see
 * Theme.palette); selecting a theme in the studio ships its resolved palette
 * as BoardResponse.paletteColors, constraining SVG generation for following
 * rounds. Names are stable handles the user can refer to in conversation.
 */
export const PaletteColorSchema = z.object({
  name: z.string(),
  /** CSS color value, e.g. "#a855f7". */
  value: z.string(),
});
export type PaletteColor = z.infer<typeof PaletteColorSchema>;

export const RuntimeEngineSchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.string(),
});
export type RuntimeEngine = z.infer<typeof RuntimeEngineSchema>;

export const ModelCatalogEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  provider: z.string(),
  /** Which orchestration runtimes can honestly delegate to this model. */
  engineIds: z.array(z.string()).min(1).default(['claude']),
  capabilities: z
    .object({
      orchestrate: z.boolean().default(false),
      delegate: z.boolean().default(true),
    })
    .default({ orchestrate: false, delegate: true }),
});
export type ModelCatalogEntry = z.infer<typeof ModelCatalogEntrySchema>;

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
  /** judge deck: per-option flick verdicts (keep flicked right, kill flicked left). */
  deckVerdicts: z.record(z.enum(['keep', 'kill'])).default({}),
  /** judge deck / sudden death: pairwise duels the user resolved — winner is preference data. */
  duelResults: z
    .array(z.object({ pair: z.tuple([z.string(), z.string()]), winner: z.string() }))
    .default([]),
  /** judge deck: keeps ordered strongest-pull first (refined by duels). Leads the synthesis vector. */
  ranking: z.array(z.string()).default([]),
  /** Files/photos attached in the composer — persisted by the bridge, surfaced in the digest. */
  attachments: z.array(ResponseAttachmentSchema).default([]),
  /** Generation colors picked in the palette picker — constrain the next round's SVGs. */
  paletteColors: z.array(PaletteColorSchema).default([]),
  /** UI-invoked repo procedures (plan-closeout, discover-skills, new-brainstorm) to run now. */
  commands: z.array(z.string()).default([]),
  /** User clicked a phase tab — present the NEXT board in this phase. */
  requestedPhase: PhaseSchema.optional(),
  /** action=finalize: THE one — capture it, then run plan-closeout (finality). */
  finalOptionId: z.string().optional(),
  /** mindmap: the user's edited tree — absent means the tree was untouched. */
  editedTree: MindTreeSchema.optional(),
  /**
   * mindmap: the ordered node-op decision log for this round (explode/delete/
   * add/note/rename/move). editedTree is the final shape; treeOps is the intent
   * — the orchestrator reads `explode` ops to know which nodes to expand (≥5
   * relevant children) and with what steering note.
   */
  treeOps: z.array(TreeOpSchema).default([]),
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
    /** Artifact-chat revision lineage: the slug of the artifact this one revised. */
    revises: z.string().optional(),
  }),
  capturedAt: z.string(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;

/**
 * One message in an artifact's chat dialog (fullscreen artifact view). The
 * dialog persists append-only to the thread's artifacts/chat.jsonl (rule 7);
 * user messages arrive via POST /api/artifact-chat, Claude's replies via the
 * reply_artifact_chat MCP tool — always authored by a subagent. A reply that
 * changed the artifact names the NEW captured version in revisedSlug (the
 * original is never overwritten).
 */
export const ArtifactChatMessageSchema = z.object({
  /** Which artifact this dialog belongs to (Artifact.slug in its thread). */
  artifactSlug: z.string(),
  role: z.enum(['user', 'claude']),
  text: z.string(),
  at: z.string(),
  /** On a claude reply that revised the artifact: the new version's slug. */
  revisedSlug: z.string().optional(),
});
export type ArtifactChatMessage = z.infer<typeof ArtifactChatMessageSchema>;

/**
 * One turn of the adaptive concierge intake (wiki/Product/intake-methodologies.md):
 * after the brief, Claude asks AS MANY clarifying questions as it takes (not a
 * fixed count). Each question is presented in the studio with tappable
 * suggestion chips plus a free-text box; the user's answer packages back into
 * the seed digest the orchestrator builds on. The pending question rides
 * StudioState.concierge; the answer returns via POST /api/concierge.
 */
export const ConciergeExchangeSchema = z.object({
  /** Stable id for this question — the answer POST names it. */
  id: z.string(),
  /** Claude's clarifying question. */
  question: z.string(),
  /** Tappable suggested answers — the user may pick any, all, or none. */
  suggestions: z.array(z.string()).default([]),
  /** The user's assembled answer (chips + free text). Empty until answered. */
  answer: z.string().default(''),
});
export type ConciergeExchange = z.infer<typeof ConciergeExchangeSchema>;

/**
 * One method card in the Living Gallery (wiki/Product/intake-methodologies.md):
 * after the concierge Q&A, Claude presents the methodologies (Mind map, Funnel,
 * Wreck, Cluster) as cards, each a LIVE miniature genuinely seeded from the
 * brief + answers. The recommended card is ribboned with a reason chip quoting
 * the user's answers. Picking a card routes the session into that methodology.
 * `method` is the routing key the pick returns; the roster is open (string) so
 * new methodologies never need a protocol bump.
 */
export const MethodCardSchema = z.object({
  /** Routing key returned on pick, e.g. 'mindmap' | 'funnel' | 'wreck' | 'cluster'. */
  method: z.string(),
  label: z.string(),
  blurb: z.string().default(''),
  /** The live mini SVG — seeded from the brief + answers. Self-contained. */
  svg: z.string(),
  /** The one recommendation: accent-ringed + ribboned in the studio. */
  recommended: z.boolean().default(false),
  /** Reason chip on the recommended card — quotes the user's answers. */
  reason: z.string().default(''),
});
export type MethodCard = z.infer<typeof MethodCardSchema>;

export const LivingGallerySchema = z.object({
  id: z.string(),
  /** Claude's framing line above the cards. */
  prompt: z.string().default(''),
  cards: z.array(MethodCardSchema).min(1),
});
export type LivingGallery = z.infer<typeof LivingGallerySchema>;

/**
 * Option chats reuse the artifact-chat channel: a board OPTION (any round,
 * incl. previous ones) is addressed by this synthetic slug in
 * ArtifactChatMessage.artifactSlug, so questions about earlier choices
 * persist to the same artifacts/chat.jsonl and reload with the thread.
 * Board ids and option ids contain no ':' (board-r<N>-<ts> / r<N>-o<N>).
 */
export function optionChatSlug(boardId: string, optionId: string): string {
  return `option:${boardId}:${optionId}`;
}

/** Inverse of optionChatSlug; null for ordinary artifact slugs. */
export function parseOptionChatSlug(
  slug: string,
): { boardId: string; optionId: string } | null {
  const match = slug.match(/^option:([^:]+):([^:]+)$/);
  return match ? { boardId: match[1], optionId: match[2] } : null;
}

export const SessionInfoSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  startedAt: z.string(),
  dir: z.string(),
  /** Per-thread target repo/folder override — final artifacts are COPIED here on closeout. */
  targetRepo: z.string().optional(),
  /** Per-thread theme override — skins the studio AND steers generated artifact colors. */
  theme: z.string().optional(),
  /** Captured-artifact slugs pinned to a dedicated filmstrip row (studio Pin toggle). */
  pinnedSlugs: z.array(z.string()).default([]),
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
  /** Token meter: total tokens (input+output) reported for this thread over its progress events. */
  tokens: z.number().int().min(0).default(0),
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
  /**
   * Curated generation palette: 5 named colors designed to work together,
   * anchored on the theme's accent. Optional — drop-in themes without one get
   * a derived fallback in the studio's palette picker.
   */
  palette: z.array(PaletteColorSchema).optional(),
});
export type Theme = z.infer<typeof ThemeSchema>;

// ---------------------------------------------------------------------------
// Session progress — deterministic feedback piped from Claude Code to the UI
// ---------------------------------------------------------------------------

/**
 * One progress event from the working session — posted to the bridge
 * (POST /api/progress) by the orchestrator or the deterministic hook script
 * (scripts/pipe-progress.mjs), broadcast live to the studio, and persisted
 * append-only to the thread's progress.jsonl for recall. `tokens` carries the
 * usage this event accounts for; a thread's token meter is the sum over all
 * of its events.
 */
export const ProgressEventSchema = z.object({
  /** ISO timestamp — the bridge stamps arrival time when the sender omits it. */
  at: z.string(),
  /** Who reported: 'orchestrator', an agent name, or 'hook:<event>'. */
  source: z.string().default('orchestrator'),
  note: z.string(),
  tokens: z
    .object({ input: z.number().min(0).default(0), output: z.number().min(0).default(0) })
    .optional(),
});
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

// ---------------------------------------------------------------------------
// Bridge ⇄ studio envelopes
// ---------------------------------------------------------------------------

export interface StudioState {
  session: SessionInfo | null;
  rounds: RoundRecord[];
  activeBoard: Board | null;
  artifacts: Artifact[];
  thinking: string | null;
  /** The live orchestration runtime behind this session. */
  runtime: RuntimeEngine;
  /** Available themes (built-ins + ingested user styles). */
  themes: Theme[];
  /** Default theme name from config. */
  theme: string;
  /** Models offered in the composer picker. */
  models: ModelCatalogEntry[];
  defaultModel: string;
  /** Effective target repo/folder (thread override ?? config default), null when unset. */
  targetRepo: string | null;
  /** Recent session-progress events (tail — the full log is the thread's progress.jsonl). */
  progress: ProgressEvent[];
  /** Token meter: the live thread's cumulative totals over ALL its progress events. */
  tokens: { input: number; output: number };
  /** Artifact chat dialogs (all slugs mixed — filter by artifactSlug client-side). */
  artifactChat: ArtifactChatMessage[];
  /**
   * In-progress board answers ("the meta for generating these artifacts"): the
   * user's dials/selections/notes/elaboration/model on a live board, persisted
   * to `round-NN/draft.json` and restored on reload OR when a board re-presents
   * after an artifact-chat detour — so dials PERSIST through chat and are
   * recallable later. One entry per board that has a saved draft (by boardId).
   * A draft is an un-submitted `BoardResponse` (rule 5 — no separate shape).
   */
  drafts: BoardResponse[];
  /**
   * Handoff from Claude Code for the New Discussion panel: the brief that
   * pre-fills the composer, plus (on a real run-brainstorm) a friendly summary
   * for the panel's opening bubble and pre-selected survey answers — so the
   * human refines instead of retyping (requires no rework). Null on a bare
   * New Discussion with nothing handed off. See `SeedBrief`.
   */
  seedBrief: SeedBrief | null;
  /** Pending adaptive-concierge question, null when none is awaiting an answer. */
  concierge: ConciergeExchange | null;
  /** Pending Living Gallery (method cards), null when none is awaiting a pick. */
  gallery: LivingGallery | null;
}

export type ServerToStudio =
  | { type: 'hello'; state: StudioState }
  | { type: 'board'; board: Board }
  | { type: 'thinking'; note: string | null }
  | { type: 'responded'; boardId: string; response: BoardResponse }
  | { type: 'artifact'; artifact: Artifact }
  | { type: 'progress'; event: ProgressEvent }
  | { type: 'artifact-chat'; message: ArtifactChatMessage; discussionId?: string }
  | { type: 'draft'; draft: BoardResponse }
  | { type: 'concierge'; exchange: ConciergeExchange | null }
  | { type: 'gallery'; gallery: LivingGallery | null };

export type StudioToServer = { type: 'response'; response: BoardResponse };
