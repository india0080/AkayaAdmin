export type ProviderType = "openAiCompatible" | "gemini" | "anthropic";

/// What a provider row is FOR. Mirrors functions/src/provider_validation.ts —
/// the server is the enforcer, this type is the UI's vocabulary.
///   chat      — proxied chat LLM (arbitrary ids, unlimited rows)
///   stt       — online voice recognition; active rows form the fallback chain
///   tts       — online voice synthesis (chain managed on the Voice page)
///   websearch — the single fixed 'websearch' key slot
export type ProviderCategory = "chat" | "stt" | "tts" | "websearch";

export interface Provider {
  id: string;
  name: string;
  hasKey: boolean;   // true when an API key is saved server-side in /provider_keys
  baseUrl: string;
  model: string;
  type: ProviderType;
  category: ProviderCategory;
  platform: string;  // preset label ("groq", "openai", …) — display/filter only
  order: number;     // fallback position within a category (stt chain order)
  isActive: boolean;
}

export type UserPlan = "free" | "silver" | "gold";

export interface AkayaUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  plan: UserPlan;
  planExpiry: Date | null;
  isGuest: boolean;
  createdAt: Date | null;
  messageCount: number;
}

export interface DashboardStats {
  totalUsers: number;
  guestUsers: number;
  silverUsers: number;
  goldUsers: number;
  activeProviders: number;
  totalProviders: number;
}
