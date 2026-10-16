// On-device model catalog as the Akaya app ships it.
//
// MUST match akaya_ai/lib/runtime/model_manager/model_manager.dart
// (AiModelCatalog.models) id-for-id — pinned by src/__tests__/models.test.ts,
// which reads the Dart file. The app treats a saved app_config/models
// `llmEnabledIds` as an ALLOW-LIST: any built-in id missing from it is hidden
// from every user. This list used to carry the retired Gemma 3 / Gemma 3n /
// Phi-3.5 / Qwen 2.5 3B ids, so one toggle on the Offline Models page would
// have hidden Gemma 4, Qwen 3, SmolLM3 and Phi-4 app-wide (audit S8).

export type ModelType = "gemmaIt" | "llama" | "qwen" | "deepSeek";
export type FileType = "task" | "litertlm";

export interface BuiltInLlm {
  id: string;
  name: string;
  provider: string;
  description: string;
  ramRequiredMb: number;
  fileSizeBytes: number;
  modelType: ModelType;
  fileType: FileType;
  capabilities: string[];
}

export const BUILT_IN_LLM: BuiltInLlm[] = [
  { id: "gemma4-e2b",       name: "Gemma 4 E2B",              provider: "Google",      description: "⭐ Best overall mobile model — 4GB RAM phones ke liye",      ramRequiredMb: 4096, fileSizeBytes: 2590000000, modelType: "gemmaIt",  fileType: "task", capabilities: ["chat", "hindi", "multilingual", "reasoning"] },
  { id: "gemma4-e4b",       name: "Gemma 4 E4B",              provider: "Google",      description: "High-quality offline assistant — 6-8GB RAM flagships ke liye", ramRequiredMb: 6144, fileSizeBytes: 3660000000, modelType: "gemmaIt",  fileType: "task", capabilities: ["chat", "code", "hindi", "reasoning"] },
  { id: "qwen3-0.6b",       name: "Qwen 3 0.6B",              provider: "Alibaba",     description: "Ultra-fast basic chat — 2GB RAM, runs on any phone",         ramRequiredMb: 2048, fileSizeBytes: 500000000,  modelType: "qwen",     fileType: "task", capabilities: ["chat", "fast"] },
  { id: "qwen3-4b",         name: "Qwen 3 4B",                provider: "Alibaba",     description: "Reasoning + coding — 6GB RAM phones ke liye",                ramRequiredMb: 6144, fileSizeBytes: 2660000000, modelType: "qwen",     fileType: "task", capabilities: ["chat", "code", "reasoning", "hindi"] },
  { id: "qwen2.5-1.5b",     name: "Qwen 2.5 1.5B",            provider: "Alibaba",     description: "Hindi + English ka best small model — 2GB+ phones",          ramRequiredMb: 2048, fileSizeBytes: 1597931520, modelType: "qwen",     fileType: "task", capabilities: ["chat", "hindi", "fast"] },
  { id: "smollm3-3b",       name: "SmolLM3 3B",               provider: "HuggingFace", description: "Lightweight chat — 4-6GB RAM, efficient inference",          ramRequiredMb: 4096, fileSizeBytes: 2000000000, modelType: "llama",    fileType: "task", capabilities: ["chat", "fast"] },
  { id: "phi-4-mini",       name: "Phi-4 Mini",               provider: "Microsoft",   description: "Coding + agents — 6-8GB RAM phones ke liye",                 ramRequiredMb: 6144, fileSizeBytes: 4198029734, modelType: "llama",    fileType: "task", capabilities: ["chat", "code", "reasoning", "agents"] },
  { id: "llama3.2-1b",      name: "Llama 3.2 1B",             provider: "Meta",        description: "Lightweight general assistant — 3GB RAM",                    ramRequiredMb: 3072, fileSizeBytes: 629145600,  modelType: "llama",    fileType: "task", capabilities: ["chat", "fast"] },
  { id: "llama3.2-3b",      name: "Llama 3.2 3B",             provider: "Meta",        description: "Better quality general assistant — 6GB RAM",                ramRequiredMb: 6144, fileSizeBytes: 1932735283, modelType: "llama",    fileType: "task", capabilities: ["chat", "reasoning", "hindi"] },
  { id: "deepseek-r1-1.5b", name: "DeepSeek R1 Distill 1.5B", provider: "DeepSeek",    description: "Reasoning — math, logic, step-by-step, 4GB RAM",             ramRequiredMb: 4096, fileSizeBytes: 1833451520, modelType: "deepSeek", fileType: "task", capabilities: ["reasoning", "math", "code"] },
  { id: "deepseek-r1-7b",   name: "DeepSeek R1 Distill 7B",   provider: "DeepSeek",    description: "Advanced reasoning — complex problems, 8GB+ RAM",            ramRequiredMb: 8192, fileSizeBytes: 4531978224, modelType: "deepSeek", fileType: "task", capabilities: ["reasoning", "math", "code", "hindi"] },
];

// Defaults follow the app's own ladder (model_manager_impl.dart
// _recommendModel): ≥12 GB deepseek-r1-7b, ≥8 GB gemma4-e4b, ≥6 GB qwen3-4b,
// ≥4 GB gemma4-e2b, ≥3 GB qwen2.5-1.5b, floor qwen3-0.6b.
export const RAM_TIERS = [
  { key: "12000", label: "≥ 12 GB", default: "deepseek-r1-7b" },
  { key: "10000", label: "≥ 10 GB", default: "gemma4-e4b" },
  { key: "8000", label: "≥ 8 GB", default: "gemma4-e4b" },
  { key: "6000", label: "≥ 6 GB", default: "qwen3-4b" },
  { key: "5000", label: "≥ 5 GB", default: "gemma4-e2b" },
  { key: "4000", label: "≥ 4 GB", default: "gemma4-e2b" },
  { key: "3000", label: "≥ 3 GB", default: "qwen2.5-1.5b" },
  { key: "2000", label: "≥ 2 GB", default: "qwen2.5-1.5b" },
  { key: "0", label: "< 2 GB", default: "qwen3-0.6b" },
];

export interface CatalogDrift {
  /// Built-in models a saved allow-list hides from every user.
  hiddenBuiltIns: string[];
  /// Ids in the saved allow-list the app no longer ships (ignored by it).
  staleEnabledIds: string[];
  /// Recommendation targets the app cannot offer (it skips them).
  staleRecommendations: string[];
}

/// Pure: compares a stored app_config/models doc with the shipped catalog.
/// `storedEnabledIds` null/undefined = no allow-list (everything enabled).
export function catalogDrift(
  storedEnabledIds: readonly string[] | null | undefined,
  customIds: readonly string[],
  recommendations: Record<string, string> | null | undefined,
): CatalogDrift {
  const builtIn = new Set(BUILT_IN_LLM.map((m) => m.id));
  const known = new Set([...builtIn, ...customIds]);
  const hiddenBuiltIns = storedEnabledIds
    ? BUILT_IN_LLM.filter((m) => !storedEnabledIds.includes(m.id)).map((m) => m.id)
    : [];
  const staleEnabledIds = storedEnabledIds ? storedEnabledIds.filter((id) => !known.has(id)) : [];
  const staleRecommendations = Object.values(recommendations ?? {}).filter((id) => !known.has(id));
  return {
    hiddenBuiltIns,
    staleEnabledIds: [...new Set(staleEnabledIds)],
    staleRecommendations: [...new Set(staleRecommendations)],
  };
}
