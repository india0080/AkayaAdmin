// Types and helpers for the Floating System page.
//
// PRESENTATION ONLY. There is no validation logic in here and there must
// never be: `functions/src/floating_config.ts` is the single validator, and
// the panel gets its verdicts from `adminFloatingSystem`. A copy of the
// rules in the browser is a third source of truth that would drift, and it
// would drift in the direction of telling an operator their configuration
// is fine when the app refuses it.
//
// What DOES live here: the labels, the ordering, and the shapes the callable
// returns.

import { httpsCallable } from "firebase/functions";
import { fns } from "@/lib/firebase";

export type ArchitectureId = "existing" | "openai_multi" | "openai_realtime";
export type StageExecution = "fused" | "split";
export type CostPolicy =
  | "cost_optimized"
  | "balanced"
  | "quality_first"
  | "latency_first";
export type ConfigStatus =
  | "configured"
  | "validated"
  | "healthy"
  | "staged"
  | "active"
  | "failed"
  | "disabled"
  | "rolled_back";

export type Stage =
  | "stt"
  | "language_detection"
  | "translation"
  | "improvement"
  | "tone"
  | "fallback";

export interface ModelRef {
  provider: string;
  model: string;
  voice?: string;
}

export interface RealtimeConfig {
  enabled: boolean;
  model: string;
  voice: string;
  transcriptionModel: string;
  persistentSession: boolean;
  sessionIdleTimeoutMs: number;
  maxReconnectAttempts: number;
  eagerness: string;
}

export interface FloatingConfig {
  mode: ArchitectureId;
  stageExecution: StageExecution;
  costPolicy: CostPolicy;
  emergencyDisabled: boolean;
  stt: ModelRef[];
  languageDetection: ModelRef[];
  translation: ModelRef[];
  improvement: ModelRef[];
  tone: ModelRef[];
  fallback: ModelRef[];
  fallbackArchitecture: ArchitectureId;
  realtime: RealtimeConfig;
  version: number;
  status: ConfigStatus;
}

export interface ConfigIssue {
  severity: "error" | "warning";
  field: string;
  message: string;
}

export interface Validation {
  ok: boolean;
  issues: ConfigIssue[];
  errors: ConfigIssue[];
  warnings: ConfigIssue[];
}

export interface VersionSummary {
  version: number;
  status: string;
  mode: string;
  createdByEmail: string;
  createdAt: number | null;
  activatedAt: number | null;
  reason: string;
  errorCount: number;
  warningCount: number;
}

export interface ReadResult {
  active: { config: FloatingConfig; validation: Validation; configured: boolean };
  draft: {
    config: FloatingConfig;
    validation: Validation;
    exists: boolean;
    updatedAt: number | null;
    updatedByEmail: string;
    dirty: boolean;
  };
  versions: VersionSummary[];
}

export const ARCHITECTURES: {
  id: ArchitectureId;
  label: string;
  blurb: string;
}[] = [
  {
    id: "existing",
    label: "Existing Floating",
    blurb:
      "The production pipeline. Streamed PCM → insertProcess (speech-to-text and the fused polish, next to the providers) → script gate → PicoClaw fall-through. Its models are configured on the Voice page, in config/voice. The permanent safety baseline.",
  },
  {
    id: "openai_multi",
    label: "OpenAI Multi-Model",
    blurb:
      "A model per job, configured below. Cost- and quality-tunable. In split execution it pays a round trip per stage.",
  },
  {
    id: "openai_realtime",
    label: "OpenAI Realtime",
    blurb:
      "One persistent session. Streams audio into a live session rather than posting a finished recording. Bills for wall-clock audio.",
  },
];

export const STAGE_LABEL: Record<Stage, string> = {
  stt: "Speech to Text",
  language_detection: "Language Detection",
  translation: "Translation",
  improvement: "Improvement",
  tone: "Tone",
  fallback: "Fallback",
};

/// Document field name for each stage. The stage ID is snake_case (it is
/// also the issue-report path); the document uses camelCase.
export const STAGE_FIELD: Record<Stage, keyof FloatingConfig> = {
  stt: "stt",
  language_detection: "languageDetection",
  translation: "translation",
  improvement: "improvement",
  tone: "tone",
  fallback: "fallback",
};

export const ALL_STAGES: Stage[] = [
  "stt",
  "language_detection",
  "translation",
  "improvement",
  "tone",
  "fallback",
];

