import { useState } from 'react';
import type { PaletteColor, Theme } from '@visual-brainstorm/protocol';

/**
 * Generation palettes, selectable BY THEME: click a theme's name to make its
 * curated palette the generation palette (and, on a live board, the
 * discussion's theme — studio skin and artifacts follow). Click any swatch to
 * edit that color and its name in a picker dialog; the + on each row adds a
 * new named color. Edits persist as a drop-in theme JSON via POST /api/themes
 * (an edited built-in is shadowed by its saved copy), so every color keeps a
 * name the user can refer to in conversation.
 */
export function themePalettes(themes: Theme[]): { name: string; colors: PaletteColor[] }[] {
  return themes.map((theme) => ({
    name: theme.label,
    colors: resolvePalette(theme),
  }));
}

/** A theme's curated palette, or the derived fallback for drop-ins without one. */
export function resolvePalette(theme: Theme): PaletteColor[] {
  return theme.palette && theme.palette.length > 0
    ? theme.palette
    : [
        { name: `${theme.label} accent`, value: theme.light.accent },
        { name: `${theme.label} ink`, value: theme.light.ink },
        { name: `${theme.label} dim ink`, value: theme.light.inkDim },
        { name: `${theme.label} surface`, value: theme.light.surface2 },
        { name: `${theme.label} canvas`, value: theme.light.canvas },
      ];
}

function ColorDialog({
  title,
  initial,
  onSave,
  onClose,
}: {
  title: string;
  initial: PaletteColor;
  onSave: (color: PaletteColor) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [value, setValue] = useState(initial.value);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xs rounded-2xl border border-line bg-surface p-4 shadow-2xl">
        <h2 className="text-sm font-bold">{title}</h2>
        <div className="mt-3 flex items-center gap-3">
          <input
            type="color"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            title="Pick the color"
            className="h-10 w-14 cursor-pointer rounded-lg border border-line bg-surface-2"
          />
          <div
            className="h-10 flex-1 rounded-lg border border-line"
            style={{ background: value }}
            title={value}
          />
        </div>
        <label className="mt-3 block text-xs text-ink-dim">
          Color name (use it in conversation)
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ultraviolet"
            className="mt-1 w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs text-ink-dim hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => onSave({ name: name.trim(), value })}
            className="rounded-lg bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:brightness-105 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function PalettePicker({
  themes,
  selectedTheme,
  onSelect,
  linkSession = false,
}: {
  themes: Theme[];
  /** Name of the theme whose palette is the current generation palette. */
  selectedTheme: string | null;
  onSelect: (theme: Theme | null, colors: PaletteColor[]) => void;
  /** Also set the live discussion's theme on select (board composer). */
  linkSession?: boolean;
}) {
  const [editing, setEditing] = useState<{ theme: Theme; index: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickTheme = async (theme: Theme) => {
    const deselect = selectedTheme === theme.name;
    onSelect(deselect ? null : theme, deselect ? [] : resolvePalette(theme));
    if (linkSession) {
      try {
        await fetch('/api/session-theme', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: deselect ? null : theme.name }),
        });
      } catch {
        /* selection still counts locally; the response carries the palette */
      }
    }
  };

  const saveColor = async (color: PaletteColor) => {
    if (!editing) return;
    const { theme, index } = editing;
    const base = resolvePalette(theme);
    const palette = index === null ? [...base, color] : base.map((c, i) => (i === index ? color : c));
    const updated = { ...theme, palette };
    setEditing(null);
    try {
      const res = await fetch('/api/themes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme: updated }),
      });
      const body = await res.json();
      setError(body.ok ? null : body.error);
    } catch (err) {
      setError(String(err));
    }
    // Keep the generation palette in sync when the edited theme is selected.
    if (selectedTheme === theme.name) onSelect(updated, palette);
  };

  const selected = themes.find((t) => t.name === selectedTheme);

  return (
    <div className="space-y-2">
      {themes.map((theme) => {
        const active = theme.name === selectedTheme;
        return (
          <div
            key={theme.name}
            className={`flex items-center gap-2 rounded-lg border p-1.5 ${
              active ? 'border-accent bg-accent/10' : 'border-transparent'
            }`}
          >
            <button
              type="button"
              onClick={() => pickTheme(theme)}
              aria-pressed={active}
              title={`Use the ${theme.label} palette for generated options${linkSession ? ' and this discussion' : ''} (click again to clear)`}
              className={`w-24 shrink-0 truncate text-left text-xs ${
                active ? 'font-semibold text-accent' : 'text-ink-dim hover:text-ink'
              }`}
            >
              {theme.label}
            </button>
            <div className="flex flex-wrap gap-1.5">
              {resolvePalette(theme).map((color, i) => (
                <button
                  key={`${color.value}-${i}`}
                  type="button"
                  onClick={() => setEditing({ theme, index: i })}
                  title={`${color.name} (${color.value}): click to change the color or its name`}
                  className="h-6 w-6 rounded-md border border-line hover:ring-2 hover:ring-accent/50"
                  style={{ background: color.value }}
                />
              ))}
              <button
                type="button"
                onClick={() => setEditing({ theme, index: null })}
                aria-label={`Add a color to ${theme.label}`}
                title={`Add a color to ${theme.label}`}
                className="h-6 w-6 rounded-md border border-dashed border-line text-xs font-semibold text-ink-dim hover:border-accent hover:text-accent"
              >
                +
              </button>
            </div>
          </div>
        );
      })}
      {error && <div className="text-[11px] text-red-500">could not save the theme: {error}</div>}
      {selected && (
        <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
          {resolvePalette(selected).map((color) => (
            <span
              key={color.value}
              className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 px-1.5 py-0.5 text-[11px]"
            >
              <span className="h-3 w-3 rounded-sm border border-line" style={{ background: color.value }} />
              {color.name}
            </span>
          ))}
          <span className="text-[11px] text-ink-dim">will color the generated options</span>
        </div>
      )}
      {editing && (
        <ColorDialog
          title={
            editing.index === null
              ? `Add a color to ${editing.theme.label}`
              : `Edit ${resolvePalette(editing.theme)[editing.index].name}`
          }
          initial={
            editing.index === null
              ? { name: '', value: editing.theme.light.accent }
              : resolvePalette(editing.theme)[editing.index]
          }
          onSave={saveColor}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
