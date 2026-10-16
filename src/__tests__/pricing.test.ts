// Country pricing: money conversion, validation, payload builders, formatting,
// permission gating, registry parity, nav, revenue currency grouping.
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  LIMITS, formatByCurrency,
  COUNTRIES, CURRENCY_RULES, IN_PROTECTED_REASON, buildMatrix, buildUpsertPatch, confirmPhrase, countryByCode, deactivatePatch, deletePatch,
  describeChange, docId, draftFromRow, formatLedgerAmount, formatMinor, formatTotals, isChanged, majorToMinor, minorToMajorInput, parseDocId,
  parsePrices, pricingAccess, previewLines, priceChangeText, sumByCurrency, validateDraft, type Draft, type PriceRow,
} from "../features/pricing/logic";
import { COUNTRIES_DATA } from "../features/pricing/countriesData";
import { findRoute, visibleNav } from "../shell/nav";
import { hasPermission, PERMISSIONS, type Permission } from "../lib/permissions";
import { TARGET_LABELS } from "../features/config/logic";
import { normaliseError } from "../lib/apiErrors";

const US = countryByCode("US")!;
const IN = countryByCode("IN")!;
const CA = countryByCode("CA")!;
const row = (over: Partial<PriceRow> = {}): PriceRow => ({
  id: "gold_US", planId: "gold", country: "US", currency: "USD", priceMonthly: 499, priceAnnual: 4999, active: true,
  effectiveFrom: null, notes: "", version: 3, updatedAt: 1, updatedBy: "a@b.c", ...over,
});
const draft = (over: Partial<Draft> = {}): Draft => ({ monthly: "4.99", annual: "49.99", active: true, effectiveFrom: null, notes: "", ...over });

test("majorToMinor: exact integer conversion, no float drift", () => {
  assert.equal(majorToMinor("4.99", 2), 499);
  assert.equal(majorToMinor("0.1", 2), 10);
  assert.equal(majorToMinor("19.99", 2), 1999);
  assert.equal(majorToMinor("1,299.50", 2), 129950);
  assert.equal(majorToMinor("49", 2), 4900);
  assert.equal(majorToMinor("499", 0), 499);
  assert.equal(majorToMinor("4.5", 0), null);
  assert.equal(majorToMinor("4.999", 2), null);
  assert.equal(majorToMinor("-1", 2), null);
  assert.equal(majorToMinor("", 2), null);
  assert.equal(majorToMinor("$4.99", 2), null);
  assert.equal(majorToMinor("1e3", 2), null);
  assert.equal(majorToMinor("99999999999999999999", 2), null);
  // 3-decimal currency (e.g. KWD) works with exponent 3
  assert.equal(majorToMinor("1.234", 3), 1234);
});

test("minorToMajorInput round-trips", () => {
  for (const [minor, exp] of [[499, 2], [4900, 2], [5, 2], [0, 2], [1234, 3], [77, 0]] as const) {
    assert.equal(majorToMinor(minorToMajorInput(minor, exp), exp), minor);
  }
  assert.equal(minorToMajorInput(4900, 2), "49");
  assert.equal(minorToMajorInput(499, 2), "4.99");
  assert.equal(minorToMajorInput(5, 2), "0.05");
});

