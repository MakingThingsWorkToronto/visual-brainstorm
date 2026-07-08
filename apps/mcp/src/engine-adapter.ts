import {
  ModelCatalogEntrySchema,
  RuntimeEngineSchema,
  type ModelCatalogEntry,
  type RuntimeEngine,
} from '@visual-brainstorm/protocol';

export interface EngineAdapter {
  runtime: RuntimeEngine;
  normalizeModel(model: string | ModelCatalogEntry): ModelCatalogEntry;
  processingSelectionNote(): string;
  rewindNote(round: number): string;
}

export const DEFAULT_RUNTIME: RuntimeEngine = RuntimeEngineSchema.parse({
  id: 'claude',
  label: 'Claude Code',
  provider: 'Anthropic',
});

function titleWords(text: string): string {
  return text
    .split('-')
    .filter(Boolean)
    .map((part) => (/^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ');
}

function usesRuntimePrefix(modelId: string, runtimeId: string): boolean {
  return modelId === runtimeId || modelId.startsWith(`${runtimeId}-`);
}

function stripRuntimePrefix(modelId: string, runtimeId: string): string {
  return usesRuntimePrefix(modelId, runtimeId) ? modelId.slice(runtimeId.length).replace(/^-/, '') : modelId;
}

function runtimeModelPrefix(runtime: RuntimeEngine): string {
  return titleWords(runtime.id) || runtime.label || runtime.provider || 'Model';
}

function inferModelLabel(modelId: string, runtime: RuntimeEngine): string {
  const slug = stripRuntimePrefix(modelId, runtime.id);
  const words = titleWords(slug);
  if (!words) return modelId;
  return usesRuntimePrefix(modelId, runtime.id) ? `${runtimeModelPrefix(runtime)} ${words}` : words;
}

function inferModelProvider(modelId: string, runtime: RuntimeEngine): string {
  return usesRuntimePrefix(modelId, runtime.id) ? runtime.provider : 'Unknown';
}

function normalizeModelWithRuntime(runtime: RuntimeEngine, model: string | ModelCatalogEntry): ModelCatalogEntry {
  if (typeof model !== 'string') {
    const parsed = ModelCatalogEntrySchema.parse(model);
    return 'engineIds' in model ? parsed : { ...parsed, engineIds: [runtime.id] };
  }
  return {
    id: model,
    label: inferModelLabel(model, runtime),
    provider: inferModelProvider(model, runtime),
    engineIds: [runtime.id],
    capabilities: { orchestrate: false, delegate: true },
  };
}

export function normalizeRuntime(runtime?: RuntimeEngine): RuntimeEngine {
  return runtime ? RuntimeEngineSchema.parse(runtime) : DEFAULT_RUNTIME;
}

export function createEngineAdapter(runtime?: RuntimeEngine): EngineAdapter {
  const resolvedRuntime = normalizeRuntime(runtime);
  const actor = resolvedRuntime.id === 'claude' ? 'Claude' : resolvedRuntime.label;
  return {
    runtime: resolvedRuntime,
    normalizeModel: (model) => normalizeModelWithRuntime(resolvedRuntime, model),
    processingSelectionNote: () => `${actor} is processing your selection…`,
    rewindNote: (round) => `${actor} is rewinding to round ${round}…`,
  };
}

export function normalizeModelsForRuntime(
  models: Array<string | ModelCatalogEntry>,
  runtime?: RuntimeEngine,
): ModelCatalogEntry[] {
  const adapter = createEngineAdapter(runtime);
  return models.map((model) => adapter.normalizeModel(model));
}