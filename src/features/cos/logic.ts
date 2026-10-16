// Conversation OS console: pure logic (vocabulary, validation mirror of the
// server, diff helpers, payload builders, permissions, telemetry summary).
// No React / Firebase imports so it is unit-tested under node --test. The
// SERVER (akaya_ai/functions/src/cos_config.ts + cos_admin.ts) re-validates
// everything; this mirror only gives instant feedback. Parity with the server
// vocabulary and with the Dart contract (cos_api.dart) is pinned by tests.

import type { Permission } from "../../lib/permissions";

// ---------------------------------------------------------------------------
// Vocabulary (wire names = cos_api.dart enum names)
// ---------------------------------------------------------------------------

export const CHANNELS = ["chat", "voice", "floating", "floatingTranslation", "email", "messaging", "notification"] as const;
export const INTENTS = [
  "casualChat", "generalQuestion", "factualQuestion", "deepReasoning", "task", "reminder", "calendar", "followUp",
  "translation", "rewrite", "summarize", "emailDraft", "messageDraft", "business", "coding", "troubleshooting", "search",
  "memory", "imageAction", "documentAction", "phoneAction", "deviceAction", "toolAction", "emotionalSupport", "command", "ambiguous",
] as const;
export const MODES = [
  "instant", "concise", "standard", "detailed", "deepReasoning", "spoken", "translation", "professionalDraft",
  "actionConfirmation", "structured",
] as const;
export const LANGUAGES = ["en", "hi", "hinglish", "mixed", "other"] as const;
export const FALLBACK_LANGUAGES = ["en", "hi", "hinglish"] as const;
export const ROLLOUT_MODES = ["disabled", "internal", "selected", "percentage", "channels", "full"] as const;
export const TRAITS = [
  "friendliness", "warmth", "professionalism", "formality", "directness", "empathy", "humor", "verbosity", "technicalDepth",
] as const;
export const THRESHOLDS = ["professionalism", "rudeness", "repetition", "languageMatch", "relevance", "completion", "formatting"] as const;
export const SECTIONS = [
  "enabled", "rollout", "traits", "personalityText", "forbiddenPhrases", "channels", "intents", "languages", "thresholds",
  "quality", "fallbackTexts", "flags", "lkgMaxAgeDays", "telemetryEnabled",
] as const;
export const SPEED_TIERS = ["fast", "medium", "slow"] as const;
export const COST_TIERS = ["free", "low", "medium", "high"] as const;
export const EXPERIMENT_STATUSES = ["draft", "running", "stopped"] as const;

export type Channel = (typeof CHANNELS)[number];
export type Intent = (typeof INTENTS)[number];
export type Mode = (typeof MODES)[number];
export type Language = (typeof LANGUAGES)[number];
export type Trait = (typeof TRAITS)[number];
export type Threshold = (typeof THRESHOLDS)[number];
export type Section = (typeof SECTIONS)[number];

export const LIMITS = {
  personalityTextMax: 1200,
  toneNoteMax: 140,
  forbiddenPhrasesMax: 50,
  forbiddenPhraseMax: 80,
  allowlistMax: 200,
  fallbackTextMax: 300,
  fallbackKeysMax: 10,
  flagsMax: 20,
  lkgMaxAgeDaysMin: 1,
  lkgMaxAgeDaysMax: 90,
  lkgMaxAgeDaysDefault: 14,
  maxSentencesMax: 50,
  routingPriorityMax: 1000,
  experimentVariantsMin: 2,
  experimentVariantsMax: 5,
  experimentNameMax: 80,
  maxRunningExperiments: 3,
} as const;

/// Sections an experiment variant may not override (server rule).
export const EXPERIMENT_FORBIDDEN_SECTIONS: readonly Section[] = ["enabled", "rollout", "flags", "lkgMaxAgeDays", "telemetryEnabled"];

