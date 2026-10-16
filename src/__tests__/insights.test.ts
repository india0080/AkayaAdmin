// Usage totals across days and money formatting for estimates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { modelTotals, uptimeLabel, usd, type DayRollup } from "../features/insights/types";

test("probe uptime label", () => {
  assert.equal(uptimeLabel([]), null);
  assert.equal(uptimeLabel([{ status: "reachable" }, { status: "unreachable" }, { status: "reachable" }]), "2/3 reachable");
});

const day = (d: string, byModel: DayRollup["byModel"]): DayRollup => ({
  day: d, requests: 0, served: 0, failed: 0, uniqueUsers: 0, estOutTokens: 0, estCostUsd: 0, unpricedRequests: 0,
  byModel, byPlan: {}, byOutcome: {}, generatedAt: null,
});
const m = (requests: number, cost: number | null) => ({ requests, served: requests, failed: 0, outChars: 0, estOutTokens: requests * 10, estCostUsd: cost, ttftP50Ms: null, ttftP95Ms: null });

test("model totals add across days; an unpriced day makes the total unknown, not lower", () => {
  const t = modelTotals([day("a", { "x/y": m(2, 0.5), "p/q": m(6, null) }), day("b", { "x/y": m(3, 0.25) })]);
  assert.deepEqual(t.map((r) => r.model), ["p/q", "x/y"], "busiest first");
  assert.equal(t[1].requests, 5);
  assert.equal(t[1].estCostUsd, 0.75);
  assert.equal(t[0].estCostUsd, null);
});

test("usd formatting", () => {
  assert.equal(usd(null), "—");
  assert.equal(usd(0.004), "<$0.01");
  assert.equal(usd(12.345), "$12.35");
  assert.equal(usd(0), "$0.00");
});
