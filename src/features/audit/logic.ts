// Pure audit-log helpers (unit-tested).

export interface AuditChange {
  field: string;
  from: string;
  to: string;
}

export interface AuditEntry {
  id: string;
  at: number | null;
  actorUid: string;
  actorEmail: string;
  actorRoles: string[];
  action: string;
  targetType: string;
  targetId: string;
  changes: AuditChange[];
  reason: string;
  result: "ok" | "denied" | "error";
  errorCode: string | null;
  requestId: string;
  meta: Record<string, unknown> | null;
}

/// The server accepts ONE equality filter at a time (one composite index
/// per field). The UI models that honestly instead of pretending to AND.
export type AuditFilterField = "action" | "actorUid" | "targetType" | "targetId" | "result";

export interface AuditFilter {
  field: AuditFilterField;
  value: string;
}

export const FILTER_FIELDS: { id: AuditFilterField; label: string; placeholder: string }[] = [
  { id: "action", label: "Action", placeholder: "e.g. billing.setPlan" },
  { id: "actorUid", label: "Actor UID", placeholder: "Admin UID" },
  { id: "targetType", label: "Target type", placeholder: "user, provider, admin…" },
  { id: "targetId", label: "Target ID", placeholder: "User UID, provider id…" },
  { id: "result", label: "Result", placeholder: "ok, denied, error" },
];

export function filterPayload(f: AuditFilter | null): Record<string, unknown> {
  if (!f || !f.value.trim()) return {};
  return { [f.field]: f.value.trim() };
}

const DOMAIN_NAMES: Record<string, string> = {
  iam: "IAM",
  ai: "AI",
  billing: "Billing",
  users: "Users",
  floating: "Floating",
  voice: "Voice",
  config: "Config",
  flags: "Flags",
  comms: "Comms",
  audit: "Audit",
};

/// Actions whose generated wording would read badly.
const ACTION_LABELS: Record<string, string> = {
  "users.viewPii": "Users · Viewed personal data",
  "users.revokeSessions": "Users · Signed out everywhere",
  "users.retryErasure": "Users · Retried account erasure",
};

/// "billing.setPlan" → "Billing · Set plan". Unknown shapes pass through.
export function describeAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  const [domain, verb] = action.split(".", 2);
  if (!verb) return action;
  const human = verb
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
  const d = DOMAIN_NAMES[domain] ?? domain.charAt(0).toUpperCase() + domain.slice(1);
  return `${d} · ${human}`;
}

export function resultTone(r: AuditEntry["result"]): "ok" | "down" | "degraded" {
  return r === "ok" ? "ok" : r === "denied" ? "degraded" : "down";
}

export function resultLabel(r: AuditEntry["result"]): string {
  return r === "ok" ? "Success" : r === "denied" ? "Denied" : "Error";
}
