// Country pricing: BULK FILL from a base price with a MANUAL rate table.
// No live FX anywhere: the admin types the rates (target-currency units per 1
// unit of the base currency) and they live only in the local draft / exported
// text. All arithmetic is exact (BigInt rationals), never floating point.
// Pure: nothing enters the draft until the admin confirms the preview.
import { docId, type CountryDef, type PlanId } from "./logic";
import type { PricingRegistry } from "./registry";
import { validateRowValues, hasRuleErrors, strictMajorToMinor, type RowValues } from "./rules";
import type { RowEdits } from "./table";

export const RATES_NOTICE = "Rates are manual and are not fetched from any exchange-rate service. Verify them before publishing: a wrong rate publishes a wrong price.";

// ── Exact decimals ──────────────────────────────────────────────────────────

export interface Decimal { n: bigint; scale: number }

/// "83.5" -> {835, 1}. Positive plain decimals only, at most 18 digits total.
export function parseDecimal(raw: string): Decimal | null {
  const s = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(s) || s.replace(".", "").length > 18) return null;
  const [w, f = ""] = s.split(".");
  const n = BigInt(w + f);
  return n > BigInt(0) ? { n, scale: f.length } : null;
}

const pow10 = (k: number): bigint => BigInt("1" + "0".repeat(k));

// ── Rounding rules ──────────────────────────────────────────────────────────

export type RoundingRule = { kind: "minor" } | { kind: "whole" } | { kind: "charm" } | { kind: "step"; step: number };

export const ROUNDING_OPTIONS: { value: string; label: string }[] = [
  { value: "minor", label: "Nearest minor unit (cent / paisa)" },
  { value: "whole", label: "Whole currency units (e.g. 5.00)" },
  { value: "charm", label: "Ends in .99 (whole units: ends in 9)" },
  { value: "step:5", label: "Nearest 5 units" },
  { value: "step:10", label: "Nearest 10 units" },
  { value: "step:50", label: "Nearest 50 units" },
  { value: "step:100", label: "Nearest 100 units" },
  { value: "step:1000", label: "Nearest 1,000 units" },
];

export function parseRounding(s: string): RoundingRule {
  if (s === "whole") return { kind: "whole" };
  if (s === "charm") return { kind: "charm" };
  const m = /^step:(\d+)$/.exec(s);
  if (m && Number(m[1]) > 0) return { kind: "step", step: Number(m[1]) };
  return { kind: "minor" };
}

/// Nearest multiple of `s` (half up) of the rational num/den, then offset.
function nearest(num: bigint, den: bigint, s: bigint, offset = BigInt(0)): bigint {
  // k = round((num/den - offset) / s) clamped to >= 0
  const two = BigInt(2);
  const top = num - offset * den;
  if (top <= BigInt(0)) return offset;
  const k = (two * top + den * s) / (two * den * s);
  return k * s + offset;
}

/// Round the rational minor-unit value num/den to an integer minor amount.
/// Never below one rounding step (a price of 0 is not a price). 3-decimal
/// currencies always end in 0 (gateway rule), so they round in tens.
export function roundMinor(num: bigint, den: bigint, exponent: number, rule: RoundingRule): bigint {
  const unit = pow10(exponent);
  const ten = BigInt(10);
  let out: bigint;
  let floor: bigint;
  switch (rule.kind) {
    case "whole": out = nearest(num, den, unit); floor = unit; break;
    case "step": { const s = unit * BigInt(rule.step); out = nearest(num, den, s); floor = s; break; }
    case "charm": {
      if (exponent === 0) {
        // value < 10: no 9-ending price below 10, keep whole units
        if (num < den * ten) { out = nearest(num, den, BigInt(1)); floor = BigInt(1); }
        else { out = nearest(num, den, ten, BigInt(9)); floor = BigInt(9); }
      } else {
        const off = exponent === 3 ? unit - ten : unit - BigInt(1);
        out = nearest(num, den, unit, off); floor = off;
      }
      break;
    }
    default:
      if (exponent === 3) { out = nearest(num, den, ten); floor = ten; }
      else { out = nearest(num, den, BigInt(1)); floor = BigInt(1); }
  }
  if (exponent === 3 && out % ten !== BigInt(0)) out = nearest(out, BigInt(1), ten);
  return out < floor ? floor : out;
}

/// base minor units x rate x multiplier -> target minor units (exact, rounded by rule).
export function convertMinor(
  baseMinor: number, baseExp: number, rate: Decimal, mult: Decimal, targetExp: number, rule: RoundingRule,
): number | null {
  const num = BigInt(baseMinor) * rate.n * mult.n * pow10(targetExp);
  const den = pow10(baseExp + rate.scale + mult.scale);
  const r = roundMinor(num, den, targetExp, rule);
  return r <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(r) : null;
}

