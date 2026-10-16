// Product Config — client helpers over the adminConfig registry (unit-tested).
// The registry itself comes from the server (adminConfig "registry"), so the
// console never carries its own copy of what a flag means.

export type Target =
  | "flags" | "app" | "limits" | "tools" | "routing" | "fallbacks" | "personality" | "skills" | "voice" | "floating"
  | "quickActions" | "intentRules" | "subscription" | "placements" | "capabilities" | "planPrices" | "pricingPolicy";

export interface FlagDef {
  key: string;
  label: string;
  domain: string;
  description: string;
  defaultWhenAbsent: boolean;
  killSwitch?: boolean;
  dangerousWhen?: boolean;
  readBy: string;
}

export interface FieldDef {
  key: string;
  target: Exclude<Target, "flags">;
  label: string;
  type:
    | "bool" | "string" | "semver" | "int" | "stringList" | "model" | "modelList"
    | "enum" | "orderedList" | "textList" | "voiceChain" | "voiceChainMap" | "locale" | "regexList";
  pattern?: string;
  description: string;
  defaultValue: unknown;
  min?: number;
  max?: number;
  maxLength?: number;
  allowed?: readonly string[];
  dangerousWhen?: unknown;
  group?: string;
  readBy?: string;
  allowEmpty?: boolean;
  maxItems?: number;
}

export interface Registry {
  flags: FlagDef[];
  fields: FieldDef[];
}

export type Snapshot = Record<string, unknown>;

export interface TargetState {
  target: Target;
  snapshot: Snapshot;
  version: number;
  updatedAt: number | null;
  updatedByEmail: string | null;
  /// Additive per-row meta for collection targets (planPrices).
  itemMeta?: Record<string, { version?: number; updatedAt?: unknown; updatedBy?: string }>;
}

export type FlagState = "on" | "off" | "default-on" | "default-off";

export function flagState(def: FlagDef, stored: boolean | null | undefined): FlagState {
  if (stored === true) return "on";
  if (stored === false) return "off";
  return def.defaultWhenAbsent ? "default-on" : "default-off";
}

export function effectiveOn(def: FlagDef, stored: boolean | null | undefined): boolean {
  return stored ?? def.defaultWhenAbsent;
}

/// The keys whose value in `draft` differs from `current`.
export function draftPatch(current: Snapshot, draft: Snapshot): Snapshot {
  const out: Snapshot = {};
  for (const [k, v] of Object.entries(draft)) {
    if (JSON.stringify(current[k] ?? null) !== JSON.stringify(v ?? null)) out[k] = v;
  }
  return out;
}

/// Mirrors the server's dangerousKeys() so the console picks the right
/// confirmation level up front. The SERVER decides (and re-checks).
export function isDangerous(
  registry: Registry,
  target: Target,
  key: string,
  before: unknown,
  after: unknown,
): boolean {
  if (target === "flags") {
    const def = registry.flags.find((f) => f.key === key);
    if (!def?.killSwitch) return false;
    const was = effectiveOn(def, before as boolean | null);
    const will = effectiveOn(def, after as boolean | null);
    return was !== will && will === (def.dangerousWhen ?? false);
  }
  const def = registry.fields.find((f) => f.key === key && f.target === target);
  if (!def || def.dangerousWhen === undefined) return false;
  const was = before ?? def.defaultValue;
  const will = after ?? def.defaultValue;
  return was !== will && will === def.dangerousWhen;
}

export function showValue(v: unknown): string {
  if (v === null || v === undefined) return "Default";
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (Array.isArray(v)) {
    if (!v.length) return "None";
    return v.map((x) => (x && typeof x === "object" ? chainToText([x]) : String(x))).join(", ");
  }
  if (typeof v === "object") return Object.entries(v as Record<string, unknown>).map(([k, c]) => `${k}: ${showValue(c)}`).join("; ");
  if (v === -1) return "Unlimited (-1)";
  return String(v);
}

export const TARGET_LABELS: Record<Target, string> = {
  flags: "Feature flags",
  app: "App settings",
  limits: "Limits & quotas",
  tools: "Device tools",
  routing: "Model routing",
  fallbacks: "Fallback chains",
  personality: "Personality",
  skills: "Skills",
  voice: "Voice",
  floating: "Floating overlay",
  quickActions: "Radial menu",
  intentRules: "Intent rules",
  subscription: "Subscription enforcement",
  placements: "Future / Coming Soon items",
  capabilities: "Capability overrides",
  planPrices: "Country pricing",
  pricingPolicy: "Country pricing policy",
};

// ── Line-based editors (one entry per line) ─────────────────────────────────

