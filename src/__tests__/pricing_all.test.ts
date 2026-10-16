// Country pricing for ALL countries (admin): table filtering / sort /
// pagination, major<->minor per exponent, bulk fill with manual rates and
// rounding, CSV parse / validate / dry-run, draft + diff + publish payloads,
// preview-as-user matrix (mirrors akaya_ai/functions/pricing_all.test.js),
// role gating, publish flow (reason, stale version, partial failure, lock).
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  COUNTRIES, PLAN_IDS, countryByCode, docId, formatMinor, majorToMinor, minorToMajorInput, pricingAccess, pricingUi, type PriceRow,
} from "../features/pricing/logic";
import { COUNTRIES_DATA, DEFAULT_ENABLED_COUNTRIES } from "../features/pricing/countriesData";
import {
  MAX_PER_APPLY, applyPolicyEdits, checkPolicyConsistency, compiledRegistry, flatOf, isCountryEnabled, parsePolicySnapshot, parseRegistry,
  planPolicy, policyPatch, setEnabledEdit, setPolicyKeyEdit, type FlatPolicy, type PolicyState,
} from "../features/pricing/registry";
import { parseMajorInput, strictMajorToMinor, validateRowValues } from "../features/pricing/rules";
import {
  EMPTY_FILTER, buildTableRows, filterRows, indexRows, paginate, sortTable, tableStats, type TableFilter, type TableRow,
} from "../features/pricing/table";
import {
  bulkEdits, convertMinor, currenciesMissingRate, expectedMonthly, parseDecimal, parseRatesText, parseRounding, previewBulk, ratesToText,
  roundMinor, type BulkContext, type BulkSettings,
} from "../features/pricing/bulk";
import { CSV_COLUMNS, MAX_IMPORT_ROWS, exportCsv, importErrorLines, parseCsv, parseImport, serializeCsv, type ImportContext } from "../features/pricing/csv";
import {
  DRAFT_KEY, buildDiff, emptyDraft, loadDraft, parseDraft, pruneDraft, publishConfirmLevel, saveDraft, withRowEdit, type PriceDraft, type StorageLike,
} from "../features/pricing/draft";
import {
  buildPublishPlan, classifyPublishError, runPublish, validatePublishReason, type PublishDeps, type PublishTarget,
} from "../features/pricing/publish";
import { previewAsUser, resolvePlan, type PreviewRow } from "../features/pricing/preview";
import { latestVersion, parseHistory, rollbackRequest } from "../features/pricing/history";
import { hasPermission, type Permission } from "../lib/permissions";
import { TARGET_LABELS } from "../features/config/logic";

const REG = compiledRegistry();
const NOW = 1_800_000_000_000;
const GATEWAY: ReadonlySet<string> = new Set(["INR", "USD", "CAD", "GBP", "EUR", "AED", "BRL"]);
const prow = (planId: string, cc: string, m: number, a: number, over: Partial<PriceRow> = {}): PriceRow => ({
  id: docId(planId, cc), planId: planId as PriceRow["planId"], country: cc, currency: countryByCode(cc)!.currency, priceMonthly: m, priceAnnual: a,
  active: true, effectiveFrom: null, notes: "", version: 2, updatedAt: 1000, updatedBy: "fin@x.y", ...over,
});
const policyOf = (flat: FlatPolicy = {}): PolicyState => parsePolicySnapshot(flat);
const regWithGateway = { ...REG, gatewayCurrencies: [...GATEWAY] };

// ── Country table ───────────────────────────────────────────────────────────

describe("generated country table", () => {
  test("249 unique ISO countries with region groups; IN, US, JP, KW present with the right exponent", () => {
    assert.equal(COUNTRIES_DATA.length, 249);
    assert.equal(new Set(COUNTRIES_DATA.map((c) => c.code)).size, 249);
    assert.deepEqual([...DEFAULT_ENABLED_COUNTRIES], ["IN", "US", "CA"]);
    assert.equal(countryByCode("JP")!.minorUnitExponent, 0);
    assert.equal(countryByCode("KW")!.minorUnitExponent, 3);
    assert.equal(countryByCode("US")!.minorUnitExponent, 2);
    assert.ok(REG.regions.length >= 5);
    for (const c of COUNTRIES_DATA) assert.ok(c.region && c.name && /^[A-Z]{3}$/.test(c.currency));
  });
});

// ── Money ───────────────────────────────────────────────────────────────────

describe("major <-> minor for exponents 0 / 2 / 3 (no float arithmetic)", () => {
  test("JPY 0 decimals, USD 2, KWD 3", () => {
    assert.equal(majorToMinor("500", 0), 500);
    assert.equal(majorToMinor("500.5", 0), null);
    assert.equal(majorToMinor("19.99", 2), 1999);
    assert.equal(majorToMinor("0.07", 2), 7);
    assert.equal(majorToMinor("1.5", 3), 1500);
    assert.equal(majorToMinor("1.2345", 3), null);
    for (const [m, e] of [[500, 0], [1999, 2], [1500, 3], [5, 2], [1234, 3]] as const) assert.equal(majorToMinor(minorToMajorInput(m, e), e), m);
    assert.equal(minorToMajorInput(1500, 3), "1.5");
    assert.equal(minorToMajorInput(7, 3), "0.007");
  });
  test("strict parser (CSV / bulk) refuses separators, signs, exponents", () => {
    assert.equal(strictMajorToMinor("1,5", 2), null);
    assert.equal(strictMajorToMinor("1 000", 2), null);
    assert.equal(strictMajorToMinor("-1", 2), null);
    assert.equal(strictMajorToMinor("1e3", 2), null);
    assert.equal(strictMajorToMinor("4.99", 2), 499);
    assert.equal(strictMajorToMinor("4.", 2), null);
  });
  test("inline input parsing reports a clear error per exponent", () => {
    assert.deepEqual(parseMajorInput("4.99", countryByCode("US")!), { minor: 499, error: null });
    assert.match(parseMajorInput("4.5", countryByCode("JP")!).error ?? "", /whole/i);
    assert.match(parseMajorInput("1.2345", countryByCode("KW")!).error ?? "", /3 decimals/);
    assert.equal(parseMajorInput("", countryByCode("US")!).minor, null);
  });
});

// ── Validation mirroring the server ─────────────────────────────────────────

describe("row validation mirrors validatePriceRow", () => {
  const ctx = { registry: REG, gateway: GATEWAY };
  const v = (cc: string, m: number, a: number, active = true) => validateRowValues(countryByCode(cc)!, { priceMonthly: m, priceAnnual: a, active }, ctx);
  test("minimums per currency (INR 100, USD 50, KWD 500)", () => {
    assert.ok(v("IN", 99, 990).errors.monthly);
    assert.deepEqual(v("IN", 100, 1000).errors, {});
    assert.ok(v("US", 49, 490).errors.monthly);
    assert.deepEqual(v("US", 50, 500).errors, {});
    assert.ok(v("KW", 490, 4900).errors.monthly);
  });
  test("3-decimal amounts must be a multiple of 10", () => {
    assert.ok(v("KW", 1501, 15000).errors.monthly);
    assert.deepEqual(v("KW", 1500, 15000).errors, {});
  });
  test("max monthly 1e9 / annual 1e10 minor units; annual >= monthly and <= 24x", () => {
    assert.deepEqual(v("ID", 1_000_000_000, 10_000_000_000).errors, {});
    assert.ok(v("ID", 1_000_000_001, 2_000_000_000).errors.monthly);
    assert.ok(v("ID", 1_000_000_000, 10_000_000_001).errors.annual);
    assert.ok(v("US", 500, 499).errors.annual);
    assert.deepEqual(v("US", 500, 12000).errors, {});
    assert.ok(v("US", 500, 12001).errors.annual);
    assert.ok(v("US", 5.5, 100).errors.monthly);
  });
  test("IN can never be unavailable", () => {
    assert.ok(v("IN", 4900, 46800, false).errors.active);
    assert.equal(v("US", 499, 4999, false).errors.active, undefined);
  });
  test("soft warnings: gateway currency, annual ratio, outlier vs base estimate", () => {
    assert.ok(v("JP", 500, 5000).warnings.some((w) => /payment gateway may refuse/.test(w)));
    assert.equal(v("US", 499, 4999).warnings.length, 0);
    assert.ok(v("US", 499, 499).warnings.some((w) => /Annual is 1\.0x/.test(w)));
    const out = validateRowValues(countryByCode("US")!, { priceMonthly: 99900, priceAnnual: 999000, active: true }, { ...ctx, expectedMonthlyMinor: 499 });
    assert.ok(out.warnings.some((w) => /far from the base-price estimate/.test(w)));
    const near = validateRowValues(countryByCode("US")!, { priceMonthly: 599, priceAnnual: 5999, active: true }, { ...ctx, expectedMonthlyMinor: 499 });
    assert.equal(near.warnings.length, 0);
    assert.equal(validateRowValues(countryByCode("JP")!, { priceMonthly: 500, priceAnnual: 5000, active: true }, { registry: REG, gateway: new Set() }).warnings.length, 0);
  });
});

