// Admin Panel > Capabilities: pure logic (types, validation mirror of the
// server, payload builders, answer-line preview, wire parsing, permissions).
// No React / Firebase imports so it is unit-tested under node --test. The
// SERVER re-validates everything (functions/src/capabilities.ts).
import {
  CAPABILITY_STATUSES, LANGS, catalogEntry, type CapabilityStatus, type CatalogEntry, type Lang, type Localized,
} from "./catalog";

export { CAPABILITY_STATUSES, LANGS, type CapabilityStatus, type Lang, type Localized };

export const STATUS_LABEL: Record<CapabilityStatus, string> = {
  live: "Live", beta: "Beta", coming_soon: "Coming soon", hidden: "Hidden",
};
export const LANG_LABEL: Record<Lang, string> = { en: "English", hi: "Hindi", hinglish: "Hinglish" };

/// Server limits (pinned by tests against the server's wire contract).
export const LIMITS = { label: 40, description: 140, overrides: 100 } as const;
export const ID_RE = /^[a-z0-9][a-z0-9_]{1,47}$/;
const ANGLE = /[<>\uff1c\uff1e]/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

export interface Override {
  status?: CapabilityStatus;
  label?: Localized;
  description?: Localized;
}
export type CapabilitiesPatch = Record<string, Override | null>;

const cpLen = (s: string) => Array.from(s).length;

// ── Draft (editor state) ────────────────────────────────────────────────────

/// status "" = inherit the default (the app's compiled status).
export interface Draft {
  status: CapabilityStatus | "";
  label: Record<Lang, string>;
  description: Record<Lang, string>;
}
const blank = (): Record<Lang, string> => ({ en: "", hi: "", hinglish: "" });
export const emptyDraft = (): Draft => ({ status: "", label: blank(), description: blank() });

export function draftFromOverride(ov: Override | undefined | null): Draft {
  const d = emptyDraft();
  if (!ov) return d;
  d.status = ov.status ?? "";
  for (const l of LANGS) {
    d.label[l] = ov.label?.[l] ?? "";
    d.description[l] = ov.description?.[l] ?? "";
  }
  return d;
}

/// Count shown next to a field: trimmed code points.
export const countOf = (s: string) => cpLen(s.trim());

export type Errors = Record<string, string>;

function textError(name: string, v: string, max: number): string | null {
  const s = v.trim();
  if (s === "") return null;
  if (ANGLE.test(s)) return `${name} cannot contain < or > (plain text only).`;
  if (CONTROL.test(s)) return `${name} cannot contain line breaks or control characters.`;
  if (cpLen(s) > max) return `${name} must be at most ${max} characters.`;
  return null;
}

/// Pure: mirrors the server rules. Keys: `label.en`, `description.hi`, ...
export function validateDraft(d: Draft): Errors {
  const e: Errors = {};
  for (const l of LANGS) {
    const a = textError(`${LANG_LABEL[l]} label`, d.label[l], LIMITS.label);
    if (a) e[`label.${l}`] = a;
    const b = textError(`${LANG_LABEL[l]} description`, d.description[l], LIMITS.description);
    if (b) e[`description.${l}`] = b;
  }
  return e;
}
export const hasErrors = (e: Errors) => Object.keys(e).length > 0;

/// Canonical override from a draft (trimmed; empty parts omitted), or null
/// when the draft sets nothing (= the default).
export function buildOverride(d: Draft): Override | null {
  const out: Override = {};
  if (d.status) out.status = d.status;
  const pick = (m: Record<Lang, string>) => {
    const o: Localized = {};
    for (const l of LANGS) {
      const t = m[l].trim().normalize("NFC");
      if (t) o[l] = t;
    }
    return Object.keys(o).length ? o : undefined;
  };
  const label = pick(d.label);
  const description = pick(d.description);
  if (label) out.label = label;
  if (description) out.description = description;
  return Object.keys(out).length ? out : null;
}