// ── Settings (persisted in the local draft only) ────────────────────────────

export interface BulkSettings {
  baseCountry: string;
  /// major units as typed
  baseMonthly: string;
  baseAnnual: string;
  /// currency -> rate text (target units per 1 base-currency unit)
  rates: Record<string, string>;
  /// country -> multiplier text (default 1), e.g. "0.6" for a lower-income market
  multipliers: Record<string, string>;
  rounding: string;
}

export const DEFAULT_BULK: BulkSettings = { baseCountry: "IN", baseMonthly: "", baseAnnual: "", rates: {}, multipliers: {}, rounding: "whole" };

export function sanitizeBulk(raw: unknown): BulkSettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mapOf = (v: unknown): Record<string, string> => {
    const out: Record<string, string> = {};
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) if (typeof x === "string" && x.length <= 24) out[k] = x;
    return out;
  };
  return {
    baseCountry: typeof o.baseCountry === "string" && /^[A-Z]{2}$/.test(o.baseCountry) ? o.baseCountry : "IN",
    baseMonthly: typeof o.baseMonthly === "string" ? o.baseMonthly.slice(0, 24) : "",
    baseAnnual: typeof o.baseAnnual === "string" ? o.baseAnnual.slice(0, 24) : "",
    rates: mapOf(o.rates),
    multipliers: mapOf(o.multipliers),
    rounding: typeof o.rounding === "string" ? o.rounding : "whole",
  };
}

// ── Preview ─────────────────────────────────────────────────────────────────

export type BulkStatus = "new" | "changed" | "unchanged" | "invalid" | "skipped";

export interface BulkPreviewRow {
  code: string;
  name: string;
  currency: string;
  exponent: number;
  status: BulkStatus;
  monthly: number | null;
  annual: number | null;
  before: RowValues | null;
  errors: string[];
  warnings: string[];
}

export interface BulkPreview {
  rows: BulkPreviewRow[];
  /// settings-level problems (no preview can be computed)
  errors: string[];
  counts: Record<BulkStatus, number>;
}

export interface BulkContext {
  registry: PricingRegistry;
  gateway: ReadonlySet<string>;
  countryByCode: (code: string) => CountryDef | undefined;
  /// existing effective values (draft over server) for the product
  existing: (code: string) => RowValues | null;
}

const emptyCounts = (): Record<BulkStatus, number> => ({ new: 0, changed: 0, unchanged: 0, invalid: 0, skipped: 0 });

function baseOf(s: BulkSettings, ctx: BulkContext): { country: CountryDef; monthly: number; annual: number } | string {
  const country = ctx.countryByCode(s.baseCountry);
  if (!country) return "Choose a valid base country.";
  const m = strictMajorToMinor(s.baseMonthly, country.minorUnitExponent);
  const a = strictMajorToMinor(s.baseAnnual, country.minorUnitExponent);
  if (m === null || m <= 0) return `The base monthly price must be a positive number with at most ${country.minorUnitExponent} decimals.`;
  if (a === null || a <= 0) return `The base annual price must be a positive number with at most ${country.minorUnitExponent} decimals.`;
  return { country, monthly: m, annual: a };
}

/// Rate for a currency: typed value; the base currency defaults to 1.
function rateFor(s: BulkSettings, currency: string, baseCurrency: string): Decimal | null {
  const typed = s.rates[currency];
  if (typed === undefined || typed.trim() === "") return currency === baseCurrency ? parseDecimal("1") : null;
  return parseDecimal(typed);
}

/// Expected monthly minor units for a country from the base price + manual
/// rates + multiplier (unrounded to the nearest minor unit); null when unknown.
export function expectedMonthly(s: BulkSettings, country: CountryDef, ctx: BulkContext): number | null {
  const base = baseOf(s, ctx);
  if (typeof base === "string") return null;
  const rate = rateFor(s, country.currency, base.country.currency);
  const mult = parseDecimal(s.multipliers[country.code] ?? "1") ?? parseDecimal("1")!;
  if (!rate) return null;
  return convertMinor(base.monthly, base.country.minorUnitExponent, rate, mult, country.minorUnitExponent, { kind: "minor" });
}