export interface VoiceRung {
  provider: string;
  model: string;
  voice?: string;
}

export type Parsed<T> = { value: T | null; error: string | null };

const PROVIDER_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/// "provider | model | voice" per line → rungs. Blank text = null (default).
export function parseChain(text: string): Parsed<VoiceRung[]> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { value: null, error: null };
  const out: VoiceRung[] = [];
  for (const line of lines) {
    const [provider = "", model = "", voice = ""] = line.split("|").map((s) => s.trim());
    if (!PROVIDER_RE.test(provider) || !model) return { value: null, error: `"${line}" must be: provider | model | voice (voice optional)` };
    out.push(voice ? { provider, model, voice } : { provider, model });
  }
  return { value: out, error: null };
}

export function chainToText(v: unknown): string {
  if (!Array.isArray(v)) return "";
  return (v as VoiceRung[]).map((r) => [r.provider, r.model, r.voice].filter(Boolean).join(" | ")).join("\n");
}

/// "lang: provider | model | voice" per line, grouped by lang in order.
export function parseChainMap(text: string): Parsed<Record<string, VoiceRung[]>> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { value: null, error: null };
  const out: Record<string, VoiceRung[]> = {};
  for (const line of lines) {
    const m = /^([A-Za-z-]+)\s*:\s*(.+)$/.exec(line);
    if (!m) return { value: null, error: `"${line}" must be: lang: provider | model | voice` };
    const rung = parseChain(m[2]);
    if (rung.error || !rung.value) return { value: null, error: `"${line}" must be: lang: provider | model | voice` };
    (out[m[1]] ??= []).push(rung.value[0]);
  }
  if (!out.default) return { value: null, error: "Add at least one \"default:\" line (used for every other language)." };
  return { value: out, error: null };
}

export function chainMapToText(v: unknown): string {
  if (!v || typeof v !== "object" || Array.isArray(v)) return "";
  const entries = Object.entries(v as Record<string, VoiceRung[]>);
  // default first, then alphabetical, so the text is stable across loads.
  entries.sort(([a], [b]) => (a === "default" ? -1 : b === "default" ? 1 : a.localeCompare(b)));
  return entries.flatMap(([lang, chain]) => (Array.isArray(chain) ? chain : []).map((r) => `${lang}: ${chainToText([r])}`)).join("\n");
}

/// One value per line, each checked against `allowed` or `pattern`.
export function parseList(text: string, opts: { allowed?: readonly string[]; pattern?: string }): Parsed<string[]> {
  const items = [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
  if (items.length === 0) return { value: null, error: null };
  const re = opts.pattern ? new RegExp(opts.pattern) : null;
  const bad = items.filter((x) => (opts.allowed ? !opts.allowed.includes(x) : re ? !re.test(x) : false));
  if (bad.length) return { value: null, error: `Not allowed: ${bad.join(", ")}${opts.allowed ? ` (use ${opts.allowed.join(", ")})` : ""}` };
  return { value: items, error: null };
}

/// Model chains are edited one id per line (order = try order).
export function parseModelLines(s: string): string[] {
  return [...new Set(s.split(/\r?\n/).map((t) => t.trim()).filter(Boolean))];
}

export const MODEL_ID_RE = /^[a-z0-9~][\w.-]*\/[\w.:-]+$/i;

/// Ids in a draft value that are not in the synced catalog (or not a model
/// id at all). The server re-checks; this is for inline feedback.
export function unknownModels(value: unknown, catalog: ReadonlySet<string> | null): string[] {
  const ids = Array.isArray(value) ? (value as string[]) : typeof value === "string" && value ? [value] : [];
  return ids.filter((id) => !MODEL_ID_RE.test(id) || (catalog !== null && !catalog.has(id)));
}

// ── Intent trigger rules ──

/// One entry per line: the old editor split on commas, which corrupted any
/// regular expression containing a comma (e.g. \d{1,3}).
export function linesToList(s: string): string[] {
  return s.split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
}

export function invalidRegexes(list: string[]): string[] {
  return list.filter((r) => {
    try {
      new RegExp(r);
      return false;
    } catch {
      return true;
    }
  });
}

/// One pattern per line; each must compile (the server re-checks).
export function parseRegexList(text: string): Parsed<string[]> {
  const items = [...new Set(text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
  if (items.length === 0) return { value: null, error: null };
  const bad = items.filter((r) => {
    try {
      new RegExp(r, "i");
      return false;
    } catch {
      return true;
    }
  });
  return bad.length ? { value: null, error: `Not a valid pattern: ${bad.join(" · ")}` } : { value: items, error: null };
}