function canon(o: Override | null | undefined) {
  if (!o) return null;
  const loc = (m?: Localized) => (m ? LANGS.filter((l) => m[l] !== undefined).map((l) => [l, m[l]]) : null);
  return { s: o.status ?? null, l: loc(o.label), d: loc(o.description) };
}
export function sameOverride(a: Override | null | undefined, b: Override | null | undefined): boolean {
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

// ── Patches ─────────────────────────────────────────────────────────────────

/// One capability per change. A draft that sets nothing resets the override.
export function savePatch(id: string, d: Draft): CapabilitiesPatch {
  return { [id]: buildOverride(d) };
}
export const resetPatch = (id: string): CapabilitiesPatch => ({ [id]: null });

/// adminConfig requires a reason of at least 5 characters.
export function autoReason(verb: string, name: string): string {
  const r = `Capabilities: ${verb} "${name.slice(0, 60)}"`;
  return r.length >= 5 ? r : `Capabilities: ${verb}`;
}

// ── Effective state + preview ───────────────────────────────────────────────

export function effectiveStatus(entry: Pick<CatalogEntry, "baseStatus">, ov: Override | null | undefined): CapabilityStatus {
  return ov?.status ?? entry.baseStatus;
}

/// Statuses that take a capability away from users or tell them it is not
/// ready: changing TO one of these (from something else) asks for confirmation.
export const CONFIRM_STATUSES: readonly CapabilityStatus[] = ["hidden", "coming_soon"];
export function needsConfirm(entry: Pick<CatalogEntry, "baseStatus">, before: Override | null | undefined, after: Override | null): boolean {
  const was = effectiveStatus(entry, before);
  const will = effectiveStatus(entry, after);
  return was !== will && CONFIRM_STATUSES.includes(will);
}

/// The name in one language: the override, else the catalog default, else the
/// English name, else the id.
export function nameFor(entry: CatalogEntry, ov: Override | null | undefined, lang: Lang): string {
  return ov?.label?.[lang]?.trim() || entry.labels[lang] || entry.labels.en || entry.id;
}

const SUFFIX: Record<Lang, Record<"beta" | "coming_soon", string>> = {
  en: { beta: "beta", coming_soon: "coming soon" },
  hi: { beta: "बीटा", coming_soon: "जल्द आ रहा है" },
  hinglish: { beta: "beta", coming_soon: "jald aa raha hai" },
};

/// How the "what can you do" answer lists one capability, per language:
/// `Name: description (suffix)`; the description falls back to the built-in
/// one; hidden capabilities are not listed (null).
/// This is the CONSOLE's rendering for review; the app composes the real
/// answer from the same fields.
export function answerLine(entry: CatalogEntry, ov: Override | null | undefined, lang: Lang): string | null {
  const status = effectiveStatus(entry, ov);
  if (status === "hidden") return null;
  const name = nameFor(entry, ov, lang);
  const desc = ov?.description?.[lang]?.trim() || entry.descriptions[lang]?.trim() || entry.descriptions.en?.trim();
  const suffix = status === "live" ? "" : ` (${SUFFIX[lang][status]})`;
  return `${name}${desc ? `: ${desc}` : ""}${suffix}`;
}

// ── Wire parsing ────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function parseLoc(v: unknown): Localized | undefined {
  if (!isObj(v)) return undefined;
  const out: Localized = {};
  for (const l of LANGS) if (typeof v[l] === "string" && (v[l] as string).trim()) out[l] = v[l] as string;
  return Object.keys(out).length ? out : undefined;
}

export function parseOverride(raw: unknown): Override | null {
  if (!isObj(raw)) return null;
  const out: Override = {};
  if (typeof raw.status === "string" && (CAPABILITY_STATUSES as readonly string[]).includes(raw.status)) {
    out.status = raw.status as CapabilityStatus;
  }
  const label = parseLoc(raw.label);
  const description = parseLoc(raw.description);
  if (label) out.label = label;
  if (description) out.description = description;
  return Object.keys(out).length ? out : null;
}

/// { id: override } from the adminConfig `get` snapshot.
export function parseSnapshot(snapshot: unknown): Record<string, Override> {
  const out: Record<string, Override> = {};
  if (!isObj(snapshot)) return out;
  for (const [id, v] of Object.entries(snapshot)) {
    const o = parseOverride(v);
    if (o) out[id] = o;
  }
  return out;
}

// ── Rows ────────────────────────────────────────────────────────────────────

export interface Row {
  id: string;
  /// null = an override for an id that is not in this console's catalog.
  entry: CatalogEntry | null;
  override: Override | null;
  status: CapabilityStatus | null;
}

export function buildRows(catalog: readonly CatalogEntry[], overrides: Record<string, Override>): { rows: Row[]; unknown: Row[] } {
  const rows: Row[] = catalog.map((entry) => ({
    id: entry.id, entry, override: overrides[entry.id] ?? null, status: effectiveStatus(entry, overrides[entry.id]),
  }));
  const known = new Set(catalog.map((c) => c.id));
  const unknown: Row[] = Object.keys(overrides).filter((id) => !known.has(id)).sort()
    .map((id) => ({ id, entry: null, override: overrides[id], status: overrides[id].status ?? null }));
  return { rows, unknown };
}

export function filterRows(rows: Row[], query: string): Row[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.id.toLowerCase().includes(q) || (r.entry !== null && Object.values(r.entry.labels).some((n) => (n ?? "").toLowerCase().includes(q))));
}

export const overrideCount = (o: Record<string, Override>) => Object.keys(o).length;

// ── Permissions ─────────────────────────────────────────────────────────────

/// Server mirror: get/history need config.read; apply needs config.modify;
/// rollback config.activate (done from Config History, not here).
export const CAPABILITIES_READ_PERMISSION = "config.read" as const;
export const CAPABILITIES_WRITE_PERMISSION = "config.modify" as const;
export function capabilitiesAccess(can: (p: typeof CAPABILITIES_READ_PERMISSION | typeof CAPABILITIES_WRITE_PERMISSION) => boolean) {
  return { canView: can(CAPABILITIES_READ_PERMISSION), canEdit: can(CAPABILITIES_WRITE_PERMISSION) };
}

export { catalogEntry };
