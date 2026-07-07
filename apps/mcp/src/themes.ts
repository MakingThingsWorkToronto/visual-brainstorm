import fs from 'node:fs';
import path from 'node:path';
import { ThemeSchema, type Theme } from '@visual-brainstorm/protocol';
import type { VibrConfig } from './config.js';

/**
 * Built-in themes. Default accent is neon purple.
 *
 * Each theme carries a curated 5-color generation palette anchored on its
 * accent and tuned to 2026 palette forecasts (Pantone "Cloud Dancer" off-white
 * ground; Pinterest's Cool Blue / Jade / Plum Noir / Wasabi; the earth-tone
 * clay / sage / wheat layering; floral purples with juicy orange highlights).
 * Rule: a dark anchor, the accent, one supporting mid, one contrast pop, one
 * grounding neutral — so any subset still hangs together.
 */
export const BUILTIN_THEMES: Theme[] = [
  {
    name: 'neon-purple',
    label: 'Neon Purple',
    palette: [
      { name: 'Plum Noir', value: '#3b2141' },
      { name: 'Ultraviolet', value: '#a855f7' },
      { name: 'Orchid', value: '#c084fc' },
      { name: 'Muskmelon', value: '#f2a65a' },
      { name: 'Cloud Dancer', value: '#f0efeb' },
    ],
    light: {
      canvas: '#f8f7fb',
      surface: '#ffffff',
      surface2: '#f1eef8',
      line: '#e4dff0',
      ink: '#1c1726',
      inkDim: '#6f6883',
      accent: '#a855f7',
    },
    dark: {
      canvas: '#100c17',
      surface: '#1a1424',
      surface2: '#241c31',
      line: '#372c4a',
      ink: '#f2edfa',
      inkDim: '#a79fc0',
      accent: '#b975ff',
    },
  },
  {
    name: 'amber-classic',
    label: 'Amber Classic',
    palette: [
      { name: 'Burnt Umber', value: '#6b4423' },
      { name: 'Amber', value: '#f59e0b' },
      { name: 'Terracotta', value: '#c65d3b' },
      { name: 'Dusty Sage', value: '#a3b18a' },
      { name: 'Wheat', value: '#f5deb3' },
    ],
    light: {
      canvas: '#f7f6f3',
      surface: '#ffffff',
      surface2: '#f1efe9',
      line: '#e4e1d8',
      ink: '#1c1917',
      inkDim: '#78716c',
      accent: '#f59e0b',
    },
    dark: {
      canvas: '#12100e',
      surface: '#1c1917',
      surface2: '#26221e',
      line: '#37322c',
      ink: '#f5f0e8',
      inkDim: '#a8a29e',
      accent: '#fbbf24',
    },
  },
  {
    name: 'ocean',
    label: 'Ocean',
    palette: [
      { name: 'Deep Navy', value: '#1b4965' },
      { name: 'Cool Blue', value: '#0ea5e9' },
      { name: 'Jade', value: '#00a878' },
      { name: 'Wasabi', value: '#a8bf5a' },
      { name: 'Sea Ice', value: '#e7f3f6' },
    ],
    light: {
      canvas: '#f3f7fa',
      surface: '#ffffff',
      surface2: '#e9f1f7',
      line: '#d8e4ee',
      ink: '#0f1c26',
      inkDim: '#5c7285',
      accent: '#0ea5e9',
    },
    dark: {
      canvas: '#0a1219',
      surface: '#101c26',
      surface2: '#172633',
      line: '#233a4c',
      ink: '#e8f2fa',
      inkDim: '#8aa5ba',
      accent: '#38bdf8',
    },
  },
  {
    name: 'mono',
    label: 'Mono',
    palette: [
      { name: 'Ink', value: '#171717' },
      { name: 'Charcoal', value: '#4b4b4b' },
      { name: 'Greige', value: '#8a8378' },
      { name: 'Silver', value: '#c8c8c4' },
      { name: 'Paper', value: '#f4f4f2' },
    ],
    light: {
      canvas: '#fafafa',
      surface: '#ffffff',
      surface2: '#f0f0f0',
      line: '#e2e2e2',
      ink: '#171717',
      inkDim: '#737373',
      accent: '#171717',
    },
    dark: {
      canvas: '#0f0f0f',
      surface: '#191919',
      surface2: '#232323',
      line: '#333333',
      ink: '#f5f5f5',
      inkDim: '#a3a3a3',
      accent: '#f5f5f5',
    },
  },
];

/**
 * Persist a theme (e.g. after a palette edit in the studio) as a drop-in JSON
 * under <cwd>/<stylesDir>/ — the same files loadThemes ingests, so an edited
 * built-in is shadowed by its saved copy from then on. Returns the file path.
 */
export function saveThemeFile(theme: Theme, config: VibrConfig, cwd = process.cwd()): string {
  const dir = path.resolve(cwd, config.stylesDir);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${theme.name.replace(/[^\w.-]+/g, '_')}.json`);
  fs.writeFileSync(file, JSON.stringify(theme, null, 2) + '\n');
  return file;
}

/** Ingest user themes from <cwd>/<stylesDir>/*.json; user themes shadow built-ins by name. */
export function loadThemes(config: VibrConfig, cwd = process.cwd()): Theme[] {
  const themes = new Map(BUILTIN_THEMES.map((t) => [t.name, t]));
  const dir = path.resolve(cwd, config.stylesDir);
  if (fs.existsSync(dir)) {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      try {
        const theme = ThemeSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')));
        themes.set(theme.name, theme);
      } catch (err) {
        console.error(`[themes] skipping ${file}: ${String(err)}`);
      }
    }
  }
  return [...themes.values()];
}
