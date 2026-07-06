import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

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
  /** Models offered in the studio's composer picker. */
  models: z
    .array(z.string())
    .default(['claude-fable-5', 'claude-opus-4-8', 'claude-sonnet-5', 'claude-haiku-4-5']),
  defaultModel: z.string().default('claude-fable-5'),
  /** Thread cache root (cwd-relative). The donor-style discussion folder. */
  discussionDir: z.string().default('.docs/discussion'),
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
