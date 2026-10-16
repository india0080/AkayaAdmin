// Pure IAM helpers for the Admins & Roles screen (unit-tested).

export interface AdminRow {
  uid: string;
  email: string;
  roles: string[];
  legacy: boolean;
  disabled: boolean;
  extraPermissions: string[];
  addedAt: number | null;
  lastSignInAt: number | null;
  authExists: boolean;
  authDisabled: boolean;
  mfaEnrolled: boolean;
}

export interface RoleDef {
  id: string;
  label: string;
  permissions: string[];
}

export const ROLE_ORDER = [
  "super_admin",
  "operations",
  "support",
  "finance",
  "ai_ops",
  "product",
  "analyst",
  "read_only",
];

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  super_admin: "Everything, including managing admins. Keep this to very few people.",
  operations: "Runs the platform day to day: users, config, flags, kill switches, support queues.",
  support: "Finds users, edits user records, works the inbox and moderation (cannot grant plans or tokens).",
  finance: "Subscriptions, pricing, payment reconciliation, revenue and cost reporting.",
  ai_ops: "Providers, keys, models, routing, voice and the Floating control plane.",
  product: "Assistant behaviour, product config and flags, in-app communications.",
  analyst: "Read-only analytics and AI usage. No personal data.",
  read_only: "Sees most areas without changing anything. No personal data beyond lookups.",
};

export function roleHas(role: RoleDef, permission: string): boolean {
  return role.permissions.some(
    (p) => p === "*" || p === permission || (p.endsWith(".*") && permission.startsWith(p.slice(0, -1))),
  );
}

const DOMAIN_LABELS: Record<string, string> = {
  dashboard: "Command Center",
  alerts: "Command Center",
  users: "Customers",
  billing: "Revenue",
  plans: "Revenue",
  subscription: "Revenue",
  ai: "AI Platform",
  cos: "AI Platform",
  floating: "Voice & Floating",
  voice: "Voice & Floating",
  flags: "Product Config",
  config: "Product Config",
  comms: "Communications",
  support: "Support & Trust",
  moderation: "Support & Trust",
  analytics: "Analytics",
  finops: "Analytics",
  audit: "Security & Admin",
  security: "Security & Admin",
  admins: "Security & Admin",
  system: "System",
};

export interface PermissionGroup {
  domain: string;
  permissions: string[];
}

/// Groups permission ids by console domain, preserving catalog order.
export function groupPermissions(all: readonly string[]): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  for (const p of all) {
    const domain = DOMAIN_LABELS[p.split(".")[0]] ?? "Other";
    let g = groups.find((x) => x.domain === domain);
    if (!g) {
      g = { domain, permissions: [] };
      groups.push(g);
    }
    g.permissions.push(p);
  }
  return groups;
}

export type AdminStatus = "active" | "suspended" | "legacy" | "orphaned";

export function adminStatus(a: AdminRow): AdminStatus {
  if (!a.authExists) return "orphaned";
  if (a.disabled) return "suspended";
  if (a.legacy) return "legacy";
  return "active";
}

export function sameRoles(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export function sortRoles(roles: readonly string[]): string[] {
  return [...roles].sort((x, y) => ROLE_ORDER.indexOf(x) - ROLE_ORDER.indexOf(y));
}

export interface AdminFilter {
  query: string;
  role: string; // "" = any
  status: "" | AdminStatus;
}

export function filterAdmins(rows: readonly AdminRow[], f: AdminFilter): AdminRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((a) => {
    if (q && !a.email.toLowerCase().includes(q) && !a.uid.toLowerCase().includes(q)) return false;
    if (f.role && !a.roles.includes(f.role)) return false;
    if (f.status && adminStatus(a) !== f.status) return false;
    return true;
  });
}

/// Counts for the summary strip.
export function adminSummary(rows: readonly AdminRow[]) {
  let active = 0;
  let suspended = 0;
  let legacy = 0;
  let noMfa = 0;
  let supers = 0;
  for (const a of rows) {
    const s = adminStatus(a);
    if (s === "suspended") suspended++;
    else active++;
    if (a.legacy) legacy++;
    if (!a.mfaEnrolled && !a.disabled) noMfa++;
    if (!a.disabled && a.roles.includes("super_admin")) supers++;
  }
  return { total: rows.length, active, suspended, legacy, noMfa, supers };
}
