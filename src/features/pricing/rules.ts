// Country pricing: price validation on MINOR units (mirror of the server's
// validatePriceRow in akaya_ai/functions/src/pricing.ts) plus soft warnings.
// Pure. The server re-validates everything and is the source of truth.
import { formatMinor, majorToMinor, minorToMajorInput, type CountryDef } from "./logic";
import { currencyInfo, type PricingRegistry } from "./registry";

export interface RowValues { priceMonthly: number; priceAnnual: number; active: boolean }

export interface RuleResult {
  /// field -> message (monthly | annual | active | currency)
  errors: Record<string, string>;
  warnings: string[];
}

export const hasRuleErrors = (r: RuleResult): boolean => Object.keys(r.errors).length > 0;

/// Soft-warning thresholds (never block publishing).
export const WARN = {
  /// annual / monthly outside this band is unusual (12 = no discount, ~10 = typical)
  annualRatioMin: 6,
  annualRatioMax: 12.5,
  /// price vs the manual-rate expectation (rate x base price)
  outlierLow: 0.25,
  outlierHigh: 4,
} as const;

export interface RuleContext {
  registry: PricingRegistry;
  gateway: ReadonlySet<string>;
  /// Optional expectation from the manual rate table: expected monthly minor units for this country.
  expectedMonthlyMinor?: number | null;
}

const money = (minor: number, c: CountryDef, reg: PricingRegistry): string =>
  formatMinor(minor, c.currency, { exponent: currencyInfo(reg, c.currency, c.minorUnitExponent).exponent, exact: true, locale: "en-US" });

/// Hard rules (blocking) + soft warnings for one (country, monthly, annual, active).
export function validateRowValues(country: CountryDef, v: RowValues, ctx: RuleContext): RuleResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];
  const reg = ctx.registry;
  const cur = currencyInfo(reg, country.currency, country.minorUnitExponent);
  if (cur.exponent !== country.minorUnitExponent) {
    errors.currency = `The registry exponent for ${country.currency} does not match the country table.`;
    return { errors, warnings };
  }
  const L = reg.limits;
  const check = (key: "monthly" | "annual", label: string, minor: number, max: number) => {
    if (!Number.isInteger(minor)) { errors[key] = `${label} price must be a whole number of minor units.`; return; }
    if (minor < cur.minAmount) { errors[key] = `${label} price is below the minimum of ${money(cur.minAmount, country, reg)}.`; return; }
    if (minor > max) { errors[key] = `${label} price is above the allowed maximum of ${money(max, country, reg)}.`; return; }
    if (cur.exponent === 3 && minor % 10 !== 0) errors[key] = `${label} price for ${country.currency} must end in 0 (gateway rule for 3-decimal currencies).`;
  };
  check("monthly", "Monthly", v.priceMonthly, L.maxMonthly);
  check("annual", "Annual", v.priceAnnual, L.maxAnnual);
  if (!errors.monthly && !errors.annual) {
    if (v.priceAnnual < v.priceMonthly) errors.annual = "Annual price cannot be lower than the monthly price.";
    else if (v.priceAnnual > v.priceMonthly * L.annualMaxMonths) errors.annual = `Annual price cannot exceed ${L.annualMaxMonths} times the monthly price.`;
  }
  if (country.code === "IN" && !v.active) errors.active = "India (INR) is the fallback price list and can never be made unavailable.";

  if (!hasKeys(errors)) {
    const ratio = v.priceAnnual / v.priceMonthly;
    if (ratio < WARN.annualRatioMin || ratio > WARN.annualRatioMax) {
      warnings.push(`Annual is ${ratio.toFixed(1)}x the monthly price (usually about 10 to 12x). Check for a typo.`);
    }
    const exp = ctx.expectedMonthlyMinor;
    if (typeof exp === "number" && exp > 0) {
      const r = v.priceMonthly / exp;
      if (r < WARN.outlierLow || r > WARN.outlierHigh) {
        warnings.push(`Monthly ${money(v.priceMonthly, country, reg)} is far from the base-price estimate ${money(exp, country, reg)} (${r.toFixed(2)}x).`);
      }
    }
  }
  if (ctx.gateway.size > 0 && !ctx.gateway.has(country.currency)) {
    warnings.push(`${country.currency} is not in the payment gateway currency list: the payment gateway may refuse this currency.`);
  }
  return { errors, warnings };
}

const hasKeys = (o: object): boolean => Object.keys(o).length > 0;

/// Strict major->minor for CSV / bulk: plain digits with an optional dot only
/// (no thousands separators: "1,5" is ambiguous between locales).
export function strictMajorToMinor(raw: string, exponent: number): number | null {
  const s = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return majorToMinor(s, exponent);
}

/// Typed text (major units) -> validated minor units for one country. Used by
/// the inline editor; null minor = the text is not a valid amount.
export function parseMajorInput(raw: string, country: CountryDef): { minor: number | null; error: string | null } {
  const t = raw.trim();
  if (t === "") return { minor: null, error: "Required" };
  const m = majorToMinor(t, country.minorUnitExponent);
  if (m === null) {
    return { minor: null, error: country.minorUnitExponent === 0 ? "Whole number only" : `Max ${country.minorUnitExponent} decimals` };
  }
  return { minor: m, error: null };
}

export { minorToMajorInput };
