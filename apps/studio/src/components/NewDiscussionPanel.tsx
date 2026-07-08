import { useEffect, useRef, useState } from 'react';
import type {
  ModelCatalogEntry,
  PaletteColor,
  ResponseAttachment,
  RuntimeEngine,
  SeedIntake,
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
import { useVoice } from '../lib/useVoice';
import { Survey, surveyWords, type SurveyQuestion, type SurveyAnswers } from './Survey';

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

type Stroke = { x: number; y: number }[];

export interface NewDiscussionExtras {
  attachments: ResponseAttachment[];
  model?: string;
  palette: PaletteColor[];
}

// The pre-session intake as questions (the winning concierge→gallery design,
// panel 2): each former chip group reworded as a question with tappable
// answers. Static here — the panel runs before Claude attaches; adaptive
// follow-ups are the live ask_concierge's job. Single-select where the answer
// is a spectrum or a one-of.
const QUESTIONS: SurveyQuestion[] = [
  { id: 'making', question: 'What are you making?', options: ['icons', 'a logo', 'a ui flow', 'a palette', 'a system map', 'new feature', 'comparison'], multi: true },
  { id: 'vibe', question: "What's the vibe?", options: ['calm', 'playful', 'bold', 'minimal', 'neon', 'formal', 'professional'], multi: true },
  { id: 'range', question: 'How far should it push convention?', options: ['stay close to convention', 'go wild'] },
  { id: 'audience', question: 'Who is it for?', options: ['just me', 'my team', 'customers', 'kids', 'executives'] },
  { id: 'constraints', question: 'Any hard constraints?', options: ['works tiny', 'monochrome-safe', 'high contrast', 'print friendly', 'square format'], multi: true },
];

/** One collapsible intake card — every box on the panel shares this shell. */
function Section({
  title,
  grow = false,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  /** Expands to fill the panel's leftover vertical space when open. */
  grow?: boolean;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-4 ${
        grow && !collapsed ? 'flex min-h-[16rem] flex-1 flex-col' : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center justify-between text-left text-sm font-semibold capitalize"
      >
        {title}
        <span className={`text-ink-dim transition-transform ${collapsed ? '' : 'rotate-90'}`}>▸</span>
      </button>
      {!collapsed && (
        <div className={grow ? 'mt-2 flex min-h-0 flex-1 flex-col' : 'mt-2'}>{children}</div>
      )}
    </div>
  );
}

function strokesToSvg(strokes: Stroke[]): string {
  const lines = strokes
    .filter((s) => s.length > 1)
    .map(
      (s) =>
        `<polyline points="${s.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ')}" fill="none" stroke="#333" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">${lines}</svg>`;
}

export function NewDiscussionPanel({
  themes = [],
  models = [],
  defaultModel = '',
  runtime = { id: 'claude', label: 'Claude Code', provider: 'Anthropic' },
  targetRepo = null,
  cancellable = true,
  initialPrompt = '',
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
   * Handoff from Claude Code: the purpose the human already described, used to
   * pre-fill the brief so the studio hosts that content (no retyping).
   */
  initialPrompt?: string;
  onCancel: () => void;
  onStart: (prompt: string, seed: SeedIntake | undefined, extras: NewDiscussionExtras) => void;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [answers, setAnswers] = useState<SurveyAnswers>({});
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [genTheme, setGenTheme] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [model, setModel] = useState(defaultModel);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  // Scribble starts collapsed — it's an optional seed, not the primary intake,
  // and expanded it pushes the composer into main's scroll-fade band.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ scribble: true });
  const toggleSection = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
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

  // Handoff seed arrives async over WS (hello.seedBrief). Fill the brief the
  // first time it lands, but never clobber text the user has already typed.
  const seededRef = useRef(false);
  useEffect(() => {
    if (initialPrompt && !seededRef.current) {
      seededRef.current = true;
      setPrompt((prev) => (prev.trim() ? prev : initialPrompt));
    }
  }, [initialPrompt]);

  // The brief box grows with its content; the max-h-[30vh] class caps it at
  // 30% of the viewport, after which it scrolls internally.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [prompt]);

  const point = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 400,
      y: ((e.clientY - rect.top) / rect.height) * 240,
    };
  };

  const hasSketch = strokes.some((s) => s.length > 1);
  const seed: SeedIntake | undefined = hasSketch
    ? { kind: 'sketch', svg: strokesToSvg(strokes) }
    : undefined;
  const chipWords = surveyWords(QUESTIONS, answers);
  const composedPrompt = [prompt.trim(), chipWords.length > 0 ? `(${chipWords.join(' · ')})` : '']
    .filter(Boolean)
    .join(' ');
  const canStart = composedPrompt.length > 0 || seed !== undefined || intake.attachments.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <Bubble side="claude">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-dim">
          New Discussion
        </div>
        What do you want to explore? Type it, say it, scribble it, or attach a photo or file.
        Whatever arrives seeds the first board.
      </Bubble>

      <Survey questions={QUESTIONS} answers={answers} onChange={setAnswers} />
      {themes.length > 0 && (
        <Section
          title="Colors"
          collapsed={!!collapsed.colors}
          onToggle={() => toggleSection('colors')}
        >
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
        </Section>
      )}

      <Section
        title="Scribble a seed"
        grow
        collapsed={!!collapsed.scribble}
        onToggle={() => toggleSection('scribble')}
      >
        {hasSketch && (
          <div className="mb-1 flex justify-end text-[11px] text-ink-dim">
            <button type="button" onClick={() => setStrokes([])} className="hover:text-ink">
              clear
            </button>
          </div>
        )}
        <svg
          ref={svgRef}
          viewBox="0 0 400 240"
          preserveAspectRatio="none"
          className="w-full flex-1 cursor-crosshair touch-none rounded-xl border border-dashed border-line bg-surface-2"
          onPointerDown={(e) => {
            drawing.current = true;
            (e.target as Element).setPointerCapture?.(e.pointerId);
            setStrokes((prev) => [...prev, [point(e)]]);
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const p = point(e);
            setStrokes((prev) => {
              const next = prev.slice();
              next[next.length - 1] = [...next[next.length - 1], p];
              return next;
            });
          }}
          onPointerUp={() => (drawing.current = false)}
          onPointerLeave={() => (drawing.current = false)}
        >
          {strokes.map((stroke, i) => (
            <polyline
              key={i}
              points={stroke.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="var(--color-accent, #A855F7)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </svg>
      </Section>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <textarea
          ref={textRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. app icons for a note-taking tool, or just talk, draw, or attach instead"
          rows={2}
          className="max-h-[30vh] w-full resize-none overflow-y-auto rounded-xl border border-line bg-surface-2 p-3 text-sm outline-none focus:border-accent"
        />
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
            disabled={!canStart}
            onClick={() =>
              onStart(composedPrompt, seed, {
                attachments: intake.attachments,
                model: model && model !== defaultModel ? model : undefined,
                palette,
              })
            }
            title={`Starts a fresh brainstorm session from this brief (requires ${runtime.label})`}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow hover:brightness-105 disabled:opacity-50"
          >
            Send & iterate
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
