import { test } from "node:test";
import assert from "node:assert/strict";
import { pnlTotals, shares, topConsumer, weekNet } from "../features/insights/dashboardTypes";
import { CHALLENGE, challengeEconomics, daysLeft, progress } from "../features/growth/referralLogic";
import { NAV } from "../shell/nav";
import { PENDING } from "../lib/pending";

test("shares always sum to 100 and handle zero totals", () => {
  const s = shares([{ key: "daily", value: 1 }, { key: "monthly", value: 1 }, { key: "yearly", value: 1 }]);
  assert.equal(s.reduce((t, x) => t + x.pct, 0), 100);
  assert.deepEqual(shares([{ key: "a", value: 0 }]).map((x) => x.pct), [0]);
});

test("profit & loss totals and margin", () => {
  const weeks = [{ week: "w1", revenue: 1000, aiCost: 200, serverCost: 100, gatewayFees: 20 }, { week: "w2", revenue: 0, aiCost: 50, serverCost: 0, gatewayFees: 0 }];
  assert.deepEqual(pnlTotals(weeks), { revenue: 1000, costs: 370, net: 630, marginPct: 63 });
  assert.equal(weekNet(weeks[1]), -50);
  assert.equal(pnlTotals([]).marginPct, null);
});

test("top consumer is the busiest integration", () => {
  const r = (id: string, calls24h: number) => ({ id, name: id, calls24h, errorRate: 0, p95Ms: null, quotaPct: null, trend: [] });
  assert.equal(topConsumer([r("a", 3), r("openrouter", 9)])?.id, "openrouter");
  assert.equal(topConsumer([]), null);
});

test("90-day challenge rules", () => {
  assert.equal(CHALLENGE.targetPaid, 30);
  const now = Date.UTC(2026, 0, 31);
  assert.equal(daysLeft(Date.UTC(2026, 0, 1), now), 60);
  assert.equal(daysLeft(Date.UTC(2025, 0, 1), now), 0);
  assert.equal(progress({ referred: 100, paid: 29 }).qualified, false);
  assert.equal(progress({ referred: 100, paid: 30 }).qualified, true);
  assert.equal(progress({ referred: 40, paid: 7 }).nextMilestone, 10);
  // 30 paid at ₹4,999 covers the ₹75,000 gift cap after GST + gateway fees.
  assert.ok(challengeEconomics(30).surplusAfterGift > 0);
  assert.ok(challengeEconomics(20).surplusAfterGift < 30000);
});

test("every pending contract names a callable and collections", () => {
  for (const [k, c] of Object.entries(PENDING)) {
    assert.ok(c.callable.startsWith("admin"), k);
    assert.ok(c.collections.length > 0, k);
  }
  assert.ok(NAV.some((g) => g.routes.some((r) => r.href === "/dashboard/referral")));
});

test("uptime and p95 helpers", async () => {
  const { uptimePct, p95 } = await import("../features/insights/dashboardTypes");
  assert.equal(uptimePct([{ status: "reachable" }, { status: "server_error" }, { status: "inactive" }]), 50);
  assert.equal(uptimePct([]), null);
  assert.equal(p95([1, 2, 3, 4, 100]), 100);
  assert.equal(p95([]), null);
});
