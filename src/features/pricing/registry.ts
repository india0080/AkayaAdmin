// Country pricing: registry + policy wire types and tolerant parsers
// (docs/eleven/43_country_pricing_all.md section 2.4). Pure: no React, no
// Firebase, unit-tested under node --test. The SERVER is authoritative; this
// mirrors its rules so errors show before a call.
import { DEFAULT_ENABLED_COUNTRIES } from "./countriesData";
import { COUNTRIES, LIMITS, PLAN_IDS, minAmountFor, type CountryDef, type PlanId } from "./logic";

// ── Registry (adminConfig action "registry" -> planPrices) ──────────────────

export interface CurrencyInfo { code: string; exponent: number; symbol: string; minAmount: number }
export interface PricingLimits { maxMonthly: number; maxAnnual: number; notesMax: number; maxPerApply: number; annualMaxMonths: number }

export interface PricingRegistry {
  countries: readonly CountryDef[];
  /// ENABLED codes as the server saw them at load time (null = unknown).
  activeCountries: readonly string[] | null;
  defaultEnabled: readonly string[];
  regions: readonly string[];
  currencies: Record<string, CurrencyInfo>;
  gatewayCurrencies: readonly string[];
  planIds: readonly PlanId[];
  defaultCountry: string;
  limits: PricingLimits;
  source: "server" | "compiled";
}

/// Hard cap of one adminConfig apply (server PLAN_PRICE_LIMITS.maxPerApply).
export const MAX_PER_APPLY = 400;

export const DEFAULT_LIMITS: PricingLimits = {
  maxMonthly: LIMITS.maxMonthly, maxAnnual: LIMITS.maxAnnual, notesMax: 200, maxPerApply: MAX_PER_APPLY, annualMaxMonths: LIMITS.annualMaxMonths,
};

export const regionsOf = (list: readonly CountryDef[]): string[] => [...new Set(list.map((c) => c.region))].sort();

export function currenciesOf(list: readonly CountryDef[]): Record<string, CurrencyInfo> {
  const out: Record<string, CurrencyInfo> = {};
  for (const c of list) {
    if (!out[c.currency]) out[c.currency] = { code: c.currency, exponent: c.minorUnitExponent, symbol: c.currency, minAmount: minAmountFor(c.currency, c.minorUnitExponent) };
  }
  return out;
}

