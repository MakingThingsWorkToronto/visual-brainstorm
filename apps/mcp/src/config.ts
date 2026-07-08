import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { ModelCatalogEntrySchema, RuntimeEngineSchema, type ModelCatalogEntry, type RuntimeEngine } from '@visual-brainstorm/protocol';

export const DEFAULT_RUNTIME: RuntimeEngine = {
  id: 'claude',
  label: 'Claude Code',
  provider: 'Anthropic',
};

export const DEFAULT_MODELS: ModelCatalogEntry[] = [
  {
    id: 'claude-fable-5',
    label: 'Claude Fable 5',
    provider: 'Anthropic',
    engineIds: ['claude'],
    capabilities: { orchestrate: false, delegate: true },
  },
  {
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    provider: 'Anthropic',
    engineIds: ['claude'],
    capabilities: { orchestrate: false, delegate: true },
  },
  {
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    provider: 'Anthropic',
    engineIds: ['claude'],
    capabilities: { orchestrate: false, delegate: true },
  },
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    provider: 'Anthropic',
    engineIds: ['claude'],
    capabilities: { orchestrate: false, delegate: true },
  },
];

function legacyModelToCatalogEntry(id: string): ModelCatalogEntry {
  const known = DEFAULT_MODELS.find((entry) => entry.id === id);
  if (known) return known;
  const slug = id.replace(/^claude-/, '');
  const words = slug
    .split('-')
    .filter(Boolean)
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
  return {
    id,
    label: id.startsWith('claude-') ? `Claude ${words}` : words || id,
    provider: id.startsWith('claude-') ? 'Anthropic' : 'Unknown',
    engineIds: ['claude'],
    capabilities: { orchestrate: false, delegate: true },
  };
}

const RawModelSchema = z.union([z.string().min(1), ModelCatalogEntrySchema]);

function normalizeModels(models: Array<string | ModelCatalogEntry>): ModelCatalogEntry[] {
  return models.map((model) =>
    typeof model === 'string' ? legacyModelToCatalogEntry(model) : ModelCatalogEntrySchema.parse(model),
  );
}

/**
 * Human-editable config: visual-brainstorm.config.json in the brainstormed
 * project's root (cwd). Everything optional; defaults below.
 */
export const ConfigSchema = z.object({
  /** Path (absolute or cwd-relative) of a repo to also receive accepted artifacts. */
  targetRepo: z.string().optional(),
  /** Directory (cwd-relative) scanned for user theme JSON files. */
  stylesDir: z.string().default('styles'),
  /** Default theme name (built-in or ingested). */
  theme: z.string().default('neon-purple'),
  /** Real orchestration runtime metadata — Claude today, widened for future adapters. */
  runtime: RuntimeEngineSchema.default(DEFAULT_RUNTIME),
  /** Models offered in the studio's composer picker. */
  models: z
    .array(RawModelSchema)
    .default(DEFAULT_MODELS)
    .transform((models) => normalizeModels(models as Array<string | ModelCatalogEntry>)),
  defaultModel: z.string().default('claude-fable-5'),
  /** Thread cache root (cwd-relative). Top-level discussion folder. */
  discussionDir: z.string().default('discussion'),
});
export type VibrConfig = z.infer<typeof ConfigSchema>;

export const CONFIG_FILENAME = 'visual-brainstorm.config.json';

export function loadConfig(cwd = process.cwd()): VibrConfig {
  const file = path.join(cwd, CONFIG_FILENAME);
  let raw: unknown = {};
  if (fs.existsSync(file)) {
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.error(`[config] ${CONFIG_FILENAME} is invalid JSON, using defaults: ${String(err)}`);
    }
  }
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`[config] ${CONFIG_FILENAME} failed validation, using defaults: ${parsed.error.message}`);
    return ConfigSchema.parse({});
  }
  return parsed.data;
}

export function discussionRoot(config: VibrConfig, cwd = process.cwd()): string {
  return process.env.VIBR_HOME ?? path.resolve(cwd, config.discussionDir);
}

/**
 * Persist the default targetRepo to visual-brainstorm.config.json, preserving
 * every other key (including unknown ones and $comment). null removes the key.
 */
export function saveTargetRepo(targetRepo: string | null, cwd = process.cwd()): void {
  const file = path.join(cwd, CONFIG_FILENAME);
  let raw: Record<string, unknown> = {};
  if (fs.existsSync(file)) {
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch (err) {
      console.error(`[config] ${CONFIG_FILENAME} unreadable while saving targetRepo, rewriting: ${String(err)}`);
      raw = {};
    }
  }
  if (targetRepo === null) {
    delete raw.targetRepo;
  } else {
    raw.targetRepo = targetRepo;
  }
  fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
}