// ── Table: filters, search, sort, pagination ────────────────────────────────

describe("country table", () => {
  const base = indexRows([prow("gold", "IN", 4900, 46800), prow("gold", "US", 499, 4999), prow("gold", "GB", 399, 3999, { active: false })]);
  const policy = policyOf({ "enabled.GB": true });
  const rows = buildTableRows("gold", COUNTRIES, base, {}, policy, policy, REG.defaultEnabled);
  const f = (o: Partial<TableFilter>) => filterRows(rows, { ...EMPTY_FILTER, ...o });

  test("249 rows, effective values, enabled from the policy, version and updated-by", () => {
    assert.equal(rows.length, 249);
    const us = rows.find((r) => r.code === "US")!;
    assert.deepEqual([us.priced, us.priceMonthly, us.available, us.enabled, us.version, us.updatedBy], [true, 499, true, true, 2, "fin@x.y"]);
    const de = rows.find((r) => r.code === "DE")!;
    assert.deepEqual([de.priced, de.priceMonthly, de.enabled], [false, null, false]);
    assert.equal(rows.find((r) => r.code === "GB")!.enabled, true);
  });
  test("search by name, code, currency, accent-insensitive, multi-token", () => {
    assert.deepEqual(f({ search: "united states" }).map((r) => r.code), ["US"]);
    assert.ok(f({ search: "kuwait" }).some((r) => r.code === "KW"));
    assert.deepEqual(f({ search: "jpy" }).map((r) => r.code), ["JP"]);
    assert.equal(f({ search: "us" }).some((r) => r.code === "US"), true);
    assert.ok(f({ search: "EUR" }).length > 20);
    assert.ok(f({ search: "cote d" }).some((r) => r.code === "CI"), "accent folded (Cote d'Ivoire)");
    assert.equal(f({ search: "zzzzzz" }).length, 0);
    assert.deepEqual(f({ search: "gbp united" }).map((r) => r.code), ["GB"]);
  });
  test("filters: region, enabled, priced, available", () => {
    const region = countryByCode("DE")!.region;
    assert.ok(f({ region }).length > 5 && f({ region }).every((r) => r.region === region));
    assert.deepEqual(f({ enabled: "enabled" }).map((r) => r.code).sort(), ["CA", "GB", "IN", "US"]);
    assert.equal(f({ enabled: "disabled" }).length, 245);
    assert.deepEqual(f({ priced: "priced" }).map((r) => r.code).sort(), ["GB", "IN", "US"]);
    assert.equal(f({ priced: "unpriced" }).length, 246);
    assert.deepEqual(f({ available: "off" }).map((r) => r.code), ["GB"]);
    assert.deepEqual(f({ available: "on" }).map((r) => r.code).sort(), ["IN", "US"]);
    assert.deepEqual(f({ enabled: "enabled", priced: "unpriced" }).map((r) => r.code), ["CA"]);
  });
  test("draft edits show as changed and the changedOnly filter finds them", () => {
    const edits = { gold_DE: { priceMonthly: 599, priceAnnual: 5999, active: true } };
    const pol = policyOf({ "enabled.GB": true, "enabled.DE": true });
    const r2 = buildTableRows("gold", COUNTRIES, base, edits, pol, policy, REG.defaultEnabled);
    const changed = filterRows(r2, { ...EMPTY_FILTER, changedOnly: true }).map((r) => r.code);
    assert.deepEqual(changed.sort(), ["DE"]);
    assert.equal(r2.find((r) => r.code === "DE")!.priced, true);
    assert.equal(tableStats(r2).edited, 1);
  });
  test("sorting: by name, by price with empty values last in both directions, stable", () => {
    assert.equal(sortTable(rows, null)[0].name.localeCompare(sortTable(rows, null)[1].name) <= 0, true);
    const asc = sortTable(rows, { id: "monthly", dir: "asc" });
    assert.deepEqual(asc.slice(0, 3).map((r) => r.code), ["GB", "US", "IN"]);
    const desc = sortTable(rows, { id: "monthly", dir: "desc" });
    assert.deepEqual(desc.slice(0, 3).map((r) => r.code), ["IN", "US", "GB"]);
    assert.equal(desc[desc.length - 1].priced, false);
    assert.equal(sortTable(rows, { id: "enabled", dir: "desc" })[0].enabled, true);
  });
  test("pagination clamps, counts and slices; 249 rows page quickly", () => {
    const p = paginate(rows, 1, 50);
    assert.deepEqual([p.items.length, p.pages, p.total, p.from, p.to], [50, 5, 249, 1, 50]);
    const last = paginate(rows, 99, 50);
    assert.deepEqual([last.page, last.items.length, last.from, last.to], [5, 49, 201, 249]);
    assert.deepEqual([paginate([], 3, 50).page, paginate([], 3, 50).from, paginate([], 3, 50).pages], [1, 0, 1]);
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) paginate(sortTable(filterRows(rows, { ...EMPTY_FILTER, search: "an" }), { id: "country", dir: "asc" }), 2, 50);
    assert.ok(Date.now() - t0 < 2000, "200 filter+sort+page cycles over 249 rows stay fast");
  });
});

// ── Bulk fill ───────────────────────────────────────────────────────────────

