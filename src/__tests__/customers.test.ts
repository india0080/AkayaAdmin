// Customers domain — pure helpers behind the Directory and User 360.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accountStatus, daysLeft, providerLabel, usageTotals, validTokenGrant } from "../features/customers/logic";
import { findRoute } from "../shell/nav";

const day = (date: string, o: Partial<Record<string, number>> = {}) => ({
  date, messages: 0, voice: 0, tts: 0, images: 0, videos: 0, webSearch: 0, webFetch: 0, ...o,
});

test("usage totals sum the window and count active days", () => {
  const t = usageTotals([day("2026-09-23", { messages: 10, voice: 2 }), day("2026-09-22"), day("2026-09-21", { images: 1 })]);
  assert.equal(t.messages, 10);
  assert.equal(t.voice, 2);
  assert.equal(t.images, 1);
  assert.equal(t.activeDays, 2);
});

test("days left rounds up, negative when lapsed, null without expiry", () => {
  const now = Date.UTC(2026, 8, 23);
  assert.equal(daysLeft(now + 1.2 * 86_400_000, now), 2);
  assert.equal(daysLeft(now - 86_400_000, now), -1);
  assert.equal(daysLeft(null, now), null);
});

test("account status", () => {
  assert.deepEqual(accountStatus({ auth: { exists: false }, erasure: null }), { label: "No sign-in record", tone: "degraded" });
  assert.equal(accountStatus({ auth: { exists: false }, erasure: { failedSteps: ["x"], resolved: false } }).tone, "down");
  const live = { exists: true as const, disabled: false, providers: [], anonymous: true, lastSignInAt: null, lastRefreshAt: null, tokensValidAfter: null };
  assert.equal(accountStatus({ auth: live, erasure: null }).label, "Active");
  assert.equal(accountStatus({ auth: { ...live, disabled: true }, erasure: null }).label, "Disabled");
});

test("token grants: whole numbers 1..1,000,000 only (the server's cap)", () => {
  assert.equal(validTokenGrant("5000"), 5000);
  assert.equal(validTokenGrant(" 1 "), 1);
  assert.equal(validTokenGrant("1000000"), 1_000_000);
  for (const bad of ["0", "1000001", "12.5", "-5", "1e3", "", "abc"]) assert.equal(validTokenGrant(bad), null, bad);
});

test("provider labels", () => {
  assert.equal(providerLabel("google.com"), "Google");
  assert.equal(providerLabel("phone"), "Phone OTP");
  assert.equal(providerLabel("oidc.x"), "oidc.x");
});

test("the User 360 route belongs to User Directory (breadcrumb + permission)", () => {
  const hit = findRoute("/dashboard/users/view");
  assert.equal(hit?.route.label, "User Directory");
  assert.equal(hit?.route.permission, "users.read");
  assert.equal(findRoute("/dashboard/erasure")?.route.permission, "users.erasure");
});
