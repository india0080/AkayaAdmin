// Admin Panel > Plans & Pricing > Country pricing: pure logic (money
// conversion, validation mirroring the server, payload builders, formatting,
// permission gating). No React / Firebase imports so it is unit-tested under
// node --test. The SERVER re-validates everything and is the source of truth.
import { COUNTRIES_DATA } from "./countriesData";

export const PLAN_IDS = ["silver", "gold", "app_premium", "floating_premium", "all_access"] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export const PLAN_LABEL: Record<PlanId, string> = {
  silver: "Silver (legacy)",
  gold: "Gold (legacy)",
  app_premium: "App Premium",
  floating_premium: "Floating System Premium",
  all_access: "All Access",
};

export interface CountryDef {
  code: string;
  name: string;
  currency: string;
  minorUnitExponent: number;
  defaultLocale: string;
  /// Region group (console filters).
  region: string;
}

export const COUNTRIES: readonly CountryDef[] = COUNTRIES_DATA;
export const FALLBACK_COUNTRY = "IN";
export const NOTES_MAX = 200;
export const MIN_REASON = 5;

const BY_CODE: ReadonlyMap<string, CountryDef> = new Map(COUNTRIES.map((c) => [c.code, c]));
export function countryByCode(code: string, list?: readonly CountryDef[]): CountryDef | undefined {
  return list ? list.find((c) => c.code === code) : BY_CODE.get(code);
}

/// Mirrors the server validators (akaya_ai/functions/src/pricing.ts, doc 43):
/// per-currency minimum in MINOR units (registry minAmount), monthly <=
/// 1,000,000,000 and annual <= 10,000,000,000 minor units, annual >= monthly
/// and <= 24 x monthly, 3-decimal amounts a multiple of 10. The server
/// registry response (planPrices.limits / currencies) is authoritative at runtime.
export const LIMITS = { maxMonthly: 1_000_000_000, maxAnnual: 10_000_000_000, annualMaxMonths: 24 } as const;

/// Same floors as the backend minAmountFor(): INR 100, 3-decimal 500, others 50.
export function minAmountFor(currency: string, exponent: number): number {
  if (currency === "INR") return 100;
  if (exponent === 3) return 500;
  return 50;
}

function deriveCurrencyRules(list: readonly CountryDef[]): Record<string, { exponent: number; minMinor: number }> {
  const out: Record<string, { exponent: number; minMinor: number }> = {};
  for (const c of list) {
    if (!out[c.currency]) out[c.currency] = { exponent: c.minorUnitExponent, minMinor: minAmountFor(c.currency, c.minorUnitExponent) };
  }
  return out;
}
export const CURRENCY_RULES: Record<string, { exponent: number; minMinor: number }> = deriveCurrencyRules(COUNTRIES_DATA);

export const IN_PROTECTED_REASON =
  "India (INR) is the fallback price list: the app and checkout fall back to it whenever a region has no price, and old app versions are always charged in INR. It can be edited but never deactivated or deleted.";

export function isProtectedCountry(country: string): boolean {
  return country === FALLBACK_COUNTRY;
}

// ── Money ───────────────────────────────────────────────────────────────────

