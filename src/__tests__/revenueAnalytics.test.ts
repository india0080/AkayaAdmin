import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryLabel, revenueSnapshotMatches, type RevenueData } from "../features/revenue/revenueTypes";
test("revenue snapshot cannot be relabelled under new filters", () => {
  const d = { days: 30, currency: "INR", transactions: { page: 0, status: "all" } } as RevenueData;
  assert.equal(revenueSnapshotMatches(d, 30, "INR", 0, "all"), true);
  assert.equal(revenueSnapshotMatches(d, 7, "INR", 0, "all"), false);
  assert.equal(revenueSnapshotMatches(d, 30, "USD", 0, "all"), false);
  assert.equal(revenueSnapshotMatches(d, 30, "INR", 1, "all"), false);
  assert.equal(revenueSnapshotMatches(d, 30, "INR", 0, "failed"), false);
});
test("refund category display stays readable", () => assert.equal(categoryLabel("service_issue"), "service issue"));