/// Which stages a mode uses. Mirrors activeStages() in floating_config.ts —
/// used ONLY to decide what to render, never to decide what is valid.
export function activeStages(cfg: FloatingConfig): Set<Stage> {
  if (cfg.mode === "existing") return new Set();
  if (cfg.mode === "openai_realtime") return new Set<Stage>(["fallback"]);
  return cfg.stageExecution === "fused"
    ? new Set<Stage>(["stt", "improvement", "fallback"])
    : new Set<Stage>(ALL_STAGES);
}

export function chainOf(cfg: FloatingConfig, stage: Stage): ModelRef[] {
  return (cfg[STAGE_FIELD[stage]] as ModelRef[]) ?? [];
}

export function withChain(
  cfg: FloatingConfig,
  stage: Stage,
  chain: ModelRef[],
): FloatingConfig {
  return { ...cfg, [STAGE_FIELD[stage]]: chain };
}

export const STATUS_TONE: Record<string, string> = {
  active: "text-accent border-accent/30 bg-accent-soft",
  healthy: "text-accent border-accent/30 bg-accent-soft",
  validated: "text-info border-info/30 bg-info-soft",
  staged: "text-warning border-warning/30 bg-warning-soft",
  configured: "text-fg-subtle border-line bg-raised",
  failed: "text-danger border-danger/30 bg-danger-soft",
  disabled: "text-fg-subtle border-line bg-raised",
  rolled_back: "text-warning border-warning/30 bg-warning-soft",
};

