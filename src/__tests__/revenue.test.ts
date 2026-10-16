// Revenue domain helpers: money formatting and parsing, ledger statuses.
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatINR, ledgerStatus, parseRupeesToPaise, priceChange } from "../features/revenue/logic";

test("paise render as rupees with Indian grouping", () => {
  assert.equal(formatINR(9900), "₹99");
  assert.equal(formatINR(9950), "₹99.50");
  assert.equal(formatINR(12345600), "₹1,23,456");
  assert.equal(formatINR(9900, { exact: true }), "₹99.00");
  assert.equal(formatINR(null), "—");
});

test("rupee input parses to integer paise, rejects nonsense", () => {
  assert.equal(parseRupeesToPaise("129"), 12900);
  assert.equal(parseRupeesToPaise("₹1,299.5"), 129950);
  assert.equal(parseRupeesToPaise(" 99.99 "), 9999);
  for (const bad of ["", "abc", "1.234", "-5", "1e3"]) assert.equal(parseRupeesToPaise(bad), null, bad);
});

test("price change summary shows direction and percentage", () => {
  assert.equal(priceChange(9900, 12900), "₹99 → ₹129 (+30%)");
  assert.equal(priceChange(9900, 4900), "₹99 → ₹49 (-51%)");
  assert.equal(priceChange(null, 4900), "₹49 (new)");
});

test("ledger statuses map to words and tones; unknown passes through", () => {
  assert.deepEqual(ledgerStatus("refunded"), { label: "Refunded", tone: "off" });
  assert.equal(ledgerStatus("needs_attention").tone, "down");
  assert.deepEqual(ledgerStatus("weird"), { label: "weird", tone: "unknown" });
});
