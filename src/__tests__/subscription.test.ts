// Subscription enforcement console logic: copy, payload builders, defaults.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENFORCEMENT_COPY,
  GRANT_PLAN_OPTIONS,
  NEW_PLAN_IDS,
  PLAN_ENTITLEMENTS,
  PRODUCTS,
  buildEnforcementPatch,
  buildProductPatch,
  enforcementConfirm,
  entitlementSummary,
  isVersionConflict,
  versionConflictError,
  VERSION_CONFLICT_MESSAGE,
  KILLSWITCH_NOTICE,
  PRODUCT_NOTE,
  planLabel,
  productConfirm,
  readSubscriptionConfig,
} from "../features/revenue/subscriptionLogic";
import { canConfirm } from "../ui/logic";
import { PERMISSIONS, canChangeEnforcement } from "../lib/permissions";
import { normaliseError, AdminApiError } from "../lib/apiErrors";
import { findRoute } from "../shell/nav";

test("enforcement copy is exact for both states", () => {
  assert.equal(ENFORCEMENT_COPY.on, "Users require a valid subscription for premium access.");
  assert.equal(
    ENFORCEMENT_COPY.off,
    "Subscription requirements are temporarily disabled. Eligible users receive full App + Floating System premium access without altering billing records.",
  );
});

test("confirmation modals: titles, bodies, typed phrases", () => {
  const off = enforcementConfirm(false);
  assert.equal(off.title, "Disable Subscription Requirement?");
  assert.equal(off.phrase, "DISABLE");
  assert.equal(off.danger, true);
  assert.match(off.body, /Existing purchases and billing records will not be changed\.$/);
  const on = enforcementConfirm(true);
  assert.equal(on.title, "Enable Subscription Requirement?");
  assert.equal(on.body, "Users will return to access based on their actual verified subscriptions.");
  assert.equal(on.phrase, "ENABLE");
});

test("typed level needs the phrase and a reason", () => {
  const { phrase } = enforcementConfirm(false);
  assert.equal(canConfirm("typed", "because testing", "", phrase), false);
  assert.equal(canConfirm("typed", "because testing", "disable", phrase), false);
  assert.equal(canConfirm("typed", "abc", phrase, phrase), false);
  assert.equal(canConfirm("typed", "because testing", phrase, phrase), true);
});

test("missing or malformed subscriptionRequired reads as ON (secure default)", () => {
  assert.equal(readSubscriptionConfig({}).subscriptionRequired, true);
  assert.equal(readSubscriptionConfig({}).requiredIsDefault, true);
  assert.equal(readSubscriptionConfig({ subscriptionRequired: "false" }).subscriptionRequired, true);
  assert.equal(readSubscriptionConfig({ subscriptionRequired: null }).subscriptionRequired, true);
  assert.equal(readSubscriptionConfig(null).subscriptionRequired, true);
  const off = readSubscriptionConfig({ subscriptionRequired: false });
  assert.equal(off.subscriptionRequired, false);
  assert.equal(off.requiredIsDefault, false);
});

test("product flags read from dotted or nested snapshots; absent = inactive", () => {
  const a = readSubscriptionConfig({ "products.appPremium.active": true });
  assert.deepEqual(a.products, { appPremium: true, floatingPremium: false, allAccess: false });
  const b = readSubscriptionConfig({ products: { allAccess: { active: true }, floatingPremium: { active: "yes" } } });
  assert.deepEqual(b.products, { appPremium: false, floatingPremium: false, allAccess: true });
});

test("payload builders emit only the one key", () => {
  assert.deepEqual(buildEnforcementPatch(false), { subscriptionRequired: false });
  assert.deepEqual(buildProductPatch("floatingPremium", true), { "products.floatingPremium.active": true });
  assert.throws(() => buildEnforcementPatch("no" as unknown as boolean));
  assert.throws(() => buildProductPatch("nope" as never, true));
  assert.throws(() => buildProductPatch("appPremium", 1 as unknown as boolean));
});

test("product confirm copy keeps billing and ownership untouched", () => {
  assert.match(productConfirm("appPremium", false).body, /keep their access/);
  assert.match(productConfirm("allAccess", true).title, /All Access/);
});

test("version conflict detection", () => {
  assert.equal(isVersionConflict({ code: "functions/aborted", message: "x" }), true);
  assert.equal(isVersionConflict({ code: "unknown", message: "Config changed since you loaded it" }), true);
  assert.equal(isVersionConflict({ code: "permission-denied", message: "no" }), false);
});

test("plans: three new ids, labels, entitlements", () => {
  assert.deepEqual([...NEW_PLAN_IDS], PRODUCTS.map((p) => p.planId));
  assert.equal(planLabel("app_premium"), "App Premium");
  assert.equal(planLabel("floating_premium"), "Floating System Premium");
  assert.equal(planLabel("all_access"), "All Access");
  assert.equal(planLabel(null), "Free");
  assert.equal(entitlementSummary("gold"), "App Premium + Floating System Premium");
  assert.equal(entitlementSummary("mystery"), "Unknown plan (no access)");
  assert.deepEqual(PLAN_ENTITLEMENTS.all_access, PLAN_ENTITLEMENTS.gold);
  const values = GRANT_PLAN_OPTIONS.map((o) => o.value);
  for (const id of ["silver", "gold", "free", ...NEW_PLAN_IDS]) assert.ok(values.includes(id), id);
});

test("subscription.manage is declared; Subscriptions nav still needs billing.read", () => {
  assert.ok((PERMISSIONS as readonly string[]).includes("subscription.manage"));
  assert.equal(findRoute("/dashboard/subscriptions")?.route.permission, "billing.read");
});

test("stale-version conflict keeps its message through normaliseError", () => {
  const e = versionConflictError();
  assert.ok(e instanceof AdminApiError);
  assert.equal(e.code, "aborted");
  const n = normaliseError(e);
  assert.equal(n, e);
  assert.equal(n.kind, "conflict");
  assert.equal(n.message, VERSION_CONFLICT_MESSAGE);
  assert.match(n.message, /changed since you loaded it/);
  // a plain Error (the old behaviour) would have been flattened to unknown
  assert.equal(normaliseError(new Error(VERSION_CONFLICT_MESSAGE)).kind, "unknown");
});

test("enforcement switch: ON->OFF needs flags.killswitch, OFF->ON only subscription.manage", () => {
  const finance = ["subscription.manage", "billing.read"];
  const ops = ["subscription.manage", "flags.killswitch"];
  assert.equal(canChangeEnforcement(finance, true), false);
  assert.equal(canChangeEnforcement(finance, false), true);
  assert.equal(canChangeEnforcement(ops, true), true);
  assert.equal(canChangeEnforcement(ops, false), true);
  assert.equal(canChangeEnforcement(["*"], true), true);
  assert.equal(canChangeEnforcement(["flags.killswitch"], true), false);
  assert.equal(canChangeEnforcement(["flags.killswitch"], false), false);
  assert.equal(canChangeEnforcement([], false), false);
  assert.equal(KILLSWITCH_NOTICE, "Turning enforcement OFF needs the kill-switch permission (operations or super admin).");
});

test("product copy states the Active-here AND Active-in-Plans rule", () => {
  assert.match(PRODUCT_NOTE, /Active here AND its plan in Plans is Active/);
  assert.match(PRODUCT_NOTE, /existing users and master enforcement are separate/);
  assert.match(productConfirm("appPremium", true).body, /plan in Plans is also Active/);
});
