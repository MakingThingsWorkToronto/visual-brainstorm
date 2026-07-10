#!/usr/bin/env node
/**
 * Deterministic agentic-surface guard (no model — rule 11 keeps harness code dumb).
 *
 * Enforces that every DURABLE `.claude/{commands,skills,agents}` file is registered in the
 * provider-neutral SSOT registry (`.claude/agentic-surface-registry.json`), and that every
 * registry surface points at a real file. Also WARNS when a registry command/agent has no
 * GitHub Copilot adapter in `.github/agentic-surface-registry.json`, so harness parity stays
 * visible (rule 11).
 *
 * Prevents the drift found 2026-07-09 (`add-theme` + `revisit-round` existed on disk but were
 * absent from the registry). Docs: wiki/System/harness-claude-code.md + harness-copilot.md.
 *
 * Exit codes (CLI / hook): 2 = errors (blocking), 0 = clean (warnings are non-blocking).
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KINDS = ['command', 'skill', 'agent'];

/**
 * Pure evaluation — all inputs in memory, no filesystem. Testable in isolation.
 * @param {{surfaces:Array, exclusions?:object, disk:object, copilotMap:object|null}} input
 *   disk: { command:[{name,path}], skill:[...], agent:[...] } — files that EXIST on disk.
 *   copilotMap: { commands:[{name}], agents:[{name}] } or null when unavailable.
 * @returns {{errors:string[], warnings:string[]}}
 */
export function evaluateSurface({ surfaces = [], exclusions = {}, disk = {}, copilotMap = null }) {
  const errors = [];
  const warnings = [];

  const byKind = { command: [], skill: [], agent: [] };
  for (const s of surfaces) (byKind[s.kind] ??= []).push(s);

  for (const kind of KINDS) {
    const registered = new Set((byKind[kind] ?? []).map((s) => s.name));
    const excl = exclusions[`${kind}s`] ?? [];
    const onDisk = disk[kind] ?? [];
    const diskNames = new Set(onDisk.map((f) => f.name));

    // Forward: a durable file on disk must be registered (or explicitly excluded).
    for (const { name, path } of onDisk) {
      if (registered.has(name)) continue;
      if (excl.some((p) => globMatch(p, name))) continue;
      errors.push(
        `Unregistered ${kind} "${name}" (${path}) is on disk but absent from the SSOT registry. ` +
          `Add a "${kind}" surface entry to .claude/agentic-surface-registry.json, ` +
          `or add "${name}" to exclusions.${kind}s with a documented reason.`,
      );
    }

    // Reverse: a registry entry must point at a file that exists.
    for (const s of byKind[kind] ?? []) {
      if (!diskNames.has(s.name)) {
        errors.push(
          `Dangling registry entry: ${kind} "${s.name}" (${s.path}) is registered but the file ` +
            `does not exist. Remove the entry or restore the file.`,
        );
      }
    }
  }

  // Copilot adapter parity — WARN only (some surfaces are intentionally unadapted).
  if (copilotMap) {
    const copilotExcl = exclusions.copilot ?? {};
    const adaptedCmd = new Set((copilotMap.commands ?? []).map((c) => c.name));
    const adaptedAgent = new Set((copilotMap.agents ?? []).map((a) => a.name));
    for (const s of byKind.command ?? []) {
      if (adaptedCmd.has(s.name)) continue;
      if ((copilotExcl.commands ?? []).some((p) => globMatch(p, s.name))) continue;
      warnings.push(
        `Copilot gap: command "${s.name}" is in the SSOT registry but has no .github/prompts ` +
          `adapter (agentic-surface-registry.json). Add one for harness parity (rule 11) or list it ` +
          `under exclusions.copilot.commands.`,
      );
    }
    for (const s of byKind.agent ?? []) {
      if (adaptedAgent.has(s.name)) continue;
      if ((copilotExcl.agents ?? []).some((p) => globMatch(p, s.name))) continue;
      warnings.push(`Copilot gap: agent "${s.name}" has no .github/agents adapter.`);
    }
  } else {
    warnings.push('No .github Copilot adapter map found — Copilot parity not checked.');
  }

  return { errors, warnings };
}

/** Filesystem wrapper: read the real repo and evaluate. */
export function checkAgenticSurface(root) {
  const registry = readJson(join(root, '.claude/agentic-surface-registry.json'));
  // The Copilot adapter map has been named both agentic-surface-map.json and
  // agentic-surface-registry.json across the .github rename — accept whichever exists.
  const mapPath = ['.github/agentic-surface-map.json', '.github/agentic-surface-registry.json']
    .map((p) => join(root, p))
    .find((p) => existsSync(p));
  const copilotMap = mapPath ? readJson(mapPath) : null;
  const disk = {
    command: listMd(join(root, '.claude/commands')),
    skill: listSkillDirs(join(root, '.claude/skills')),
    agent: listMd(join(root, '.claude/agents')),
  };
  return evaluateSurface({
    surfaces: registry.surfaces ?? [],
    exclusions: registry.exclusions ?? {},
    disk,
    copilotMap,
  });
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}
function listMd(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({ name: f.replace(/\.md$/, ''), path: `.claude/${dir.split(/[\\/]/).at(-1)}/${f}` }));
}
function listSkillDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((d) => statSync(join(dir, d)).isDirectory() && existsSync(join(dir, d, 'SKILL.md')))
    .map((d) => ({ name: d, path: `.claude/skills/${d}/SKILL.md` }));
}
export function globMatch(pattern, name) {
  const re = new RegExp('^' + pattern.split('*').map(escapeRe).join('.*') + '$');
  return re.test(name);
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// CLI / hook entry — diagnostics to stderr only (stdout stays clean).
// `--hook` mode stays quiet on success (only blocking errors surface) so it can run after every
// Write/Edit without spamming advisory Copilot warnings — those are caught by `npm test` / a
// bare CLI run.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/check-agentic-surface.mjs')) {
  const hookMode = process.argv.includes('--hook');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const { errors, warnings } = checkAgenticSurface(root);
  if (!hookMode) for (const w of warnings) console.error(`⚠ ${w}`);
  for (const e of errors) console.error(`✖ ${e}`);
  if (errors.length) {
    console.error(
      `\nagentic-surface guard: ${errors.length} error(s). Register the file(s) in ` +
        `.claude/agentic-surface-registry.json so every harness stays in sync (rule 11).`,
    );
    process.exit(2);
  }
  if (!hookMode) console.error(`agentic-surface guard: OK (${warnings.length} Copilot warning(s)).`);
}
