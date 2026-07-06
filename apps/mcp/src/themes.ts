import fs from 'node:fs';
import path from 'node:path';
import { ThemeSchema, type Theme } from '@visual-brainstorm/protocol';
import type { VibrConfig } from './config.js';

/** Built-in themes. Default accent is neon purple. */
export const BUILTIN_THEMES: Theme[] = [
  {
    name: 'neon-purple',
    label: 'Neon Purple',
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