/// "floatingTranslation" -> "Floating translation".
export function humanize(id: string): string {
  const s = id.replace(/([A-Z])/g, " $1").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const TRAIT_HELP: Record<Trait, string> = {
  friendliness: "How approachable and personable the voice is.",
  warmth: "Emotional warmth in wording.",
  professionalism: "Business-appropriate conduct. Users can never lower this.",
  formality: "Casual (0) to formal (1) register.",
  directness: "Gets to the point versus softening and hedging.",
  empathy: "Acknowledges feelings before solving.",
  humor: "Light humour. Keep low for a professional assistant.",
  verbosity: "Short (0) to long (1) answers by default.",
  technicalDepth: "Plain explanations (0) to expert depth (1).",
};
export const THRESHOLD_HELP: Record<Threshold, string> = {
  professionalism: "Minimum professionalism score a response needs.",
  rudeness: "MAXIMUM tolerated rudeness (lower is stricter).",
  repetition: "Maximum tolerated repetition (lower is stricter).",
  languageMatch: "Minimum match with the user's language.",
  relevance: "Minimum relevance to the question.",
  completion: "Minimum completeness (not cut off or unfinished).",
  formatting: "Minimum fit with the channel's formatting rules.",
};

// ---------------------------------------------------------------------------
// Compiled defaults (cos_api.dart): what "unset" means
// ---------------------------------------------------------------------------

export const DEFAULT_TRAITS: Record<Trait, number> = {
  friendliness: 0.7, warmth: 0.6, professionalism: 0.85, formality: 0.35, directness: 0.7, empathy: 0.6, humor: 0.15,
  verbosity: 0.3, technicalDepth: 0.5,
};
export const DEFAULT_THRESHOLDS: Record<Threshold, number> = {
  professionalism: 0.8, rudeness: 0.2, repetition: 0.4, languageMatch: 0.85, relevance: 0.6, completion: 0.8, formatting: 0.7,
};
export const DEFAULT_QUALITY = { gateEnabled: true, repairEnabled: true, escalationEnabled: true, maxRepairAttempts: 1 } as const;
export const DEFAULT_LANGUAGES = { enabled: ["en", "hi", "hinglish", "mixed"] as Language[], fallback: "en" as Language };

export interface ChannelCfg {
  defaultMode?: Mode;
  maxSentences?: number | null;
  allowMarkdown?: boolean;
  allowHeadings?: boolean;
  allowBullets?: boolean;
  allowEmoji?: boolean;
  readUrls?: boolean;
  toneNote?: string | null;
}
export interface IntentCfg {
  mode?: Mode | null;
  confirmationFirst?: boolean;
  toneNote?: string | null;
}
export interface Rollout {
  mode?: (typeof ROLLOUT_MODES)[number];
  percentage?: number;
  channels?: Channel[];
  allowlist?: string[];
}
export interface CosConfig {
  enabled?: boolean;
  rollout?: Rollout;
  traits?: Partial<Record<Trait, number>>;
  personalityText?: string;
  forbiddenPhrases?: string[];
  channels?: Partial<Record<Channel, ChannelCfg>>;
  intents?: Partial<Record<Intent, IntentCfg>>;
  languages?: { enabled?: Language[]; fallback?: Language };
  thresholds?: Partial<Record<Threshold, number>>;
  quality?: { gateEnabled?: boolean; repairEnabled?: boolean; escalationEnabled?: boolean; maxRepairAttempts?: number };
  fallbackTexts?: Partial<Record<(typeof FALLBACK_LANGUAGES)[number], Record<string, string>>>;
  flags?: Record<string, boolean>;
  lkgMaxAgeDays?: number;
  telemetryEnabled?: boolean;
}

/// Compiled per-channel defaults (cos_api.dart ChannelProfile + contract notes:
/// voice/floating/notification are brief and plain).
export function defaultChannel(ch: Channel): Required<Omit<ChannelCfg, "toneNote" | "maxSentences">> & { maxSentences: number | null; toneNote: string | null } {
  const brief = ch === "voice" || ch === "floating" || ch === "notification";
  return {
    defaultMode: ch === "voice" ? "spoken" : ch === "notification" ? "instant" : ch === "floatingTranslation" ? "translation" : ch === "email" ? "professionalDraft" : brief ? "concise" : "standard",
    maxSentences: ch === "voice" ? 3 : ch === "notification" ? 1 : ch === "floating" ? 3 : null,
    allowMarkdown: !brief && ch !== "floatingTranslation" && ch !== "messaging",
    allowHeadings: ch === "chat" || ch === "email",
    allowBullets: !brief && ch !== "floatingTranslation",
    allowEmoji: false,
    readUrls: ch !== "voice" && ch !== "notification",
    toneNote: null,
  };
}

// ---------------------------------------------------------------------------
// Validation mirror (instant feedback; the server is the authority)
// ---------------------------------------------------------------------------

export type Res<T> = { ok: true; value: T } | { ok: false; message: string };
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });
const inList = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const cpLen = (s: string) => Array.from(s).length;

const MARKUP_TOKENS = ["<", ">", "```", "{{", "}}", "${", "[[", "]]", String.fromCharCode(0xff1c), String.fromCharCode(0xff1e)];
export const hasMarkup = (s: string) => MARKUP_TOKENS.some((t) => s.includes(t));

/// Section headers / untrusted-data markers the prompt composer uses. Admin text must not be able to
/// forge them (it would let a personality line pose as an operational instruction block).
const SPOOF_RE = /(^|\n)\s*\[\s*(personality|channel|task|language|user preferences|model notes|operational)[^\]\n]*\]|akaya[_\s-]*untrusted|end[_\s-]*untrusted/i;

export function hasControl(s: string, allowNewline: boolean): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 10 && allowNewline) continue;
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029) return true;
    // Invisible format characters (zero-width, bidi, soft hyphen, BOM, tag chars):
    // they can hide instructions from the admin reviewing the text.
    if (c === 0xad || (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) ||
        (c >= 0x2060 && c <= 0x2064) || c === 0xfeff || (c >= 0xe0000 && c <= 0xe007f)) return true;
  }
  return false;
}

/// Error for one admin-authored text, or null when it is fine.
export function textError(label: string, v: string, max: number, opts: { multiline?: boolean; required?: boolean } = {}): string | null {
  const s = v.normalize("NFC").replace(/\r\n?/g, "\n").trim();
  if (s === "") return opts.required ? `${label} cannot be empty.` : null;
  if (hasMarkup(s)) return `${label} must be plain text: no < >, code fences or template markers.`;
  if (SPOOF_RE.test(s)) return `${label} must not contain prompt section headers such as [Operational ...] or untrusted-data markers.`;
  if (hasControl(s, !!opts.multiline)) return `${label} contains characters that are not allowed.`;
  if (cpLen(s) > max) return `${label} must be at most ${max} characters.`;
  return null;
}

