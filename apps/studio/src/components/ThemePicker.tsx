import { useState } from 'react';
import type { Theme } from '@visual-brainstorm/protocol';

/** Visual theme selection — swatch cards for each ingested/built-in theme. */
export function ThemePicker({
  themes,
  current,
  onPick,
}: {
  themes: Theme[];
  current: string;
  onPick: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = themes.find((t) => t.name === current);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs hover:border-accent"
        title="Theme: pick visually, or set in visual-brainstorm.config.json"
      >
        <span
          className="h-3 w-3 rounded-full"
          style={{ background: active?.light.accent ?? 'var(--accent)' }}
        />
        {active?.label ?? current}
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-40 mb-2 w-56 rounded-xl border border-line bg-surface p-2 shadow-xl">
          {themes.map((theme) => (
            <button
              key={theme.name}
              type="button"
              onClick={() => {
                onPick(theme.name);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm ${
                theme.name === current ? 'bg-accent/15' : 'hover:bg-surface-2'
              }`}
            >
              <span className="flex overflow-hidden rounded-md border border-line">
                {[theme.light.canvas, theme.light.surface2, theme.light.accent, theme.dark.canvas].map(
                  (color, i) => (
                    <span key={i} className="h-5 w-3.5" style={{ background: color }} />
                  ),
                )}
              </span>
              {theme.label}
            </button>
          ))}
          <div className="mt-1 border-t border-line px-2 pt-2 text-[10px] leading-snug text-ink-dim">
            Drop JSON themes in your project's <code>styles/</code> folder to ingest more.
          </div>
        </div>
      )}
    </div>
  );
}
