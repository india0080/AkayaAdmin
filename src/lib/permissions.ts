// Permission vocabulary for the console UI.
//
// The SERVER decides what an admin may do (akaya_ai/functions/src/
// admin_rbac.ts, via adminIam `me`). The console only uses this list to
// decide what to SHOW — hiding a button is never authorization. Keeping the
// names typed here makes a typo in a nav entry a compile error; the list is
// pinned to the server's by akaya_ai/functions/admin_rbac.test.js, which
// reads the block between the markers below.

// @permissions-begin
export const PERMISSIONS = [
  "dashboard.read",
  "alerts.read",
  "alerts.ack",
  "users.read",
  "users.pii",
  "users.content",
  "users.modify",
  "users.disable",
  "users.erasure",
  "users.export",
  "billing.read",
  "billing.modify",
  "billing.grant",
  "billing.reconcile",
  "plans.read",
  "plans.modify",
  "subscription.manage",
  "ai.providers.read",
  "ai.providers.configure",
  "ai.secrets.rotate",
  "ai.models.read",
  "ai.models.configure",
  "ai.routing.read",
  "ai.routing.configure",
  "ai.routing.activate",
  "ai.health.read",
  "ai.behaviour.read",
  "ai.behaviour.configure",
  "ai.usage.read",
  "cos.read",
  "cos.modify",
  "cos.publish",
  "floating.read",
  "floating.configure",
  "floating.activate",
  "voice.read",
  "voice.configure",
  "flags.read",
  "flags.modify",
  "flags.killswitch",
  "config.read",
  "config.modify",
  "config.limits",
  "config.activate",
  "comms.send",
  "comms.broadcast",
  "support.read",
  "support.modify",
  "moderation.modify",
  "analytics.read",
  "finops.read",
  "audit.read",
  "audit.export",
  "security.read",
  "system.read",
  "admins.manage",
] as const;
// @permissions-end

export type Permission = (typeof PERMISSIONS)[number];

/// Same semantics as the server: "*" grants everything; "ai.*" grants the
/// ai.* subtree.
export function hasPermission(granted: readonly string[], needed: Permission): boolean {
  for (const p of granted) {
    if (p === "*" || p === needed) return true;
    if (p.endsWith(".*") && needed.startsWith(p.slice(0, -1))) return true;
  }
  return false;
}

/// Subscription master switch. OFF->ON needs subscription.manage; ON->OFF
/// (opens premium to everyone) additionally needs flags.killswitch. Mirrors
/// the server rule in adminConfig; the server stays the authority.
export function canChangeEnforcement(granted: readonly string[], currentlyRequired: boolean): boolean {
  if (!hasPermission(granted, "subscription.manage")) return false;
  return currentlyRequired ? hasPermission(granted, "flags.killswitch") : true;
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  operations: "Operations",
  support: "Support",
  finance: "Finance",
  ai_ops: "AI Operations",
  product: "Product",
  analyst: "Analyst",
  read_only: "Read Only",
};

export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? role;
}