/// Compiled view (generated country table); used until / unless the server answers.
export function compiledRegistry(): PricingRegistry {
  return {
    countries: COUNTRIES,
    activeCountries: null,
    defaultEnabled: DEFAULT_ENABLED_COUNTRIES,
    regions: regionsOf(COUNTRIES),
    currencies: currenciesOf(COUNTRIES),
    gatewayCurrencies: [],
    planIds: PLAN_IDS,
    defaultCountry: "IN",
    limits: DEFAULT_LIMITS,
    source: "compiled",
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strOf = (v: unknown): string | null => (typeof v === "string" ? v : null);
const numOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strList = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);

function parseCountry(v: unknown): CountryDef | null {
  if (!isObj(v)) return null;
  const code = strOf(v.code);
  const name = strOf(v.name);
  const currency = strOf(v.currency);
  const exp = numOf(v.minorUnitExponent);
  if (!code || !/^[A-Z]{2}$/.test(code) || !name || !currency || !/^[A-Z]{3}$/.test(currency) || exp === null || ![0, 2, 3].includes(exp)) return null;
  return { code, name, currency, minorUnitExponent: exp, defaultLocale: strOf(v.defaultLocale) ?? "en", region: strOf(v.region) ?? "Other" };
}

/// Tolerant: accepts the whole registry response or just its planPrices block;
/// anything missing/garbage falls back to the compiled table.
export function parseRegistry(raw: unknown): PricingRegistry {
  const base = compiledRegistry();
  const root = isObj(raw) ? (isObj(raw.planPrices) ? raw.planPrices : raw) : null;
  if (!root) return base;
  const countries = Array.isArray(root.countries) ? root.countries.map(parseCountry).filter((c): c is CountryDef => c !== null) : [];
  const list: readonly CountryDef[] = countries.length > 0 ? countries : base.countries;
  const currencies = currenciesOf(list);
  if (isObj(root.currencies)) {
    for (const [code, c] of Object.entries(root.currencies)) {
      if (!isObj(c)) continue;
      const exp = numOf(c.exponent);
      const min = numOf(c.minAmount);
      if (exp !== null && [0, 2, 3].includes(exp) && min !== null && min > 0) {
        currencies[code] = { code, exponent: exp, symbol: strOf(c.symbol) ?? code, minAmount: min };
      }
    }
  }
  const limits = { ...DEFAULT_LIMITS };
  if (isObj(root.limits)) {
    for (const k of Object.keys(limits) as (keyof PricingLimits)[]) {
      const n = numOf(root.limits[k]);
      if (n !== null && n > 0) limits[k] = n;
    }
  }
  limits.maxPerApply = Math.min(limits.maxPerApply, MAX_PER_APPLY);
  const planIds = (strList(root.planIds) ?? []).filter((p): p is PlanId => (PLAN_IDS as readonly string[]).includes(p));
  const regions = strList(root.regions);
  return {
    countries: list,
    activeCountries: strList(root.activeCountries),
    defaultEnabled: strList(root.defaultEnabled) ?? base.defaultEnabled,
    regions: regions && regions.length ? regions : regionsOf(list),
    currencies,
    gatewayCurrencies: strList(root.gatewayCurrencies) ?? [],
    planIds: planIds.length ? planIds : PLAN_IDS,
    defaultCountry: strOf(root.defaultCountry) ?? "IN",
    limits,
    source: "server",
  };
}

export function currencyInfo(reg: PricingRegistry, currency: string, fallbackExp = 2): CurrencyInfo {
  return reg.currencies[currency] ?? { code: currency, exponent: fallbackExp, symbol: currency, minAmount: minAmountFor(currency, fallbackExp) };
}

// ── Policy (flat snapshot of target "pricingPolicy") ────────────────────────

export type UnpricedPolicy = "unavailable" | "fallback";
export const UNPRICED_POLICIES: readonly UnpricedPolicy[] = ["unavailable", "fallback"];
export interface ProductPolicy { unpricedPolicy?: UnpricedPolicy; fallbackCountry?: string }

export interface PolicyState {
  defaultCountry: string;
  fallbackCountry: string;
  unpricedPolicy: UnpricedPolicy;
  allowUserChangeCountry: boolean;
  /// null = compiled/registry gateway list.
  gatewayCurrencies: string[] | null;
  /// explicit per-country overrides only
  enabled: Record<string, boolean>;
  products: Partial<Record<PlanId, ProductPolicy>>;
}

export type FlatPolicy = Record<string, unknown>;

export const DEFAULT_POLICY: PolicyState = {
  defaultCountry: "IN", fallbackCountry: "IN", unpricedPolicy: "unavailable", allowUserChangeCountry: true,
  gatewayCurrencies: null, enabled: {}, products: {},
};

const ISO_RE = /^[A-Z]{2}$/;
const asUnpriced = (v: unknown): UnpricedPolicy | null => (v === "unavailable" || v === "fallback" ? v : null);

function asProduct(v: unknown): ProductPolicy | null {
  if (!isObj(v)) return null;
  const out: ProductPolicy = {};
  const up = asUnpriced(v.unpricedPolicy);
  if (up) out.unpricedPolicy = up;
  const fc = strOf(v.fallbackCountry);
  if (fc && ISO_RE.test(fc)) out.fallbackCountry = fc;
  return Object.keys(out).length ? out : null;
}

/// Only STORED keys appear in a snapshot; absent = compiled default. Tolerant:
/// unknown/invalid keys are ignored, IN is always enabled (mirrors normalizePolicy).
export function parsePolicySnapshot(snapshot: unknown): PolicyState {
  const s = isObj(snapshot) ? snapshot : {};
  const p: PolicyState = { ...DEFAULT_POLICY, enabled: {}, products: {} };
  const dc = strOf(s.defaultCountry); if (dc && ISO_RE.test(dc)) p.defaultCountry = dc;
  const fc = strOf(s.fallbackCountry); if (fc && ISO_RE.test(fc)) p.fallbackCountry = fc;
  p.unpricedPolicy = asUnpriced(s.unpricedPolicy) ?? "unavailable";
  p.allowUserChangeCountry = s.allowUserChangeCountry !== false;
  const gc = strList(s.gatewayCurrencies); if (gc) p.gatewayCurrencies = [...gc].sort();
  for (const [k, v] of Object.entries(s)) {
    let m = /^enabled\.([A-Z]{2})$/.exec(k);
    if (m && typeof v === "boolean") p.enabled[m[1]] = v;
    m = /^product\.([a-z_]+)$/.exec(k);
    if (m && (PLAN_IDS as readonly string[]).includes(m[1])) {
      const prod = asProduct(v);
      if (prod) p.products[m[1] as PlanId] = prod;
    }
  }
  p.enabled.IN = true;
  return p;
}

/// The flat STORED keys of a snapshot (garbage dropped), the base for diffs.
export function flatOf(snapshot: unknown): FlatPolicy {
  const s = isObj(snapshot) ? snapshot : {};
  const out: FlatPolicy = {};
  for (const k of Object.keys(s).sort()) {
    const v = s[k];
    if (v === null || v === undefined) continue;
    if (k === "defaultCountry" || k === "fallbackCountry") { if (typeof v === "string" && ISO_RE.test(v)) out[k] = v; }
    else if (k === "unpricedPolicy") { if (asUnpriced(v)) out[k] = v; }
    else if (k === "allowUserChangeCountry") { if (typeof v === "boolean") out[k] = v; }
    else if (k === "gatewayCurrencies") { const l = strList(v); if (l) out[k] = [...l].sort(); }
    else if (/^enabled\.[A-Z]{2}$/.test(k)) { if (typeof v === "boolean") out[k] = v; }
    else if (/^tier\.[A-Z]{2}$/.test(k)) { if (typeof v === "string" && ["high","medium","low"].includes(v)) out[k]=v; }
    else if (/^product\.[a-z_]+$/.test(k)) { const prod = asProduct(v); if (prod) out[k] = prod; }
  }
  return out;
}

/// Overlay edits ({key: value | null(remove)}) on a flat base.
export function applyPolicyEdits(base: FlatPolicy, edits: FlatPolicy): FlatPolicy {
  const out: FlatPolicy = { ...base };
  for (const [k, v] of Object.entries(edits)) {
    if (v === null || v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/// Edits that really differ from base (the others are dropped).
export function pruneEdits(base: FlatPolicy, edits: FlatPolicy): FlatPolicy {
  const out: FlatPolicy = {};
  for (const [k, v] of Object.entries(edits)) {
    const b = base[k];
    if (v === null || v === undefined) { if (b !== undefined) out[k] = null; }
    else if (!same(b, v)) out[k] = v;
  }
  return out;
}

/// The adminConfig apply patch for target pricingPolicy (flat, null removes a key).
export function policyPatch(base: FlatPolicy, edits: FlatPolicy): FlatPolicy {
  return pruneEdits(base, edits);
}

export function isCountryEnabled(policy: PolicyState, code: string, defaultEnabled: readonly string[] = DEFAULT_ENABLED_COUNTRIES): boolean {
  if (code === "IN") return true;
  const o = policy.enabled[code];
  return o === undefined ? defaultEnabled.includes(code) : o;
}

export function planPolicy(policy: PolicyState, planId: string): { unpricedPolicy: UnpricedPolicy; fallbackCountry: string } {
  const o = policy.products[planId as PlanId];
  return { unpricedPolicy: o?.unpricedPolicy ?? policy.unpricedPolicy, fallbackCountry: o?.fallbackCountry ?? policy.fallbackCountry };
}

/// Mirrors backend checkPolicyConsistency(): default / fallback (global and
/// per product) must be enabled; IN can never be disabled.
export function checkPolicyConsistency(policy: PolicyState, defaultEnabled: readonly string[] = DEFAULT_ENABLED_COUNTRIES): string[] {
  const out: string[] = [];
  const on = (cc: string) => isCountryEnabled(policy, cc, defaultEnabled);
  if (policy.enabled.IN === false) out.push("India (INR) is the fallback price list and cannot be disabled.");
  if (!on(policy.defaultCountry)) out.push(`The default country ${policy.defaultCountry} must be enabled.`);
  if (!on(policy.fallbackCountry)) out.push(`The fallback country ${policy.fallbackCountry} must be enabled.`);
  for (const pid of PLAN_IDS) {
    const fc = policy.products[pid]?.fallbackCountry;
    if (fc && !on(fc)) out.push(`The fallback country ${fc} for ${pid} must be enabled.`);
  }
  return out;
}

/// Gateway-accepted currencies in effect: the policy list replaces the compiled one.
export function effectiveGateway(policy: PolicyState, reg: PricingRegistry): ReadonlySet<string> {
  return new Set(policy.gatewayCurrencies ?? reg.gatewayCurrencies);
}

// ── Draft edit helpers for policy keys ──────────────────────────────────────

/// Sets enabled.<CC>; an edit equal to the effective base value is dropped.
/// IN can never be disabled (returns the edits unchanged).
export function setEnabledEdit(base: FlatPolicy, edits: FlatPolicy, code: string, enabled: boolean, defaultEnabled: readonly string[]): FlatPolicy {
  if (code === "IN" && !enabled) return edits;
  const key = `enabled.${code}`;
  const baseEff = typeof base[key] === "boolean" ? (base[key] as boolean) : code === "IN" ? true : defaultEnabled.includes(code);
  const next = { ...edits };
  if (enabled === baseEff) delete next[key];
  else next[key] = enabled;
  return next;
}

export function setPolicyKeyEdit(base: FlatPolicy, edits: FlatPolicy, key: string, value: unknown): FlatPolicy {
  const next = { ...edits, [key]: value === undefined ? null : value };
  return pruneEdits(base, next);
}

export const POLICY_KEY_LABEL = (key: string): string => {
  if (key === "defaultCountry") return "Default country";
  if (key === "fallbackCountry") return "Fallback country";
  if (key === "unpricedPolicy") return "Unpriced countries";
  if (key === "allowUserChangeCountry") return "Users can change country";
  if (key === "gatewayCurrencies") return "Gateway currencies";
  const e = /^enabled\.([A-Z]{2})$/.exec(key);
  if (e) return `Country ${e[1]} enabled`;
  const p = /^product\.(.+)$/.exec(key);
  if (p) return `Product override ${p[1]}`;
  return key;
};
