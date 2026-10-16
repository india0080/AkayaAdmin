// Change 9: notification campaigns - pure logic (features/comms/campaign.ts, destinations.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BODY_MAX, CONFIRM_ALL_PHRASE, COUNT_ROWS, COUNTS_DISCLAIMER, EMPTY_DRAFT, LARGE_SEND, TITLE_MAX, UNSUPPORTED_AUDIENCE_NOTE, USERS_MAX,
  MAX_DEVICES, audienceLabel, audiencePayload, canCancel, friendlyError, listRequest, overDeviceCap, planFor, promoteRequest, cancelRequest, charCount, commsAccess, composePayload, confirmPlan, estimateLabel, localToMs,
  normalizeCampaign, normalizeCampaignList, normalizeValidate, parseUserList, sendRequest, statusMeta, testSendRequest,
  textProblem, validateAudience, validateDraft, validateSchedule, type CampaignDraft,
} from "../features/comms/campaign";
import { DESTINATIONS, destinationPayload, parseRegistryJson, registryFrom, selectableDestinations, validateDestination } from "../features/comms/destinations";
import { hasPermission } from "../lib/permissions";

const NOW = Date.UTC(2026, 9, 2, 12, 0, 0);
const draft = (o: Partial<CampaignDraft> = {}): CampaignDraft => ({ ...EMPTY_DRAFT, title: "Hello", body: "World", ...o });
const localIn = (ms: number) => {
  const d = new Date(NOW + ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ── Destinations ────────────────────────────────────────────────────────────
test("destination: unknown type rejected, known types without params pass", () => {
  assert.ok(validateDestination({ type: "nope", params: {} }).type);
  assert.deepEqual(validateDestination({ type: "home", params: {} }), {});
});
test("destination: support_ticket needs a well-formed ticketId; unknown params rejected", () => {
  assert.ok(validateDestination({ type: "support_ticket", params: {} }).ticketId);
  assert.ok(validateDestination({ type: "support_ticket", params: { ticketId: "a b" } }).ticketId);
  assert.deepEqual(validateDestination({ type: "support_ticket", params: { ticketId: "t1" } }), {}); // regex is {1,128}
  assert.ok(validateDestination({ type: "support_ticket", params: { ticketId: "../x" } }).ticketId);
  assert.deepEqual(validateDestination({ type: "support_ticket", params: { ticketId: "abc123XYZ" } }), {});
  assert.ok(validateDestination({ type: "home", params: { x: "1" } }).x);
});
test("destination: generic list excludes support_ticket; payload keeps registry params only", () => {
  assert.ok(!selectableDestinations().some((d) => d.type === "support_ticket"));
  assert.deepEqual(destinationPayload({ type: "support_ticket", params: { ticketId: " abc123 ", evil: "x" } }), { type: "support_ticket", params: { ticketId: "abc123" } });
  assert.deepEqual(destinationPayload({ type: "home", params: { a: "b" } }), { type: "home", params: {} });
});
test("destination: no external url and no free-form route destinations", () => {
  for (const d of DESTINATIONS) {
    assert.ok(d.appRoute.startsWith("/"), d.type);
    assert.ok(!/^[a-z]+:\/\//.test(d.appRoute), d.type);
    assert.notEqual(d.type, "external_url");
  }
});

const REGISTRY_JSON = path.resolve(__dirname, "../../../akaya_ai/assets/deeplinks/registry.json");
test("parity: destination registry equals akaya_ai/assets/deeplinks/registry.json", (t) => {
  if (!fs.existsSync(REGISTRY_JSON)) {
    t.skip(`registry.json not present yet (${REGISTRY_JSON}); parity not checked. It must be checked once the backend produces it.`);
    return;
  }
  const raw = JSON.parse(fs.readFileSync(REGISTRY_JSON, "utf8"));
  const json = parseRegistryJson(raw);
  assert.equal(json.length, 16);
  assert.deepEqual(DESTINATIONS, json); // exact: types, labels, params + regexes, routes, auth flags, selectable
  assert.equal(DESTINATIONS.find((d) => d.type === "support_ticket")?.params.ticketId.regex, "^[A-Za-z0-9_-]{1,128}$");
  assert.equal(DESTINATIONS.find((d) => d.type === "support_ticket")?.appRoute, "/support/ticket/:ticketId");
  assert.deepEqual(registryFrom({ registry: raw }), json); // runtime registry from adminComms destinations
});

// ── Text and limits ─────────────────────────────────────────────────────────
test("limits mirror the server (65 / 240) and counts are live", () => {
  assert.equal(TITLE_MAX, 65);
  assert.equal(BODY_MAX, 240);
  assert.equal(charCount("abc", 65).label, "3/65");
  assert.equal(charCount("x".repeat(66), 65).over, true);
  assert.equal(charCount("x".repeat(65), 65).over, false);
  assert.equal(charCount("\u{1F600}", 65).length, 1); // code points, not UTF-16 units
});
test("text rules: required, max, brackets, control chars, newline only in body", () => {
  assert.ok(textProblem("   ", "Title", 65, false));
  assert.ok(textProblem("x".repeat(66), "Title", 65, false));
  assert.ok(textProblem("<b>x</b>", "Title", 65, false));
  assert.ok(textProblem("a\nb", "Title", 65, false));
  assert.equal(textProblem("a\nb", "Message", 240, true), null);
  assert.ok(textProblem("a\u0000b", "Message", 240, true));
});

// ── Audience ────────────────────────────────────────────────────────────────
test("audience payloads per kind", () => {
  const base = draft().audience;
  assert.deepEqual(audiencePayload({ ...base, kind: "all" }, null), { kind: "all" });
  assert.deepEqual(audiencePayload({ ...base, kind: "entitlement", group: "all_access" }, null), { kind: "entitlement", group: "all_access" });
  assert.deepEqual(audiencePayload({ ...base, kind: "platform", platform: "ios" }, null), { kind: "platform", platform: "ios" });
  // AND filters
  assert.deepEqual(audiencePayload({ ...base, kind: "entitlement", group: "free", platform: "android", language: "HI" }, null), { kind: "entitlement", group: "free", platform: "android", language: "hi" });
  assert.deepEqual(audiencePayload({ ...base, kind: "platform", platform: "ios", language: "en" }, null), { kind: "platform", platform: "ios", language: "en" });
  assert.deepEqual(audiencePayload({ ...base, kind: "all", platform: "ios", language: "en" }, null), { kind: "all" }); // no filters on all
  assert.deepEqual(audiencePayload({ ...base, kind: "language", language: " HI " }, null), { kind: "language", language: "hi" });
  assert.deepEqual(audiencePayload({ ...base, kind: "language", language: "hi", platform: "ios" }, null), { kind: "language", language: "hi", platform: "ios" });
  assert.deepEqual(audiencePayload({ ...base, kind: "users", usersText: "uid_123456, uid_123456 uid_777777" }, null), { kind: "users", uids: ["uid_123456", "uid_777777"] });
});
test("explicit user list: dedupe, classify, invalid, <=500", () => {
  const l = parseUserList("abcdef1, ABCDEF1\nx@y.io;bad token!");
  assert.deepEqual(l.uids, ["abcdef1", "ABCDEF1"]);
  assert.deepEqual(l.emails, ["x@y.io"]);
  assert.deepEqual(l.invalid, ["bad", "token!"]);
  const base = draft().audience;
  assert.ok(validateAudience({ ...base, kind: "users", usersText: "" }, null).users);
  assert.ok(validateAudience({ ...base, kind: "users", usersText: "bad!" }, null).users);
  assert.match(validateAudience({ ...base, kind: "users", usersText: "a@b.com" }, null).users, /Emails are not accepted/);
  const many = Array.from({ length: USERS_MAX + 1 }, (_, i) => `user_${String(i).padStart(5, "0")}`).join(",");
  assert.ok(validateAudience({ ...base, kind: "users", usersText: many }, null).users);
  assert.deepEqual(validateAudience({ ...base, kind: "users", usersText: many.split(",").slice(0, USERS_MAX).join(",") }, null), {});
});
test("language and enums validated", () => {
  const base = draft().audience;
  assert.ok(validateAudience({ ...base, kind: "language", language: "" }, null).language);
  assert.ok(validateAudience({ ...base, kind: "language", language: "english!" }, null).language);
  assert.ok(validateAudience({ ...base, kind: "platform", platform: "" }, null).platform); // required for its own kind
  assert.ok(validateAudience({ ...base, kind: "entitlement", language: "bad lang" }, null).language); // optional filter still validated
  assert.deepEqual(validateAudience({ ...base, kind: "entitlement", group: "free", platform: "ios", language: "hi" }, null), {});
  assert.deepEqual(validateAudience({ ...base, kind: "language", language: "pt-BR" }, null), {});
});
test("ticket destination locks the audience to the ticket owner", () => {
  const d = draft({ destination: { type: "support_ticket", params: { ticketId: "abc123" } }, ticket: { ticketId: "abc123", ownerUid: "u_owner1" } });
  assert.deepEqual(composePayload(d).audience, { kind: "ticket_owner", ticketId: "abc123" });
  assert.deepEqual(validateDraft(d, NOW), {});
  // without a lookup it is invalid
  assert.ok(validateDraft({ ...d, ticket: null }, NOW).ticket);
  // changing the id after lookup invalidates the lock
  assert.ok(validateDraft({ ...d, destination: { type: "support_ticket", params: { ticketId: "other99" } } }, NOW)["dest.ticketId"]);
  // a stale lock is ignored for other destinations
  const home = { ...d, destination: { type: "home", params: {} } };
  assert.notEqual(composePayload(home).audience.kind, "ticket_owner");
});
test("unsupported filters are stated", () => {
  assert.match(UNSUPPORTED_AUDIENCE_NOTE, /country/);
  assert.match(UNSUPPORTED_AUDIENCE_NOTE, /app version/);
  assert.match(audienceLabel({ kind: "entitlement", group: "floating_premium" }), /Floating Premium/);
  assert.equal(audienceLabel({ kind: "users", uids: ["a", "b"] }), "2 specific users");
});

// ── Schedule ────────────────────────────────────────────────────────────────
test("schedule: now needs nothing; at needs a valid window", () => {
  assert.deepEqual(validateSchedule({ mode: "now", local: "" }, NOW), {});
  assert.ok(validateSchedule({ mode: "at", local: "" }, NOW).at);
  assert.ok(validateSchedule({ mode: "at", local: "garbage" }, NOW).at);
  assert.ok(validateSchedule({ mode: "at", local: localIn(30_000) }, NOW).at); // < 1 min
  assert.deepEqual(validateSchedule({ mode: "at", local: localIn(90_000) }, NOW), {}); // >= 1 min ok
  assert.deepEqual(validateSchedule({ mode: "draft", local: "" }, NOW), {});
  assert.ok(validateSchedule({ mode: "at", local: localIn(61 * 24 * 3600_000) }, NOW).at);
  assert.deepEqual(validateSchedule({ mode: "at", local: localIn(3600_000) }, NOW), {});
});
test("schedule payload is an exact epoch instant", () => {
  const local = localIn(3600_000);
  assert.deepEqual(composePayload(draft({ schedule: { mode: "at", local } })).schedule, { mode: "at", at: localToMs(local) });
  assert.deepEqual(composePayload(draft()).schedule, { mode: "now" });
  assert.deepEqual(composePayload(draft({ schedule: { mode: "draft", local: "" } })).schedule, { mode: "draft" });
});

// ── Draft validation and requests ───────────────────────────────────────────
test("valid draft has no errors; empty text and bad image flagged", () => {
  assert.deepEqual(validateDraft(draft({ audience: { ...draft().audience, kind: "all" } }), NOW), {});
  assert.ok(validateDraft(draft({ title: "" }), NOW).title);
  assert.ok(validateDraft(draft({ body: "x".repeat(241) }), NOW).body);
  assert.ok(validateDraft(draft({ image: { url: "http://x/y.png" } }), NOW).image);
});
test("composePayload trims, includes https image only when set", () => {
  const p = composePayload(draft({ title: "  Hi ", image: { url: "https://cdn.example/x.png" } }));
  assert.equal(p.title, "Hi");
  assert.equal(p.imageUrl, "https://cdn.example/x.png");
  assert.equal("imageUrl" in composePayload(draft()), false);
});
test("send request: reason, confirmAll only for audience all, force only when asked, no requestId", () => {
  const all = draft({ audience: { ...draft().audience, kind: "all" } });
  const r = sendRequest(all, { reason: "launch", confirmAll: true }) as Record<string, unknown>;
  assert.equal(r.action, "sendCampaign");
  assert.equal(r.confirmAll, true);
  assert.equal(r.reason, "launch");
  assert.equal("force" in r, false);
  assert.equal("requestId" in r, false);
  const seg = sendRequest(draft(), {}) as Record<string, unknown>;
  assert.equal("confirmAll" in seg, false);
  assert.equal("reason" in seg, false);
  assert.equal((sendRequest(draft(), { force: true }) as Record<string, unknown>).force, true);
  assert.equal((sendRequest(all, {}) as Record<string, unknown>).confirmAll, false); // server refuses without the strict boolean
});
test("promote draft sends only campaignId + schedule (+ confirmations)", () => {
  assert.deepEqual(promoteRequest("c1", { mode: "now" }, {}), { action: "sendCampaign", campaignId: "c1", schedule: { mode: "now" } });
  assert.deepEqual(promoteRequest("c1", { mode: "at", at: 5 }, { reason: "go", confirmAll: true, force: true }), { action: "sendCampaign", campaignId: "c1", schedule: { mode: "at", at: 5 }, reason: "go", confirmAll: true, force: true });
});
test("list request: limit, status, before cursor", () => {
  assert.deepEqual(listRequest({}), { action: "listCampaigns", limit: 30 });
  assert.deepEqual(listRequest({ status: "sent", before: 99 }), { action: "listCampaigns", limit: 30, status: "sent", before: 99 });
});
test("test send carries only content and destination", () => {
  const r = testSendRequest(draft({ audience: { ...draft().audience, kind: "all" } })) as Record<string, unknown>;
  assert.equal(r.action, "testSendToSelf");
  assert.equal("audience" in r, false);
  assert.equal("schedule" in r, false);
});
test("cancel request carries expectedVersion when known", () => {
  assert.deepEqual(cancelRequest("c1", 3, "oops"), { action: "cancelCampaign", campaignId: "c1", expectedVersion: 3, reason: "oops" });
  assert.equal("expectedVersion" in cancelRequest("c1", null, "oops"), false);
});
// ── Confirmation policy ─────────────────────────────────────────────────────
test("confirm: all = typed phrase; scheduled or large = reason; else confirm", () => {
  const all = draft({ audience: { ...draft().audience, kind: "all" } });
  const p = confirmPlan(all, 10);
  assert.equal(p.level, "typed");
  assert.equal(p.level === "typed" && p.phrase, CONFIRM_ALL_PHRASE);
  assert.equal(confirmPlan(draft({ schedule: { mode: "at", local: "2030-01-01T10:00" } }), 5).level, "reason");
  assert.equal(confirmPlan(draft(), LARGE_SEND).level, "reason");
  assert.equal(confirmPlan(draft(), LARGE_SEND - 1).level, "confirm");
  assert.equal(confirmPlan(draft(), null).level, "confirm");
  assert.equal(planFor("all", "draft", null).level, "typed"); // a draft of all is typed too
  assert.equal(planFor("users", "draft", null).level, "confirm");
  // a ticket destination is a single recipient: never "all"
  assert.equal(confirmPlan(draft({ destination: { type: "support_ticket", params: { ticketId: "abc123" } }, ticket: { ticketId: "abc123", ownerUid: "u" }, audience: { ...draft().audience, kind: "all" } }), 1).level, "confirm");
});

// ── Honest labels ───────────────────────────────────────────────────────────
test("count labels never claim delivered or read", () => {
  for (const r of COUNT_ROWS) {
    assert.doesNotMatch(`${r.label} ${r.hint}`, /deliver|\bread\b|opened/i, r.label);
  }
  assert.ok(COUNT_ROWS.some((r) => r.label === "Accepted by FCM"));
  for (const l of ["Targeted users", "Device tokens", "Failed", "Dead tokens removed"]) assert.ok(COUNT_ROWS.some((r) => r.label === l), l);
  assert.match(COUNTS_DISCLAIMER, /no delivery or read figure/);
});
test("status chips and cancel rule", () => {
  assert.equal(statusMeta("scheduled").label, "Scheduled");
  assert.equal(statusMeta("sent").pill, "ok");
  assert.equal(statusMeta("weird").label, "weird");
  assert.equal(canCancel({ status: "scheduled" }, true), true);
  assert.equal(canCancel({ status: "scheduled" }, false), false);
  assert.equal(canCancel({ status: "draft" }, true), true);
  for (const s of ["sending", "sent", "failed", "cancelled"]) assert.equal(canCancel({ status: s }, true), false, s);
});

// ── Wire parsing ────────────────────────────────────────────────────────────
test("normalizeCampaign tolerates shapes and missing counts", () => {
  const c = normalizeCampaign({
    id: "c1", title: "T", body: "B", status: "sent", version: 2, createdAt: { _seconds: 10 },
    destination: { type: "support_ticket", params: { ticketId: "abc123", n: 5 } },
    schedule: { mode: "at", at: 1000 }, counts: { targeted: 3, tokens: 4, accepted: 3, failed: 1 },
  });
  assert.equal(c.createdAt, 10_000);
  assert.deepEqual(c.destination.params, { ticketId: "abc123" });
  assert.equal(c.counts.pruned, null);
  assert.equal(c.scheduledAt, 1000);
  assert.deepEqual(normalizeCampaignList({ campaigns: [{ id: "a" }, { title: "no id" }] }).map((x) => x.id), ["a"]);
  assert.deepEqual(normalizeCampaignList(null), []);
});
test("composeValidate valid shape: users/tokens/capped/exact/requiresConfirmAll", () => {
  const v = normalizeValidate({ valid: true, errors: [], warnings: ["w"], audience: { kind: "entitlement", users: 12, tokens: 20, capped: false, exact: true, requiresConfirmAll: false }, preview: {} });
  assert.deepEqual([v.valid, v.users, v.tokens, v.capped, v.exact, v.warnings], [true, 12, 20, false, true, ["w"]]);
  assert.match(estimateLabel(v), /12 user\(s\) on 20 device\(s\)/);
  const all = normalizeValidate({ valid: true, audience: { kind: "all", users: null, tokens: 50, exact: true, requiresConfirmAll: true } });
  assert.equal(all.users, null);
  assert.equal(all.requiresConfirmAll, true);
  assert.match(estimateLabel(all), /50 device\(s\) \(user count is not available for everyone\)/);
  assert.match(estimateLabel(normalizeValidate({ valid: true, audience: { users: 5, tokens: 6, exact: false } })), /^About 5/);
});
test("composeValidate invalid shape renders field errors, is not a send", () => {
  const bad = normalizeValidate({ valid: false, errors: [{ field: "audience", message: "nope" }, { field: "content", message: "bad" }], unsupported: ["country"] });
  assert.equal(bad.valid, false);
  assert.deepEqual(bad.errors, [{ field: "audience", message: "nope" }, { field: "content", message: "bad" }]);
  assert.match(estimateLabel(bad), /rejected/);
  assert.equal(normalizeValidate({}).valid, false);
  assert.match(estimateLabel(null), /Not checked/);
  assert.match(estimateLabel(normalizeValidate({ valid: true, audience: { users: 0, tokens: 0 } })), /nobody/);
});
test("device cap 20000", () => {
  assert.equal(MAX_DEVICES, 20000);
  assert.equal(overDeviceCap(normalizeValidate({ valid: true, audience: { tokens: 20001 } })), true);
  assert.equal(overDeviceCap(normalizeValidate({ valid: true, audience: { tokens: 20000 } })), false);
  assert.equal(overDeviceCap(null), false);
});
test("error messages: duplicate guard, rate limit, passthrough", () => {
  assert.match(friendlyError({ code: "already-exists", message: "x" }, "f"), /last 10 minutes/);
  assert.match(friendlyError({ code: "resource-exhausted", message: "x" }, "f"), /Rate limit/);
  assert.equal(friendlyError({ code: "failed-precondition", message: "No matching devices" }, "f"), "No matching devices");
  assert.equal(friendlyError(null, "fallback"), "fallback");
});
test("normalizeCampaign reads backend row: counts, note, reason, version", () => {
  const c = normalizeCampaign({ id: "x", title: "t", body: "b", status: "sent", counts: { targeted: 2, tokens: 4, accepted: 3, failed: 1, pruned: 1 }, note: "no_recipients", reason: "why", version: 4, createdAt: 5, createdByEmail: "a@b.c" });
  assert.deepEqual(c.counts, { targeted: 2, tokens: 4, accepted: 3, failed: 1, pruned: 1 });
  assert.deepEqual([c.note, c.reason, c.version, c.createdByEmail], ["no_recipients", "why", 4, "a@b.c"]);
});

// ── Permissions ─────────────────────────────────────────────────────────────
test("permission gating: viewer cannot read or send; broadcast separate", () => {
  const can = (granted: string[]) => (p: "comms.send" | "comms.broadcast") => hasPermission(granted, p);
  assert.deepEqual(commsAccess(can(["config.read"])), { canRead: false, canSend: false, canBroadcast: false });
  assert.deepEqual(commsAccess(can(["comms.send"])), { canRead: true, canSend: true, canBroadcast: false });
  assert.deepEqual(commsAccess(can(["comms.*"])), { canRead: true, canSend: true, canBroadcast: true });
});