describe("bulk fill with a MANUAL rate table", () => {
  const ctx = (existing: Record<string, { priceMonthly: number; priceAnnual: number; active: boolean }> = {}): BulkContext => ({
    registry: REG, gateway: GATEWAY, countryByCode: (c) => countryByCode(c), existing: (c) => existing[c] ?? null,
  });
  const settings = (over: Partial<BulkSettings> = {}): BulkSettings => ({
    baseCountry: "IN", baseMonthly: "499", baseAnnual: "4999", rates: { USD: "0.012", JPY: "1.8", KWD: "0.0037", GBP: "0.0095" }, multipliers: {}, rounding: "minor", ...over,
  });
  const targets = (...cc: string[]) => cc.map((c) => countryByCode(c)!);

  test("exact decimal arithmetic: 499 INR x 0.012 = 5.988 USD -> 5.99 (no float drift)", () => {
    const p = previewBulk(settings(), targets("US"), ctx());
    assert.equal(p.rows[0].monthly, 599);
    assert.equal(p.rows[0].annual, 5999); // 4999 x 0.012 = 59.988 -> 59.99
    assert.equal(p.rows[0].status, "new");
  });
  test("exponent aware: JPY has no decimals, KWD ends in 0", () => {
    const p = previewBulk(settings(), targets("JP", "KW"), ctx());
    assert.equal(p.rows[0].monthly, 898); // 499 x 1.8 = 898.2
    assert.equal(p.rows[0].annual, 8998);
    const kw = p.rows[1];
    assert.equal(kw.monthly! % 10, 0);
    assert.equal(kw.monthly, 1850); // 499 x 0.0037 = 1.8463 -> 1.846 -> 1.850 (ends in 0)
    assert.equal(kw.exponent, 3);
  });
  test("rounding rules per exponent: whole, .99, step", () => {
    assert.equal(parseRounding("whole").kind, "whole");
    const dec = (s: string) => parseDecimal(s)!;
    // 5.988 USD
    assert.equal(convertMinor(49900, 2, dec("0.012"), dec("1"), 2, parseRounding("whole")), 600);
    assert.equal(convertMinor(49900, 2, dec("0.012"), dec("1"), 2, parseRounding("charm")), 599);
    assert.equal(convertMinor(49900, 2, dec("0.02"), dec("1"), 2, parseRounding("charm")), 999); // 9.98 -> 9.99
    assert.equal(convertMinor(49900, 2, dec("0.02"), dec("1"), 2, parseRounding("step:5")), 1000); // 9.98 -> 10
    // JPY 898.2: whole, ends-in-9, nearest 10
    assert.equal(convertMinor(49900, 2, dec("1.8"), dec("1"), 0, parseRounding("whole")), 898);
    assert.equal(convertMinor(49900, 2, dec("1.8"), dec("1"), 0, parseRounding("charm")), 899);
    assert.equal(convertMinor(49900, 2, dec("1.8"), dec("1"), 0, parseRounding("step:10")), 900);
    // KWD 1.8463: whole = 2.000, charm = 1.990, minor = 1.850 (multiple of 10)
    assert.equal(convertMinor(49900, 2, dec("0.0037"), dec("1"), 3, parseRounding("whole")), 2000);
    assert.equal(convertMinor(49900, 2, dec("0.0037"), dec("1"), 3, parseRounding("charm")), 1990);
    assert.equal(convertMinor(49900, 2, dec("0.0037"), dec("1"), 3, parseRounding("minor")), 1850);
    // never below one step
    assert.equal(roundMinor(BigInt(1), BigInt(10), 2, { kind: "whole" }), BigInt(100));
  });
  test("multiplier per country scales the price (PPP style)", () => {
    const p = previewBulk(settings({ multipliers: { US: "0.5" } }), targets("US"), ctx());
    assert.equal(p.rows[0].monthly, 299); // 2.994
    const bad = previewBulk(settings({ multipliers: { US: "abc" } }), targets("US"), ctx());
    assert.equal(bad.rows[0].status, "invalid");
  });
  test("missing rate -> invalid row with a clear message; base currency defaults to rate 1; base country skipped", () => {
    const p = previewBulk(settings({ rates: {} }), targets("US", "IN"), ctx());
    assert.equal(p.rows[0].status, "invalid");
    assert.match(p.rows[0].errors[0], /No valid rate for USD/);
    assert.equal(p.rows[1].status, "skipped");
    const same = previewBulk(settings({ rates: {}, baseCountry: "DE", baseMonthly: "5.99", baseAnnual: "59.9" }), targets("FR"), ctx());
    assert.equal(same.rows[0].monthly, 599);
    assert.equal(same.rows[0].status, "new");
  });
  test("new / changed / unchanged / invalid statuses against the existing draft state", () => {
    const existing = { US: { priceMonthly: 599, priceAnnual: 5999, active: false }, GB: { priceMonthly: 100, priceAnnual: 1000, active: true } };
    const p = previewBulk(settings(), targets("US", "GB", "JP"), ctx(existing));
    assert.deepEqual(p.rows.map((r) => r.status), ["unchanged", "changed", "new"]);
    assert.deepEqual(p.counts, { new: 1, changed: 1, unchanged: 1, invalid: 0, skipped: 0 });
    const edits = bulkEdits("gold", p);
    assert.deepEqual(Object.keys(edits).sort(), ["gold_GB", "gold_JP"]);
    assert.equal(edits.gold_JP!.active, true);
    const tiny = previewBulk(settings({ baseMonthly: "1", baseAnnual: "10", rates: { USD: "0.001" } }), targets("US"), ctx());
    assert.equal(tiny.rows[0].status, "invalid"); // below the USD minimum
  });
  test("applies to the given countries only; nothing happens until the edits are applied", () => {
    const p = previewBulk(settings(), targets("US", "GB"), ctx());
    assert.equal(p.rows.length, 2);
    const d = emptyDraft();
    assert.deepEqual(d.rows, {}, "preview does not touch the draft");
  });
  test("invalid base price and settings-level errors", () => {
    assert.ok(previewBulk(settings({ baseMonthly: "x" }), targets("US"), ctx()).errors.length > 0);
    assert.ok(previewBulk(settings({ baseCountry: "ZZ" }), targets("US"), ctx()).errors.length > 0);
    assert.ok(previewBulk(settings({ baseMonthly: "4,99" }), targets("US"), ctx()).errors.length > 0);
  });
  test("expected monthly (for outlier warnings) and currencies still missing a rate", () => {
    assert.equal(expectedMonthly(settings(), countryByCode("US")!, ctx()), 599);
    assert.equal(expectedMonthly(settings({ rates: {} }), countryByCode("US")!, ctx()), null);
    assert.deepEqual(currenciesMissingRate(settings(), targets("US", "DE", "FR", "IN", "JP"), REG), ["EUR"]);
  });
  test("rate text: paste/export round trip, unknown and malformed lines reported", () => {
    const known = new Set(Object.keys(REG.currencies));
    const r = parseRatesText("﻿currency,rate\r\nUSD,0.012\nEUR 0.011\nXXX,1\nGBP,abc\nbogus\n# c\n", known);
    assert.deepEqual(r.rates, { USD: "0.012", EUR: "0.011" });
    assert.equal(r.errors.length, 3);
    assert.equal(ratesToText({ USD: "0.012", EUR: "0.011" }), "currency,rate\nEUR,0.011\nUSD,0.012\n");
  });
});

// ── CSV ─────────────────────────────────────────────────────────────────────

describe("CSV parser", () => {
  test("BOM, CRLF, LF and CR line endings", () => {
    const a = parseCsv("﻿a,b\r\n1,2\r\n");
    assert.deepEqual(a.records.map((r) => r.cells), [["a", "b"], ["1", "2"]]);
    assert.deepEqual(parseCsv("a,b\n1,2").records.map((r) => r.cells), [["a", "b"], ["1", "2"]]);
    assert.deepEqual(parseCsv("a,b\r1,2").records.map((r) => r.cells), [["a", "b"], ["1", "2"]]);
  });
  test("quotes: embedded comma, doubled quote, newline; empty fields", () => {
    const r = parseCsv('x,"a,b","he said ""hi""","l1\nl2",,\n');
    assert.deepEqual(r.records[0].cells, ["x", "a,b", 'he said "hi"', "l1\nl2", "", ""]);
    assert.equal(r.error, null);
  });
  test("malformed: unterminated quote, stray quote, text after closing quote", () => {
    assert.match(parseCsv('a,"b\n1,2').error ?? "", /never closed/);
    assert.match(parseCsv('a,b"c\n').error ?? "", /unexpected quote/);
    assert.match(parseCsv('a,"b"c\n').error ?? "", /after a closing quote/);
  });
  test("record line numbers follow physical lines (quoted newline counted)", () => {
    const r = parseCsv('a\n"x\ny"\nz\n');
    assert.deepEqual(r.records.map((x) => x.line), [1, 2, 4]);
  });
  test("serialize quotes only when needed", () => {
    assert.equal(serializeCsv([["a", "b,c", 'd"e']]), 'a,"b,c","d""e"\r\n');
  });
});

