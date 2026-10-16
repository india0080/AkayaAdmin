// Admin Panel > Future: validation matrix, reorder math, payload builders,
// wire parsing, image checks, permission gating, nav.
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  ICONS, ITEM_ID_RE, LIMITS, autoReason, editPatch, buildItem, checkImage, deletePatch, draftFromItem, emptyDraft, futureAccess, groupByPlacement,
  imageUploadPayload, localInputToMs, msToLocalInput, newItemId, nextSortOrder, parseSnapshot, reorderPatch,
  toWire, togglePatch, upsertPatch, validateDraft, windowState, type Draft, type FutureItem,
} from "../features/future/logic";
import { PLACEMENTS, placementById } from "../features/future/placementRegistry";
import { NAV, findRoute, visibleNav } from "../shell/nav";
import { hasPermission, PERMISSIONS, type Permission } from "../lib/permissions";

const base = (over: Partial<Draft> = {}): Draft => ({
  ...emptyDraft("sidebar_dynamic"), title: "Wallet", buttonLabel: "Wallet",
  popup: { type: "text", title: "Coming soon", body: "We are building it.", ctaAction: "close" }, ...over,
});
const item = (id: string, sortOrder: number, placement = "sidebar_dynamic"): FutureItem => ({
  id, placement, title: id, buttonLabel: id, icon: "schedule", status: "coming_soon", enabled: true, sortOrder,
  popup: { type: "text", title: "t", body: "b" }, version: 3, updatedAt: 1, updatedBy: "a@b.c",
});

test("registry: unique ids, only the three shipped chat-menu features have a route, dynamic slot max 10", () => {
  assert.equal(new Set(PLACEMENTS.map((p) => p.id)).size, PLACEMENTS.length);
  assert.deepEqual(
    PLACEMENTS.filter((p) => p.hasRoute).map((p) => p.id),
    ["chat_menu_projects", "chat_menu_uploaded_files", "chat_menu_add_to_home"],
  );
  assert.equal(placementById("sidebar_dynamic")?.maxItems, 10);
});

test("validation: a complete text item is valid", () => {
  assert.deepEqual(validateDraft(base()), {});
});

test("validation matrix: required + length limits", () => {
  assert.ok(validateDraft(base({ title: "  " })).title);
  assert.ok(validateDraft(base({ title: "x".repeat(LIMITS.title + 1) })).title);
  assert.equal(validateDraft(base({ title: "x".repeat(LIMITS.title) })).title, undefined);
  assert.ok(validateDraft(base({ buttonLabel: "x".repeat(31) })).buttonLabel);
  const p = base().popup;
  assert.ok(validateDraft(base({ popup: { ...p, title: "x".repeat(81) } }))["popup.title"]);
  assert.ok(validateDraft(base({ popup: { ...p, body: "x".repeat(601) } }))["popup.body"]);
  assert.equal(validateDraft(base({ popup: { ...p, body: "x".repeat(600) } }))["popup.body"], undefined);
  assert.ok(validateDraft(base({ popup: { ...p, ctaLabel: "x".repeat(31) } }))["popup.ctaLabel"]);
  assert.ok(validateDraft(base({ title: "a\u0000b" })).title);
});

test("validation: status live/beta rejected without a route", () => {
  assert.ok(validateDraft(base({ status: "live" })).status);
  assert.ok(validateDraft(base({ status: "beta" })).status);
  assert.deepEqual(validateDraft(base({ status: "hidden" })), {});
});

test("validation: icon, placement and maxItems", () => {
  assert.ok(validateDraft(base({ icon: "evil" })).icon);
  assert.ok(validateDraft(base({ placement: "nope" })).placement);
  assert.ok(validateDraft(base({ placement: "sidebar_agents" }), { existingInPlacement: 1 }).placement);
  assert.equal(validateDraft(base({ placement: "sidebar_agents" }), { existingInPlacement: 1, editing: true }).placement, undefined);
  assert.ok(validateDraft(base(), { existingInPlacement: 10 }).placement);
});

