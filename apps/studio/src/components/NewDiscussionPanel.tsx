import { useEffect, useRef, useState } from 'react';
import { DEFAULT_INTAKE_QUESTIONS } from '@visual-brainstorm/protocol';
import type {
  ModelCatalogEntry,
  PaletteColor,
  ResponseAttachment,
  RuntimeEngine,
  SeedBrief,
  SeedIntake,
  SurveyQuestion,
  Theme,
} from '@visual-brainstorm/protocol';
import { Bubble } from './primitives';
import { PalettePicker } from './PalettePicker';
import { TargetRepoPicker } from './TargetRepoPicker';
import {
  AttachmentChips,
  CameraModal,
  MicButton,
  cameraAvailable,
  useAttachments,
} from './composer';
import {
  PhotoScribble,
  PhotoOfferBanner,
  composeSeedSvg,
  toScribbleAnnotations,
  renderCompositePng,
  type ScribbleContent,
} from './PhotoScribble';
import { useVoice } from '../lib/useVoice';
import {
  SurveyField,
  answerOf,
  pickAnswer,
  setOtherAnswer,
  surveyWords,
  type SurveyAnswers,
} from './Survey';

/**
 * "Open with anything" as a blank chat panel: the landing surface for a new
 * brainstorm (New Discussion button, or a bare /run-brainstorm via the
 * open_studio tool). Organizes the intake top to bottom: what we're making
 * (as tappable questions — the Survey module), generation colors, a
 * full-height scribble pad, and a
 * composer with the full board-reply toolset (mic, attachments, camera,
 * model, target folder). Send & iterate dispatches new-brainstorm, which
 * starts a fresh live session when the attached runtime can handle it.
 */

export interface NewDiscussionExtras {
  attachments: ResponseAttachment[];
  model?: string;
  palette: PaletteColor[];
  /**
   * The intake survey STRUCTURED (question text → picked answers + typed
   * "other") — the composed prompt flattens answers into a parenthetical,
   * losing which question each belonged to; this preserves the mapping for
   * the orchestrator's seed note.
   */
  intakeAnswers?: { question: string; answers: string[] }[];
}

// The panel's intake questions come from ONE of two sources: a run-brainstorm
// handoff supplies a bespoke set anchored to the brief (seedBrief.questions),
// and a blank UI-started New Discussion falls back to the generic preset
// (DEFAULT_INTAKE_QUESTIONS, protocol-owned). The panel is otherwise identical.
const activeQuestions = (seed?: SeedBrief | null): SurveyQuestion[] =>
  seed?.questions && seed.questions.length > 0 ? seed.questions : DEFAULT_INTAKE_QUESTIONS;

/**
 * Map a handoff's pre-selected picks (SeedBrief.picks) onto survey answers for
 * the ACTIVE question set, respecting each question's single/multi arity: known
 * option strings become picked pills; any value not among the options falls
 * back to the question's free-text "other" so nothing handed off is lost.
 */
function seedAnswers(picks: SeedBrief['picks'], questions: SurveyQuestion[]): SurveyAnswers {
  if (!picks) return {};
  const out: SurveyAnswers = {};
  for (const q of questions) {
    const vals = picks[q.id];
    if (!vals || vals.length === 0) continue;
    const known = vals.filter((v) => q.options.includes(v));
    const rest = vals.filter((v) => !q.options.includes(v));
    out[q.id] = { picked: q.multi ? known : known.slice(0, 1), other: rest.join(', ') };
  }
  return out;
}

/**
 * The ONE collapsible card shell every intake box shares — survey questions,
 * Colors, and the scribble pad all render inside this identical box, so they
 * look and behave the same. Collapse is driven by the caller (rows are coupled).
 */
function Box({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-line bg-surface p-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between text-left text-sm font-semibold"
      >
        {title}
        <span
          className={`ml-2 shrink-0 text-ink-dim transition-transform ${collapsed ? '' : 'rotate-90'}`}
        >
          ▸
        </span>
      </button>
      {!collapsed && <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>}
    </div>
  );
}