function num01(label: string, v: unknown): Res<number> {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) return fail(`${label} must be a number from 0 to 1.`);
  return { ok: true, value: Math.round(v * 1000) / 1000 };
}
const bool = (label: string, v: unknown): Res<boolean> => (typeof v === "boolean" ? { ok: true, value: v } : fail(`${label} must be on or off.`));
function intIn(label: string, v: unknown, lo: number, hi: number): Res<number> {
  if (typeof v !== "number" || !Number.isInteger(v) || v < lo || v > hi) return fail(`${label} must be a whole number from ${lo} to ${hi}.`);
  return { ok: true, value: v };
}
function enumList<T extends string>(label: string, v: unknown, list: readonly T[]): Res<T[]> {
  if (!Array.isArray(v)) return fail(`${label} must be a list.`);
  const out: T[] = [];
  for (const x of v) {
    if (!inList(list, x)) return fail(`${label}: "${String(x)}" is not one of ${list.join(", ")}.`);
    if (!out.includes(x)) out.push(x);
  }
  return { ok: true, value: list.filter((l) => out.includes(l)) };
}
const KEY_RE = /^[a-z][A-Za-z0-9_]{1,30}$/;
const HASH_RE = /^[a-f0-9]{8,64}$/;

function mapOf<T>(label: string, v: unknown, keys: readonly string[], each: (k: string, x: unknown) => Res<T>): Res<Record<string, T>> {
  if (!isObj(v)) return fail(`${label} must be an object.`);
  const out: Record<string, T> = {};
  for (const k of keys) {
    if (!(k in v)) continue;
    const r = each(k, v[k]);
    if (!r.ok) return r;
    out[k] = r.value;
  }
  for (const k of Object.keys(v)) if (!keys.includes(k)) return fail(`${label}: "${k}" is not one of ${keys.join(", ")}.`);
  return { ok: true, value: out };
}
function noteOf(label: string, v: unknown): Res<string | null> {
  if (v === null) return { ok: true, value: null };
  if (typeof v !== "string") return fail(`${label} must be text.`);
  const e = textError(label, v, LIMITS.toneNoteMax);
  if (e) return fail(e);
  const s = v.normalize("NFC").trim();
  return { ok: true, value: s === "" ? null : s };
}

const CH_BOOL = ["allowMarkdown", "allowHeadings", "allowBullets", "allowEmoji", "readUrls"] as const;
function channelCfg(ch: string, v: unknown): Res<ChannelCfg> {
  const label = `channels.${ch}`;
  if (!isObj(v)) return fail(`${label} must be an object.`);
  for (const k of Object.keys(v)) if (!["defaultMode", "maxSentences", "toneNote", ...CH_BOOL].includes(k)) return fail(`${label}: "${k}" is not a recognised field.`);
  const out: ChannelCfg = {};
  if (v.defaultMode !== undefined) {
    if (!inList(MODES, v.defaultMode)) return fail(`${label}.defaultMode must be one of ${MODES.join(", ")}.`);
    out.defaultMode = v.defaultMode;
  }
  if (v.maxSentences !== undefined) {
    if (v.maxSentences === null) out.maxSentences = null;
    else {
      const r = intIn(`${label}.maxSentences`, v.maxSentences, 1, LIMITS.maxSentencesMax);
      if (!r.ok) return r;
      out.maxSentences = r.value;
    }
  }
  for (const k of CH_BOOL) {
    if (v[k] === undefined) continue;
    const r = bool(`${label}.${k}`, v[k]);
    if (!r.ok) return r;
    out[k] = r.value;
  }
  if (v.toneNote !== undefined) {
    const r = noteOf(`${label}.toneNote`, v.toneNote);
    if (!r.ok) return r;
    out.toneNote = r.value;
  }
  return { ok: true, value: out };
}
function intentCfg(it: string, v: unknown): Res<IntentCfg> {
  const label = `intents.${it}`;
  if (!isObj(v)) return fail(`${label} must be an object.`);
  for (const k of Object.keys(v)) if (!["mode", "confirmationFirst", "toneNote"].includes(k)) return fail(`${label}: "${k}" is not a recognised field.`);
  const out: IntentCfg = {};
  if (v.mode !== undefined) {
    if (v.mode === null) out.mode = null;
    else if (inList(MODES, v.mode)) out.mode = v.mode;
    else return fail(`${label}.mode must be one of ${MODES.join(", ")}.`);
  }
  if (v.confirmationFirst !== undefined) {
    const r = bool(`${label}.confirmationFirst`, v.confirmationFirst);
    if (!r.ok) return r;
    out.confirmationFirst = r.value;
  }
  if (v.toneNote !== undefined) {
    const r = noteOf(`${label}.toneNote`, v.toneNote);
    if (!r.ok) return r;
    out.toneNote = r.value;
  }
  return { ok: true, value: out };
}

