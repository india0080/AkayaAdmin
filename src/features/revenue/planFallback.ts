import type { PlanRow } from "./types";

/**
 * Products without a compiled INR fallback (App Premium, Floating System
 * Premium, All Access) come back with `fallback: null`. The Plans table used
 * `p.priceMonthly ?? p.fallback.priceMonthly` and crashed the whole page
 * ("Cannot read properties of null (reading 'priceMonthly')") on production
 * 2026-10-06 as soon as the new server listed them.
 */
const NO_FALLBACK = { priceMonthly: 0, priceAnnual: 0, durationDays: 30, annualDurationDays: 365 };

export function planFallback(p: Pick<PlanRow, "fallback">): NonNullable<PlanRow["fallback"]> {
  return p.fallback ?? NO_FALLBACK;
}
