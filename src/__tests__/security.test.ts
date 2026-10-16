// Security & Admin screens — the pure logic behind Admins & Roles and Audit Log.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adminStatus,
  adminSummary,
  filterAdmins,
  groupPermissions,
  roleHas,
  sameRoles,
  sortRoles,
  type AdminRow,
} from "../features/iam/logic";
import { describeAction, filterPayload, resultLabel, resultTone } from "../features/audit/logic";
import { PERMISSIONS } from "../lib/permissions";

const base: AdminRow = {
  uid: "u1", email: "a@akaya.ai", roles: ["support"], legacy: false, disabled: false,
  extraPermissions: [], addedAt: 1, lastSignInAt: null, authExists: true, authDisabled: false, mfaEnrolled: false,
};
const row = (o: Partial<AdminRow>): AdminRow => ({ ...base, ...o });

test("admin status precedence: missing account > suspended > legacy > active", () => {
  assert.equal(adminStatus(row({ authExists: false, disabled: true })), "orphaned");
  assert.equal(adminStatus(row({ disabled: true, legacy: true })), "suspended");
  assert.equal(adminStatus(row({ legacy: true, roles: ["super_admin"] })), "legacy");
  assert.equal(adminStatus(row({})), "active");
});

test("summary counts supers (incl. legacy), MFA gaps only for active admins", () => {
  const s = adminSummary([
    row({ uid: "a", roles: ["super_admin"], legacy: true }),
    row({ uid: "b", roles: ["super_admin"], mfaEnrolled: true }),
    row({ uid: "c", disabled: true }),
    row({ uid: "d" }),
  ]);
  assert.deepEqual(s, { total: 4, active: 3, suspended: 1, legacy: 1, noMfa: 2, supers: 2 });
});

test("filters: query matches email or uid, role and status narrow", () => {
  const rows = [row({ uid: "x1", email: "ops@akaya.ai", roles: ["operations"] }), row({ uid: "y2", email: "fin@akaya.ai", roles: ["finance"], disabled: true })];
  assert.equal(filterAdmins(rows, { query: "OPS", role: "", status: "" }).length, 1);
  assert.equal(filterAdmins(rows, { query: "y2", role: "", status: "" })[0].email, "fin@akaya.ai");
  assert.equal(filterAdmins(rows, { query: "", role: "finance", status: "" }).length, 1);
  assert.equal(filterAdmins(rows, { query: "", role: "", status: "suspended" })[0].uid, "y2");
  assert.equal(filterAdmins(rows, { query: "", role: "", status: "" }).length, 2);
});

test("role comparison ignores order; sorting follows the catalog order", () => {
  assert.equal(sameRoles(["finance", "support"], ["support", "finance"]), true);
  assert.equal(sameRoles(["finance"], ["finance", "support"]), false);
  assert.deepEqual(sortRoles(["read_only", "super_admin", "support"]), ["super_admin", "support", "read_only"]);
});

test("roleHas understands * and prefix wildcards", () => {
  assert.equal(roleHas({ id: "s", label: "S", permissions: ["*"] }, "admins.manage"), true);
  assert.equal(roleHas({ id: "x", label: "X", permissions: ["ai.*"] }, "ai.routing.activate"), true);
  assert.equal(roleHas({ id: "y", label: "Y", permissions: ["users.read"] }, "users.modify"), false);
});

test("every permission lands in a named console domain (no 'Other')", () => {
  const groups = groupPermissions(PERMISSIONS);
  assert.ok(!groups.some((g) => g.domain === "Other"), JSON.stringify(groups.find((g) => g.domain === "Other")));
  assert.equal(groups.reduce((n, g) => n + g.permissions.length, 0), PERMISSIONS.length);
});

test("audit: actions read as sentences; filters send one field", () => {
  assert.equal(describeAction("billing.setPlan"), "Billing · Set plan");
  assert.equal(describeAction("ai.rotateProviderKey"), "AI · Rotate provider key");
  assert.equal(describeAction("iam.setRoles"), "IAM · Set roles");
  assert.equal(describeAction("users.viewPii"), "Users · Viewed personal data");
  assert.equal(describeAction("weird"), "weird");
  assert.deepEqual(filterPayload(null), {});
  assert.deepEqual(filterPayload({ field: "action", value: "  " }), {});
  assert.deepEqual(filterPayload({ field: "targetId", value: " uid_1 " }), { targetId: "uid_1" });
  assert.equal(resultTone("denied"), "degraded");
  assert.equal(resultLabel("error"), "Error");
});
