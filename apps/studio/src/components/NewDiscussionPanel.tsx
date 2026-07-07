import { useEffect, useRef, useState } from 'react';
import type { PaletteColor, ResponseAttachment, SeedIntake, Theme } from '@visual-brainstorm/protocol';
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

/**
 * "Open with anything" as a blank chat panel: the landing surface for a new
 * brainstorm (New Discussion button, or a bare /run-brainstorm via the
 * open_studio tool). Organizes the intake top to bottom: what we're making
 * (chips + other), generation colors, a full-height scribble pad, and a
 * composer with the full board-reply toolset (mic, attachments, camera,
 * model, target folder). Send & iterate dispatches new-brainstorm, which
 * starts a fresh Claude session when the engine is attached.
 */

type Stroke = { x: number; y: number }[];

export interface NewDiscussionExtras {
  attachments: ResponseAttachment[];
  model?: string;
  palette: PaletteColor[];
}

const CHIP_GROUPS: { label: string; chips: string[] }[] = [
  { label: 'making', chips: ['icons', 'a logo', 'a ui flow', 'a palette', 'a system map', 'new feature', 'comparison'] },
  { label: 'vibe', chips: ['calm', 'playful', 'bold', 'minimal', 'neon', 'formal', 'professional'] },
  { label: 'range', chips: ['stay close to convention', 'go wild'] },
  { label: 'audience', chips: ['just me', 'my team', 'customers', 'kids', 'executives'] },
  { label: 'constraints', chips: ['works tiny', 'monochrome-safe', 'high contrast', 'print friendly', 'square format'] },
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
  enginePreview,
  themes = [],
  models = [],
  defaultModel = '',
  targetRepo = null,
  cancellable = true,
  onCancel,
  onStart,
}: {
  enginePreview: boolean;
  themes?: Theme[];
  models?: string[];
  defaultModel?: string;
  targetRepo?: string | null;
  /** False when the panel IS the landing surface (nothing to go back to). */
  cancellable?: boolean;
  onCancel: () => void;
  onStart: (prompt: string, seed: SeedIntake | undefined, extras: NewDiscussionExtras) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [chips, setChips] = useState<string[]>([]);
  const [others, setOthers] = useState<Record<string, string>>({});
  const [otherOpen, setOtherOpen] = useState<Record<string, boolean>>({});
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [genTheme, setGenTheme] = useState<string | null>(null);
  const [palette, setPalette] = useState<PaletteColor[]>([]);
  const [model, setModel] = useState(defaultModel);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleSection = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const voice = useVoice((heard) =>
    setPrompt((prev) => (prev.trim() ? `${prev.trim()} ${heard}` : heard)),
  );
  const intake = useAttachments();

  // The brief box grows with its content; the max-h-[30vh] class caps it at
  // 30% of the viewport, after which it scrolls internally.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [prompt]);

  const toggleChip = (chip: string) =>
    setChips((prev) => (prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]));

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
  const chipWords = [
    ...chips,
    ...Object.values(others).map((v) => v.trim()).filter(Boolean),
  ];
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
        {enginePreview && (
          <div className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[11px] leading-snug text-ink-dim">
            <span className="font-semibold text-ink">Preview harness: no generator attached.</span>{' '}
            This server only shows static fixture boards. To brainstorm for real, start Claude Code
            in this repo and ask it to brainstorm.
          </div>
        )}
      </Bubble>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CHIP_GROUPS.map((group) => (
          <Section
            key={group.label}
            title={group.label}
            collapsed={!!collapsed[group.label]}
            onToggle={() => toggleSection(group.label)}
          >
            <div className="flex flex-wrap gap-2">
              {group.chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => toggleChip(chip)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    chips.includes(chip)
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-line text-ink-dim hover:border-accent hover:text-ink'
                  }`}
                >
                  {chip}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  setOtherOpen((prev) => ({ ...prev, [group.label]: !prev[group.label] }))
                }
                className={`rounded-full border px-3 py-1 text-sm ${
                  otherOpen[group.label] || (others[group.label] ?? '').trim()
                    ? 'border-accent bg-accent/15 text-accent'
                    : 'border-line text-ink-dim hover:border-accent hover:text-ink'
                }`}
              >
                other
              </button>
            </div>
            {otherOpen[group.label] && (
              <input
                autoFocus
                value={others[group.label] ?? ''}
                onChange={(e) => setOthers((prev) => ({ ...prev, [group.label]: e.target.value }))}
                placeholder={`your own ${group.label}`}
                className="mt-2 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-accent"
              />
            )}
          </Section>
        ))}
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
      </div>

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
            title="Starts a fresh brainstorm session from this brief (requires the Claude engine)"
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
                {models.length > 0 && (
                  <label className="block px-2 py-1.5 text-xs text-ink-dim">
                    Model for generation
                    <select
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none focus:border-accent"
                    >
                      {models.map((m) => (
                        <option key={m} value={m}>
                          {m.replace(/^claude-/, '')}
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