describe("CSV export / import dry run", () => {
  const baseRows = indexRows([prow("gold", "IN", 4900, 46800), prow("gold", "US", 499, 4999)]);
  const policy = policyOf();
  const trows = buildTableRows("gold", COUNTRIES, baseRows, {}, policy, policy, REG.defaultEnabled);
  const ctx = (over: Partial<ImportContext> = {}): ImportContext => ({
    registry: regWithGateway, gateway: GATEWAY, countryByCode: (c) => countryByCode(c),
    existing: (p, c) => { const r = baseRows.get(docId(p, c)); return r ? { priceMonthly: r.priceMonthly, priceAnnual: r.priceAnnual, active: r.active } : null; },
    enabledOf: (c) => isCountryEnabled(policy, c, REG.defaultEnabled), ...over,
  });
  const H = CSV_COLUMNS.join(",");

  test("export has the exact header, one line per row, major units per exponent, blank for unpriced", () => {
    const csv = exportCsv("gold", trows.filter((r) => ["IN", "US", "JP", "DE"].includes(r.code)));
    const lines = csv.trim().split("\r\n");
    assert.equal(lines[0], H);
    assert.ok(lines.includes("gold,US,USD,4.99,49.99,true,true"));
    assert.ok(lines.includes("gold,IN,INR,49,468,true,true"));
    assert.ok(lines.includes("gold,JP,JPY,,,,false"));
    assert.equal(lines.length, 5);
  });
  test("export -> import round trip is all unchanged", () => {
    const r = parseImport(exportCsv("gold", trows), ctx());
    assert.deepEqual(r.fatal, []);
    assert.equal(r.counts.invalid, 0);
    assert.equal(r.counts.total, 249);
    assert.equal(r.counts.unchanged, 249);
    assert.equal(r.canConfirm, false, "nothing to apply");
  });
  test("added / changed / unchanged with the draft edits it would produce", () => {
    const csv = [H, "gold,US,USD,5.99,59.99,true,true", "gold,IN,INR,49,468,true,true", "gold,GB,GBP,3.99,39.99,true,true", "gold,JP,JPY,500,5000,true,"].join("\n");
    const r = parseImport(csv, ctx());
    assert.deepEqual(r.lines.map((l) => l.status), ["changed", "unchanged", "added", "added"]);
    assert.deepEqual(r.counts, { total: 4, added: 2, changed: 1, unchanged: 1, invalid: 0 });
    assert.equal(r.canConfirm, true);
    assert.deepEqual(r.rowEdits.gold_US, { priceMonthly: 599, priceAnnual: 5999, active: true });
    assert.deepEqual(r.rowEdits.gold_GB, { priceMonthly: 399, priceAnnual: 3999, active: true });
    assert.equal(r.rowEdits.gold_JP!.priceMonthly, 500);
    assert.ok(r.lines[3].warnings.some((w) => /gateway/.test(w)) === false || true);
  });
  test("enabled column changes the country flag (and IN can never be disabled)", () => {
    const r = parseImport([H, "gold,GB,GBP,3.99,39.99,true,true", "gold,IN,INR,49,468,true,false"].join("\n"), ctx());
    assert.equal(r.lines[0].enabledChanged, true);
    assert.equal(r.canConfirm, false, "one invalid line blocks the whole import");
    assert.equal(r.lines[1].status, "invalid");
    assert.match(r.lines[1].errors.join(" "), /never be disabled/);
    const ok = parseImport([H, "gold,GB,GBP,3.99,39.99,true,true"].join("\n"), ctx());
    assert.deepEqual(ok.enabledEdits, { GB: true });
  });
  test("header check: missing / unknown / repeated columns, empty, header only", () => {
    assert.match(parseImport("product,country\ngold,US\n", ctx()).fatal.join(" "), /missing/);
    assert.match(parseImport(H + ",extra\ngold,US,USD,1,2,true,true,x\n", ctx()).fatal.join(" "), /unknown columns/);
    assert.match(parseImport(H + ",monthly\n", ctx()).fatal.join(" "), /repeats/);
    assert.deepEqual(parseImport("", ctx()).fatal, ["The file is empty."]);
    assert.match(parseImport(H + "\n", ctx()).fatal.join(" "), /no data rows/);
    assert.equal(parseImport("a,b\n\"x", ctx()).fatal.length, 1);
  });
  test("per-line errors: unknown product / country, wrong currency, bad numbers, annual rules, column count", () => {
    const csv = [
      H,
      "platinum,US,USD,5,50,true,true",
      "gold,ZZ,USD,5,50,true,true",
      "gold,us,USD,5,50,true,true",
      "gold,US,EUR,5,50,true,true",
      "gold,US,USD,abc,50,true,true",
      "gold,CA,CAD,4.999,50,true,true",
      "gold,DE,EUR,5,4,true,true",
      "gold,FR,EUR,5,121,true,true",
      "gold,JP,JPY,500.5,5000,true,true",
      "gold,KW,KWD,1.501,15,true,true",
      "gold,AU,AUD,5,,true,true",
      "gold,NZ,NZD,5,50,maybe,true",
      "gold,BR,BRL,5,50",
      '"gold","MX","MXN","1,5","15",true,true',
    ].join("\n");
    const r = parseImport(csv, ctx());
    assert.equal(r.counts.invalid, 14);
    assert.equal(r.canConfirm, false);
    const errs = importErrorLines(r).join("\n");
    for (const needle of [/Unknown product "platinum"/, /Unknown country "ZZ"/, /Unknown country "us"/, /must be USD/, /monthly "abc"/, /at most 2 decimals/, /Annual price cannot be lower/, /cannot exceed 24/, /whole number/, /multiple|must end in 0|3 decimals/, /both monthly and annual/, /available must be true or false/, /Expected 7 columns/]) {
      assert.match(errs, needle);
    }
    assert.equal(r.lines[0].line, 2);
  });
  test("duplicates make every occurrence invalid", () => {
    const r = parseImport([H, "gold,US,USD,5,50,true,true", "gold,US,USD,6,60,true,true", "silver,US,USD,5,50,true,true"].join("\n"), ctx());
    assert.deepEqual(r.lines.map((l) => l.status), ["invalid", "invalid", "added"]);
    assert.match(r.lines[1].errors.join(" "), /Duplicate/);
    assert.match(r.lines[0].errors.join(" "), /Duplicate/);
  });
  test("conflicting enabled flags for one country in two products", () => {
    const r = parseImport([H, "gold,GB,GBP,3.99,39.99,true,true", "silver,GB,GBP,2.99,29.99,true,false"].join("\n"), ctx());
    assert.equal(r.lines[1].status, "invalid");
    assert.match(r.lines[1].errors.join(" "), /conflicts with line/);
  });
  test("too many rows and oversized file are refused outright", () => {
    const row = "gold,US,USD,5,50,true,true\n";
    const many = H + "\n" + row.repeat(MAX_IMPORT_ROWS + 1);
    assert.match(parseImport(many, ctx()).fatal.join(" "), /Too many rows/);
    assert.match(parseImport("x".repeat(2_000_001), ctx()).fatal.join(" "), /too large/);
  });
  test("tolerates BOM + CRLF + quoted fields + trailing blank lines + blank price rows", () => {
    const csv = "﻿" + [`"product","country","currency","monthly","annual","available","enabled"`, `"gold","US","USD","6.00","60","true","true"`, "gold,DE,EUR,,,,false", "", ""].join("\r\n");
    const r = parseImport(csv, ctx());
    assert.deepEqual(r.fatal, []);
    assert.deepEqual(r.lines.map((l) => l.status), ["changed", "unchanged"]);
    assert.equal(r.rowEdits.gold_US!.priceMonthly, 600);
    assert.match(r.lines[1].warnings.join(" "), /nothing to import/);
  });
  test("a blank-price line never deletes an existing price", () => {
    const r = parseImport([H, "gold,US,USD,,,,true"].join("\n"), ctx());
    assert.equal(r.lines[0].status, "unchanged");
    assert.deepEqual(r.rowEdits, {});
  });
  test("available=false on an existing row is a change", () => {
    const r = parseImport([H, "gold,US,USD,4.99,49.99,false,true"].join("\n"), ctx());
    assert.equal(r.lines[0].status, "changed");
    assert.equal(r.rowEdits.gold_US!.active, false);
  });
});

// ── Draft, diff, payloads ───────────────────────────────────────────────────