test("validation: popup types and image rules", () => {
  const p = base().popup;
  assert.ok(validateDraft(base({ popup: { ...p, type: "image" } }))["popup.imageUrl"]);
  assert.deepEqual(validateDraft(base({ popup: { type: "image", title: "", body: "", imageUrl: "https://x/y.png" } })), {});
  assert.ok(validateDraft(base({ popup: { ...p, type: "image_text", imageUrl: "http://x/y.png" } }))["popup.imageUrl"]);
  assert.ok(validateDraft(base({ popup: { ...p, type: "image_text", title: "", imageUrl: "https://x/y.png" } }))["popup.title"]);
  assert.ok(validateDraft(base({ popup: { ...p, ctaAction: "https://evil" as never } }))["popup.ctaAction"]);
  assert.ok(validateDraft(base({ popup: { ...p, imageUrl: "javascript:alert(1)" } }))["popup.imageUrl"]);
});

test("validation: window end must follow start", () => {
  assert.ok(validateDraft(base({ startAt: 2000, endAt: 1000 })).endAt);
  assert.ok(validateDraft(base({ startAt: 1000, endAt: 1000 })).endAt);
  assert.deepEqual(validateDraft(base({ startAt: 1000, endAt: 2000 })), {});
  assert.deepEqual(validateDraft(base({ startAt: null, endAt: 2000 })), {});
});

test("payload builder: trims, omits empty optionals, drops image for text popups", () => {
  const w = buildItem("fi_1", base({ title: " Wallet ", popup: { type: "text", title: " T ", body: " B ", imageUrl: "https://x/a.png", ctaLabel: " " } }), 20);
  assert.equal(w.title, "Wallet");
  assert.deepEqual(w.popup, { type: "text", title: "T", body: "B" });
  assert.equal("startAt" in w, false);
  assert.equal(w.sortOrder, 20);
  const w2 = buildItem("fi_2", base({ startAt: 5, endAt: 9, popup: { type: "image_text", title: "t", body: "b", imageUrl: "https://x/a.png", ctaLabel: "Go", ctaAction: "upgrade" } }), 10);
  assert.equal(w2.startAt, 5);
  assert.equal(w2.popup.imageUrl, "https://x/a.png");
  assert.equal(w2.popup.ctaAction, "upgrade");
});

test("payload builder: server-owned fields never sent; patches shape", () => {
  const w = toWire(item("a", 10));
  assert.ok(!("version" in w) && !("updatedAt" in w) && !("updatedBy" in w));
  assert.deepEqual(Object.keys(upsertPatch(w)), ["a"]);
  assert.equal(deletePatch("a").a, null);
  assert.equal(togglePatch(item("a", 10), false).a?.enabled, false);
  assert.match(newItemId(() => 0.5, 1000), /^fi_[0-9a-z]+$/);
  assert.notEqual(newItemId(Math.random, 1), newItemId(Math.random, 1));
});

test("draft round trip", () => {
  const it = item("a", 10);
  assert.equal(draftFromItem(it).title, "a");
});

test("sortOrder: next order and reorder math", () => {
  assert.equal(nextSortOrder([]), 10);
  assert.equal(nextSortOrder([item("a", 10), item("b", 40)]), 50);
  const g = [item("a", 10), item("b", 20), item("c", 30)];
  const p = reorderPatch(g, "b", -1)!;
  assert.deepEqual(Object.keys(p).sort(), ["a", "b"]);
  assert.equal(p.b?.sortOrder, 10);
  assert.equal(p.a?.sortOrder, 20);
  assert.equal(reorderPatch(g, "a", -1), null);
  assert.equal(reorderPatch(g, "c", 1), null);
  assert.equal(reorderPatch(g, "zzz", 1), null);
  // ties and gaps heal
  const t = [item("a", 5), item("b", 5), item("c", 99)];
  const p2 = reorderPatch(t, "c", -1)!;
  const orders = Object.values(p2).map((x) => x!.sortOrder as number).sort((x, y) => x - y);
  assert.ok(orders.every((o) => o % 10 === 0));
});

test("grouping: registry order first, unknown placements kept", () => {
  const g = groupByPlacement([item("x", 1, "mystery"), item("a", 1, "sidebar_agents"), item("d", 1, "sidebar_dynamic"), item("f", 1, "sidebar_future_message")]);
  assert.deepEqual(g.map((x) => x.id), ["sidebar_future_message", "sidebar_agents", "sidebar_dynamic", "mystery"]);
  assert.equal(g[3].placement, null);
});

