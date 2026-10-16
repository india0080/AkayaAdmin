// Pure console logic: confirmation gating, sorting, counts, errors, theme.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canConfirm, countLabel, formatNumber, nextSort, relativeTime, sortRows } from "../ui/logic";
import { normaliseError, operatorMessage } from "../lib/apiErrors";
import { hasPermission } from "../lib/permissions";
import { parsePref, resolveTheme } from "../shell/theme";

test("confirm: harmless level needs nothing", () => {
  assert.equal(canConfirm("confirm", "", ""), true);
});

test("confirm: reason level needs a real reason", () => {
  assert.equal(canConfirm("reason", "   ", ""), false);
  assert.equal(canConfirm("reason", "abc", ""), false);
  assert.equal(canConfirm("reason", "Customer refund", ""), true);
});

test("confirm: typed level needs the exact phrase AND a reason", () => {
  assert.equal(canConfirm("typed", "Outage response", "maintenance", "MAINTENANCE"), false);
  assert.equal(canConfirm("typed", "", "MAINTENANCE", "MAINTENANCE"), false);
  assert.equal(canConfirm("typed", "Outage response", " MAINTENANCE ", "MAINTENANCE"), true);
  assert.equal(canConfirm("typed", "Outage response", "x", undefined), false);
});

test("sort cycles asc → desc → off, and restarts on a new column", () => {
  assert.deepEqual(nextSort(null, "a"), { id: "a", dir: "asc" });
  assert.deepEqual(nextSort({ id: "a", dir: "asc" }, "a"), { id: "a", dir: "desc" });
  assert.equal(nextSort({ id: "a", dir: "desc" }, "a"), null);
  assert.deepEqual(nextSort({ id: "a", dir: "desc" }, "b"), { id: "b", dir: "asc" });
});

test("sortRows: numeric, natural string, nulls always last, stable", () => {
  const rows = [
    { n: "b", v: 10 }, { n: "a", v: null }, { n: "c", v: 2 }, { n: "d", v: 10 },
  ];
  const val = (r: { n: string; v: number | null }, id: string) => (id === "v" ? r.v : r.n);
  assert.deepEqual(sortRows(rows, { id: "v", dir: "asc" }, val).map((r) => r.n), ["c", "b", "d", "a"]);
  assert.deepEqual(sortRows(rows, { id: "v", dir: "desc" }, val).map((r) => r.n), ["b", "d", "c", "a"]);
  const names = [{ n: "item10" }, { n: "item2" }];
  assert.deepEqual(sortRows(names, { id: "n", dir: "asc" }, (r) => r.n).map((r) => r.n), ["item2", "item10"]);
  assert.deepEqual(sortRows(rows, null, val), rows);
});

test("countLabel never invents a total", () => {
  assert.equal(countLabel(25, 1204, true), "Showing 25 of 1,204");
  assert.equal(countLabel(12, 12, false), "All 12");
  assert.equal(countLabel(25, null, true), "Showing 25 (more available)");
  assert.equal(countLabel(7, null, false), "7 shown");
});

test("formatNumber uses Indian grouping and dashes for missing", () => {
  assert.equal(formatNumber(1234567), "12,34,567");
  assert.equal(formatNumber(null), "—");
  assert.equal(formatNumber(Number.NaN), "—");
});

test("relativeTime", () => {
  const now = Date.UTC(2026, 8, 23, 12, 0, 0);
  assert.equal(relativeTime(now - 10_000, now), "just now");
  assert.equal(relativeTime(now - 5 * 60_000, now), "5m ago");
  assert.equal(relativeTime(now - 3 * 3_600_000, now), "3h ago");
  assert.equal(relativeTime(now - 2 * 86_400_000, now), "2d ago");
  assert.equal(relativeTime(null, now), "—");
});

test("errors: permission, validation, missing function, offline — no raw text leaks", () => {
  assert.equal(normaliseError({ code: "functions/permission-denied", message: "Your role does not include x." }).kind, "permission");
  const v = normaliseError({ code: "functions/invalid-argument", message: "durationDays must be 1-400." });
  assert.equal(v.kind, "validation");
  assert.equal(v.message, "durationDays must be 1-400.");
  assert.equal(normaliseError({ code: "functions/not-found", message: "NOT_FOUND" }).kind, "missing-function");
  assert.equal(normaliseError({ code: "functions/not-found", message: "Admin not found." }).kind, "not-found");
  const internal = normaliseError({ code: "functions/internal", message: "TypeError: x at y.js:12" });
  assert.equal(internal.kind, "unavailable");
  assert.ok(!internal.message.includes("TypeError"), "stack text must not reach the operator");
  assert.equal(normaliseError(new Error("Failed to fetch")).kind, "unavailable");
  assert.equal(normaliseError({ code: "functions/internal" }).retryable, true);
  assert.equal(normaliseError({ code: "functions/permission-denied" }).retryable, false);
});

test("hasPermission mirrors the server", () => {
  assert.ok(hasPermission(["*"], "admins.manage"));
  assert.ok(hasPermission(["ai.*"], "ai.routing.activate"));
  assert.ok(!hasPermission(["ai.models.read"], "ai.models.configure"));
});

test("theme resolution", () => {
  assert.equal(resolveTheme("dark", false), "dark");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(parsePref("system"), "system");
  assert.equal(parsePref("bogus"), "light");
  assert.equal(parsePref(null), "light");
});

test("operatorMessage: deliberate plain Error text is kept; API/runtime errors stay operator-safe", () => {
  assert.equal(operatorMessage(new Error("You sent this exact notification to this audience in the last 10 minutes.")), "You sent this exact notification to this audience in the last 10 minutes.");
  assert.match(operatorMessage({ code: "functions/internal", message: "boom" }), /did not respond/);
  assert.match(operatorMessage(new TypeError("x is undefined")), /Something went wrong/);
  assert.match(operatorMessage({ code: "functions/permission-denied", message: "Your role does not include x." }), /Your role does not include x\./);
});