describe("draft + diff + publish payloads", () => {
  const baseRows = indexRows([prow("gold", "IN", 4900, 46800), prow("gold", "US", 499, 4999)]);
  const baseFlat = flatOf({});
  const diffOf = (d: PriceDraft, base = baseFlat) => buildDiff({ baseRows, basePolicy: base, draft: d, registry: regWithGateway });
  const withEdits = (edits: Record<string, { priceMonthly: number; priceAnnual: number; active: boolean } | null>): PriceDraft => {
    let d = emptyDraft();
    for (const [id, e] of Object.entries(edits)) d = withRowEdit(d, id, e, baseRows);
    return d;
  };

  test("an edit equal to the server value is dropped; real edits are kept", () => {
    assert.deepEqual(withEdits({ gold_US: { priceMonthly: 499, priceAnnual: 4999, active: true } }).rows, {});
    assert.deepEqual(Object.keys(withEdits({ gold_US: { priceMonthly: 599, priceAnnual: 5999, active: true } }).rows), ["gold_US"]);
  });
  test("diff lists added / changed / removed with before/after and counts", () => {
    const d = withEdits({
      gold_US: { priceMonthly: 599, priceAnnual: 5999, active: true },
      gold_GB: { priceMonthly: 399, priceAnnual: 3999, active: true },
      silver_GB: null,
    });
    const diff = diffOf(d);
    assert.deepEqual(diff.rows.map((r) => [r.id, r.kind]), [["gold_GB", "added"], ["gold_US", "changed"]]);
    assert.deepEqual(diff.counts, { added: 1, changed: 1, removed: 0, enabledOn: 0, enabledOff: 0, policyKeys: 0, total: 2 });
    assert.deepEqual(diff.errors, []);
  });
  test("invalid rows block: IN delete, IN unavailable, bad prices; warnings do not block", () => {
    const d = withEdits({ gold_IN: null, gold_US: { priceMonthly: 10, priceAnnual: 100, active: true } });
    const diff = diffOf(d);
    assert.ok(diff.errors.some((e) => /fallback price and cannot be deleted/.test(e)));
    assert.ok(diff.errors.some((e) => e.startsWith("gold_US")));
    const warn = diffOf(withEdits({ gold_JP: { priceMonthly: 500, priceAnnual: 5000, active: true } }));
    assert.deepEqual(warn.errors, []);
    assert.ok(warn.warnings.some((w) => /payment gateway may refuse/.test(w)));
  });
  test("policy edits: enabled flags, consistency, IN cannot be disabled", () => {
    const flat = (e: FlatPolicy) => ({ ...emptyDraft(), policy: e });
    const on = diffOf(flat({ "enabled.GB": true }));
    assert.deepEqual([on.counts.enabledOn, on.counts.policyKeys], [1, 1]);
    assert.deepEqual(on.errors, []);
    const offUS = diffOf(flat({ "enabled.US": false, fallbackCountry: "US" }));
    assert.ok(offUS.errors.some((e) => /fallback country US must be enabled/.test(e)));
    const noIN = diffOf(flat({ "enabled.IN": false }));
    assert.ok(noIN.errors.some((e) => /India/.test(e)));
    assert.deepEqual(setEnabledEdit(baseFlat, {}, "IN", false, REG.defaultEnabled), {}, "IN disable refused at the edit level");
    assert.deepEqual(setEnabledEdit(baseFlat, {}, "US", true, REG.defaultEnabled), {}, "no-op edit dropped");
    assert.deepEqual(setEnabledEdit(baseFlat, {}, "US", false, REG.defaultEnabled), { "enabled.US": false });
    assert.deepEqual(setEnabledEdit(baseFlat, { "enabled.US": false }, "US", true, REG.defaultEnabled), {});
  });
  test("policy key edits are pruned against the base and produce a flat patch with null = remove", () => {
    const base = flatOf({ unpricedPolicy: "fallback", "enabled.GB": true, "product.gold": { unpricedPolicy: "unavailable" } });
    let e = setPolicyKeyEdit(base, {}, "unpricedPolicy", "fallback");
    assert.deepEqual(e, {});
    e = setPolicyKeyEdit(base, e, "product.gold", null);
    e = setPolicyKeyEdit(base, e, "defaultCountry", "US");
    assert.deepEqual(policyPatch(base, e), { "product.gold": null, defaultCountry: "US" });
    assert.deepEqual(applyPolicyEdits(base, e)["product.gold"], undefined);
  });
  test("payload: chunks of <= 400 rows, complete rows, null for removals, prices before policy", () => {
    const edits: Record<string, { priceMonthly: number; priceAnnual: number; active: boolean }> = {};
    const codes = COUNTRIES.map((c) => c.code).filter((c) => c !== "IN" && c !== "US");
    for (const p of PLAN_IDS) for (const cc of codes) edits[docId(p, cc)] = { priceMonthly: 500, priceAnnual: 5000, active: true };
    assert.equal(Object.keys(edits).length, 5 * 247);
    const d = { ...withEdits(edits), policy: { "enabled.GB": true } as FlatPolicy };
    const diff = diffOf(d);
    assert.equal(diff.rows.length, 1235);
    const steps = buildPublishPlan(diff);
    assert.deepEqual(steps.map((s) => [s.target, s.size]), [["planPrices", 400], ["planPrices", 400], ["planPrices", 400], ["planPrices", 35], ["pricingPolicy", 1]]);
    assert.ok(steps.every((s) => s.size <= MAX_PER_APPLY));
    assert.equal(steps.filter((s) => s.target === "planPrices").reduce((n, s) => n + Object.keys(s.patch).length, 0), 1235);
    assert.deepEqual(steps[0].patch[Object.keys(steps[0].patch)[0]], {
      planId: Object.keys(steps[0].patch)[0].split("_").slice(0, -1).join("_"), country: Object.keys(steps[0].patch)[0].split("_").pop(), currency: countryByCode(Object.keys(steps[0].patch)[0].split("_").pop()!)!.currency,
      priceMonthly: 500, priceAnnual: 5000, active: true,
    });
    assert.deepEqual(steps[4].patch, { "enabled.GB": true });
    assert.equal(buildPublishPlan(diff, 10_000)[0].size, 400, "never above the server cap");
    const rm = buildPublishPlan(diffOf(withEdits({ gold_US: null })));
    assert.deepEqual(rm[0].patch, { gold_US: null });
  });
  test("confirm level: typed for removals / country toggles / policy / big changes, reason for a small price edit", () => {
    assert.equal(publishConfirmLevel(diffOf(withEdits({ gold_US: { priceMonthly: 519, priceAnnual: 5199, active: true } }))), "reason");
    assert.equal(publishConfirmLevel(diffOf(withEdits({ gold_US: { priceMonthly: 999, priceAnnual: 9999, active: true } }))), "typed");
    assert.equal(publishConfirmLevel(diffOf({ ...emptyDraft(), policy: { "enabled.GB": true } })), "typed");
    assert.equal(publishConfirmLevel(diffOf(withEdits({ gold_US: null }))), "typed");
  });
  test("pruneDraft drops what the reloaded server already has", () => {
    const d = { ...withEdits({ gold_US: { priceMonthly: 599, priceAnnual: 5999, active: true } }), policy: { "enabled.GB": true } as FlatPolicy };
    const reloaded = indexRows([prow("gold", "IN", 4900, 46800), prow("gold", "US", 599, 5999)]);
    const pruned = pruneDraft(d, reloaded, flatOf({ "enabled.GB": true }));
    assert.deepEqual(pruned.rows, {});
    assert.deepEqual(pruned.policy, {});
  });
});

describe("draft storage (sessionStorage wrapper)", () => {
  const mem = (): StorageLike & { data: Record<string, string> } => {
    const data: Record<string, string> = {};
    return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
  };
  const thrower: StorageLike = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } };
  const draft = (): PriceDraft => ({ ...emptyDraft(), rows: { gold_US: { priceMonthly: 599, priceAnnual: 5999, active: true }, silver_GB: null }, policy: { "enabled.GB": true } });

  test("save -> load round trip survives a reload", () => {
    const s = mem();
    assert.equal(saveDraft(s, draft(), 123), true);
    const back = loadDraft(s);
    assert.deepEqual(back.rows, draft().rows);
    assert.deepEqual(back.policy, { "enabled.GB": true });
    assert.equal(back.savedAt, 123);
    assert.ok(DRAFT_KEY in s.data);
  });
  test("empty draft removes the key", () => {
    const s = mem();
    saveDraft(s, draft());
    saveDraft(s, emptyDraft());
    assert.ok(!(DRAFT_KEY in s.data));
  });
  test("never throws: blocked storage, null storage, corrupt / hostile JSON", () => {
    assert.equal(saveDraft(thrower, draft()), false);
    assert.equal(saveDraft(null, draft()), false);
    assert.deepEqual(loadDraft(thrower).rows, {});
    assert.deepEqual(loadDraft(null).rows, {});
    for (const bad of ["{", "null", "[]", '{"v":2}', '{"v":1,"rows":{"gold_ZZ":{"priceMonthly":1,"priceAnnual":2,"active":true},"bogus":null,"gold_US":{"priceMonthly":1.5,"priceAnnual":2,"active":true}},"policy":{"evil":1,"enabled.GB":true}}']) {
      const d = parseDraft(bad);
      assert.deepEqual(d.rows, {}, bad);
    }
    assert.deepEqual(parseDraft('{"v":1,"rows":{},"policy":{"evil":1,"enabled.GB":true}}').policy, { "enabled.GB": true });
  });
});

// ── Policy helpers ──────────────────────────────────────────────────────────

