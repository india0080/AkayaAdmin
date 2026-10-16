// Recurring (auto-renewing) subscriptions console logic (docs/subscription/14).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECURRING_PRODUCTS,
  annualFromMonthlyPaise,
  buildAllowListPatch,
  buildRecurringMasterPatch,
  buildRecurringProductPatch,
  ledgerTypeLabel,
  parseUidList,
  readRecurringConfig,
  recurringMasterConfirm,
  recurringStatus,
} from "../features/revenue/recurringLogic";
import { parseRupeesToPaise } from "../features/revenue/logic";

test("config reads OFF by default and for malformed values", () => {
  for (const snap of [null, undefined, {}, { recurring: null }, { "recurring.enabled": "true" }]) {
    const v = readRecurringConfig(snap as never);
    assert.equal(v.enabled, false);
    assert.equal(v.graceDays, 3);
    assert.deepEqual(v.allowUids, []);
    assert.ok(RECURRING_PRODUCTS.every((p) => v.products[p.key].enabled === false && v.products[p.key].introPaise === 100));
  }
});

test("config reads nested and dotted snapshots", () => {
  const nested = readRecurringConfig({ recurring: { enabled: true, graceDays: 5, allowUids: ["a".repeat(28)], products: { appPremium: { enabled: true, introAmountInr: 100 }, allAccess: { introAmountInr: 50 } } } });
  assert.equal(nested.enabled, true);
  assert.equal(nested.graceDays, 5);
  assert.equal(nested.products.appPremium.enabled, true);
  assert.equal(nested.products.allAccess.introPaise, 100, "below the 100 paise minimum reads as the default");
  const dotted = readRecurringConfig({ "recurring.enabled": true, "recurring.products.floatingPremium.enabled": true, "recurring.products.floatingPremium.introAmountInr": 200 });
  assert.equal(dotted.enabled, true);
  assert.equal(dotted.products.floatingPremium.introPaise, 200);
  assert.equal(readRecurringConfig({ recurring: { graceDays: 99 } }).graceDays, 3);
});

test("patch builders use the registry keys and validate", () => {
  assert.deepEqual(buildRecurringMasterPatch(true), { "recurring.enabled": true });
  assert.deepEqual(buildRecurringProductPatch("appPremium", true, 100), {
    "recurring.products.appPremium.enabled": true,
    "recurring.products.appPremium.introAmountInr": 100,
  });
  assert.deepEqual(buildRecurringProductPatch("allAccess", false), { "recurring.products.allAccess.enabled": false });
  assert.throws(() => buildRecurringProductPatch("appPremium", true, 99), /at least 100 paise/);
  assert.throws(() => buildRecurringProductPatch("nope" as never, true));
  assert.throws(() => buildRecurringMasterPatch("yes" as never));
  assert.deepEqual(buildAllowListPatch(["x"]), { "recurring.allowUids": ["x"] });
});

test("rollout list parsing", () => {
  const uid = "A1b2C3d4E5f6G7h8I9j0K1l2M3n4";
  assert.deepEqual(parseUidList(`${uid}, ${uid}\n`), { ok: true, uids: [uid] });
  assert.deepEqual(parseUidList(""), { ok: true, uids: [] });
  assert.equal(parseUidList("short").ok, false);
  assert.equal(parseUidList("a@b.com").ok, false);
});

test("annual price = 12 x monthly x 0.80 rounded to whole rupees: 950 / 1430 / 1910", () => {
  assert.equal(annualFromMonthlyPaise(9900), 95000);
  assert.equal(annualFromMonthlyPaise(14900), 143000);
  assert.equal(annualFromMonthlyPaise(19900), 191000);
  assert.equal(parseRupeesToPaise("99"), 9900);
});

test("master confirmation copy says existing subscribers are not affected by turning off", () => {
  assert.match(recurringMasterConfirm(false).body, /Existing auto-renewing subscribers keep renewing/);
  assert.match(recurringMasterConfirm(true).body, /Old app versions keep the one-time purchase/);
});

test("status wording covers every server status honestly", () => {
  assert.equal(recurringStatus("active").tone, "ok");
  assert.match(recurringStatus("cancelling").label, /access until period end/);
  assert.equal(recurringStatus("pending_payment").tone, "degraded");
  assert.equal(recurringStatus("halted").tone, "down");
  assert.equal(recurringStatus("ended").tone, "off");
  assert.match(recurringStatus("awaiting_payment").label, /not completed/);
  assert.equal(recurringStatus(null, "weird").label, "weird");
});

test("ledger type label", () => {
  assert.equal(ledgerTypeLabel({}), "One-time");
  assert.equal(ledgerTypeLabel({ recurringKind: "recurring_intro", isIntro: true }), "Intro month");
  assert.equal(ledgerTypeLabel({ recurringKind: "recurring_charge", cycle: 2 }), "Renewal 2");
  assert.equal(ledgerTypeLabel({ recurringKind: "recurring_failed" }), "Failed renewal");
});