test("formatMinor uses Intl with the currency code (no hard-coded symbol)", () => {
  assert.equal(formatMinor(499, "USD", { locale: "en-US" }), "$4.99");
  assert.equal(formatMinor(500, "USD", { locale: "en-US" }), "$5");
  assert.equal(formatMinor(500, "USD", { locale: "en-US", exact: true }), "$5.00");
  assert.ok(formatMinor(4900, "INR", { locale: "en-IN" }).includes("49"));
  assert.ok(formatMinor(4900, "INR", { locale: "en-IN" }).startsWith("₹"));
  assert.ok(formatMinor(499, "CAD", { locale: "en-CA" }).includes("4.99"));
  assert.equal(formatMinor(1234, "JPY", { exponent: 0, locale: "en-US" }).replace(/\D/g, ""), "1234");
  assert.equal(formatMinor(null, "USD"), "—");
  assert.equal(formatMinor(Number.NaN, "USD"), "—");
  const src = fs.readFileSync(path.join(__dirname, "../../src/features/pricing/logic.ts"), "utf8");
  assert.ok(!/"₹"|'₹'|`₹/.test(src.replace(/\/\/.*$/gm, "")), "no hard-coded rupee sign literal in formatting code");
});

test("priceChangeText in the row's own currency", () => {
  assert.equal(priceChangeText(499, 599, "USD", 2, "en-US"), "$4.99 → $5.99 (+20%)");
  assert.equal(priceChangeText(null, 499, "USD", 2, "en-US"), "$4.99 (new)");
  assert.equal(priceChangeText(1000, 500, "USD", 2, "en-US"), "$10 → $5 (-50%)");
});

test("doc ids: {planId}_{CC}, planId with underscores parses", () => {
  assert.equal(docId("app_premium", "US"), "app_premium_US");
  assert.deepEqual(parseDocId("floating_premium_CA"), { planId: "floating_premium", country: "CA" });
  assert.equal(parseDocId("bogus_US"), null);
  assert.equal(parseDocId("gold_usa"), null);
  assert.equal(parseDocId("gold"), null);
});

test("validation: a normal US row is valid; minimums, bounds, annual sanity", () => {
  assert.deepEqual(validateDraft(draft(), US), {});
  assert.ok(validateDraft(draft({ monthly: "0.49" }), US).monthly, "below USD 0.50 minimum");
  assert.equal(validateDraft(draft({ monthly: "0.50", annual: "0.50" }), US).monthly, undefined);
  assert.ok(validateDraft(draft({ monthly: "0.99", annual: "9" }), IN).monthly, "INR minimum is Re 1");
  assert.equal(validateDraft(draft({ monthly: "1", annual: "12" }), IN).monthly, undefined);
  assert.ok(validateDraft(draft({ monthly: "10000000.01", annual: "10000000.01" }), US).monthly, "above bound");
  assert.ok(validateDraft(draft({ monthly: "" }), US).monthly);
  assert.ok(validateDraft(draft({ monthly: "abc" }), US).monthly);
  assert.ok(validateDraft(draft({ monthly: "4.999" }), US).monthly);
  assert.ok(validateDraft(draft({ monthly: "5", annual: "4" }), US).annual, "annual below one month");
  assert.ok(validateDraft(draft({ monthly: "5", annual: "121" }), US).annual, "annual above 24 months");
  assert.equal(validateDraft(draft({ monthly: "5", annual: "120" }), US).annual, undefined);
});

test("validation: unsupported currency / exponent mismatch", () => {
  assert.ok(validateDraft(draft(), { ...US, currency: "XXX" }).currency);
  assert.ok(validateDraft(draft(), { ...US, minorUnitExponent: 0 }).currency);
});

test("validation: notes limit, plain text, single line; effectiveFrom", () => {
  assert.equal(validateDraft(draft({ notes: "x".repeat(200) }), US).notes, undefined);
  assert.ok(validateDraft(draft({ notes: "x".repeat(201) }), US).notes);
  assert.ok(validateDraft(draft({ notes: "<b>hi</b>" }), US).notes);
  assert.ok(validateDraft(draft({ notes: "a\nb" }), US).notes);
  assert.ok(validateDraft(draft({ notes: "a\u0000b" }), US).notes);
  assert.ok(validateDraft(draft({ effectiveFrom: Number.NaN }), US).effectiveFrom);
});

test("IN row is protected: cannot be deactivated or deleted", () => {
  assert.ok(validateDraft(draft({ monthly: "49", annual: "468", active: false }), IN, { protectedRow: true }).active);
  assert.equal(validateDraft(draft({ monthly: "49", annual: "468", active: true }), IN, { protectedRow: true }).active, undefined);
  assert.throws(() => deletePatch("silver", "IN"), /fallback/);
  assert.throws(() => deactivatePatch(row({ id: "silver_IN", country: "IN", currency: "INR", planId: "silver" }), IN), /fallback/);
  assert.ok(IN_PROTECTED_REASON.length > 20);
});

test("payload builders: complete row, integer minor units, explicit null for cleared effectiveFrom", () => {
  const p = buildUpsertPatch("gold", US, draft({ notes: " test " }), null);
  assert.deepEqual(p, {
    gold_US: { planId: "gold", country: "US", currency: "USD", priceMonthly: 499, priceAnnual: 4999, active: true, notes: "test" },
  });
  const withDate = buildUpsertPatch("gold", US, draft({ effectiveFrom: 1_800_000_000_000 }), row());
  assert.equal((withDate.gold_US as Record<string, unknown>).effectiveFrom, 1_800_000_000_000);
  const cleared = buildUpsertPatch("gold", US, draft(), row({ effectiveFrom: 123 }));
  assert.equal((cleared.gold_US as Record<string, unknown>).effectiveFrom, null);
  const none = buildUpsertPatch("gold", US, draft(), row());
  assert.ok(!("effectiveFrom" in (none.gold_US as object)));
  for (const v of Object.values(p.gold_US as Record<string, unknown>)) assert.notEqual(typeof v, "undefined");
  assert.throws(() => buildUpsertPatch("gold", US, draft({ monthly: "x" }), null));
});

test("deactivate keeps prices and flips active; delete is null (non-IN only)", () => {
  const d = deactivatePatch(row(), US);
  assert.equal((d.gold_US as Record<string, unknown>).active, false);
  assert.equal((d.gold_US as Record<string, unknown>).priceMonthly, 499);
  assert.deepEqual(deletePatch("gold", "CA"), { gold_CA: null });
});

test("typed confirmation phrase = plan id + country", () => {
  assert.equal(confirmPhrase("gold", "US"), "gold_US");
  assert.equal(confirmPhrase("app_premium", "CA"), "app_premium_CA");
});

test("change summary: only changed fields, with percent", () => {
  const lines = describeChange(row(), draft({ monthly: "5.99" }), US, "en-US");
  assert.deepEqual(lines, ["Monthly: $4.99 → $5.99 (+20%)"]);
  assert.deepEqual(describeChange(row(), draft({ monthly: "4.99", annual: "49.99" }), US), []);
  assert.equal(isChanged(row(), draft(), US), false);
  assert.equal(isChanged(null, draft(), US), true);
  assert.ok(describeChange(row(), draft({ active: false }), US).includes("Not offered in this country"));
  assert.ok(describeChange(row(), draft({ effectiveFrom: 1_800_000_000_000 }), US).some((l) => l.startsWith("Launch date")));
  assert.ok(describeChange(row({ effectiveFrom: 5 }), draft(), US).includes("Effective immediately"));
});

test("draftFromRow prefills in major units", () => {
  assert.deepEqual(draftFromRow(row(), US), { monthly: "4.99", annual: "49.99", active: true, effectiveFrom: null, notes: "" });
  assert.equal(draftFromRow(null, US).monthly, "");
});

test("matrix: all five plans, status chips incl. unavailable / scheduled / inactive", () => {
  const rows = [row(), row({ id: "silver_US", planId: "silver", active: false }), row({ id: "all_access_US", planId: "all_access", effectiveFrom: 2000 })];
  const m = buildMatrix(rows, "US", 1000);
  assert.deepEqual(m.map((x) => x.planId), ["silver", "gold", "app_premium", "floating_premium", "all_access"]);
  assert.deepEqual(m.map((x) => x.status), ["inactive", "active", "unavailable", "unavailable", "scheduled"]);
  assert.equal(buildMatrix(rows, "CA", 1000).every((x) => x.status === "unavailable"), true);
});

test("parsePrices: object map, wrapped, array, timestamps, junk skipped", () => {
  const raw = { gold_US: { planId: "gold", country: "US", currency: "USD", priceMonthly: 499, priceAnnual: 4999, active: true, version: 2, updatedAt: { _seconds: 10 }, updatedBy: "x" } };
  const [r] = parsePrices(raw);
  assert.equal(r.id, "gold_US");
  assert.equal(r.updatedAt, 10_000);
  assert.equal(parsePrices({ items: raw }).length, 1);
  assert.equal(parsePrices({ prices: [{ id: "gold_US", ...raw.gold_US }] }).length, 1);
  assert.equal(parsePrices({ bogus_US: { priceMonthly: 1, priceAnnual: 2 }, gold_US: null, silver_CA: { priceMonthly: "1" } }).length, 0);
  assert.deepEqual(parsePrices(null), []);
  // currency inferred from registry when absent; active defaults true
  const [r2] = parsePrices({ silver_CA: { priceMonthly: 100, priceAnnual: 1000 } });
  assert.equal(r2.currency, "CAD");
  assert.equal(r2.active, true);
});

test("preview: formatted price + billing country wording; unavailable wording", () => {
  const pv = previewLines(US, { priceMonthly: 499, priceAnnual: 4999 }, true);
  assert.equal(pv.monthly, "$4.99 / month");
  assert.equal(pv.annual, "$49.99 / year");
  assert.match(pv.billing, /Billing country: United States/);
  assert.match(pv.billing, /USD/);
  assert.match(previewLines(CA, null, true).monthly, /not available in your region/i);
  assert.match(previewLines(US, { priceMonthly: 499, priceAnnual: 4999 }, false).monthly, /not available/i);
});

test("permission gating: view plans.read, edit plans.modify, history config.read, rollback config.activate", () => {
  const can = (perms: string[]) => (p: Permission) => hasPermission(perms, p);
  assert.deepEqual(pricingAccess(can(["plans.read"])), { canView: true, canEdit: false, canOpenHistory: false, canRollback: false });
  assert.deepEqual(pricingAccess(can(["plans.read", "plans.modify", "config.read"])), { canView: true, canEdit: true, canOpenHistory: true, canRollback: true });
  assert.deepEqual(pricingAccess(can(["*"])), { canView: true, canEdit: true, canOpenHistory: true, canRollback: true });
  assert.equal(pricingAccess(can([])).canView, false);
  for (const p of ["plans.read", "plans.modify", "config.read"]) assert.ok((PERMISSIONS as readonly string[]).includes(p));
});

test("version conflict (aborted / failed-precondition) normalises to kind conflict", () => {
  assert.equal(normaliseError({ code: "functions/aborted", message: "x" }).kind, "conflict");
  assert.equal(normaliseError({ code: "failed-precondition", message: "x" }).kind, "conflict");
});

test("nav: Country Pricing under Revenue group, plans.read, searchable", () => {
  const r = findRoute("/dashboard/pricing");
  assert.equal(r?.route.label, "Country Pricing");
  assert.equal(r?.route.permission, "plans.read");
  const viewer = visibleNav((p: Permission) => hasPermission(["plans.read"], p)).flatMap((g) => g.routes.map((x) => x.href));
  assert.ok(viewer.includes("/dashboard/pricing"));
  const none = visibleNav((p: Permission) => hasPermission(["dashboard.read"], p)).flatMap((g) => g.routes.map((x) => x.href));
  assert.ok(!none.includes("/dashboard/pricing"));
});

test("config history knows the planPrices target", () => {
  assert.equal(TARGET_LABELS.planPrices, "Country pricing");
});

test("registry: IN present+active, unique codes, exponents match currency table, parity with countries.json when present", () => {
  assert.equal(COUNTRIES.length, 249);
  assert.ok(COUNTRIES.find((c) => c.code === "IN" && c.currency === "INR"));
  assert.equal(new Set(COUNTRIES.map((c) => c.code)).size, COUNTRIES.length);
  for (const c of COUNTRIES) {
    assert.ok(/^[A-Z]{2}$/.test(c.code));
    assert.equal(CURRENCY_RULES[c.currency]?.exponent, c.minorUnitExponent, `${c.code}: currency table`);
  }
  const file = path.resolve(__dirname, "../../../akaya_ai/assets/pricing/countries.json");
  if (!fs.existsSync(file)) {
    console.log("NOTE: akaya_ai/assets/pricing/countries.json absent; parity not checked (fixture in use)");
    return;
  }
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const list: Record<string, unknown>[] = Array.isArray(json) ? json : json.countries;
  const pick = (c: Record<string, unknown>) => ({ code: c.code, name: c.name, currency: c.currency, minorUnitExponent: c.minorUnitExponent, defaultLocale: c.defaultLocale, region: c.region });
  assert.deepEqual(COUNTRIES_DATA.map((c) => ({ ...c })), list.map(pick), "regenerate: node akaya_ai/functions/scripts/gen-country-table.js");
});

test("revenue: never sum across currencies; per-currency totals; INR default", () => {
  const t = sumByCurrency([
    { amount: 4900, currency: "INR" }, { amount: 9900, currency: "" }, { amount: 499, currency: "USD" }, { amount: 499, currency: "usd" }, { amount: null, currency: "CAD" },
  ]);
  assert.deepEqual(t, { INR: 14800, USD: 998 });
  const f = formatTotals(t);
  assert.ok(f.includes(" + "));
  assert.ok(f.includes("148") && f.includes("9.98"));
  assert.ok(f.indexOf("148") < f.indexOf("9.98"), "INR first");
  assert.equal(formatTotals({}), "—");
  assert.equal(formatLedgerAmount(499, "USD"), "$4.99");
  assert.ok(formatLedgerAmount(4900, undefined).startsWith("₹"));
  assert.equal(formatLedgerAmount(null, "USD"), "—");
});

test("limits mirror the server: 1e9 monthly / 1e10 annual minor units, annual <= 24x monthly, mins per currency", () => {
  assert.equal(LIMITS.maxMonthly, 1_000_000_000);
  assert.equal(LIMITS.maxAnnual, 10_000_000_000);
  assert.equal(LIMITS.annualMaxMonths, 24);
  assert.equal(CURRENCY_RULES.INR.minMinor, 100);
  assert.equal(CURRENCY_RULES.USD.minMinor, 50);
  assert.equal(CURRENCY_RULES.CAD.minMinor, 50);
  assert.equal(CURRENCY_RULES.KWD.minMinor, 500);
  assert.equal(CURRENCY_RULES.JPY.exponent, 0);
  assert.equal(validateDraft(draft({ monthly: "5", annual: "120" }), US).annual, undefined);
  assert.ok(validateDraft(draft({ monthly: "5", annual: "120.01" }), US).annual);
  assert.equal(validateDraft(draft({ monthly: "10000000", annual: "100000000" }), IN).monthly, undefined);
  assert.ok(validateDraft(draft({ monthly: "10000000.01", annual: "100000000" }), IN).monthly);
  assert.ok(validateDraft(draft({ monthly: "1000", annual: "100000001" }), IN).annual);
});

test("itemMeta supplies per-row version / updatedAt / updatedBy", () => {
  const snap = { gold_US: { planId: "gold", country: "US", currency: "USD", priceMonthly: 499, priceAnnual: 4999, active: true } };
  const [r] = parsePrices(snap, { gold_US: { version: 4, updatedAt: 1700000000000, updatedBy: "fin@x.y" } });
  assert.equal(r.version, 4);
  assert.equal(r.updatedAt, 1700000000000);
  assert.equal(r.updatedBy, "fin@x.y");
});

test("launch-date wording in the change summary", () => {
  assert.ok(describeChange(row(), draft({ effectiveFrom: 1_800_000_000_000 }), US).some((l) => l.includes("whole row")));
});

test("formatByCurrency renders one figure per currency with server exponents", () => {
  const by = { INR: { captured: 14800, refunded: 4900 }, USD: { captured: 998, refunded: 0 } };
  const cap = formatByCurrency(by, "captured", { INR: 2, USD: 2 });
  assert.ok(cap.includes("148") && cap.includes("9.98") && cap.includes(" + "));
  assert.ok(formatByCurrency(by, "net").includes("99"));
  assert.equal(formatByCurrency(null, "captured"), "—");
});