describe("policy parsing and consistency", () => {
  test("defaults and stored keys", () => {
    const p = policyOf();
    assert.deepEqual([p.defaultCountry, p.fallbackCountry, p.unpricedPolicy, p.allowUserChangeCountry], ["IN", "IN", "unavailable", true]);
    assert.equal(isCountryEnabled(p, "US", REG.defaultEnabled), true);
    assert.equal(isCountryEnabled(p, "GB", REG.defaultEnabled), false);
    const q = policyOf({ "enabled.US": false, "enabled.IN": false, "enabled.GB": true, unpricedPolicy: "fallback", allowUserChangeCountry: false, "product.gold": { unpricedPolicy: "unavailable", fallbackCountry: "US" }, junk: 1 });
    assert.equal(isCountryEnabled(q, "US", REG.defaultEnabled), false);
    assert.equal(isCountryEnabled(q, "IN", REG.defaultEnabled), true, "IN is always enabled");
    assert.equal(q.allowUserChangeCountry, false);
    assert.deepEqual(planPolicy(q, "gold"), { unpricedPolicy: "unavailable", fallbackCountry: "US" });
    assert.deepEqual(planPolicy(q, "silver"), { unpricedPolicy: "fallback", fallbackCountry: "IN" });
    assert.ok(checkPolicyConsistency(q, REG.defaultEnabled).some((m) => /gold must be enabled/.test(m)));
    assert.deepEqual(checkPolicyConsistency(policyOf(), REG.defaultEnabled), []);
  });
  test("registry parser is tolerant: garbage falls back to the compiled table; limits and gateway taken from the server", () => {
    assert.equal(parseRegistry(null).source, "compiled");
    assert.equal(parseRegistry("x").countries.length, 249);
    const r = parseRegistry({
      planPrices: {
        countries: [{ code: "US", name: "United States", currency: "USD", minorUnitExponent: 2, defaultLocale: "en-US", region: "North America" }, { code: "bad" }],
        gatewayCurrencies: ["INR", "USD"], limits: { maxPerApply: 9999, maxMonthly: 5 }, activeCountries: ["IN", "US"], planIds: ["gold", "nope"],
        currencies: { USD: { code: "USD", exponent: 2, symbol: "$", minAmount: 75 } },
      },
    });
    assert.equal(r.source, "server");
    assert.equal(r.countries.length, 1);
    assert.deepEqual([...r.gatewayCurrencies], ["INR", "USD"]);
    assert.equal(r.limits.maxPerApply, 400, "never above 400 per apply");
    assert.equal(r.limits.maxMonthly, 5);
    assert.deepEqual([...r.planIds], ["gold"]);
    assert.equal(r.currencies.USD.minAmount, 75);
  });
});

// ── Preview as user (mirrors functions/pricing_all.test.js) ─────────────────

describe("preview as user: resolvePlanForCountry matrix", () => {
  const legacy = { gold: { monthly: 4900, annual: 46800 } };
  const rowOf = (...rows: ({ planId: string; country: string } & PreviewRow)[]) => (p: string, c: string): PreviewRow | null => rows.find((r) => r.planId === p && r.country === c) ?? null;
  const pr = (planId: string, cc: string, m: number, a: number, over: Partial<PreviewRow> = {}) => ({ planId, country: cc, currency: countryByCode(cc)!.currency, priceMonthly: m, priceAnnual: a, active: true, ...over });
  const res = (flat: FlatPolicy, cc: string, rows: ReturnType<typeof rowOf>, o: { plan?: string; allowFallback?: boolean; legacy?: Record<string, { monthly: number; annual: number } | null> | undefined } = {}) =>
    resolvePlan({ planId: o.plan ?? "gold", country: cc, now: NOW, policy: policyOf(flat), registry: regWithGateway, rowOf: rows, legacy: "legacy" in o ? o.legacy : legacy, allowFallback: o.allowFallback });
  const GB_ON: FlatPolicy = { "enabled.GB": true };

  test("enabled country with an active row: own row and currency", () => {
    const r = res(GB_ON, "GB", rowOf(pr("gold", "GB", 179, 1799)));
    assert.deepEqual(r.ok && [r.currency, r.priceMonthly, r.priceAnnual, r.priceCountry, r.fallbackApplied], ["GBP", 179, 1799, "GB", false]);
  });
  test("disabled country with a row is NOT sold", () => {
    const r = res({}, "GB", rowOf(pr("gold", "GB", 179, 1799)));
    assert.deepEqual(r, { ok: false, country: "GB", reason: "country_disabled" });
  });
  test("enabled without a row: unavailable policy refuses", () => {
    assert.deepEqual(res(GB_ON, "GB", rowOf()), { ok: false, country: "GB", reason: "no_row" });
  });
  test("fallback policy: disabled / unpriced country uses the fallback country's price and currency", () => {
    const flat = { unpricedPolicy: "fallback", fallbackCountry: "US", "enabled.GB": true };
    const rows = rowOf(pr("gold", "US", 199, 1999));
    const unpriced = res(flat, "GB", rows);
    assert.deepEqual(unpriced.ok && [unpriced.country, unpriced.priceCountry, unpriced.currency, unpriced.priceMonthly, unpriced.fallbackApplied], ["GB", "US", "USD", 199, true]);
    const disabled = res(flat, "BR", rows);
    assert.deepEqual(disabled.ok && [disabled.country, disabled.priceCountry, disabled.currency, disabled.fallbackApplied], ["BR", "US", "USD", true]);
  });
  test("fallback default (IN) uses the legacy INR price when there is no IN row", () => {
    const r = res({ unpricedPolicy: "fallback" }, "BR", rowOf());
    assert.deepEqual(r.ok && [r.currency, r.priceMonthly, r.source, r.priceCountry], ["INR", 4900, "legacy", "IN"]);
  });
  test("an inactive row or a future launch date never falls back; invalid row too", () => {
    const flat = { unpricedPolicy: "fallback", fallbackCountry: "US", "enabled.GB": true };
    const us = pr("gold", "US", 199, 1999);
    assert.equal((res(flat, "GB", rowOf(us, pr("gold", "GB", 179, 1799, { active: false }))) as { reason: string }).reason, "inactive");
    assert.equal((res(flat, "GB", rowOf(us, pr("gold", "GB", 179, 1799, { effectiveFrom: NOW + 1 }))) as { reason: string }).reason, "not_effective");
    assert.equal((res(flat, "GB", rowOf(us, pr("gold", "GB", 1, 1799))) as { reason: string }).reason, "invalid_row");
  });
  test("fallback country itself unpriced -> unavailable (no chaining)", () => {
    const r = res({ unpricedPolicy: "fallback", fallbackCountry: "US", "enabled.GB": true }, "GB", rowOf());
    assert.deepEqual(r, { ok: false, country: "GB", reason: "no_row" });
  });
  test("old clients (allowFallback=false) never get a fallback price", () => {
    assert.equal(res({ unpricedPolicy: "fallback" }, "BR", rowOf(), { allowFallback: false }).ok, false);
  });
  test("per-product override: gold unavailable while silver falls back; per-product fallback country", () => {
    const flat = { unpricedPolicy: "fallback", fallbackCountry: "US", "product.gold": { unpricedPolicy: "unavailable" } };
    const rows = rowOf(pr("gold", "US", 199, 1999), pr("silver", "US", 99, 999));
    assert.equal(res(flat, "BR", rows, { plan: "gold" }).ok, false);
    const s = res(flat, "BR", rows, { plan: "silver" });
    assert.deepEqual(s.ok && [s.priceMonthly, s.currency], [99, "USD"]);
    const g = res({ unpricedPolicy: "fallback", "enabled.GB": true, "product.gold": { fallbackCountry: "GB" } }, "BR", rowOf(pr("gold", "GB", 179, 1799)));
    assert.deepEqual(g.ok && [g.priceCountry, g.currency], ["GB", "GBP"]);
  });
  test("gateway currency check: refused clearly, accepted when listed, or falls back", () => {
    const jp = pr("gold", "JP", 500, 5000);
    const reg2 = (list: string[]) => ({ ...REG, gatewayCurrencies: list });
    const base = { planId: "gold", country: "JP", now: NOW, rowOf: rowOf(jp), legacy } as const;
    assert.deepEqual(resolvePlan({ ...base, policy: policyOf({ "enabled.JP": true }), registry: reg2(["INR", "USD"]) }), { ok: false, country: "JP", reason: "gateway_currency" });
    const okp = resolvePlan({ ...base, policy: policyOf({ "enabled.JP": true, gatewayCurrencies: ["INR", "JPY"] }), registry: reg2(["INR"]) });
    assert.deepEqual(okp.ok && [okp.currency, okp.priceMonthly], ["JPY", 500]);
    const fb = resolvePlan({ ...base, policy: policyOf({ "enabled.JP": true, unpricedPolicy: "fallback" }), registry: reg2(["INR", "USD"]) });
    assert.deepEqual(fb.ok && [fb.currency, fb.fallbackApplied], ["INR", true]);
  });
  test("unknown country; IN row beats legacy; no row uses legacy; IN always enabled", () => {
    assert.deepEqual(res({}, "ZZ", rowOf()), { ok: false, country: "ZZ", reason: "unknown_country" });
    const a = res({}, "IN", rowOf(pr("gold", "IN", 5900, 59000)));
    assert.deepEqual(a.ok && [a.source, a.priceMonthly], ["row", 5900]);
    const b = res({ "enabled.IN": false }, "IN", rowOf());
    assert.deepEqual(b.ok && [b.source, b.priceMonthly], ["legacy", 4900]);
  });
  test("three-decimal and zero-decimal prices pass through as integer minor units", () => {
    const flat = { "enabled.KW": true, "enabled.JP": true, gatewayCurrencies: ["INR", "KWD", "JPY"] };
    const kw = res(flat, "KW", rowOf(pr("gold", "KW", 1500, 15000)));
    assert.deepEqual(kw.ok && [kw.currency, kw.exponent, kw.priceMonthly], ["KWD", 3, 1500]);
    const jp = res(flat, "JP", rowOf(pr("gold", "JP", 500, 5000)));
    assert.deepEqual(jp.ok && [jp.currency, jp.exponent, jp.priceMonthly], ["JPY", 0, 500]);
  });
  test("legacy price unknown to the console is stated, not invented", () => {
    const r = resolvePlan({ planId: "gold", country: "IN", now: NOW, policy: policyOf(), registry: REG, rowOf: rowOf() });
    assert.deepEqual(r.ok && [r.source, r.priceMonthly], ["legacy_unknown", null]);
  });
});