export function validateSection(section: Section, v: unknown): Res<unknown> {
  switch (section) {
    case "enabled":
      return bool("enabled", v);
    case "rollout": {
      if (!isObj(v)) return fail("rollout must be an object.");
      for (const k of Object.keys(v)) if (!["mode", "percentage", "channels", "allowlist"].includes(k)) return fail(`rollout: "${k}" is not a recognised field.`);
      const out: Rollout = {};
      if (v.mode !== undefined) {
        if (!inList(ROLLOUT_MODES, v.mode)) return fail(`rollout.mode must be one of ${ROLLOUT_MODES.join(", ")}.`);
        out.mode = v.mode;
      }
      if (v.percentage !== undefined) {
        const r = intIn("rollout.percentage", v.percentage, 0, 100);
        if (!r.ok) return r;
        out.percentage = r.value;
      }
      if (v.channels !== undefined) {
        const r = enumList("rollout.channels", v.channels, CHANNELS);
        if (!r.ok) return r;
        out.channels = r.value;
      }
      if (v.allowlist !== undefined) {
        if (!Array.isArray(v.allowlist) || v.allowlist.length > LIMITS.allowlistMax) return fail(`rollout.allowlist must be a list of at most ${LIMITS.allowlistMax} user hashes.`);
        const seen: string[] = [];
        for (const h of v.allowlist) {
          if (typeof h !== "string" || !HASH_RE.test(h)) return fail("rollout.allowlist entries must be lowercase hex user hashes (8-64 chars), never raw ids or emails.");
          if (!seen.includes(h)) seen.push(h);
        }
        out.allowlist = seen;
      }
      if (out.mode === "percentage" && out.percentage === undefined) return fail("rollout.percentage is required when the mode is percentage.");
      if (out.mode === "channels" && (!out.channels || out.channels.length === 0)) return fail("rollout.channels needs at least one channel when the mode is channels.");
      return { ok: true, value: out };
    }
    case "traits":
    case "thresholds":
      return mapOf(section, v, section === "traits" ? TRAITS : THRESHOLDS, (k, x) => num01(`${section}.${k}`, x));
    case "personalityText": {
      if (typeof v !== "string") return fail("personalityText must be text.");
      const e = textError("personalityText", v, LIMITS.personalityTextMax, { multiline: true });
      if (e) return fail(e);
      return { ok: true, value: v.normalize("NFC").replace(/\r\n?/g, "\n").trim() };
    }
    case "forbiddenPhrases": {
      if (!Array.isArray(v)) return fail("forbiddenPhrases must be a list.");
      if (v.length > LIMITS.forbiddenPhrasesMax) return fail(`forbiddenPhrases can hold at most ${LIMITS.forbiddenPhrasesMax} phrases.`);
      const out: string[] = [];
      const seen = new Set<string>();
      for (const p of v) {
        if (typeof p !== "string") return fail("forbiddenPhrases entry must be text.");
        const e = textError("forbiddenPhrases entry", p, LIMITS.forbiddenPhraseMax, { required: true });
        if (e) return fail(e);
        if (/["“”]/.test(p)) return fail("forbiddenPhrases entries must not contain double quotes.");
        const s = p.normalize("NFC").trim();
        if (seen.has(s.toLowerCase())) continue;
        seen.add(s.toLowerCase());
        out.push(s);
      }
      return { ok: true, value: out };
    }
    case "channels":
      return mapOf("channels", v, CHANNELS, (k, x) => channelCfg(k, x));
    case "intents":
      return mapOf("intents", v, INTENTS, (k, x) => intentCfg(k, x));
    case "languages": {
      if (!isObj(v)) return fail("languages must be an object.");
      for (const k of Object.keys(v)) if (!["enabled", "fallback"].includes(k)) return fail(`languages: "${k}" is not a recognised field.`);
      const out: NonNullable<CosConfig["languages"]> = {};
      if (v.enabled !== undefined) {
        const r = enumList("languages.enabled", v.enabled, LANGUAGES);
        if (!r.ok) return r;
        if (r.value.length === 0) return fail("languages.enabled needs at least one language.");
        out.enabled = r.value;
      }
      if (v.fallback !== undefined) {
        if (!inList(LANGUAGES, v.fallback)) return fail(`languages.fallback must be one of ${LANGUAGES.join(", ")}.`);
        out.fallback = v.fallback;
      }
      if (out.enabled && out.fallback && !out.enabled.includes(out.fallback)) return fail("languages.fallback must be one of the enabled languages.");
      return { ok: true, value: out };
    }
    case "quality": {
      if (!isObj(v)) return fail("quality must be an object.");
      for (const k of Object.keys(v)) if (!["gateEnabled", "repairEnabled", "escalationEnabled", "maxRepairAttempts"].includes(k)) return fail(`quality: "${k}" is not a recognised field.`);
      const out: NonNullable<CosConfig["quality"]> = {};
      for (const k of ["gateEnabled", "repairEnabled", "escalationEnabled"] as const) {
        if (v[k] === undefined) continue;
        const r = bool(`quality.${k}`, v[k]);
        if (!r.ok) return r;
        out[k] = r.value;
      }
      if (v.maxRepairAttempts !== undefined) {
        const r = intIn("quality.maxRepairAttempts", v.maxRepairAttempts, 0, 1);
        if (!r.ok) return fail("quality.maxRepairAttempts must be 0 or 1 (at most ONE bounded repair attempt).");
        out.maxRepairAttempts = r.value;
      }
      return { ok: true, value: out };
    }
    case "fallbackTexts": {
      if (!isObj(v)) return fail("fallbackTexts must be an object.");
      const out: Record<string, Record<string, string>> = {};
      for (const lang of FALLBACK_LANGUAGES) {
        if (!(lang in v)) continue;
        const m = v[lang];
        if (!isObj(m)) return fail(`fallbackTexts.${lang} must be an object.`);
        const keys = Object.keys(m);
        if (keys.length > LIMITS.fallbackKeysMax) return fail(`fallbackTexts.${lang} can hold at most ${LIMITS.fallbackKeysMax} texts.`);
        const o: Record<string, string> = {};
        for (const k of keys.sort()) {
          if (!KEY_RE.test(k)) return fail(`fallbackTexts.${lang}: key "${k}" is not valid (letters/digits, starts with a lowercase letter).`);
          if (typeof m[k] !== "string") return fail(`fallbackTexts.${lang}.${k} must be text.`);
          const e = textError(`fallbackTexts.${lang}.${k}`, m[k] as string, LIMITS.fallbackTextMax, { required: true });
          if (e) return fail(e);
          o[k] = (m[k] as string).normalize("NFC").trim();
        }
        out[lang] = o;
      }
      for (const k of Object.keys(v)) if (!(FALLBACK_LANGUAGES as readonly string[]).includes(k)) return fail(`fallbackTexts: "${k}" is not one of ${FALLBACK_LANGUAGES.join(", ")}.`);
      return { ok: true, value: out };
    }
    case "lkgMaxAgeDays":
      return intIn("lkgMaxAgeDays", v, LIMITS.lkgMaxAgeDaysMin, LIMITS.lkgMaxAgeDaysMax);
    case "telemetryEnabled":
      return bool("telemetryEnabled", v);
    case "flags": {
      if (!isObj(v)) return fail("flags must be an object.");
      const keys = Object.keys(v);
      if (keys.length > LIMITS.flagsMax) return fail(`flags can hold at most ${LIMITS.flagsMax} entries.`);
      const out: Record<string, boolean> = {};
      for (const k of keys.sort()) {
        if (!KEY_RE.test(k)) return fail(`flags: key "${k}" is not valid.`);
        const r = bool(`flags.${k}`, v[k]);
        if (!r.ok) return r;
        out[k] = r.value;
      }
      return { ok: true, value: out };
    }
  }
}

export function validateConfig(raw: unknown, opts: { forbid?: readonly Section[] } = {}): Res<CosConfig> {
  if (!isObj(raw)) return fail("The configuration must be an object.");
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) {
    if (!(SECTIONS as readonly string[]).includes(k)) return fail(`"${k}" is not a configuration section.`);
    if (opts.forbid?.includes(k as Section)) return fail(`"${k}" is not allowed here.`);
  }
  for (const s of SECTIONS) {
    if (!(s in raw)) continue;
    const r = validateSection(s, raw[s]);
    if (!r.ok) return r;
    out[s] = r.value;
  }
  return { ok: true, value: out as CosConfig };
}

/// Per-section error map for the editor (section -> message), "" when valid.
export function sectionErrors(cfg: CosConfig): Partial<Record<Section, string>> {
  const out: Partial<Record<Section, string>> = {};
  for (const s of SECTIONS) {
    const v = (cfg as Record<string, unknown>)[s];
    if (v === undefined) continue;
    const r = validateSection(s, v);
    if (!r.ok) out[s] = r.message;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Diff / dirty / risk
// ---------------------------------------------------------------------------

export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}
export const sameConfig = (a: CosConfig, b: CosConfig) => canonicalJson(a) === canonicalJson(b);

export interface Change { field: string; from: string; to: string }
const show = (v: unknown) => (v === undefined || v === null ? "(unset)" : typeof v === "object" ? canonicalJson(v) : String(v));
export function sectionChanges(before: CosConfig, after: CosConfig): Change[] {
  const out: Change[] = [];
  for (const s of SECTIONS) {
    const a = (before as Record<string, unknown>)[s];
    const b = (after as Record<string, unknown>)[s];
    if (canonicalJson(a ?? null) !== canonicalJson(b ?? null)) out.push({ field: s, from: show(a), to: show(b) });
  }
  return out;
}

/// Finer diff for the viewer: one line per leaf path that differs.
export function leafChanges(before: unknown, after: unknown, path = ""): Change[] {
  if (isObj(before) && isObj(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((k) => leafChanges(before[k], after[k], path ? `${path}.${k}` : k));
  }
  if (canonicalJson(before ?? null) === canonicalJson(after ?? null)) return [];
  if (isObj(after) && (before === undefined || before === null)) return leafChanges({}, after, path);
  if (isObj(before) && (after === undefined || after === null)) return leafChanges(before, {}, path);
  return [{ field: path || "(root)", from: show(before), to: show(after) }];
}

/// Sections whose change deserves the typed phrase (mirrors the server).
export function riskySections(changes: { field: string }[]): string[] {
  return changes.map((c) => c.field).filter((f) => f === "enabled" || f === "rollout" || f === "quality" || f === "lkgMaxAgeDays" || f === "telemetryEnabled");
}

export const PUBLISH_PHRASE = "PUBLISH CONVERSATION OS";
export const ROLLBACK_PHRASE = "ROLL BACK";

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface CosAccess { canView: boolean; canEdit: boolean; canPublish: boolean }
export function cosAccess(can: (p: Permission) => boolean): CosAccess {
  return { canView: can("cos.read"), canEdit: can("cos.modify"), canPublish: can("cos.publish") };
}

// ---------------------------------------------------------------------------
// Wire types (adminCos)
// ---------------------------------------------------------------------------

export interface PublishedState {
  config: CosConfig; version: number; versionId: string | null; hash: string | null; present: boolean;
  metaVersion: number; updatedAt: number | null; updatedByEmail: string | null;
}
export interface DraftState {
  config: CosConfig; version: number; baseVersion: number; updatedAt: number | null; updatedByEmail: string | null; changes: Change[];
}
export interface ModelProfile {
  modelId: string; provider: string; enabled: boolean; speedTier: (typeof SPEED_TIERS)[number]; costTier: (typeof COST_TIERS)[number];
  reasoningStrength: number; instructionReliability: number; toneReliability: number; translationQuality: number;
  supportsTools: boolean; supportsVision: boolean; supportsStructuredOutput: boolean; supportsLongContext: boolean; offline: boolean;
  routingPriority: number; allowedChannels: Channel[]; allowedIntents: Intent[]; adapterId: string | null;
}
export interface Variant { id: string; weight: number; configPatch?: CosConfig; versionId?: string }
export interface Experiment {
  name: string; status: (typeof EXPERIMENT_STATUSES)[number]; variants: Variant[]; channels: Channel[]; startAt: number | null; endAt: number | null;
}
export interface CosState {
  published: PublishedState;
  draft: DraftState | null;
  profiles: { items: Record<string, ModelProfile>; version: number };
  experiments: { items: Record<string, Experiment>; version: number };
}
export interface VersionRow {
  id: string; target: string; version: number; kind: string; rolledBackFrom: number | null; changes: Change[];
  before: unknown; after: unknown; reason: string; actorEmail: string; at: number | null;
}
export interface TelemetryRow {
  day: string; requests: number; served: number; failed: number; uniqueUsers: number; byOutcome: Record<string, number>;
  byModel: Record<string, { requests: number; served: number; failed: number; ttftP50Ms: number | null; ttftP95Ms: number | null }>;
}
/// One UTC day of Conversation OS counters (cos_telemetry_daily, numbers only).
export interface CosDayMetrics {
  day: string; turns?: number; passed?: number; failed?: number; repaired?: number; escalated?: number; legacyPath?: number;
  byChannel?: Record<string, { turns?: number; failed?: number }>;
  byIntent?: Record<string, { turns?: number; failed?: number; repaired?: number; escalated?: number }>;
  byLanguage?: Record<string, { turns?: number; failed?: number }>;
  byViolation?: Record<string, number>;
  byVersion?: Record<string, number>;
  latency?: { totalMsSum?: number; ttftMsSum?: number; gateMicrosSum?: number; repairMicrosSum?: number; totalMsBuckets?: Record<string, number> };
}
export interface CosMetrics { enabled: boolean; days: CosDayMetrics[] }
export interface Telemetry { telemetryEnabled: boolean; days: number; rows: TelemetryRow[]; cosMetrics: CosMetrics | null }

// ---------------------------------------------------------------------------
// Editing helpers (the working copy is a complete config the editor mutates)
// ---------------------------------------------------------------------------

export function setSection<K extends Section>(cfg: CosConfig, key: K, value: CosConfig[K] | undefined): CosConfig {
  const next: CosConfig = { ...cfg };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

/// The value the app will actually use for each trait (unset = compiled default).
export const effectiveTraits = (cfg: CosConfig): Record<Trait, number> => ({ ...DEFAULT_TRAITS, ...(cfg.traits ?? {}) });
export const effectiveThresholds = (cfg: CosConfig): Record<Threshold, number> => ({ ...DEFAULT_THRESHOLDS, ...(cfg.thresholds ?? {}) });
/// What a device uses when the field is unset: the compiled defaults.
export const effectiveLkgMaxAgeDays = (cfg: CosConfig): number => cfg.lkgMaxAgeDays ?? LIMITS.lkgMaxAgeDaysDefault;
export const effectiveTelemetryEnabled = (cfg: CosConfig): boolean => cfg.telemetryEnabled ?? false;
export function effectiveQuality(cfg: CosConfig) {
  return { ...DEFAULT_QUALITY, ...(cfg.quality ?? {}) };
}
export function effectiveLanguages(cfg: CosConfig) {
  return { enabled: cfg.languages?.enabled ?? DEFAULT_LANGUAGES.enabled, fallback: cfg.languages?.fallback ?? DEFAULT_LANGUAGES.fallback };
}
export function effectiveChannel(cfg: CosConfig, ch: Channel) {
  const d = defaultChannel(ch);
  const o = cfg.channels?.[ch] ?? {};
  return {
    defaultMode: o.defaultMode ?? d.defaultMode,
    maxSentences: o.maxSentences !== undefined ? o.maxSentences : d.maxSentences,
    allowMarkdown: o.allowMarkdown ?? d.allowMarkdown,
    allowHeadings: o.allowHeadings ?? d.allowHeadings,
    allowBullets: o.allowBullets ?? d.allowBullets,
    allowEmoji: o.allowEmoji ?? d.allowEmoji,
    readUrls: o.readUrls ?? d.readUrls,
    toneNote: o.toneNote !== undefined ? o.toneNote : d.toneNote,
  };
}

/// Trim empty optional pieces so they are stored as "unset", not as "".
export function compactChannel(c: ChannelCfg): ChannelCfg | undefined {
  const out: ChannelCfg = { ...c };
  if (out.toneNote !== undefined && (out.toneNote === null || out.toneNote.trim() === "")) delete out.toneNote;
  return Object.keys(out).length ? out : undefined;
}
export function compactIntent(c: IntentCfg): IntentCfg | undefined {
  const out: IntentCfg = { ...c };
  if (out.toneNote !== undefined && (out.toneNote === null || out.toneNote.trim() === "")) delete out.toneNote;
  if (out.mode === null) delete out.mode;
  return Object.keys(out).length ? out : undefined;
}

/// Parses a pasted list of user hashes (whitespace/comma/newline separated).
export function parseAllowlist(text: string): { hashes: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const hashes: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (!HASH_RE.test(p)) invalid.push(p);
    else if (!hashes.includes(p)) hashes.push(p);
  }
  return { hashes, invalid };
}

// ---------------------------------------------------------------------------
// Model profiles
// ---------------------------------------------------------------------------

export const MODEL_ID_RE = /^[A-Za-z0-9~][\w.:\-/]{0,119}$/;
export const ADAPTER_RE = /^[a-z0-9][a-z0-9_.-]{0,39}$/;
export const profileDocId = (modelId: string) => modelId.replace(/\//g, "--");

export function emptyProfile(): ModelProfile {
  return {
    modelId: "", provider: "", enabled: true, speedTier: "medium", costTier: "low", reasoningStrength: 0.5, instructionReliability: 0.5,
    toneReliability: 0.5, translationQuality: 0.5, supportsTools: false, supportsVision: false, supportsStructuredOutput: false,
    supportsLongContext: false, offline: false, routingPriority: 100, allowedChannels: [], allowedIntents: [], adapterId: null,
  };
}

export function validateProfile(p: ModelProfile): Res<ModelProfile> {
  if (!MODEL_ID_RE.test(p.modelId)) return fail("Model id is required (letters, digits, . _ - : /; up to 120 characters).");
  const prov = textError("Provider", p.provider, 40);
  if (prov) return fail(prov);
  if (!inList(SPEED_TIERS, p.speedTier)) return fail("Speed tier is not valid.");
  if (!inList(COST_TIERS, p.costTier)) return fail("Cost tier is not valid.");
  for (const k of ["reasoningStrength", "instructionReliability", "toneReliability", "translationQuality"] as const) {
    const r = num01(k, p[k]);
    if (!r.ok) return r;
  }
  const pr = intIn("Routing priority", p.routingPriority, 0, LIMITS.routingPriorityMax);
  if (!pr.ok) return pr;
  const ch = enumList("Allowed channels", p.allowedChannels, CHANNELS);
  if (!ch.ok) return ch;
  const it = enumList("Allowed intents", p.allowedIntents, INTENTS);
  if (!it.ok) return it;
  if (p.adapterId !== null && p.adapterId !== "" && !ADAPTER_RE.test(p.adapterId)) return fail("Adapter id must be a short lowercase id (letters, digits, . _ -).");
  return { ok: true, value: { ...p, provider: p.provider.trim(), allowedChannels: ch.value, allowedIntents: it.value, adapterId: p.adapterId ? p.adapterId : null } };
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

export const EXPERIMENT_ID_RE = /^[a-z0-9][a-z0-9_-]{1,39}$/;
const VARIANT_ID_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const VERSION_REF_RE = /^[1-9][0-9]{0,8}$/;

export const weightsSum = (vs: readonly { weight: number }[]) => vs.reduce((a, v) => a + (Number.isFinite(v.weight) ? v.weight : 0), 0);

/// Splits 100 evenly over n variants (remainder to the first ones).
export function evenWeights(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  const rem = 100 - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

export function validateExperiment(e: Experiment): Res<Experiment> {
  const nameErr = textError("Name", e.name, LIMITS.experimentNameMax, { required: true });
  if (nameErr) return fail(nameErr);
  const n = e.variants.length;
  if (n < LIMITS.experimentVariantsMin || n > LIMITS.experimentVariantsMax) return fail(`An experiment needs ${LIMITS.experimentVariantsMin} to ${LIMITS.experimentVariantsMax} variants.`);
  const ids = new Set<string>();
  const variants: Variant[] = [];
  for (const [i, v] of e.variants.entries()) {
    const label = `Variant ${i + 1}`;
    if (!VARIANT_ID_RE.test(v.id)) return fail(`${label}: id must be a short lowercase id (letters, digits, - _).`);
    if (ids.has(v.id)) return fail(`${label}: id "${v.id}" is used twice.`);
    ids.add(v.id);
    const w = intIn(`${label} weight`, v.weight, 0, 100);
    if (!w.ok) return w;
    const hasPatch = v.configPatch !== undefined;
    const hasVersion = v.versionId !== undefined;
    if (hasPatch === hasVersion) return fail(`${label}: choose exactly one of a published version or a config patch.`);
    const out: Variant = { id: v.id, weight: v.weight };
    if (hasPatch) {
      const p = validateConfig(v.configPatch, { forbid: EXPERIMENT_FORBIDDEN_SECTIONS });
      if (!p.ok) return fail(`${label}: ${p.message}`);
      out.configPatch = p.value;
    } else {
      if (typeof v.versionId !== "string" || !VERSION_REF_RE.test(v.versionId)) return fail(`${label}: version must be a published version number such as 7.`);
      out.versionId = v.versionId;
    }
    variants.push(out);
  }
  const sum = weightsSum(variants);
  if (sum !== 100) return fail(`Variant weights must add up to 100 (currently ${sum}).`);
  const ch = enumList("Channels", e.channels, CHANNELS);
  if (!ch.ok) return ch;
  if (e.startAt !== null && e.endAt !== null && e.endAt <= e.startAt) return fail("End must be after start.");
  return { ok: true, value: { ...e, name: e.name.normalize("NFC").trim(), variants, channels: ch.value } };
}

export function channelsOverlap(a: readonly string[], b: readonly string[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  return a.some((x) => b.includes(x));
}

/// Client-side preview of why an experiment cannot start (server decides).
export function startBlockers(id: string, exp: Experiment, all: Record<string, Experiment>, publishedVersions: ReadonlySet<number>, now: number): string[] {
  const out: string[] = [];
  if (exp.status !== "draft") out.push("Only a draft experiment can be started.");
  const running = Object.entries(all).filter(([k, o]) => k !== id && o.status === "running");
  if (running.length >= LIMITS.maxRunningExperiments) out.push(`At most ${LIMITS.maxRunningExperiments} experiments can run at once.`);
  for (const [k, o] of running) if (channelsOverlap(exp.channels, o.channels)) out.push(`Overlaps the running experiment "${k}" on the same channels.`);
  for (const v of exp.variants) if (v.versionId !== undefined && !publishedVersions.has(Number(v.versionId))) out.push(`Variant "${v.id}" uses version ${v.versionId}, which was never published.`);
  if (exp.endAt !== null && exp.endAt <= now) out.push("End time is in the past.");
  return out;
}

export function statusTone(s: Experiment["status"]): "neutral" | "success" | "warning" {
  return s === "running" ? "success" : s === "stopped" ? "neutral" : "warning";
}

// ---------------------------------------------------------------------------
// Versions / rollback
// ---------------------------------------------------------------------------

export function kindLabel(kind: string): string {
  return kind === "publish" ? "Published" : kind === "rollback" ? "Rolled back" : kind === "apply" ? "Changed" : kind;
}

/// Which stored side a rollback re-applies: "Restore this version" re-applies
/// what was live AFTER it; "Undo this change" re-applies what was live BEFORE.
export type RollbackSide = "after" | "before";

export function rollbackImpact(row: VersionRow, side: RollbackSide, currentVersion: number): string {
  const what = side === "after" ? `Restore the configuration as published in version ${row.version}` : `Undo version ${row.version} (restore what was live before it)`;
  return `${what}. This creates a NEW version ${currentVersion + 1}; history is never rewritten. It takes effect for users as soon as their app next refreshes the config.`;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/// True when a thrown AdminApiError means "someone else changed it first".
export function isConflict(e: unknown): boolean {
  const k = (e as { kind?: string; code?: string } | null)?.kind;
  const c = (e as { code?: string } | null)?.code;
  return k === "conflict" && c === "aborted";
}

// ---------------------------------------------------------------------------
// Telemetry summary
// ---------------------------------------------------------------------------

export interface TelemetrySummary {
  requests: number; served: number; failed: number; successRate: number | null; days: number; users: number;
  models: { model: string; requests: number; failed: number; ttftP50Ms: number | null; ttftP95Ms: number | null }[];
}
export function summarizeTelemetry(rows: readonly TelemetryRow[]): TelemetrySummary {
  let requests = 0; let served = 0; let failed = 0; let users = 0;
  const m = new Map<string, { requests: number; failed: number; p50: number[]; p95: number[] }>();
  for (const r of rows) {
    requests += r.requests; served += r.served; failed += r.failed; users += r.uniqueUsers;
    for (const [model, x] of Object.entries(r.byModel)) {
      const a = m.get(model) ?? { requests: 0, failed: 0, p50: [], p95: [] };
      a.requests += x.requests; a.failed += x.failed;
      if (x.ttftP50Ms !== null) a.p50.push(x.ttftP50Ms);
      if (x.ttftP95Ms !== null) a.p95.push(x.ttftP95Ms);
      m.set(model, a);
    }
  }
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    requests, served, failed, users, days: rows.length,
    successRate: requests > 0 ? Math.round((served / requests) * 1000) / 10 : null,
    models: [...m.entries()].map(([model, a]) => ({ model, requests: a.requests, failed: a.failed, ttftP50Ms: avg(a.p50), ttftP95Ms: avg(a.p95) })).sort((a, b) => b.requests - a.requests),
  };
}

// ---------------------------------------------------------------------------
// Conversation OS metrics summary (cos_telemetry_daily)
// ---------------------------------------------------------------------------

export interface CosSummary {
  days: number; turns: number; passed: number; failed: number; passRate: number | null; repaired: number; escalated: number;
  repairRate: number | null; escalationRate: number | null; avgTotalMs: number | null; avgGateMs: number | null;
  breakdown: { kind: "channel" | "intent" | "language"; key: string; turns: number; failed: number }[];
  violations: { code: string; count: number }[];
}
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
export function summarizeCos(days: readonly CosDayMetrics[]): CosSummary {
  let turns = 0; let passed = 0; let failed = 0; let repaired = 0; let escalated = 0; let totalMs = 0; let gateMicros = 0;
  const bd = new Map<string, { kind: "channel" | "intent" | "language"; key: string; turns: number; failed: number }>();
  const viol = new Map<string, number>();
  const add = (kind: "channel" | "intent" | "language", key: string, t: number, f: number) => {
    const id = kind + ":" + key;
    const a = bd.get(id) ?? { kind, key, turns: 0, failed: 0 };
    a.turns += t; a.failed += f; bd.set(id, a);
  };
  for (const d of days) {
    turns += d.turns ?? 0; passed += d.passed ?? 0; failed += d.failed ?? 0; repaired += d.repaired ?? 0; escalated += d.escalated ?? 0;
    totalMs += d.latency?.totalMsSum ?? 0; gateMicros += d.latency?.gateMicrosSum ?? 0;
    for (const [k, v] of Object.entries(d.byChannel ?? {})) add("channel", k, v.turns ?? 0, v.failed ?? 0);
    for (const [k, v] of Object.entries(d.byIntent ?? {})) add("intent", k, v.turns ?? 0, v.failed ?? 0);
    for (const [k, v] of Object.entries(d.byLanguage ?? {})) add("language", k, v.turns ?? 0, v.failed ?? 0);
    for (const [k, v] of Object.entries(d.byViolation ?? {})) viol.set(k, (viol.get(k) ?? 0) + (v ?? 0));
  }
  return {
    days: days.length, turns, passed, failed, repaired, escalated,
    passRate: pct(passed, turns), repairRate: pct(repaired, turns), escalationRate: pct(escalated, turns),
    avgTotalMs: turns > 0 ? Math.round(totalMs / turns) : null,
    avgGateMs: turns > 0 ? Math.round((gateMicros / turns / 1000) * 100) / 100 : null,
    breakdown: [...bd.values()].sort((a, b) => b.turns - a.turns || a.key.localeCompare(b.key)),
    violations: [...viol.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
  };
}
