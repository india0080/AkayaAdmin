// Provider platform presets and pure form rules for Providers & Keys.
// Presets moved verbatim from the legacy page (2026-08-15 redesign); the
// server (provider_validation.ts) remains the authority on what is valid.

import type { ProviderCategory, ProviderType } from "../../types";

/// Mirrors providerEnvName() in functions/src/secrets.ts. Duplicated rather than
/// shared because the admin panel and the functions are separate packages with no
/// common module; the rule is three characters of regex and is covered by
/// functions/secrets.test.js.
export function secretEnvName(providerId: string): string {
  return `PROVIDER_KEY_${providerId.replace(/[^A-Za-z0-9]/g, "_").toUpperCase()}`;
}

export interface PlatformPreset {
  id: string;
  label: string;
  categories: ProviderCategory[];
  dialect: ProviderType;
  baseUrl: string;
  models: string[];
  sttModels?: string[];
  ttsModels?: string[];
  keyPrefix: string;   // placeholder hint, not validation
  keyUrl: string;      // where the operator creates a key
}

export const PLATFORMS: PlatformPreset[] = [
  {
    id: "meta", label: "Meta Model API (chat / realtime STT)",
    categories: ["chat", "stt"], dialect: "openAiCompatible", baseUrl: "https://api.meta.ai/v1",
    models: ["muse-spark-1.3", "muse-spark-1.2"], sttModels: ["muse-voice-transcribe-1.0"],
    keyPrefix: "Meta Model API key", keyUrl: "dev.meta.ai",
  },
  {
    id: "meta-wit", label: "Meta Wit.ai (text-to-speech)",
    categories: ["tts"], dialect: "openAiCompatible", baseUrl: "https://api.wit.ai",
    models: ["wit-synthesize"], ttsModels: ["wit-synthesize"],
    keyPrefix: "Wit.ai server access token", keyUrl: "wit.ai",
  },
  {
    id: "groq",
    label: "Groq",
    categories: ["chat", "stt"],
    dialect: "openAiCompatible",
    baseUrl: "https://api.groq.com/openai/v1",
    // Device-QA 2026-08-18: llama-3.3-70b-versatile now 404s (model_not_found)
    // and qwen-2.5-72b-instruct was never in Groq's catalog — both replaced with
    // current production ids (console.groq.com/docs/models).
    models: ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "llama-3.1-8b-instant"],
    sttModels: ["whisper-large-v3", "whisper-large-v3-turbo"],
    keyPrefix: "gsk_…",
    keyUrl: "console.groq.com",
  },
  {
    id: "openai",
    label: "OpenAI / ChatGPT",
    categories: ["chat", "stt", "tts"],
    dialect: "openAiCompatible",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini", "gpt-4o", "o4-mini"],
    sttModels: ["whisper-1", "gpt-4o-mini-transcribe"],
    ttsModels: ["gpt-4o-mini-tts", "tts-1"],
    keyPrefix: "sk-…",
    keyUrl: "platform.openai.com",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    categories: ["chat"],
    dialect: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
    keyPrefix: "AIza…",
    keyUrl: "aistudio.google.com",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    categories: ["chat"],
    dialect: "openAiCompatible",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-chat", "deepseek-reasoner"],
    keyPrefix: "sk-…",
    keyUrl: "platform.deepseek.com",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    categories: ["chat"],
    dialect: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    models: ["claude-sonnet-5", "claude-haiku-4-5-20251001"],
    keyPrefix: "sk-ant-…",
    keyUrl: "console.anthropic.com",
  },
  {
    id: "mistral",
    label: "Mistral",
    categories: ["chat"],
    dialect: "openAiCompatible",
    baseUrl: "https://api.mistral.ai/v1",
    models: ["mistral-large-latest", "mistral-small-latest"],
    keyPrefix: "…",
    keyUrl: "console.mistral.ai",
  },
  {
    id: "together",
    label: "Together AI",
    categories: ["chat"],
    dialect: "openAiCompatible",
    baseUrl: "https://api.together.xyz/v1",
    models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"],
    keyPrefix: "…",
    keyUrl: "api.together.ai",
  },
  {
    id: "sarvam",
    label: "Sarvam AI (Hindi/Hinglish TTS)",
    categories: ["tts"],
    dialect: "openAiCompatible",
    baseUrl: "https://api.sarvam.ai",
    models: [],
    ttsModels: ["bulbul:v2", "bulbul:v3"],
    keyPrefix: "subscription key",
    keyUrl: "sarvam.ai",
  },
  {
    id: "serper",
    label: "Serper (Google Search)",
    categories: ["websearch"],
    dialect: "openAiCompatible",
    baseUrl: "",
    models: [],
    keyPrefix: "40-char key",
    keyUrl: "serper.dev",
  },
  {
    id: "tavily",
    label: "Tavily Search",
    categories: ["websearch"],
    dialect: "openAiCompatible",
    baseUrl: "",
    models: [],
    keyPrefix: "tvly-…",
    keyUrl: "tavily.com",
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    categories: ["chat", "stt", "tts"],
    dialect: "openAiCompatible",
    baseUrl: "https://",
    models: [],
    keyPrefix: "…",
    keyUrl: "",
  },
];