test("wire parsing: tolerant of malformed rows and shapes", () => {
  const good = { placement: "sidebar_agents", title: "A", buttonLabel: "A", icon: "mic", status: "coming_soon", enabled: true, sortOrder: 10,
    popup: { type: "text", title: "t", body: "b", ctaAction: "close" }, version: 2, updatedAt: { seconds: 5 }, updatedBy: "x@y.z" };
  const m = parseSnapshot({ i1: good, i2: null, i3: { status: "bogus", placement: "x" }, i4: "str" });
  assert.equal(m.length, 1);
  assert.equal(m[0].id, "i1");
  assert.equal(m[0].updatedAt, 5000);
  assert.equal(parseSnapshot({ items: [{ ...good, id: "z" }] })[0].id, "z");
  assert.equal(parseSnapshot({ items: { q: good } })[0].id, "q");
  assert.deepEqual(parseSnapshot(null), []);
  assert.deepEqual(parseSnapshot(5), []);
  assert.equal(parseSnapshot({ a: { ...good, enabled: false } })[0].enabled, false);
});

test("visibility window states and datetime-local round trip", () => {
  assert.equal(windowState({}, 100), "always");
  assert.equal(windowState({ startAt: 200 }, 100), "scheduled");
  assert.equal(windowState({ startAt: 50, endAt: 200 }, 100), "active");
  assert.equal(windowState({ endAt: 100 }, 100), "expired");
  const ms = new Date(2026, 5, 1, 9, 30).getTime();
  assert.equal(localInputToMs(msToLocalInput(ms)), ms);
  assert.equal(msToLocalInput(null), "");
  assert.equal(localInputToMs(""), null);
  assert.equal(localInputToMs("garbage"), null);
});

test("image checks: sniff content, size limit", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
  const webp = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
  assert.deepEqual(checkImage(png, 100), { ok: true, mime: "image/png" });
  assert.deepEqual(checkImage(jpg, 100), { ok: true, mime: "image/jpeg" });
  assert.deepEqual(checkImage(webp, 100), { ok: true, mime: "image/webp" });
  assert.equal(checkImage(png, LIMITS.imageBytes).ok, true);
  const big = checkImage(png, LIMITS.imageBytes + 1);
  assert.ok(!big.ok && /1 MB/.test(big.error));
  const gif = checkImage(Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]), 100);
  assert.ok(!gif.ok && /PNG, JPEG or WebP/.test(gif.error));
  const svg = checkImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"), 40);
  assert.equal(svg.ok, false);
  assert.equal(checkImage(png, 0).ok, false);
  const pl = imageUploadPayload(png, "image/png", "a.png");
  assert.equal(pl.mimeType, "image/png");
  assert.equal(Buffer.from(pl.contentBase64, "base64").length, png.length);
});

test("audit reason always satisfies the server minimum of 5", () => {
  assert.ok(autoReason("enable", "").length >= 5);
  assert.ok(autoReason("move up", "Wallet").length >= 5);
});

test("permission gating: view = config.read, edit = config.modify", () => {
  const can = (g: string[]) => (p: Permission) => hasPermission(g, p);
  assert.deepEqual(futureAccess(can(["config.read"])), { canView: true, canEdit: false });
  assert.deepEqual(futureAccess(can(["config.read", "config.modify"])), { canView: true, canEdit: true });
  assert.deepEqual(futureAccess(can(["support.read"])), { canView: false, canEdit: false });
  assert.deepEqual(futureAccess(can(["*"])), { canView: true, canEdit: true });
  assert.deepEqual(futureAccess(can(["config.*"])), { canView: true, canEdit: true });
});

test("nav: Future entry under Product Config gated by config.read", () => {
  const hit = findRoute("/dashboard/future");
  assert.ok(hit);
  assert.equal(hit.route.label, "Future");
  assert.equal(hit.group.id, "config");
  assert.ok((PERMISSIONS as readonly string[]).includes(hit.route.permission));
  assert.equal(hit.route.permission, "config.read");
  const labels = (g: string[]) => visibleNav((p) => hasPermission(g, p)).flatMap((x) => x.routes.map((r) => r.label));
  assert.ok(labels(["config.read"]).includes("Future"));
  assert.ok(!labels(["support.read"]).includes("Future"));
  assert.equal(NAV.flatMap((g) => g.routes).filter((r) => r.href === "/dashboard/future").length, 1);
});