export function NewDiscussionPanel({
  themes = [],
  models = [],
  defaultModel = '',
  runtime = { id: 'claude', label: 'Claude Code', provider: 'Anthropic' },
  targetRepo = null,
  cancellable = true,
  seedBrief = null,
  onCancel,
  onStart,
}: {
  themes?: Theme[];
  models?: Array<ModelCatalogEntry | string>;
  defaultModel?: string;
  runtime?: RuntimeEngine;
  targetRepo?: string | null;
  /** False when the panel IS the landing surface (nothing to go back to). */
  cancellable?: boolean;
  /**
   * Handoff from Claude Code (open_studio): pre-fills the brief, and on a real
   * run-brainstorm also supplies a summary for the opening bubble and
   * pre-selected survey answers, so the human refines instead of retyping.
   */
  seedBrief?: SeedBrief | null;
  onCancel: () => void;
  onStart: (prompt: string, seed: SeedIntake | undefined, extras: NewDiscussionExtras) => void;
}) {
  // The intake question set: the handoff's bespoke questions, or the generic
  // preset for a blank New Discussion. Everything below is keyed off this.
  const questions = activeQuestions(seedBrief);
  const [prompt, setPrompt] = useState(seedBrief?.brief ?? '');
  const [answers, setAnswers] = useState<SurveyAnswers>(() =>
    seedAnswers(seedBrief?.picks, activeQuestions(seedBrief)),
  );
  // Scribble pad: an optional background photo + the composed annotation SVG it
  // emits (null when there are no annotations). photoOffer holds a just-attached
  // image awaiting the "scribble on it?" decision.
  const [bgPhoto, setBgPhoto] = useState<string | null>(null);
  const [scribble, setScribble] = useState<ScribbleContent | null>(null);
  const [photoOffer, setPhotoOffer] = useState<string | null>(null);
  const [genTheme, setGenTheme] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [model, setModel] = useState(defaultModel);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  // Send became async (buildSeed rasterizes the composite PNG, hundreds of ms on
  // a big photo) — without this guard a second click mid-await dispatched a
  // duplicate new-brainstorm command (two seed folders, two threads).
  const [sending, setSending] = useState(false);
  // Collapse is coupled by ROW, keyed by the row's first box id. Scribble starts
  // collapsed (optional seed); every other row starts open.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ scribble: true });
  const toggleRow = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  const textRef = useRef<HTMLTextAreaElement>(null);
  const voice = useVoice((heard) =>
    setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${heard}` : heard)),
  );
  const intake = useAttachments();
  const delegateModels = models
    .map((candidate) =>
      typeof candidate === 'string'
        ? { id: candidate, label: candidate, capabilities: { delegate: true } }
        : candidate,
    )
    .filter((candidate) => candidate.capabilities.delegate);

  // Handoff seed arrives async over WS (hello.seedBrief). Fill the brief AND the
  // pre-selected survey answers the first time it lands, but never clobber input
  // the user has already made (typed brief / tapped answers).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!seedBrief || seededRef.current) return;
    seededRef.current = true;
    if (seedBrief.brief) setPrompt((prev) => (prev.trim() ? prev : seedBrief.brief ?? ''));
    if (seedBrief.picks) {
      setAnswers((prev) =>
        Object.keys(prev).length > 0 ? prev : seedAnswers(seedBrief.picks, activeQuestions(seedBrief)),
      );
    }
  }, [seedBrief]);

  // The brief box grows with its content; the max-h-[30vh] class caps it at
  // 30% of the viewport, after which it scrolls internally.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [prompt]);

  // When a new image lands in the composer (camera or attached file), offer to
  // open it in the scribble pad as a background to mark up. Non-image files and
  // re-renders don't re-trigger; the photo stays a plain attachment regardless.
  const prevAttachCount = useRef(0);
  useEffect(() => {
    const list = intake.attachments;
    if (list.length > prevAttachCount.current) {
      const newest = list[list.length - 1];
      if (newest?.dataUri?.startsWith('data:image/') && newest.dataUri !== bgPhoto) {
        setPhotoOffer(newest.dataUri);
      }
    }
    prevAttachCount.current = list.length;
  }, [intake.attachments, bgPhoto]);

  const hasSketch = scribble !== null;
  const chipWords = surveyWords(questions, answers);
  const composedPrompt = [prompt.trim(), chipWords.length > 0 ? `(${chipWords.join(' · ')})` : '']
    .filter(Boolean)
    .join(' ');
  const canStart = composedPrompt.length > 0 || hasSketch || intake.attachments.length > 0;

  // Build the enriched sketch seed on send: the SVG + structured annotations + a
  // rasterized composite PNG (vision-readable, unlike the SVG-as-text). The PNG
  // render is best-effort — on failure the seed still ships (svg + annotations),
  // honestly without the composite (rule 6). Only annotated scribbles become a seed.
  const buildSeed = async (): Promise<SeedIntake | undefined> => {
    if (!scribble) return undefined;
    const svg = composeSeedSvg(scribble);
    if (!svg) return undefined;
    const annotations = toScribbleAnnotations(scribble, palette);
    let compositeDataUri: string | undefined;
    try {
      compositeDataUri = await renderCompositePng(svg, scribble.viewW, scribble.viewH);
    } catch {
      compositeDataUri = undefined;
    }
    return {
      kind: 'sketch',
      svg,
      photoDataUri: scribble.photo ?? undefined,
      compositeDataUri,
      annotations,
    };
  };

  // Every intake box — survey questions, Colors, the scribble pad — is the same
  // shell. The question boxes come from the ACTIVE set (handoff or preset) and
  // are chunked two-per-row below, so a variable number of bespoke questions
  // lays out the same way the fixed five did; collapse couples per row.
  type BoxDef = { id: string; title: string; content: React.ReactNode };
  const questionBox = (q: SurveyQuestion): BoxDef => ({
    id: q.id,
    title: q.question,
    content: (
      <SurveyField
        question={q}
        answer={answerOf(answers, q.id)}
        onPick={(o) => setAnswers((a) => pickAnswer(a, q, o))}
        onOther={(o) => setAnswers((a) => setOtherAnswer(a, q.id, o))}
      />
    ),
  });
  const colorsBox = {
    id: 'colors',
    title: 'Colors',
    content: (
      <>
        <div className="mb-2 text-[11px] text-ink-dim">
          Pick a theme to draw the generated options with its palette; click a swatch to
          change a color or its name, + to add one. Leave unselected for free choice.
        </div>
        <PalettePicker
          themes={themes}
          selectedTheme={genTheme}
          onSelect={(theme, colors) => {
            setGenTheme(theme?.name ?? null);
            setPalette(colors);
          }}
        />
      </>
    ),
  };
  const scribbleBox = {
    id: 'scribble',
    title: 'Scribble a seed',
    content: (
      <PhotoScribble
        palette={palette}
        photo={bgPhoto}
        onRemovePhoto={() => setBgPhoto(null)}
        onChange={setScribble}
      />
    ),
  };
  // Question boxes + Colors (when themes exist) flow two-per-row so Colors fills
  // the slot beside the last question rather than dropping to its own row; the
  // scribble pad always gets its own full-width row.
  const formBoxes: BoxDef[] = [
    ...questions.map(questionBox),
    ...(themes.length > 0 ? [colorsBox] : []),
  ];
  const rows: BoxDef[][] = [];
  for (let i = 0; i < formBoxes.length; i += 2) rows.push(formBoxes.slice(i, i + 2));
  rows.push([scribbleBox]);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Bubble side="claude">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
          New Discussion
        </div>
        {/* On a real run-brainstorm handoff, Claude Code sends a summary of what
            we're starting — show it here instead of the generic prompt so the
            panel reads as continuity, not a blank form. */}
        {seedBrief?.summary ? (
          seedBrief.summary
        ) : (
          <>
            What do you want to explore? Type it, say it, scribble it, or attach a photo or
            file. Whatever arrives seeds the first board.
          </>
        )}
      </Bubble>

      {rows.map((row) => {
        const key = row[0].id;
        const isCollapsed = !!collapsed[key];
        return (
          <div key={key} className={`grid gap-4 ${row.length > 1 ? 'sm:grid-cols-2' : ''}`}>
            {row.map((box) => (
              <Box
                key={box.id}
                title={box.title}
                collapsed={isCollapsed}
                onToggle={() => toggleRow(key)}
              >
                {box.content}
              </Box>
            ))}
          </div>
        );
      })}

      {/* The composer is the pulse's "input" finale — it stays accent (never
          greens) like the board composer, since a typed-but-unsent brief is not
          a completed action. Consistent across both composer surfaces. */}
      <div
        data-guide="input"
        className="sticky bottom-0 z-20 rounded-2xl border border-line bg-surface p-4 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.5)]"
      >
        <textarea
          ref={textRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. app icons for a note-taking tool, or just talk, draw, or attach instead"
          rows={2}
          className="max-h-[30vh] w-full resize-none overflow-y-auto rounded-xl border border-line bg-surface-2 p-3 text-sm outline-none focus:border-accent"
        />
        {/* One blank line of breathing room below the input, per design. */}
        <div className="h-5" aria-hidden="true" />
        {!voice.supported && (
          <div className="mt-1 text-[11px] text-ink-dim">
            voice input unavailable in this browser; no fake transcripts here
          </div>
        )}
        {voice.listening && (
          <div className="mt-1 text-[11px] text-accent shimmer">listening, speak the brief...</div>
        )}
        {voice.error && <div className="mt-1 text-[11px] text-red-500">{voice.error}</div>}
        <AttachmentChips attachments={intake.attachments} onRemove={intake.remove} />
        {photoOffer && (
          <PhotoOfferBanner
            onAccept={() => {
              setBgPhoto(photoOffer);
              setCollapsed((prev) => ({ ...prev, scribble: false }));
              setPhotoOffer(null);
            }}
            onDismiss={() => setPhotoOffer(null)}
          />
        )}
        {intake.error && <div className="mt-2 text-xs text-red-500">{intake.error}</div>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <MicButton voice={voice} hint="Dictate the brief. The transcript lands in the box." />
          {cancellable && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-line px-3 py-2 text-sm text-ink-dim hover:border-accent hover:text-ink"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!canStart || sending}
            onClick={async () => {
              if (sending) return;
              setSending(true);
              try {
                const seed = await buildSeed();
                // Q→A structure travels beside the flattened prompt: the seed
                // note tells the orchestrator WHICH question each answer met.
                const intakeAnswers = questions
                  .map((q) => {
                    const a = answerOf(answers, q.id);
                    const picked = [...a.picked, ...(a.other.trim() ? [a.other.trim()] : [])];
                    return { question: q.question, answers: picked };
                  })
                  .filter((qa) => qa.answers.length > 0);
                onStart(composedPrompt, seed, {
                  attachments: intake.attachments,
                  // Always explicit (token-economy decision 4): the seed names the
                  // generation model even when it's the default — no undefined
                  // fallthrough that leaves routing to omission.
                  model: model || defaultModel || undefined,
                  palette,
                  ...(intakeAnswers.length > 0 ? { intakeAnswers } : {}),
                });
              } finally {
                setSending(false);
              }
            }}
            title={`Starts a fresh brainstorm session from this brief (requires ${runtime.label})`}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow hover:brightness-105 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send & iterate'}
          </button>
          <TargetRepoPicker targetRepo={targetRepo} />
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="More Tools"
              title="More Tools"
              className="rounded-xl border border-line px-3 py-2 text-sm font-semibold text-ink-dim hover:border-accent hover:text-ink"
            >
              +
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 z-40 mb-2 w-64 rounded-xl border border-line bg-surface p-2 shadow-xl">
                <label
                  title="Attach a file. It seeds the brainstorm."
                  className="block cursor-pointer rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"
                >
                  Attach file
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        intake.attach(file);
                        setMenuOpen(false);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
                {cameraAvailable() ? (
                  <button
                    type="button"
                    title="Take a photo with your device camera. It seeds the brainstorm."
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2"
                    onClick={() => {
                      setMenuOpen(false);
                      setCameraOpen(true);
                    }}
                  >
                    Take a photo
                  </button>
                ) : (
                  <label
                    title="No camera access in this browser; picks an image file instead."
                    className="block cursor-pointer rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2"
                  >
                    Take a photo
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          intake.attach(file);
                          setMenuOpen(false);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
                {delegateModels.length > 0 && (
                  <label className="block px-2 py-1.5 text-xs text-ink-dim">
                    Model for generation
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
                    >
                      {delegateModels.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            )}
          </div>
          <span className="ml-auto text-xs text-ink-dim">
            {canStart ? 'seeds the first board' : 'type, speak, scribble, or attach something to start'}
          </span>
        </div>
      </div>

      {cameraOpen && (
        <CameraModal onCapture={intake.addDataUri} onClose={() => setCameraOpen(false)} />
      )}
    </div>
  );
}