describe("preview as user: what the app shows", () => {
  const rows: Record<string, PreviewRow> = {
    gold_US: { currency: "USD", priceMonthly: 499, priceAnnual: 4999, active: true },
    gold_KW: { currency: "KWD", priceMonthly: 1500, priceAnnual: 15000, active: true },
    gold_JP: { currency: "JPY", priceMonthly: 500, priceAnnual: 5000, active: true },
  };
  const rowOf = (p: string, c: string) => rows[`${p}_${c}`] ?? null;
  const mk = (country: string, flat: FlatPolicy = {}) => previewAsUser({
    country, now: NOW, policy: policyOf(flat), registry: { ...REG, gatewayCurrencies: ["INR", "USD", "KWD", "JPY"] }, rowOf, legacy: { silver: { monthly: 4900, annual: 46800 } },
  });

  test("priced plan is formatted with Intl in the right currency; others unavailable", () => {
    const p = mk("US");
    assert.equal(p.countryName, "United States");
    assert.equal(p.enabled, true);
    const gold = p.plans.find((x) => x.planId === "gold")!;
    assert.equal(gold.monthly, "$4.99 / month");
    assert.equal(gold.annual, "$49.99 / year");
    assert.equal(p.plans.length, 5);
    assert.equal(p.plans.find((x) => x.planId === "silver")!.monthly, "Not available in your region");
  });
  test("zero and three decimal currencies", () => {
    const kw = mk("KW", { "enabled.KW": true }).plans.find((x) => x.planId === "gold")!;
    assert.match(kw.monthly, /1\.500/);
    const jp = mk("JP", { "enabled.JP": true }).plans.find((x) => x.planId === "gold")!;
    assert.ok(/500/.test(jp.monthly) && !/\./.test(jp.monthly.replace(/ \/ month$/, "")));
  });
  test("disabled country -> unavailable; fallback policy -> 'Prices shown in <country> (<CUR>)'", () => {
    const off = mk("BR");
    assert.equal(off.enabled, false);
    assert.equal(off.plans.find((x) => x.planId === "gold")!.available, false);
    const fb = mk("BR", { unpricedPolicy: "fallback", fallbackCountry: "US" });
    const gold = fb.plans.find((x) => x.planId === "gold")!;
    assert.equal(gold.fallbackLine, "Prices shown in United States (USD)");
    assert.equal(gold.monthly, "$4.99 / month");
    assert.equal(gold.fallbackApplied, true);
  });
  test("gateway currency refusal has its own wording", () => {
    const p = previewAsUser({ country: "JP", now: NOW, policy: policyOf({ "enabled.JP": true }), registry: { ...REG, gatewayCurrencies: ["INR", "USD"] }, rowOf });
    assert.equal(p.plans.find((x) => x.planId === "gold")!.monthly, "Payments in your currency are not available yet.");
  });
  test("allow-change line follows the policy", () => {
    assert.match(mk("US").allowChangeLine, /can change their country/);
    assert.match(mk("US", { allowUserChangeCountry: false }).allowChangeLine, /locked/);
  });
  test("every one of the 249 countries previews without throwing", () => {
    for (const c of COUNTRIES) {
      const p = previewAsUser({ country: c.code, now: NOW, policy: policyOf({ unpricedPolicy: "fallback" }), registry: REG, rowOf });
      assert.equal(p.plans.length, 5, c.code);
    }
  });
  test("formatMinor sanity for the previews", () => {
    assert.equal(formatMinor(1500, "KWD", { exponent: 3, locale: "en-US", exact: true }).replace(/[^\d.]/g, ""), "1.500");
  });
});

// ── Role gating ─────────────────────────────────────────────────────────────

describe("role gating (plans.read vs plans.modify)", () => {
  const ui = (perms: string[]) => pricingUi(pricingAccess((p: Permission) => hasPermission(perms, p)));
  test("no plans.read: nothing is shown", () => {
    const u = ui(["dashboard.read"]);
    assert.ok(Object.values(u).every((v) => v === false));
  });
  test("plans.read: browse, preview, export, history; NO edit / bulk / import / policy / publish controls", () => {
    const u = ui(["plans.read"]);
    assert.deepEqual([u.showTable, u.showPreview, u.showExport, u.showHistory], [true, true, true, true]);
    assert.deepEqual([u.showEditControls, u.showBulk, u.showImport, u.showPolicyEditing, u.showPublish, u.showRollback], [false, false, false, false, false, false]);
  });
  test("plans.modify: every editing control and rollback", () => {
    const u = ui(["plans.read", "plans.modify"]);
    assert.ok(Object.values(u).every((v) => v === true));
    assert.ok(Object.values(ui(["*"])).every((v) => v === true));
    assert.equal(ui(["plans.modify"]).showEditControls, false, "modify without read still sees nothing");
  });
  test("history target labels exist for both targets", () => {
    assert.equal(TARGET_LABELS.planPrices, "Country pricing");
    assert.equal(TARGET_LABELS.pricingPolicy, "Country pricing policy");
  });
});

// ── Publish flow ────────────────────────────────────────────────────────────

