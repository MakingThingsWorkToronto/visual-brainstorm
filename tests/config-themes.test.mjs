import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CONFIG_FILENAME, loadConfig } from '../apps/mcp/dist/config.js';
import { BUILTIN_THEMES, loadThemes } from '../apps/mcp/dist/themes.js';
import { CANONICAL_DIR } from './canonical/load.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'vibr-test-'));

test('config defaults without a file', () => {
  const config = loadConfig(tmp());
  assert.equal(config.theme, 'neon-purple');
  assert.equal(config.stylesDir, 'styles');
  assert.equal(config.discussionDir, 'discussion');
  assert.equal(config.runtime.label, 'Claude Code');
  assert.equal(config.defaultModel, 'claude-fable-5');
  assert.ok(config.models.some((model) => model.id === 'claude-opus-4-8'));
  assert.ok(config.models.every((model) => model.capabilities.delegate));
});

test('config file overrides defaults; invalid JSON falls back safely', () => {
  const dir = tmp();
  fs.writeFileSync(
    path.join(dir, CONFIG_FILENAME),
    JSON.stringify({ theme: 'mono', targetRepo: 'X:/elsewhere' }),
  );
  const config = loadConfig(dir);
  assert.equal(config.theme, 'mono');
  assert.equal(config.targetRepo, 'X:/elsewhere');

  const broken = tmp();
  fs.writeFileSync(path.join(broken, CONFIG_FILENAME), '{not json');
  assert.equal(loadConfig(broken).theme, 'neon-purple');
});

test('config normalizes string models against the configured runtime', () => {
  const dir = tmp();
  fs.writeFileSync(
    path.join(dir, CONFIG_FILENAME),
    JSON.stringify({
      runtime: { id: 'codex', label: 'Codex CLI', provider: 'OpenAI' },
      models: ['codex-mini'],
      defaultModel: 'codex-mini',
    }),
  );
  const config = loadConfig(dir);
  assert.deepEqual(config.runtime, { id: 'codex', label: 'Codex CLI', provider: 'OpenAI' });
  assert.deepEqual(config.models, [
    {
      id: 'codex-mini',
      label: 'Codex Mini',
      provider: 'OpenAI',
      engineIds: ['codex'],
      capabilities: { orchestrate: false, delegate: true },
    },
  ]);
});

test('built-in themes: neon-purple default, all vars present in both schemes', () => {
  assert.ok(BUILTIN_THEMES.length >= 4);
  const neon = BUILTIN_THEMES.find((t) => t.name === 'neon-purple');
  assert.ok(neon);
  for (const scheme of ['light', 'dark']) {
    for (const key of ['canvas', 'surface', 'surface2', 'line', 'ink', 'inkDim', 'accent']) {
      assert.ok(neon[scheme][key], `${scheme}.${key}`);
    }
  }
});

test('built-in themes carry curated 5-color palettes with names and unique values', () => {
  const seen = new Set();
  for (const theme of BUILTIN_THEMES) {
    assert.equal(theme.palette.length, 5, `${theme.name} palette has 5 colors`);
    for (const color of theme.palette) {
      assert.ok(color.name.length > 0, `${theme.name} color has a name`);
      assert.match(color.value, /^#[0-9a-f]{6}$/i, `${color.name} is a hex color`);
      assert.ok(!seen.has(color.value), `${color.value} unique across palettes`);
      seen.add(color.value);
    }
    // Anchored on the theme: the original accent is in its palette.
    assert.ok(
      theme.palette.some((c) => c.value.toLowerCase() === theme.light.accent.toLowerCase()),
      `${theme.name} palette keeps the theme accent`,
    );
  }
});

test('style ingestion: drop-in JSON adds a theme and shadows built-ins by name', () => {
  const dir = tmp();
  const styles = path.join(dir, 'styles');
  fs.mkdirSync(styles);
  const vars = { canvas: '#fff', surface: '#fff', surface2: '#eee', line: '#ddd', ink: '#000', inkDim: '#666', accent: '#123456' };
  // The canonical theme, ingested through the REAL drop-in path.
  fs.copyFileSync(path.join(CANONICAL_DIR, 'themes', 'theme.json'), path.join(styles, 'aurora.json'));
  fs.writeFileSync(path.join(styles, 'mono.json'), JSON.stringify({ name: 'mono', label: 'Shadowed Mono', light: vars, dark: vars }));
  fs.writeFileSync(path.join(styles, 'bad.json'), '{"name":"broken"}');

  const themes = loadThemes(loadConfig(dir), dir);
  const aurora = themes.find((t) => t.name === 'aurora');
  assert.ok(aurora, 'canonical theme ingested as a drop-in');
  assert.equal(aurora.label, 'Aurora');
  assert.equal(aurora.palette.length, 5, 'curated palette survives ingestion');
  assert.equal(themes.find((t) => t.name === 'mono').label, 'Shadowed Mono');
  assert.ok(!themes.find((t) => t.name === 'broken'), 'invalid theme skipped');
});