// ── Parity with the authoritative backend/app registry JSON ────────────────
const REGISTRY_JSON = path.resolve(__dirname, "../../../akaya_ai/assets/placements/registry.json");
test("parity: admin placement registry, icons and limits equal akaya_ai/assets/placements/registry.json", () => {
  const json = JSON.parse(fs.readFileSync(REGISTRY_JSON, "utf8"));
  assert.deepEqual(
    PLACEMENTS.map((p) => ({ id: p.id, label: p.label, kind: p.kind, hasRoute: p.hasRoute, maxItems: p.maxItems, popupCapable: p.popupCapable })),
    json.placements.map((p: Record<string, unknown>) => ({ id: p.id, label: p.label, kind: p.kind, hasRoute: p.hasRoute, maxItems: p.maxItems, popupCapable: p.popupCapable })),
  );
  assert.deepEqual(ICONS.map((i) => i.key), json.icons);
  assert.equal(LIMITS.title, json.limits.titleMax);
  assert.equal(LIMITS.buttonLabel, json.limits.buttonLabelMax);
  assert.equal(LIMITS.popupTitle, json.limits.popupTitleMax);
  assert.equal(LIMITS.popupBody, json.limits.popupBodyMax);
  assert.equal(LIMITS.ctaLabel, json.limits.ctaLabelMax);
  assert.equal(LIMITS.imageBytes, json.limits.imageMaxBytes);
  assert.equal(LIMITS.sortMax, json.limits.sortOrderMax);
});

test("item ids match the server pattern", () => {
  for (let i = 0; i < 200; i++) {
    const id = newItemId();
    assert.match(id, ITEM_ID_RE);
    assert.ok(id.length <= 48);
  }
  assert.match(newItemId(() => 0.999999, 36 ** 8), ITEM_ID_RE);
});

test("validation: angle brackets (incl. full-width) and newlines", () => {
  assert.ok(validateDraft(base({ title: "a<b" })).title);
  assert.ok(validateDraft(base({ buttonLabel: "a>b" })).buttonLabel);
  assert.ok(validateDraft(base({ title: "a＜b" })).title);
  const p = base().popup;
  assert.ok(validateDraft(base({ popup: { ...p, body: "<b>x</b>" } }))["popup.body"]);
  assert.ok(validateDraft(base({ title: "a\nb" })).title);
  assert.equal(validateDraft(base({ popup: { ...p, body: "line1\nline2" } }))["popup.body"], undefined);
  // empty body only for image popups
  assert.ok(validateDraft(base({ popup: { ...p, body: "" } }))["popup.body"]);
  assert.deepEqual(validateDraft(base({ popup: { type: "image", title: "", body: "", imageUrl: "https://x/y.png" } })), {});
});

test("edit patch clears removed optional fields with null; toggle/reorder are partial", () => {
  const prev: FutureItem = { ...item("a", 10), startAt: 5, endAt: 9, popup: { type: "image_text", title: "t", body: "b", imageUrl: "https://x/a.png", ctaLabel: "Go", ctaAction: "close" } };
  const next = buildItem("a", { ...draftFromItem(prev), startAt: null, endAt: null, popup: { type: "text", title: "t", body: "b" } }, 10);
  const v = editPatch(prev, next).a as Record<string, unknown>;
  assert.equal(v.startAt, null);
  assert.equal(v.endAt, null);
  assert.deepEqual(v.popup, { type: "text", title: "t", body: "b", imageUrl: null, ctaLabel: null, ctaAction: null });
  assert.deepEqual(togglePatch(prev, false), { a: { enabled: false } });
  assert.deepEqual(reorderPatch([item("a", 10), item("b", 20)], "b", -1), { b: { sortOrder: 10 }, a: { sortOrder: 20 } });
  const untouched = editPatch(item("a", 10), buildItem("a", draftFromItem(item("a", 10)), 10)).a as Record<string, unknown>;
  assert.equal("startAt" in untouched, false);
});

test("payload builder: ctaAction is only sent together with a ctaLabel (server rejects a bare action)", () => {
  const w = buildItem("fi_3", base({ popup: { type: "text", title: "t", body: "b", ctaAction: "close" } }), 10);
  assert.deepEqual(w.popup, { type: "text", title: "t", body: "b" });
  const w2 = buildItem("fi_4", base({ popup: { type: "text", title: "t", body: "b", ctaLabel: "Go" } }), 10);
  assert.equal(w2.popup.ctaAction, "close");
});