export function formatTs(ms: number | null): string {
  if (ms === null) return "—";
  const d = new Date(ms);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

/// Renders a chain the way the audit log does: the rung that answers first,
/// then its fallbacks.
export function chainLabel(chain: ModelRef[]): string {
  if (chain.length === 0) return "Not set";
  return chain.map((r) => `${r.provider}/${r.model}`).join("  →  ");
}

export type Evidence = "verified" | "declared" | "unknown" | "failed";

export interface RegistryOption {
  provider: string;
  modelId: string;
  displayName: string;
  evidence: Evidence;
  contextLength?: number;
  source: string;
}

export interface ModelsResult {
  byStage: Record<Stage, RegistryOption[]>;
  realtime: RegistryOption[];
  total: number;
  unreadableSources: string[];
}

/// What each evidence level MEANS, in the operator's words. Rendered next to
/// the option rather than encoded in a colour alone, because the difference
/// between "we watched this work" and "the catalogue says so" is the whole
/// reason the levels exist.
export const EVIDENCE_LABEL: Record<Evidence, string> = {
  verified: "measured",
  declared: "catalogue",
  unknown: "unconfirmed",
  failed: "failed",
};

export const EVIDENCE_TONE: Record<Evidence, string> = {
  verified: "text-accent",
  declared: "text-info",
  unknown: "text-warning",
  failed: "text-danger",
};

export type RungStatus =
  | "healthy"
  | "not_configured"
  | "refused"
  | "unreachable"
  | "timeout"
  | "bad_shape"
  | "skipped";

export interface RungHealth {
  stage: string;
  index: number;
  provider: string;
  model: string;
  status: RungStatus;
  latencyMs: number | null;
  detail: string;
  capability: string;
  evidence: Evidence;
  required: boolean;
}

export interface HealthReport {
  ok: boolean;
  checkedAt: number;
  mode: ArchitectureId;
  rungs: RungHealth[];
  summary: { healthy: number; failed: number; skipped: number };
  notes: string[];
}

export type SmokeVerdict =
  | "passed"
  | "wrong_script"
  | "echoed_input"
  | "answered_speaker"
  | "empty"
  | "unreachable"
  | "not_configured";

export interface SmokeResult {
  caseId: string;
  verdict: SmokeVerdict;
  detail: string;
  latencyMs: number | null;
  model: string;
  output: string;
}

export interface SmokeReport {
  ok: boolean;
  ranAt: number;
  results: SmokeResult[];
  notes: string[];
}

export const RUNG_TONE: Record<RungStatus, string> = {
  healthy: "text-accent",
  not_configured: "text-danger",
  refused: "text-danger",
  unreachable: "text-warning",
  timeout: "text-warning",
  bad_shape: "text-warning",
  skipped: "text-fg-subtle",
};

/// Words, not codes. `not_configured` and `refused` are both red and mean
/// completely different things to whoever has to fix them.
export const RUNG_LABEL: Record<RungStatus, string> = {
  healthy: "answered",
  not_configured: "no key",
  refused: "wrong model",
  unreachable: "unreachable",
  timeout: "timed out",
  bad_shape: "bad response",
  skipped: "not probed",
};

export const VERDICT_TONE: Record<SmokeVerdict, string> = {
  passed: "text-accent",
  wrong_script: "text-danger",
  echoed_input: "text-danger",
  answered_speaker: "text-danger",
  empty: "text-danger",
  unreachable: "text-warning",
  not_configured: "text-warning",
};

export const VERDICT_LABEL: Record<SmokeVerdict, string> = {
  passed: "passed",
  wrong_script: "wrong language",
  echoed_input: "echoed the input",
  answered_speaker: "replied instead of rewriting",
  empty: "returned nothing",
  unreachable: "unreachable",
  not_configured: "not configured",
};

export type ActivationRefusal =
  | "invalid"
  | "no_health_check"
  | "health_failed"
  | "health_stale"
  | "version_conflict"
  | "no_such_version"
  | "same_as_active";

export interface ActivationDecision {
  allowed: boolean;
  refusal?: ActivationRefusal;
  message?: string;
  forcible: boolean;
  validation: Validation;
}

export interface AuditEntry {
  id: string;
  action: string;
  adminEmail: string;
  at: number | null;
  version: number | null;
  changes: { field: string; from: string; to: string }[];
  reason: string;
}

/// What each action DID, in a word an operator can scan a list for.
export const ACTION_LABEL: Record<string, string> = {
  saveDraft: "edited draft",
  discardDraft: "discarded draft",
  healthCheck: "health check",
  smokeTest: "smoke test",
  stage: "staged",
  apply: "ACTIVATED",
  rollback: "ROLLED BACK",
};

export const ACTION_TONE: Record<string, string> = {
  apply: "text-accent",
  rollback: "text-warning",
  stage: "text-warning",
};

export type LanguageEvidence =
  | "unsupported"
  | "unknown"
  | "documented"
  | "experimental"
  | "partial"
  | "tested"
  | "production_verified";

export interface LanguageRow {
  code: string;
  name: string;
  script: string;
  rtl: boolean;
  tier: "A" | "B" | "C" | "D" | "E";
  capabilities: Record<string, LanguageEvidence>;
  verifiedOn?: string;
  source?: string;
}

export interface LanguagesResult {
  languageCount: number;
  tierCounts: Record<string, number>;
  capabilitySummary: Record<
    string,
    { verified: number; tested: number; any: number; unsupported: number }
  >;
  languages: LanguageRow[];
}

/// The tiers §55 defines, with what each one actually means to an operator
/// deciding whether to promise a language to a customer.
export const TIER_LABEL: Record<string, string> = {
  A: "Production verified",
  B: "Benchmarked — monitor",
  C: "Partial",
  D: "Experimental",
  E: "Unsupported",
};

export const TIER_TONE: Record<string, string> = {
  A: "text-accent border-accent/30 bg-accent-soft",
  B: "text-info border-info/30 bg-info-soft",
  C: "text-warning border-warning/30 bg-warning-soft",
  D: "text-fg-subtle border-line bg-raised",
  E: "text-danger border-danger/30 bg-danger-soft",
};

/// Words, not codes. The difference between "we watched this work" and "a
/// datasheet says so" is the entire point of the matrix, so it is spelled
/// out rather than encoded in a colour.
export const EVIDENCE_WORD: Record<LanguageEvidence, string> = {
  production_verified: "measured on a device",
  tested: "benchmarked",
  partial: "benchmarked (weak check)",
  documented: "provider says so",
  experimental: "experimental",
  unknown: "not checked",
  unsupported: "measured — failed",
};

export const CAPABILITY_LABEL: Record<string, string> = {
  stt: "Speech to Text",
  detection: "Language Detection",
  translation: "Translation",
  naturalization: "Naturalization",
  tone: "Tone",
  realtime: "Realtime",
};

type Action =
  | "read"
  | "saveDraft"
  | "validate"
  | "discardDraft"
  | "models"
  | "catalogue"
  | "healthCheck"
  | "smokeTest"
  | "stage"
  | "apply"
  | "rollback"
  | "version"
  | "audit"
  | "languages";

export async function callFloating<T>(
  action: Action,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const fn = httpsCallable<Record<string, unknown>, T>(fns, "adminFloatingSystem");
  const res = await fn({ action, ...payload });
  return res.data;
}
