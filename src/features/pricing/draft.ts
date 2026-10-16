// Country pricing: the local DRAFT (row edits + policy edits + bulk settings),
// its storage wrapper, and the DIFF against the server state. Pure: storage is
// injected (sessionStorage in the page), every access is try/catch'd.
import { countryByCode, formatMinor, parseDocId, type PlanId, type PriceRow } from "./logic";
import {
  POLICY_KEY_LABEL, applyPolicyEdits, checkPolicyConsistency, effectiveGateway, parsePolicySnapshot, pruneEdits,
  type FlatPolicy, type PricingRegistry,
} from "./registry";
import { hasRuleErrors, validateRowValues, type RowValues } from "./rules";
import { DEFAULT_BULK, sanitizeBulk, type BulkSettings } from "./bulk";
import type { RowEdits } from "./table";

export interface PriceDraft {
  v: 1;
  /// rowId -> complete values | null (delete the row)
  rows: RowEdits;
  /// flat policy key -> value | null (remove the stored key)
  policy: FlatPolicy;
  bulk: BulkSettings;
  savedAt: number;
}

export const emptyDraft = (): PriceDraft => ({ v: 1, rows: {}, policy: {}, bulk: { ...DEFAULT_BULK, rates: {}, multipliers: {} }, savedAt: 0 });

export const isDraftEmpty = (d: PriceDraft): boolean => Object.keys(d.rows).length === 0 && Object.keys(d.policy).length === 0;

const same = (a: RowValues | null, b: RowValues | null): boolean =>
  a === b || (!!a && !!b && a.priceMonthly === b.priceMonthly && a.priceAnnual === b.priceAnnual && a.active === b.active);

const valuesOf = (r: PriceRow | undefined | null): RowValues | null => (r ? { priceMonthly: r.priceMonthly, priceAnnual: r.priceAnnual, active: r.active } : null);

/// Sets (or drops, when equal to the server) the edit of one row.
export function withRowEdit(d: PriceDraft, id: string, edit: RowValues | null, base: ReadonlyMap<string, PriceRow>): PriceDraft {
  const rows = { ...d.rows };
  if (same(edit, valuesOf(base.get(id)))) delete rows[id];
  else rows[id] = edit;
  return { ...d, rows };
}

export function withRowEdits(d: PriceDraft, edits: RowEdits, base: ReadonlyMap<string, PriceRow>): PriceDraft {
  let out = d;
  for (const [id, e] of Object.entries(edits)) out = withRowEdit(out, id, e, base);
  return out;
}

/// Drop everything that already equals the (reloaded) server state.
export function pruneDraft(d: PriceDraft, base: ReadonlyMap<string, PriceRow>, basePolicy: FlatPolicy): PriceDraft {
  const rows: RowEdits = {};
  for (const [id, e] of Object.entries(d.rows)) {
    if (!same(e, valuesOf(base.get(id)))) rows[id] = e;
  }
  return { ...d, rows, policy: pruneEdits(basePolicy, d.policy) };
}

// ── Storage (sessionStorage, never throws) ──────────────────────────────────

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export const DRAFT_KEY = "akaya.pricing.draft.v1";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/// Tolerant: anything that is not a well-formed draft yields an empty one.
export function parseDraft(json: string | null): PriceDraft {
  if (!json) return emptyDraft();
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return emptyDraft(); }
  if (!isObj(raw) || raw.v !== 1) return emptyDraft();
  const d = emptyDraft();
  if (isObj(raw.rows)) {
    for (const [id, e] of Object.entries(raw.rows)) {
      const p = parseDocId(id);
      if (!p || !countryByCode(p.country)) continue;
      if (e === null) { d.rows[id] = null; continue; }
      if (isObj(e) && Number.isSafeInteger(e.priceMonthly) && Number.isSafeInteger(e.priceAnnual) && typeof e.active === "boolean") {
        d.rows[id] = { priceMonthly: e.priceMonthly as number, priceAnnual: e.priceAnnual as number, active: e.active };
      }
    }
  }
  if (isObj(raw.policy)) {
    for (const [k, v] of Object.entries(raw.policy)) if (/^(tier\.[A-Z]{2}|enabled\.[A-Z]{2}|product\.[a-z_]+|defaultCountry|fallbackCountry|unpricedPolicy|allowUserChangeCountry)$/.test(k)) d.policy[k] = v;
  }
  d.bulk = sanitizeBulk(raw.bulk);
  d.savedAt = typeof raw.savedAt === "number" ? raw.savedAt : 0;
  return d;
}

export function loadDraft(storage: StorageLike | null): PriceDraft {
  try { return parseDraft(storage ? storage.getItem(DRAFT_KEY) : null); } catch { return emptyDraft(); }
}

/// Returns false when the draft could not be stored (private mode, quota).
export function saveDraft(storage: StorageLike | null, d: PriceDraft, now: number = Date.now()): boolean {
  try {
    if (!storage) return false;
    if (isDraftEmpty(d) && !hasBulkContent(d.bulk)) { storage.removeItem(DRAFT_KEY); return true; }
    storage.setItem(DRAFT_KEY, JSON.stringify({ ...d, savedAt: now }));
    return true;
  } catch { return false; }
}

export function clearDraft(storage: StorageLike | null): void {
  try { storage?.removeItem(DRAFT_KEY); } catch { /* storage unavailable: nothing to clear */ }
}

const hasBulkContent = (b: BulkSettings): boolean =>
  b.baseMonthly !== "" || b.baseAnnual !== "" || Object.keys(b.rates).length > 0 || Object.keys(b.multipliers).length > 0;

