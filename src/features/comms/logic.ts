// Push notifications — shared types and labels (unit-tested).

export type PushTarget = "all" | "silver" | "gold" | "app_premium" | "floating_premium" | "all_access" | "user";

// Mirrors functions/src/admin_comms.ts (the server re-validates).
export const TITLE_MAX = 65;
export const BODY_MAX = 240;

export interface Audience {
  delivery: "tokens" | "topic";
  users: number | null;
  devices: number;
  capped: boolean;
}

export interface HistoryRow {
  id: string;
  title: string;
  body: string;
  target: string;
  targetUid: string | null;
  sentByEmail: string | null;
  at: number | null;
  error: string | null;
  state: "queued" | "delivered" | "partial" | "no-audience" | "failed" | "topic";
  delivered: number | null;
  attempted: number | null;
}

export function deliveryLabel(r: Pick<HistoryRow, "state" | "delivered" | "attempted">): string {
  switch (r.state) {
    case "queued": return "Queued";
    case "delivered": return `Delivered ${r.delivered}/${r.attempted}`;
    case "partial": return `Partial ${r.delivered}/${r.attempted}`;
    case "no-audience": return "No devices";
    case "topic": return "Sent to topic (unverified)";
    default: return "Failed";
  }
}
