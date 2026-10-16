// Console navigation model — what each admin sees, and how a URL resolves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NAV, breadcrumbs, findRoute, searchNav, visibleNav } from "../shell/nav";
import { PERMISSIONS, hasPermission, type Permission } from "../lib/permissions";

const canWith = (perms: string[]) => (p: Permission) => hasPermission(perms, p);

test("every nav route declares a known permission and a unique href", () => {
  const seen = new Set<string>();
  for (const g of NAV) {
    for (const r of g.routes) {
      assert.ok((PERMISSIONS as readonly string[]).includes(r.permission), `${r.href}: ${r.permission}`);
      assert.ok(!seen.has(r.href), `duplicate href ${r.href}`);
      seen.add(r.href);
      assert.ok(r.href.startsWith("/dashboard"), `${r.href} must live under /dashboard`);
    }
  }
});

test("every existing page is still reachable from the navigation", () => {
  // The 24 dashboard routes the pre-console panel shipped. If a page leaves
  // the nav it must be deliberate, and this list updated with it.
  const legacy = [
    "/dashboard", "/dashboard/activity", "/dashboard/chat", "/dashboard/config",
    "/dashboard/floating-assistant", "/dashboard/floating-system", "/dashboard/health",
    "/dashboard/inbox", "/dashboard/intelligence", "/dashboard/model-inventory",
    "/dashboard/models", "/dashboard/moderation", "/dashboard/notifications",
    "/dashboard/openrouter", "/dashboard/personality", "/dashboard/personas",
    "/dashboard/providers", "/dashboard/revenue", "/dashboard/routing",
    "/dashboard/skills", "/dashboard/subscriptions", "/dashboard/tools",
    "/dashboard/users", "/dashboard/voice",
  ];
  const hrefs = new Set(NAV.flatMap((g) => g.routes.map((r) => r.href)));
  for (const h of legacy) assert.ok(hrefs.has(h), `${h} fell out of the navigation`);
});

test("a super admin sees every group that has routes", () => {
  const all = visibleNav(canWith(["*"]));
  assert.equal(all.length, NAV.filter((g) => g.routes.length > 0).length);
});

test("support sees customers and support, not AI configuration", () => {
  const perms = ["dashboard.read", "users.read", "billing.read", "support.read", "support.modify"];
  const ids = visibleNav(canWith(perms)).map((g) => g.id);
  assert.ok(ids.includes("customers"));
  assert.ok(ids.includes("support"));
  assert.ok(!ids.includes("ai"));
  assert.ok(!ids.includes("voice"));
});

test("a role with no permissions sees nothing", () => {
  assert.deepEqual(visibleNav(canWith([])), []);
});

test("findRoute: exact, basePath-prefixed, trailing slash and nested paths", () => {
  assert.equal(findRoute("/dashboard/users")?.route.label, "User Directory");
  assert.equal(findRoute("/Admin/dashboard/users/")?.route.label, "User Directory");
  assert.equal(findRoute("/dashboard/users/detail")?.route.label, "User Directory");
  assert.equal(findRoute("/dashboard")?.route.label, "Overview");
  // "/dashboard" must not swallow unknown children.
  assert.equal(findRoute("/dashboard/unknown-page"), null);
});

test("breadcrumbs name the group then the page", () => {
  assert.deepEqual(
    breadcrumbs("/dashboard/floating-system").map((c) => c.label),
    ["Voice & Floating", "Floating Control Plane"],
  );
  assert.deepEqual(breadcrumbs("/nowhere"), [{ label: "Console" }]);
});

test("command palette search: every word must match; label hits rank first", () => {
  const nav = visibleNav(canWith(["*"]));
  const hits = searchNav("float", nav).map((h) => h.route.label);
  assert.ok(hits.length >= 2);
  assert.ok(hits[0].toLowerCase().startsWith("float"));
  assert.deepEqual(searchNav("mrr", nav).map((h) => h.route.label), ["Revenue Insights"]);
  assert.deepEqual(searchNav("zzzz nothing", nav), []);
  // Keywords count: "gemma" finds the on-device catalog.
  assert.equal(searchNav("gemma", nav)[0]?.route.label, "On-device Models");
});

test("search never returns a route the admin cannot see", () => {
  const nav = visibleNav(canWith(["support.read"]));
  assert.deepEqual(searchNav("key", nav), []);
});

test("Support tickets page is in the support group, gated by support.read", () => {
  const r = findRoute("/dashboard/tickets");
  assert.equal(r?.route.label, "Support");
  assert.equal(r?.route.permission, "support.read");
  assert.equal(r?.group.id, "support");
  const readOnly = visibleNav(canWith(["support.read"])).flatMap((g) => g.routes.map((x) => x.href));
  assert.ok(readOnly.includes("/dashboard/tickets"));
  const none = visibleNav(canWith(["dashboard.read"])).flatMap((g) => g.routes.map((x) => x.href));
  assert.ok(!none.includes("/dashboard/tickets"));
  assert.deepEqual(searchNav("helpdesk", visibleNav(canWith(["support.read"]))).map((h) => h.route.label), ["Support"]);
});
