// Country pricing: "Preview as user in <country>". A PURE mirror of the
// backend resolvePrice / resolvePlanForCountry (akaya_ai/functions/src/pricing.ts)
// run on the DRAFT state (draft rows over server rows, draft policy), so the
// admin sees what the app would show after publishing. Unit-tested against the
// same matrix as functions/pricing_all.test.js. The server is the authority.
import { PLAN_IDS, PLAN_LABEL, countryByCode, formatMinor, type CountryDef, type PlanId } from "./logic";
import { currencyInfo, isCountryEnabled, planPolicy, effectiveGateway, type PolicyState, type PricingRegistry } from "./registry";

export interface PreviewRow {
  currency: string;
  priceMonthly: number;
  priceAnnual: number;
  active: boolean;
  effectiveFrom?: number | null;
}

export type FailReason =
  | "unknown_country" | "no_row" | "inactive" | "not_effective" | "invalid_row" | "country_disabled" | "gateway_currency" | "plan_unavailable";

export interface LegacyPrice { monthly: number; annual: number }

export interface ResolveInput {
  planId: string;
  country: string;
  now: number;
  policy: PolicyState;
  registry: PricingRegistry;
  /// the row of (plan, country) in the draft state
  rowOf: (planId: string, code: string) => PreviewRow | null | undefined;
  /// Legacy INR price of the plan (used for IN only when it has no usable row).
  /// undefined = not known to the console; null per plan = plan not purchasable.
  legacy?: Record<string, LegacyPrice | null | undefined>;
  /// clients that understand a fallback price (pricingV 3)
  allowFallback?: boolean;
}

export type Resolved =
  | {
    ok: true; country: string; priceCountry: string; fallbackApplied: boolean; currency: string; exponent: number;
    priceMonthly: number | null; priceAnnual: number | null; source: "row" | "legacy" | "legacy_unknown";
  }
  | { ok: false; country: string; reason: FailReason };