/// The real sessionStorage when it exists and works (SSR / blocked access -> null).
export function browserSessionStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    const k = "__akaya_probe__";
    window.sessionStorage.setItem(k, "1");
    window.sessionStorage.removeItem(k);
    return window.sessionStorage;
  } catch { return null; }
}

// ── Diff ────────────────────────────────────────────────────────────────────

export type RowChangeKind = "added" | "changed" | "removed";

export interface RowChange {
  id: string;
  planId: PlanId;
  country: string;
  countryName: string;
  currency: string;
  exponent: number;
  kind: RowChangeKind;
  before: RowValues | null;
  after: RowValues | null;
  errors: string[];
  warnings: string[];
}

export interface PolicyChange { key: string; label: string; before: unknown; after: unknown }

export interface DraftDiff {
  rows: RowChange[];
  policy: PolicyChange[];
  /// blocking problems (invalid rows, policy consistency)
  errors: string[];
  warnings: string[];
  counts: { added: number; changed: number; removed: number; enabledOn: number; enabledOff: number; policyKeys: number; total: number };
}

export function describeRowChange(c: RowChange): string {
  const f = (m: number) => formatMinor(m, c.currency, { exponent: c.exponent, locale: "en-US", exact: true });
  if (c.kind === "removed") return `${c.id}: remove price row`;
  const a = c.after as RowValues;
  if (c.kind === "added") return `${c.id}: new ${f(a.priceMonthly)} / month, ${f(a.priceAnnual)} / year${a.active ? "" : " (not available)"}`;
  const b = c.before as RowValues;
  const parts: string[] = [];
  if (a.priceMonthly !== b.priceMonthly) parts.push(`monthly ${f(b.priceMonthly)} -> ${f(a.priceMonthly)}`);
  if (a.priceAnnual !== b.priceAnnual) parts.push(`annual ${f(b.priceAnnual)} -> ${f(a.priceAnnual)}`);
  if (a.active !== b.active) parts.push(a.active ? "now available" : "now NOT available");
  return `${c.id}: ${parts.join(", ")}`;
}

export interface DiffInput {
  baseRows: ReadonlyMap<string, PriceRow>;
  basePolicy: FlatPolicy;
  draft: PriceDraft;
  registry: PricingRegistry;
}

/// What a publish would change, with the server's validation applied to every
/// resulting row and to the resulting policy. Rows equal to the server are
/// ignored (a draft edit that was reverted costs nothing).
export function buildDiff(inp: DiffInput): DraftDiff {
  const { baseRows, basePolicy, draft, registry } = inp;
  const policyAfter = applyPolicyEdits(basePolicy, draft.policy);
  const policyState = parsePolicySnapshot(policyAfter);
  const gateway = effectiveGateway(policyState, registry);
  const errors: string[] = [];
  const warnings: string[] = [];
  const rows: RowChange[] = [];
  for (const id of Object.keys(draft.rows).sort()) {
    const p = parseDocId(id);
    const country = p ? countryByCode(p.country) : undefined;
    if (!p || !country) continue;
    const before = valuesOf(baseRows.get(id));
    const after = draft.rows[id];
    if (same(before, after)) continue;
    const kind: RowChangeKind = after === null ? "removed" : before === null ? "added" : "changed";
    const change: RowChange = {
      id, planId: p.planId, country: country.code, countryName: country.name, currency: country.currency, exponent: country.minorUnitExponent,
      kind, before, after, errors: [], warnings: [],
    };
    if (after === null) {
      if (country.code === "IN") change.errors.push("The India (INR) row is the fallback price and cannot be deleted.");
    } else {
      const res = validateRowValues(country, after, { registry, gateway });
      change.errors.push(...Object.values(res.errors));
      change.warnings.push(...res.warnings);
    }
    rows.push(change);
    for (const e of change.errors) errors.push(`${id}: ${e}`);
    for (const w of change.warnings) warnings.push(`${id}: ${w}`);
  }
  const policy: PolicyChange[] = [];
  const patch = pruneEdits(basePolicy, draft.policy);
  for (const key of Object.keys(patch).sort()) {
    policy.push({ key, label: POLICY_KEY_LABEL(key), before: basePolicy[key] ?? null, after: patch[key] });
  }
  if (policy.length) for (const m of checkPolicyConsistency(policyState, registry.defaultEnabled)) errors.push(m);
  if (patch["enabled.IN"] === false) errors.push("India (INR) can never be disabled.");
  const counts = { added: 0, changed: 0, removed: 0, enabledOn: 0, enabledOff: 0, policyKeys: policy.length, total: 0 };
  for (const r of rows) counts[r.kind]++;
  for (const c of policy) {
    if (/^enabled\./.test(c.key)) { if (c.after === true) counts.enabledOn++; else if (c.after === false) counts.enabledOff++; }
  }
  counts.total = rows.length + policy.length;
  return { rows, policy, errors, warnings, counts };
}

/// Level of friction for the publish confirmation: bigger / riskier changes
/// need the typed phrase (existing ConfirmAction levels).
export function publishConfirmLevel(diff: DraftDiff): "reason" | "typed" {
  const c = diff.counts;
  if (c.removed > 0 || c.enabledOn + c.enabledOff > 0 || c.policyKeys > 0) return "typed";
  if (c.added + c.changed > 5) return "typed";
  return diff.rows.some((r) => r.kind === "changed" && r.before && r.after && relativeChange(r.before.priceMonthly, r.after.priceMonthly) > 0.5) ? "typed" : "reason";
}

function relativeChange(a: number, b: number): number {
  return a > 0 ? Math.abs(b - a) / a : 0;
}

export const PUBLISH_PHRASE = "PUBLISH";