/// "4.99" (major units) -> 499 minor units, with NO float arithmetic. Accepts
/// thousands separators. Null when not a valid amount for `exponent`.
export function majorToMinor(raw: string, exponent: number): number | null {
  const s = raw.replace(/[,\s]/g, "");
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > 4) return null;
  const re = exponent === 0 ? /^\d+$/ : new RegExp(`^\\d+(\\.\\d{1,${exponent}})?$`);
  if (!re.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const minor = Number(whole + frac.padEnd(exponent, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

/// 499 -> "4.99"; 4900 -> "49"; used to prefill the form.
export function minorToMajorInput(minor: number, exponent: number): string {
  if (!Number.isInteger(minor) || minor < 0) return "";
  if (exponent === 0) return String(minor);
  const s = String(minor).padStart(exponent + 1, "0");
  const whole = s.slice(0, s.length - exponent);
  const frac = s.slice(s.length - exponent).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

export function exponentFor(currency: string, fallback = 2): number {
  return CURRENCY_RULES[currency]?.exponent ?? fallback;
}

/// Currency-aware display via Intl (never a hard-coded symbol).
export function formatMinor(
  minor: number | null | undefined,
  currency: string,
  opts: { exponent?: number; locale?: string; exact?: boolean } = {},
): string {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return "—";
  const exp = opts.exponent ?? exponentFor(currency);
  const major = minor / 10 ** exp;
  const whole = Number.isInteger(major);
  try {
    return new Intl.NumberFormat(opts.locale, {
      style: "currency",
      currency,
      minimumFractionDigits: whole && !opts.exact ? 0 : exp,
      maximumFractionDigits: exp,
    }).format(major);
  } catch {
    return `${major.toFixed(exp)} ${currency}`;
  }
}

/// "₹99 → ₹129 (+30%)" in the row's own currency.
export function priceChangeText(before: number | null, after: number, currency: string, exponent: number, locale?: string): string {
  const f = (v: number) => formatMinor(v, currency, { exponent, locale });
  if (before === null || before === 0) return `${f(after)} (new)`;
  const pct = Math.round(((after - before) / before) * 100);
  return `${f(before)} → ${f(after)} (${pct > 0 ? "+" : ""}${pct}%)`;
}

// ── Wire model (assumed shape, parsed tolerantly) ───────────────────────────

export interface ItemMeta { version?: number; updatedAt?: unknown; updatedBy?: string }
export interface PriceRow {
  id: string; // doc id = {planId}_{CC}
  planId: PlanId;
  country: string;
  currency: string;
  priceMonthly: number;
  priceAnnual: number;
  active: boolean;
  effectiveFrom: number | null;
  notes: string;
  version: number | null;
  updatedAt: number | null;
  updatedBy: string | null;
}

export const docId = (planId: string, country: string): string => `${planId}_${country}`;

export function parseDocId(id: string): { planId: PlanId; country: string } | null {
  const i = id.lastIndexOf("_");
  if (i <= 0) return null;
  const planId = id.slice(0, i);
  const country = id.slice(i + 1);
  if (!(PLAN_IDS as readonly string[]).includes(planId) || !/^[A-Z]{2}$/.test(country)) return null;
  return { planId: planId as PlanId, country };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
/// Firestore Timestamps may arrive as {_seconds}/{seconds}; plain ms is the contract.
function ms(v: unknown): number | null {
  const n = num(v);
  if (n !== null) return n;
  if (v && typeof v === "object") {
    const o = v as { _seconds?: unknown; seconds?: unknown };
    const s = num(o._seconds ?? o.seconds);
    if (s !== null) return s * 1000;
  }
  return null;
}

function parseRow(id: string, raw: unknown, meta?: Record<string, ItemMeta>): PriceRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fromId = parseDocId(id);
  const planId = (str(r.planId) ?? fromId?.planId) as PlanId | undefined;
  const country = str(r.country) ?? fromId?.country;
  if (!planId || !(PLAN_IDS as readonly string[]).includes(planId) || !country) return null;
  const priceMonthly = num(r.priceMonthly);
  const priceAnnual = num(r.priceAnnual);
  if (priceMonthly === null || priceAnnual === null) return null;
  return {
    id: docId(planId, country),
    planId,
    country,
    currency: str(r.currency) ?? countryByCode(country)?.currency ?? "",
    priceMonthly,
    priceAnnual,
    active: r.active !== false,
    effectiveFrom: ms(r.effectiveFrom),
    notes: str(r.notes) ?? "",
    version: num(meta?.[id]?.version) ?? num(r.version),
    updatedAt: ms(meta?.[id]?.updatedAt) ?? ms(r.updatedAt),
    updatedBy: str(meta?.[id]?.updatedBy) ?? str(r.updatedBy),
  };
}

/// adminConfig get snapshot: { [docId]: row } (collection-target precedent),
/// also tolerating { items|prices|rows: {…} | […] }.
export function parsePrices(snapshot: unknown, itemMeta?: Record<string, ItemMeta> | null): PriceRow[] {
  const meta = itemMeta ?? undefined;
  if (!snapshot || typeof snapshot !== "object") return [];
  let src: unknown = snapshot;
  for (const k of ["items", "prices", "rows"]) {
    const inner = (snapshot as Record<string, unknown>)[k];
    if (inner && typeof inner === "object") { src = inner; break; }
  }
  const out: PriceRow[] = [];
  if (Array.isArray(src)) {
    for (const r of src) {
      const o = r as { id?: unknown } | null;
      const row = parseRow(str(o?.id) ?? "", r, meta);
      if (row) out.push(row);
    }
  } else {
    for (const [id, r] of Object.entries(src as Record<string, unknown>)) {
      const row = parseRow(id, r, meta);
      if (row) out.push(row);
    }
  }
  return out;
}

// ── Matrix ──────────────────────────────────────────────────────────────────

export type CellStatus = "active" | "scheduled" | "inactive" | "unavailable";
export interface MatrixRow {
  planId: PlanId;
  id: string;
  row: PriceRow | null;
  status: CellStatus;
}

export function rowStatus(row: PriceRow | null, now: number): CellStatus {
  if (!row) return "unavailable";
  if (!row.active) return "inactive";
  if (row.effectiveFrom !== null && row.effectiveFrom > now) return "scheduled";
  return "active";
}

export const STATUS_LABEL: Record<CellStatus, string> = {
  active: "Active",
  scheduled: "Launches later (unavailable now)",
  inactive: "Inactive",
  unavailable: "Unavailable in this region",
};

export function buildMatrix(rows: readonly PriceRow[], country: string, now: number): MatrixRow[] {
  return PLAN_IDS.map((planId) => {
    const id = docId(planId, country);
    const row = rows.find((r) => r.id === id) ?? null;
    return { planId, id, row, status: rowStatus(row, now) };
  });
}

// ── Draft + validation ──────────────────────────────────────────────────────

export interface Draft {
  monthly: string; // major units, as typed
  annual: string;
  active: boolean;
  effectiveFrom: number | null;
  notes: string;
}

export function draftFromRow(row: PriceRow | null, country: CountryDef): Draft {
  return {
    monthly: row ? minorToMajorInput(row.priceMonthly, country.minorUnitExponent) : "",
    annual: row ? minorToMajorInput(row.priceAnnual, country.minorUnitExponent) : "",
    active: row ? row.active : true,
    effectiveFrom: row?.effectiveFrom ?? null,
    notes: row?.notes ?? "",
  };
}

export type Errors = Record<string, string>;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const BRACKETS = /[<>＜＞]/;

/// Mirrors the server rules so errors show before the call.
export function validateDraft(d: Draft, country: CountryDef, opts: { protectedRow?: boolean } = {}): Errors {
  const e: Errors = {};
  const rules = CURRENCY_RULES[country.currency];
  if (!rules) {
    e.currency = `${country.currency} is not a supported billing currency.`;
    return e;
  }
  if (rules.exponent !== country.minorUnitExponent) {
    e.currency = `The registry exponent for ${country.currency} does not match the console's currency table.`;
    return e;
  }
  const exp = country.minorUnitExponent;
  const check = (key: "monthly" | "annual", label: string): number | null => {
    const max = key === "monthly" ? LIMITS.maxMonthly : LIMITS.maxAnnual;
    const raw = d[key];
    if (raw.trim() === "") { e[key] = `${label} price is required.`; return null; }
    const v = majorToMinor(raw, exp);
    if (v === null) {
      e[key] = exp === 0 ? `${label} price must be a whole number.` : `${label} price must be a number with at most ${exp} decimal places.`;
      return null;
    }
    if (v < rules.minMinor) { e[key] = `${label} price is below the payment minimum of ${formatMinor(rules.minMinor, country.currency, { exponent: exp, exact: true })}.`; return null; }
    if (v > max) { e[key] = `${label} price is above the allowed maximum of ${formatMinor(max, country.currency, { exponent: exp })}.`; return null; }
    return v;
  };
  const m = check("monthly", "Monthly");
  const a = check("annual", "Annual");
  if (m !== null && a !== null) {
    if (a < m) e.annual = "Annual price cannot be lower than one month.";
    else if (a > m * LIMITS.annualMaxMonths) e.annual = `Annual price cannot exceed ${LIMITS.annualMaxMonths} months of the monthly price.`;
  }
  if (exp === 3) {
    for (const [k, label] of [["monthly", "Monthly"], ["annual", "Annual"]] as const) {
      const v = e[k] ? null : majorToMinor(d[k], exp);
      if (v !== null && v % 10 !== 0) e[k] = `${label} price for ${country.currency} must end in 0 (the payment gateway rule for 3-decimal currencies).`;
    }
  }
  if (opts.protectedRow && !d.active) e.active = IN_PROTECTED_REASON;
  if (d.effectiveFrom !== null && !Number.isFinite(d.effectiveFrom)) e.effectiveFrom = "Effective from is not a valid date and time.";
  if (BRACKETS.test(d.notes)) e.notes = "Notes cannot contain < or > (plain text only).";
  else if (/[\n\r]/.test(d.notes)) e.notes = "Notes must be a single line.";
  else if (CONTROL.test(d.notes)) e.notes = "Notes contain control characters.";
  else if (d.notes.trim().length > NOTES_MAX) e.notes = `Notes must be ${NOTES_MAX} characters or fewer (now ${d.notes.trim().length}).`;
  return e;
}

export const hasErrors = (e: Errors): boolean => Object.keys(e).length > 0;

export interface Parsed { priceMonthly: number; priceAnnual: number }
export function parseDraftPrices(d: Draft, country: CountryDef): Parsed | null {
  const m = majorToMinor(d.monthly, country.minorUnitExponent);
  const a = majorToMinor(d.annual, country.minorUnitExponent);
  return m === null || a === null ? null : { priceMonthly: m, priceAnnual: a };
}

// ── Payload builders (adminConfig apply patch: { [docId]: row | null }) ─────

export type PricesPatch = Record<string, Record<string, unknown> | null>;

/// Complete row (create or edit). A cleared effectiveFrom is an explicit null
/// on edit (precedent: Future). `notes` is always sent (empty string clears).
export function buildUpsertPatch(planId: PlanId, country: CountryDef, d: Draft, existing: PriceRow | null): PricesPatch {
  const p = parseDraftPrices(d, country);
  if (!p) throw new Error("Invalid prices");
  const row: Record<string, unknown> = {
    planId,
    country: country.code,
    currency: country.currency,
    priceMonthly: p.priceMonthly,
    priceAnnual: p.priceAnnual,
    active: d.active,
    notes: d.notes.trim(),
  };
  if (d.effectiveFrom !== null) row.effectiveFrom = d.effectiveFrom;
  else if (existing && existing.effectiveFrom !== null) row.effectiveFrom = null;
  return { [docId(planId, country.code)]: row };
}

export function deactivatePatch(row: PriceRow, country: CountryDef): PricesPatch {
  if (isProtectedCountry(country.code)) throw new Error(IN_PROTECTED_REASON);
  return buildUpsertPatch(row.planId, country, { ...draftFromRow(row, country), active: false }, row);
}

export function deletePatch(planId: PlanId, country: string): PricesPatch {
  if (isProtectedCountry(country)) throw new Error(IN_PROTECTED_REASON);
  return { [docId(planId, country)]: null };
}

/// Typed-confirmation phrase: the row's doc id, e.g. "gold_US".
export const confirmPhrase = (planId: string, country: string): string => docId(planId, country);

// ── Change summary (shown in the typed confirmation) ────────────────────────

export function describeChange(existing: PriceRow | null, d: Draft, country: CountryDef, locale?: string): string[] {
  const p = parseDraftPrices(d, country);
  if (!p) return [];
  const exp = country.minorUnitExponent;
  const lines: string[] = [];
  if (!existing || existing.priceMonthly !== p.priceMonthly) lines.push(`Monthly: ${priceChangeText(existing?.priceMonthly ?? null, p.priceMonthly, country.currency, exp, locale)}`);
  if (!existing || existing.priceAnnual !== p.priceAnnual) lines.push(`Annual: ${priceChangeText(existing?.priceAnnual ?? null, p.priceAnnual, country.currency, exp, locale)}`);
  if (!existing || existing.active !== d.active) lines.push(d.active ? "Offered in this country" : "Not offered in this country");
  if ((existing?.effectiveFrom ?? null) !== d.effectiveFrom) {
    lines.push(d.effectiveFrom === null ? "Effective immediately" : `Launch date (whole row starts) ${new Date(d.effectiveFrom).toLocaleString()}`);
  }
  if ((existing?.notes ?? "") !== d.notes.trim()) lines.push("Notes updated");
  return lines;
}

export function isChanged(existing: PriceRow | null, d: Draft, country: CountryDef): boolean {
  if (!existing) return true;
  return describeChange(existing, d, country).length > 0;
}

// ── User-facing preview ─────────────────────────────────────────────────────

export function previewLines(country: CountryDef, p: Parsed | null, active: boolean, locale?: string): { monthly: string; annual: string; billing: string } {
  const loc = locale ?? country.defaultLocale;
  if (!p || !active) {
    return { monthly: "Not available in your region", annual: "Not available in your region", billing: `Billing country: ${country.name}` };
  }
  const f = (v: number) => formatMinor(v, country.currency, { exponent: country.minorUnitExponent, locale: loc });
  return {
    monthly: `${f(p.priceMonthly)} / month`,
    annual: `${f(p.priceAnnual)} / year`,
    billing: `Prices shown for ${country.name}. Billing country: ${country.name}, charged in ${country.currency}.`,
  };
}

// ── Permissions ─────────────────────────────────────────────────────────────

export const PRICING_READ_PERMISSION = "plans.read" as const;
export const PRICING_WRITE_PERMISSION = "plans.modify" as const;
export const HISTORY_PERMISSION = "config.read" as const;
export const ROLLBACK_PERMISSION = "plans.modify" as const;

export function pricingAccess(can: (p: "plans.read" | "plans.modify" | "config.read") => boolean) {
  return {
    canView: can(PRICING_READ_PERMISSION),
    canEdit: can(PRICING_WRITE_PERMISSION),
    /// Config History page needs config.read; rollback of planPrices needs plans.modify (not config.activate).
    canOpenHistory: can(HISTORY_PERMISSION),
    canRollback: can(ROLLBACK_PERMISSION),
  };
}

// ── Revenue helpers (never sum across currencies) ───────────────────────────

export interface MoneyLike { amount: number | null; currency: string }
/// Sum minor-unit amounts per currency. Missing currency counts as INR (old rows).
export function sumByCurrency(rows: readonly MoneyLike[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (r.amount === null || !Number.isFinite(r.amount)) continue;
    const c = (r.currency || "INR").toUpperCase();
    out[c] = (out[c] ?? 0) + r.amount;
  }
  return out;
}

/// "₹99 + $4.99": one figure per currency, deterministic order (INR first).
export function formatTotals(totals: Record<string, number>): string {
  const keys = Object.keys(totals).sort((a, b) => (a === "INR" ? -1 : b === "INR" ? 1 : a.localeCompare(b)));
  if (keys.length === 0) return "—";
  return keys.map((k) => formatMinor(totals[k], k, { locale: k === "INR" ? "en-IN" : "en-US" })).join(" + ");
}

export interface CurrencyTotalsLike { captured: number; refunded: number; payments?: number }
/// One figure per currency from the backend byCurrency maps (never summed).
export function formatByCurrency(
  by: Record<string, CurrencyTotalsLike> | null | undefined,
  field: "captured" | "refunded" | "net",
  exps?: Record<string, number> | null,
): string {
  const totals: Record<string, number> = {};
  for (const [c, t] of Object.entries(by ?? {})) totals[c] = field === "net" ? t.captured - t.refunded : t[field];
  const keys = Object.keys(totals).sort((a, b) => (a === "INR" ? -1 : b === "INR" ? 1 : a.localeCompare(b)));
  if (keys.length === 0) return "—";
  return keys.map((k) => formatMinor(totals[k], k, { exponent: exps?.[k], locale: k === "INR" ? "en-IN" : "en-US" })).join(" + ");
}

/// Ledger amount in its own currency (old rows without currency = INR).
export function formatLedgerAmount(minor: number | null | undefined, currency: string | null | undefined, exact = false): string {
  const c = (currency || "INR").toUpperCase();
  return formatMinor(minor, c, { exact, locale: c === "INR" ? "en-IN" : "en-US" });
}

/// Which controls a role sees. Read-only users (plans.read) can browse, filter,
/// preview and export; every control that changes anything needs plans.modify.
export function pricingUi(access: { canView: boolean; canEdit: boolean; canOpenHistory: boolean; canRollback: boolean }) {
  return {
    showTable: access.canView,
    showPreview: access.canView,
    showExport: access.canView,
    showHistory: access.canView,
    showEditControls: access.canView && access.canEdit,
    showBulk: access.canView && access.canEdit,
    showImport: access.canView && access.canEdit,
    showPolicyEditing: access.canView && access.canEdit,
    showPublish: access.canView && access.canEdit,
    showRollback: access.canView && access.canRollback,
  };
}