export const CATEGORY_META: Record<ProviderCategory, { label: string; hint: string }> = {
  chat: {
    label: "LLM Chat",
    hint: "Selectable in the app's Online AI picker. Unlimited rows.",
  },
  stt: {
    label: "Voice STT",
    hint: "Online speech recognition. Active rows form the fallback chain, tried in Order.",
  },
  tts: {
    label: "Voice TTS",
    hint: "Online speech synthesis. Chain order is managed on the Voice page.",
  },
  websearch: {
    label: "Web Search",
    hint: "One fixed slot. Tavily keys start with tvly-, anything else is treated as Serper.",
  },
};

// stt rows need stable, chain-referenced ids. First stt row for a platform
// gets the platform id itself (groq/openai have hardcoded base-URL fallbacks
// server-side); later ones get -2, -3….
export function suggestSttId(platform: string, taken: Set<string>): string {
  if (!taken.has(platform)) return platform;
  for (let i = 2; i < 100; i++) {
    if (!taken.has(`${platform}-${i}`)) return `${platform}-${i}`;
  }
  return `${platform}-${Date.now() % 1000}`;
}


export interface ProviderForm {
  platform: string;
  category: ProviderCategory;
  name: string;
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  type: ProviderType;
  order: number;
  isActive: boolean;
  reasoningEffort?: string;
}

export function usesMetaReasoning(form: Pick<ProviderForm, 'category' | 'baseUrl' | 'model'>) {
  return form.category === 'chat' && form.baseUrl.trim().replace(/\/+$/, '') === 'https://api.meta.ai/v1' && /^muse-(spark|wonder)-/.test(form.model.trim());
}

export const EMPTY_PROVIDER_FORM: ProviderForm = {
  platform: "groq",
  category: "chat",
  name: "",
  providerId: "",
  apiKey: "",
  baseUrl: "https://api.groq.com/openai/v1",
  model: PLATFORMS.find(p => p.id === 'groq')?.models[0] ?? "",
  type: "openAiCompatible",
  order: 0,
  isActive: false, // matches the live admin: new providers start inactive
};

/// The form's own checks, before the server's. Returns the first problem.
export function providerFormError(form: ProviderForm, editId: string | null, existingIds: ReadonlySet<string>): string | null {
  if (!form.name.trim()) return "Name is required.";
  if (form.category !== "websearch" && (!form.baseUrl.trim() || !form.model.trim())) return "Base URL and model are required.";
  if ((form.category === "stt" || form.category === "tts") && !form.providerId.trim()) {
    return "Voice providers need a provider id: the fallback chain references it.";
  }
  // On create a key is required; on edit, blank keeps the stored key.
  if (!editId && !form.apiKey.trim()) return "An API key is required for a new provider.";
  const explicit = form.providerId.trim();
  // An existing id would MERGE onto the other row (and replace its key).
  if (!editId && explicit && existingIds.has(explicit)) return `Provider '${explicit}' already exists: edit it instead, or pick another id.`;
  return null;
}

/// The adminUpsertProvider payload for a form (or a row being toggled).
export function upsertPayload(form: Omit<ProviderForm, "apiKey" | "providerId">, providerId: string | undefined, reason?: string) {
  return {
    providerId,
    name: form.name.trim(),
    category: form.category,
    platform: form.platform || undefined,
    baseUrl: form.category === "websearch" ? undefined : form.baseUrl.trim(),
    model: form.category === "websearch" ? undefined : form.model.trim(),
    type: form.type,
    // `order` is STT chain position only.
    order: form.category === "stt" ? form.order : undefined,
    isActive: form.isActive,
    ...(usesMetaReasoning(form) ? {reasoningEffort: form.reasoningEffort || 'auto'} : {}),
    reason,
  };
}
