import { test } from "node:test";
import assert from "node:assert/strict";
import { retainedTotal, type TrafficData } from "../features/insights/trafficTypes";

test("dashboard retention weights eligible users rather than averaging cohort percentages", () => {
  const d = { cohorts: [
    { cohort: "2026-08-01", users: 100, retention: [{ returned: 50, eligible: 100, percent: 50 }, null, null] },
    { cohort: "2026-08-02", users: 10, retention: [{ returned: 10, eligible: 10, percent: 100 }, null, null] },
  ] } as TrafficData;
  const r = retainedTotal(d, 0)!;
  assert.equal(r.eligible, 110); assert.equal(r.returned, 60); assert.equal(r.percent, 60 / 110 * 100);
});
test("immature cohorts do not enter the retention denominator", () => {
  const d = { cohorts: [
    { cohort: "2026-08-01", users: 100, retention: [null, { returned: 20, eligible: 100, percent: 20 }, null] },
    { cohort: "2026-10-08", users: 1000, retention: [null, null, null] },
  ] } as TrafficData;
  assert.equal(retainedTotal(d, 1)!.percent, 20); assert.equal(retainedTotal(d, 2), null);
});
test("no signup cohorts gives an unknown dashboard retention", () => {
  assert.equal(retainedTotal({ cohorts: [] } as unknown as TrafficData, 0), null);
});