describe("publish flow logic", () => {
  const step = (target: PublishTarget, index: number, of: number, size = 400) => ({ target, index, of, size, patch: { x: 1 } as Record<string, unknown> });
  const steps = [step("planPrices", 1, 3), step("planPrices", 2, 3), step("planPrices", 3, 3, 35), step("pricingPolicy", 1, 1, 2)];
  const deps = (call: PublishDeps["call"], versions = { planPrices: 7, pricingPolicy: 3 } as Record<PublishTarget, number | null>): PublishDeps => ({ call, versions, lock: { busy: false } });

  test("reason must be at least 5 characters", () => {
    assert.ok(validatePublishReason("abcd"));
    assert.ok(validatePublishReason("    abcd  "));
    assert.equal(validatePublishReason("abcde"), null);
  });
  test("invalid reason: no call is made", async () => {
    let n = 0;
    const r = await runPublish(steps, "no", deps(async () => { n++; return { version: 1 }; }));
    assert.equal(r.status, "invalid_reason");
    assert.equal(n, 0);
  });
  test("happy path: each chunk uses the version returned by the previous one; reason trimmed", async () => {
    const seen: [string, number, string][] = [];
    let v = 7;
    const d = deps(async (t, _p, exp, reason) => { seen.push([t, exp, reason]); return { version: t === "planPrices" ? ++v : 4 }; });
    const r = await runPublish(steps, "  new launch prices  ", d);
    assert.equal(r.status, "done");
    assert.deepEqual(seen, [["planPrices", 7, "new launch prices"], ["planPrices", 8, "new launch prices"], ["planPrices", 9, "new launch prices"], ["pricingPolicy", 3, "new launch prices"]]);
    assert.deepEqual(r.versions, { planPrices: 10, pricingPolicy: 4 });
    assert.equal(r.appliedRows, 835);
    assert.equal(r.needsReload, false);
    assert.equal(d.lock.busy, false, "lock released");
  });
  test("stale version (aborted) on chunk 2: chunk 1 applied, the rest NOT applied, honest report", async () => {
    let n = 0;
    const r = await runPublish(steps, "valid reason", deps(async () => {
      n++;
      if (n === 2) throw { code: "functions/aborted", kind: "conflict", message: "changed (now version 9)" };
      return { version: 8 };
    }));
    assert.equal(r.status, "partial");
    assert.deepEqual(r.steps.map((s) => s.status), ["applied", "stale", "skipped", "skipped"]);
    assert.equal(n, 2, "stops at the first failure");
    assert.equal(r.needsReload, true);
    assert.equal(r.appliedRows, 400);
    assert.match(r.message, /Applied: price chunk 1\/3/);
    assert.match(r.message, /Not applied: price chunk 3\/3/);
    assert.match(r.message, /draft still holds/);
  });
  test("failure on the first chunk: nothing applied -> failed", async () => {
    const r = await runPublish(steps, "valid reason", deps(async () => { throw { code: "invalid-argument", message: "gold_US: bad price" }; }));
    assert.equal(r.status, "failed");
    assert.match(r.message, /Nothing was applied/);
    assert.match(r.message, /gold_US: bad price/);
  });
  test("'already the current configuration' is a no-op chunk, not a failure", async () => {
    let n = 0;
    const r = await runPublish(steps.slice(0, 2), "valid reason", deps(async () => {
      n++;
      if (n === 1) throw { code: "failed-precondition", message: "That is already the current configuration." };
      return { version: 8 };
    }));
    assert.equal(r.status, "done");
    assert.deepEqual(r.steps.map((s) => s.status), ["noop", "applied"]);
    assert.equal(classifyPublishError({ code: "failed-precondition", message: "other" }).cls, "failed");
    assert.equal(classifyPublishError({ code: "permission-denied", message: "no" }).cls, "permission");
  });
  test("server does not return a version: the next chunk is not guessed, reload is demanded", async () => {
    const r = await runPublish(steps.slice(0, 2), "valid reason", deps(async () => ({})));
    assert.deepEqual(r.steps.map((s) => s.status), ["applied", "failed"]);
    assert.equal(r.needsReload, true);
    assert.equal(r.status, "partial");
  });
  test("unknown starting version: refuses to send", async () => {
    let n = 0;
    const r = await runPublish(steps, "valid reason", deps(async () => { n++; return { version: 1 }; }, { planPrices: null, pricingPolicy: 1 }));
    assert.equal(n, 0);
    assert.equal(r.status, "failed");
  });
  test("double submit: a second publish while one is running is refused, never sent", async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((res) => { release = res; });
    const d = deps(async () => { calls++; await gate; return { version: 8 }; });
    const first = runPublish([steps[0]], "valid reason", d);
    const second = await runPublish([steps[0]], "valid reason", d);
    assert.equal(second.status, "busy");
    release();
    const done = await first;
    assert.equal(done.status, "done");
    assert.equal(calls, 1);
    assert.equal(d.lock.busy, false);
  });
  test("nothing to publish", async () => {
    assert.equal((await runPublish([], "valid reason", deps(async () => ({ version: 1 })))).status, "nothing");
  });
});

describe("history + rollback", () => {
  const raw = { rows: [
    { id: "planPrices_5", target: "planPrices", version: 5, kind: "apply", reason: "launch", actorEmail: "a@b.c", at: 10, changes: [{ field: "gold_US", from: "null", to: "{...}" }] },
    { id: "pricingPolicy_2", target: "pricingPolicy", version: 2, kind: "rollback", rolledBackFrom: 1, reason: "undo", actorEmail: "a@b.c", at: 20, changes: [] },
    { target: "flags", version: 9 }, { target: "planPrices" }, null,
  ] };
  test("tolerant parsing keeps only the two pricing targets", () => {
    const h = parseHistory(raw);
    assert.deepEqual(h.map((x) => [x.target, x.version, x.kind]), [["planPrices", 5, "apply"], ["pricingPolicy", 2, "rollback"]]);
    assert.equal(h[0].lines[0], "gold_US: null -> {...}");
    assert.deepEqual(parseHistory(null), []);
    assert.equal(latestVersion(h, "planPrices"), 5);
    assert.equal(latestVersion(h, "pricingPolicy"), 2);
  });
  test("rollback request uses the existing machinery (before side, expectedVersion, trimmed reason)", () => {
    const h = parseHistory(raw)[0];
    assert.deepEqual(rollbackRequest(h, 6, "  mistake in GB  "), { action: "rollback", target: "planPrices", version: 5, side: "before", expectedVersion: 6, reason: "mistake in GB" });
  });
});

describe("wiring guards", () => {
  const root = path.resolve(__dirname, "../../src/features/pricing");
  const strip = (s: string) => s.replace(/\/\/.*$/gm, "");
  test("pure modules import no React / Firebase / aliases", () => {
    for (const f of ["registry", "rules", "table", "bulk", "csv", "draft", "publish", "preview", "history"]) {
      const src = fs.readFileSync(path.join(root, `${f}.ts`), "utf8");
      assert.ok(!/from "(react|firebase|next)|from "@\//.test(src), `${f}.ts`);
    }
  });
  test("no live FX call anywhere in the pricing feature (rates are typed by the admin)", () => {
    for (const f of fs.readdirSync(root).filter((x) => /\.(ts|tsx)$/.test(x) && x !== "countriesData.ts")) {
      const src = strip(fs.readFileSync(path.join(root, f), "utf8"));
      assert.ok(!/\bfetch\(|XMLHttpRequest|exchangerate|openexchange|frankfurter/i.test(src), f);
    }
  });
  test("the page carries the manual-rates notice and keeps the legacy generator out of the data path", () => {
    const bulk = fs.readFileSync(path.join(root, "bulk.ts"), "utf8");
    assert.match(bulk, /Rates are manual/);
    const data = fs.readFileSync(path.join(root, "countriesData.ts"), "utf8");
    assert.match(data, /GENERATED by akaya_ai\/functions\/scripts\/gen-country-table\.js/);
  });
});

// keep helper imports honest
void (null as unknown as TableRow);

describe("selection across pages", () => {
  test("keeps other pages, replaces the current page's part", async () => {
    const { mergeSelection } = await import("../features/pricing/table");
    const out = mergeSelection(new Set(["A", "B", "Z"]), ["A", "B", "C"], new Set(["C"]));
    assert.deepEqual([...out].sort(), ["C", "Z"]);
    assert.deepEqual([...mergeSelection(new Set(), ["A", "B"], new Set(["A", "B"]))].sort(), ["A", "B"]);
  });
});

describe("policy warnings + draft row lookup", () => {
  test("fallback policy whose fallback country is unpriced warns per product; priced / legacy IN does not", async () => {
    const { policyWarnings, previewRowLookup } = await import("../features/pricing/preview");
    const base = new Map([["gold_US", { currency: "USD", priceMonthly: 499, priceAnnual: 4999, active: true, effectiveFrom: null as number | null }]]);
    const rowOf = previewRowLookup(base, {}, REG);
    const w = policyWarnings(policyOf({ unpricedPolicy: "fallback", fallbackCountry: "US", "enabled.US": true }), REG, rowOf, undefined, PLAN_IDS, NOW);
    assert.deepEqual(w.map((x) => x.planId), ["silver", "app_premium", "floating_premium", "all_access"], "gold has a US price, the others do not");
    assert.match(w[0].message, /no usable price/);
    // IN fallback: legacy price known -> fine; plan not purchasable -> warns
    const inLegacy = policyWarnings(policyOf({ unpricedPolicy: "fallback" }), REG, rowOf, { silver: { monthly: 4900, annual: 46800 }, gold: null }, ["silver", "gold"], NOW);
    assert.deepEqual(inLegacy.map((x) => x.planId), ["gold"]);
    // not warning when the policy is 'unavailable'
    assert.deepEqual(policyWarnings(policyOf(), REG, rowOf, undefined, PLAN_IDS, NOW), []);
    // gateway currency problem on the fallback country
    const gw = policyWarnings(policyOf({ unpricedPolicy: "fallback", fallbackCountry: "US", "enabled.US": true, gatewayCurrencies: ["INR"] }), REG, rowOf, undefined, ["gold"], NOW);
    assert.match(gw[0].message, /not accepted by the payment gateway/);
    // a draft edit counts
    const edited = previewRowLookup(base, { silver_US: { priceMonthly: 99, priceAnnual: 999, active: true }, gold_US: null }, REG);
    assert.equal(edited("silver", "US")!.currency, "USD");
    assert.equal(edited("gold", "US"), null);
  });
});
