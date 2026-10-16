import test from "node:test";
import assert from "node:assert/strict";
import { planFallback } from "../features/revenue/planFallback";

test("a plan with no compiled fallback does not throw and yields zeros", () => {
  const fb = planFallback({ fallback: null });
  assert.equal(fb.priceMonthly, 0);
  assert.equal(fb.priceAnnual, 0);
  assert.equal(fb.durationDays, 30);
  assert.equal(fb.annualDurationDays, 365);
});

test("a compiled fallback is returned as is", () => {
  const f = { priceMonthly: 4900, priceAnnual: 49900, durationDays: 30, annualDurationDays: 365 };
  assert.equal(planFallback({ fallback: f }), f);
});

test("the table expression no longer throws for a stored-null, fallback-null plan", () => {
  const p = { priceMonthly: null as number | null, fallback: null };
  assert.equal(p.priceMonthly ?? planFallback(p).priceMonthly, 0);
});