/// Computes every price the fill WOULD set for `targets`; nothing is applied.
export function previewBulk(s: BulkSettings, targets: readonly CountryDef[], ctx: BulkContext): BulkPreview {
  const counts = emptyCounts();
  const base = baseOf(s, ctx);
  if (typeof base === "string") return { rows: [], errors: [base], counts };
  const rule = parseRounding(s.rounding);
  const rows: BulkPreviewRow[] = [];
  for (const c of targets) {
    const row: BulkPreviewRow = {
      code: c.code, name: c.name, currency: c.currency, exponent: c.minorUnitExponent, status: "skipped",
      monthly: null, annual: null, before: ctx.existing(c.code), errors: [], warnings: [],
    };
    rows.push(row);
    if (c.code === base.country.code) { row.warnings.push("Base country (not changed)."); counts.skipped++; continue; }
    const rate = rateFor(s, c.currency, base.country.currency);
    if (!rate) { row.status = "invalid"; row.errors.push(`No valid rate for ${c.currency}. Type the rate in the rate table.`); counts.invalid++; continue; }
    const mult = parseDecimal(s.multipliers[c.code] ?? "") ?? (s.multipliers[c.code]?.trim() ? null : parseDecimal("1"));
    if (!mult) { row.status = "invalid"; row.errors.push(`Multiplier "${s.multipliers[c.code]}" is not a positive number.`); counts.invalid++; continue; }
    const m = convertMinor(base.monthly, base.country.minorUnitExponent, rate, mult, c.minorUnitExponent, rule);
    const a = convertMinor(base.annual, base.country.minorUnitExponent, rate, mult, c.minorUnitExponent, rule);
    if (m === null || a === null) { row.status = "invalid"; row.errors.push("The computed price is too large."); counts.invalid++; continue; }
    row.monthly = m;
    row.annual = a;
    const active = row.before ? row.before.active : true;
    const res = validateRowValues(c, { priceMonthly: m, priceAnnual: a, active }, { registry: ctx.registry, gateway: ctx.gateway });
    row.warnings.push(...res.warnings);
    if (hasRuleErrors(res)) {
      row.status = "invalid";
      row.errors.push(...Object.values(res.errors));
      counts.invalid++;
      continue;
    }
    if (row.before && row.before.priceMonthly === m && row.before.priceAnnual === a) { row.status = "unchanged"; counts.unchanged++; }
    else if (row.before) { row.status = "changed"; counts.changed++; }
    else { row.status = "new"; counts.new++; }
  }
  return { rows, errors: [], counts };
}

/// The draft edits a confirmed preview produces (new + changed rows only;
/// an existing row keeps its available flag).
export function bulkEdits(planId: PlanId, preview: BulkPreview): RowEdits {
  const out: RowEdits = {};
  for (const r of preview.rows) {
    if ((r.status === "new" || r.status === "changed") && r.monthly !== null && r.annual !== null) {
      out[docId(planId, r.code)] = { priceMonthly: r.monthly, priceAnnual: r.annual, active: r.before ? r.before.active : true };
    }
  }
  return out;
}

// ── Rate table text (export / paste) ────────────────────────────────────────

/// "CUR,rate" lines; unknown / malformed lines are reported, never guessed.
export function parseRatesText(text: string, knownCurrencies: ReadonlySet<string>): { rates: Record<string, string>; errors: string[] } {
  const rates: Record<string, string> = {};
  const errors: string[] = [];
  text.replace(/^﻿/, "").split(/\r\n|\n|\r/).forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith("#") || /^currency\b/i.test(t)) return;
    const m = /^([A-Za-z]{3})\s*[,;=:\t ]\s*([0-9.]+)$/.exec(t);
    if (!m) { errors.push(`Line ${i + 1}: expected "CUR,rate" (for example USD,0.012).`); return; }
    const cur = m[1].toUpperCase();
    if (!knownCurrencies.has(cur)) { errors.push(`Line ${i + 1}: unknown currency ${cur}.`); return; }
    if (!parseDecimal(m[2])) { errors.push(`Line ${i + 1}: rate ${m[2]} must be a positive number.`); return; }
    rates[cur] = m[2];
  });
  return { rates, errors };
}

export function ratesToText(rates: Record<string, string>): string {
  return ["currency,rate", ...Object.keys(rates).sort().filter((k) => rates[k].trim()).map((k) => `${k},${rates[k].trim()}`)].join("\n") + "\n";
}

/// Distinct currencies of `countries` (stable order) that still lack a typed rate.
export function currenciesMissingRate(s: BulkSettings, countries: readonly CountryDef[], registry: PricingRegistry): string[] {
  const base = registry.countries.find((c) => c.code === s.baseCountry)?.currency ?? "";
  const out = new Set<string>();
  for (const c of countries) if (c.currency !== base && !(s.rates[c.currency] && parseDecimal(s.rates[c.currency]))) out.add(c.currency);
  return [...out].sort();
}