const isMinor = (v: unknown, min: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= min;

type Attempt = { ok: true; r: Extract<Resolved, { ok: true }> } | { ok: false; reason: FailReason };

function attempt(inp: ResolveInput, cc: string, gateway: ReadonlySet<string>): Attempt {
  const reg = countryByCode(cc, inp.registry.countries as CountryDef[]);
  if (!reg) return { ok: false, reason: "unknown_country" };
  if (!isCountryEnabled(inp.policy, reg.code, inp.registry.defaultEnabled)) return { ok: false, reason: "country_disabled" };
  const cur = currencyInfo(inp.registry, reg.currency, reg.minorUnitExponent);
  const row = inp.rowOf(inp.planId, reg.code);
  let fail: FailReason = "no_row";
  let usable: Extract<Resolved, { ok: true }> | null = null;
  if (row) {
    if (row.currency !== reg.currency || !isMinor(row.priceMonthly, cur.minAmount) || !isMinor(row.priceAnnual, cur.minAmount)) fail = "invalid_row";
    else if (row.active !== true) fail = "inactive";
    else if (typeof row.effectiveFrom === "number" && row.effectiveFrom > inp.now) fail = "not_effective";
    else {
      usable = {
        ok: true, country: reg.code, priceCountry: reg.code, fallbackApplied: false, currency: reg.currency, exponent: cur.exponent,
        priceMonthly: row.priceMonthly, priceAnnual: row.priceAnnual, source: "row",
      };
    }
  }
  if (!usable && reg.code === "IN") {
    const legacy = inp.legacy?.[inp.planId];
    if (inp.legacy === undefined || legacy === undefined) {
      // the console does not know the legacy INR price: the app would use it
      usable = { ok: true, country: "IN", priceCountry: "IN", fallbackApplied: false, currency: "INR", exponent: cur.exponent, priceMonthly: null, priceAnnual: null, source: "legacy_unknown" };
    } else if (legacy && isMinor(legacy.monthly, cur.minAmount) && isMinor(legacy.annual, cur.minAmount)) {
      usable = { ok: true, country: "IN", priceCountry: "IN", fallbackApplied: false, currency: "INR", exponent: cur.exponent, priceMonthly: legacy.monthly, priceAnnual: legacy.annual, source: "legacy" };
    }
  }
  if (!usable) return { ok: false, reason: fail };
  if (!gateway.has(usable.currency) && gateway.size > 0) return { ok: false, reason: "gateway_currency" };
  return { ok: true, r: usable };
}

/// Mirrors resolvePlanForCountry: own price, else (fallback policy, not for an
/// explicit inactive / future row) the fallback country's price. No chaining,
/// nothing is ever converted between currencies.
export function resolvePlan(inp: ResolveInput): Resolved {
  const reg = countryByCode(inp.country, inp.registry.countries as CountryDef[]);
  if (!reg) return { ok: false, country: inp.country, reason: "unknown_country" };
  if (inp.legacy && inp.legacy[inp.planId] === null) return { ok: false, country: reg.code, reason: "plan_unavailable" };
  const gateway = effectiveGateway(inp.policy, inp.registry);
  const direct = attempt(inp, reg.code, gateway);
  if (direct.ok) return { ...direct.r, country: reg.code };
  const pp = planPolicy(inp.policy, inp.planId);
  const fallbackable = direct.reason === "no_row" || direct.reason === "country_disabled" || direct.reason === "gateway_currency";
  if ((inp.allowFallback ?? true) && pp.unpricedPolicy === "fallback" && fallbackable && pp.fallbackCountry !== reg.code) {
    const fb = attempt(inp, pp.fallbackCountry, gateway);
    if (fb.ok) return { ...fb.r, country: reg.code, priceCountry: pp.fallbackCountry, fallbackApplied: true };
  }
  return { ok: false, country: reg.code, reason: direct.reason };
}

// ── What the app shows ──────────────────────────────────────────────────────

export const UNAVAILABLE_TEXT = "Not available in your region";
export const REASON_TEXT: Record<FailReason, string> = {
  unknown_country: "Unknown country",
  no_row: UNAVAILABLE_TEXT,
  inactive: UNAVAILABLE_TEXT,
  not_effective: UNAVAILABLE_TEXT,
  invalid_row: UNAVAILABLE_TEXT,
  country_disabled: UNAVAILABLE_TEXT,
  plan_unavailable: UNAVAILABLE_TEXT,
  gateway_currency: "Payments in your currency are not available yet.",
};
const REASON_NOTE: Record<FailReason, string> = {
  unknown_country: "Not an ISO country.",
  no_row: "No price row for this plan in this country (and no fallback applies).",
  inactive: "The price row is marked not available (never falls back).",
  not_effective: "The row has a future launch date (never falls back).",
  invalid_row: "The stored row is invalid for this currency.",
  country_disabled: "The country is disabled and the unpriced policy is 'unavailable' (or the fallback has no price).",
  plan_unavailable: "The plan is not purchasable at all.",
  gateway_currency: "The price currency is not accepted by the payment gateway.",
};

export interface PlanPreview {
  planId: PlanId;
  label: string;
  available: boolean;
  monthly: string;
  annual: string;
  /// "Prices shown in <fallback country> (<CUR>)" when the fallback applied
  fallbackLine: string | null;
  note: string;
  reason: FailReason | null;
  source: "row" | "legacy" | "legacy_unknown" | null;
  fallbackApplied: boolean;
  currency: string | null;
}

export interface UserPreview {
  code: string;
  countryName: string;
  region: string;
  enabled: boolean;
  plans: PlanPreview[];
  allowChangeLine: string;
}

export interface PreviewInput extends Omit<ResolveInput, "planId" | "country"> {
  country: string;
  planIds?: readonly PlanId[];
  /// Intl locale for the amounts. Default "en": the app formats with the device locale, which the console cannot know.
  locale?: string;
}

function fmt(minor: number | null, currency: string, exponent: number, locale: string): string {
  return minor === null ? "Legacy INR price (see Plans & Pricing)" : formatMinor(minor, currency, { exponent, locale, exact: false });
}

export function previewAsUser(inp: PreviewInput): UserPreview {
  const reg = countryByCode(inp.country, inp.registry.countries as CountryDef[]);
  const enabled = !!reg && isCountryEnabled(inp.policy, reg.code, inp.registry.defaultEnabled);
  const plans: PlanPreview[] = (inp.planIds ?? PLAN_IDS).map((planId) => {
    const r = resolvePlan({ ...inp, planId, country: inp.country });
    if (!r.ok) {
      return {
        planId, label: PLAN_LABEL[planId], available: false, monthly: REASON_TEXT[r.reason], annual: REASON_TEXT[r.reason], fallbackLine: null,
        note: REASON_NOTE[r.reason], reason: r.reason, source: null, fallbackApplied: false, currency: null,
      };
    }
    const priceCountry = countryByCode(r.priceCountry, inp.registry.countries as CountryDef[]);
    const locale = inp.locale ?? "en";
    const monthly = r.priceMonthly === null ? fmt(null, r.currency, r.exponent, locale) : `${fmt(r.priceMonthly, r.currency, r.exponent, locale)} / month`;
    const annual = r.priceAnnual === null ? fmt(null, r.currency, r.exponent, locale) : `${fmt(r.priceAnnual, r.currency, r.exponent, locale)} / year`;
    return {
      planId, label: PLAN_LABEL[planId], available: true, monthly, annual,
      fallbackLine: r.fallbackApplied ? `Prices shown in ${priceCountry?.name ?? r.priceCountry} (${r.currency})` : null,
      note: r.source === "legacy" ? "Legacy INR plan price." : r.source === "legacy_unknown" ? "No India row: the app uses the legacy INR plan price." : r.fallbackApplied ? "Fallback policy applied." : "Own price row.",
      reason: null, source: r.source, fallbackApplied: r.fallbackApplied, currency: r.currency,
    };
  });
  return {
    code: inp.country,
    countryName: reg?.name ?? inp.country,
    region: reg?.region ?? "",
    enabled,
    plans,
    allowChangeLine: inp.policy.allowUserChangeCountry
      ? "Users can change their country in the app."
      : "The country is locked to the user's account region: users cannot change it in the app.",
  };
}

// ── Draft state lookup + policy warnings ────────────────────────────────────

/// Row lookup over the DRAFT state: draft edits over server rows. An edited
/// row keeps the server row's launch date (the apply patch never sends it).
export function previewRowLookup(
  base: ReadonlyMap<string, { currency: string; priceMonthly: number; priceAnnual: number; active: boolean; effectiveFrom: number | null }>,
  edits: Readonly<Record<string, { priceMonthly: number; priceAnnual: number; active: boolean } | null>>,
  registry: PricingRegistry,
): (planId: string, code: string) => PreviewRow | null {
  return (planId, code) => {
    const id = `${planId}_${code}`;
    const b = base.get(id) ?? null;
    if (Object.prototype.hasOwnProperty.call(edits, id)) {
      const e = edits[id];
      if (e === null) return null;
      const cur = (registry.countries.find((c) => c.code === code) as CountryDef | undefined)?.currency ?? "";
      return { currency: cur, priceMonthly: e.priceMonthly, priceAnnual: e.priceAnnual, active: e.active, effectiveFrom: b?.effectiveFrom ?? null };
    }
    return b ? { currency: b.currency, priceMonthly: b.priceMonthly, priceAnnual: b.priceAnnual, active: b.active, effectiveFrom: b.effectiveFrom } : null;
  };
}

export interface PolicyWarning { planId: PlanId | "all"; message: string }

/// Policy consequences worth a warning (never blocking): a fallback policy
/// whose fallback country has no usable price for a product, or whose
/// currency the gateway does not take.
export function policyWarnings(
  policy: PolicyState,
  registry: PricingRegistry,
  rowOf: (planId: string, code: string) => PreviewRow | null | undefined,
  legacy?: Record<string, LegacyPrice | null | undefined>,
  planIds: readonly PlanId[] = PLAN_IDS,
  now: number = Date.now(),
): PolicyWarning[] {
  const out: PolicyWarning[] = [];
  for (const planId of planIds) {
    const pp = planPolicy(policy, planId);
    if (pp.unpricedPolicy !== "fallback") continue;
    const fc = countryByCode(pp.fallbackCountry, registry.countries as CountryDef[]);
    const name = fc ? `${fc.name} (${fc.code})` : pp.fallbackCountry;
    if (!fc) { out.push({ planId, message: `${PLAN_LABEL[planId]}: the fallback country ${pp.fallbackCountry} is not a known country.` }); continue; }
    const r = resolvePlan({ planId, country: fc.code, now, policy: { ...policy, unpricedPolicy: "unavailable", products: {} }, registry, rowOf, legacy, allowFallback: false });
    if (!r.ok) {
      out.push({
        planId,
        message: r.reason === "gateway_currency"
          ? `${PLAN_LABEL[planId]}: fallback is on but ${fc.currency} (${name}) is not accepted by the payment gateway, so unpriced countries will see "not available".`
          : `${PLAN_LABEL[planId]}: fallback is on but ${name} has no usable price for this product, so unpriced countries will see "not available in your region".`,
      });
    }
  }
  if (!isCountryEnabled(policy, policy.defaultCountry, registry.defaultEnabled)) out.push({ planId: "all", message: `The default country ${policy.defaultCountry} is not enabled.` });
  return out;
}
