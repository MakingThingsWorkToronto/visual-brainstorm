import type { Theme, ThemeVars } from '@visual-brainstorm/protocol';

const VAR_MAP: [keyof ThemeVars, string][] = [
  ['canvas', '--canvas'],
  ['surface', '--surface'],
  ['surface2', '--surface-2'],
  ['line', '--line'],
  ['ink', '--ink'],
  ['inkDim', '--ink-dim'],
  ['accent', '--accent'],
];

/** Apply a theme's CSS variables, tracking the OS light/dark scheme. Returns cleanup. */
export function applyTheme(theme: Theme): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const set = () => {
    const vars = media.matches ? theme.dark : theme.light;
    for (const [key, cssVar] of VAR_MAP) {
      document.documentElement.style.setProperty(cssVar, vars[key]);
    }
  };
  set();
  media.addEventListener('change', set);
  return () => media.removeEventListener('change', set);
}

const STORAGE_KEY = 'vibr-theme';

export function storedThemeName(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function storeThemeName(name: string): void {
  localStorage.setItem(STORAGE_KEY, name);
}
