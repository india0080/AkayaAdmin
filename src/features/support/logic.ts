// Support tickets: pure logic (no React, no Firebase) - unit-tested under
// node --test. Contract: docs/eleven/15_change05_contract.md (adminTickets).

import { isVersionConflict } from "../revenue/subscriptionLogic";
import type {
  HistoryEntry, InternalNote, QueueFilters, Ticket, TicketCategory, TicketCounts, TicketDetail,
  TicketList, TicketMessage, TicketPriority, TicketStatus, TicketUserContext,
} from "./types";

export const STATUSES: TicketStatus[] = ["open", "in_progress", "waiting_user", "resolved", "closed"];
export const PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];
export const CATEGORIES: TicketCategory[] = [
  "login", "subscription", "floating", "attachments", "models", "voice",
  "notifications", "account", "permissions", "errors", "howto", "other",
];

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open", in_progress: "In progress", waiting_user: "Waiting on user", resolved: "Resolved", closed: "Closed",
};
export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Low", normal: "Normal", high: "High", urgent: "Urgent",
};
export const PAGE_SIZE = 25;
export const MAX_REPLY = 4000;
export const MAX_NOTE = 4000;
export const MAX_SEARCH = 100;

export const labelOf = (s: string): string => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Statuses an admin may move a ticket to from `from` (the server is authoritative). */
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "waiting_user", "resolved", "closed"],
  in_progress: ["open", "waiting_user", "resolved", "closed"],
  waiting_user: ["open", "in_progress", "resolved", "closed"],
  resolved: ["open", "in_progress", "closed"],
  closed: ["open"],
};
export function allowedTransitions(from: TicketStatus): TicketStatus[] {
  return TRANSITIONS[from] ?? [];
}
export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return allowedTransitions(from).includes(to);
}
/** Closing needs a recorded reason; resolving is a plain confirmation. */
export function statusConfirmLevel(to: TicketStatus): "none" | "confirm" | "reason" {
  if (to === "closed") return "reason";
  if (to === "resolved") return "confirm";
  return "none";
}
export const canReply = (status: TicketStatus): boolean => status !== "closed";

// -- Filters -> payload ------------------------------------------------------

export const EMPTY_FILTERS: QueueFilters = { status: "open", priority: "", assignee: "", category: "", search: "" };

export function buildListPayload(f: QueueFilters, cursor: string | null = null, limit = PAGE_SIZE): Record<string, unknown> {
  const p: Record<string, unknown> = { action: "list", limit: Math.min(Math.max(1, Math.floor(limit)), 50) };
  if (f.status !== "all") p.status = f.status;
  if (f.priority) p.priority = f.priority;
  if (f.assignee.trim()) p.assignedTo = f.assignee.trim();
  if (f.category) p.category = f.category;
  const s = f.search.trim().slice(0, MAX_SEARCH);
  if (s) p.search = s;
  if (cursor) p.cursor = cursor;
  return p;
}

/** Append a page without duplicates (first occurrence wins, order kept). */
export function mergePage(existing: Ticket[], incoming: Ticket[]): Ticket[] {
  const seen = new Set(existing.map((t) => t.id));
  const out = [...existing];
  for (const t of incoming) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }
  return out;
}

/**
 * Fold a refreshed ticket into the loaded rows: replace in place, or drop it
 * when it no longer matches the active status tab (so a closed ticket leaves
 * the "Open" tab immediately instead of lingering until a reload).
 */
export function applyTicketUpdate(rows: Ticket[], updated: Ticket, f: Pick<QueueFilters, "status">): Ticket[] {
  if (f.status !== "all" && updated.status !== f.status) return rows.filter((t) => t.id !== updated.id);
  return rows.map((t) => (t.id === updated.id ? { ...t, ...updated, email: updated.email ?? t.email } : t));
}

// -- Sorting helpers (page-local; the server order is updatedAt desc) -------

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
export const priorityRank = (p: string): number => PRIORITY_RANK[p] ?? 9;

/** Unread-for-admin first, then priority, then most recently updated. Stable. */
export function sortQueue(rows: readonly Ticket[]): Ticket[] {
  return rows
    .map((t, i) => ({ t, i }))
    .sort((a, b) =>
      Number(b.t.unreadForAdmin) - Number(a.t.unreadForAdmin) ||
      priorityRank(a.t.priority) - priorityRank(b.t.priority) ||
      (b.t.updatedAt ?? 0) - (a.t.updatedAt ?? 0) ||
      a.i - b.i)
    .map((x) => x.t);
}

export function priorityTone(p: string): "neutral" | "info" | "warning" | "danger" {
  return p === "urgent" ? "danger" : p === "high" ? "warning" : p === "normal" ? "info" : "neutral";
}
export function statusTone(s: string): "neutral" | "info" | "warning" | "success" | "accent" {
  return s === "open" ? "info" : s === "in_progress" ? "accent" : s === "waiting_user" ? "warning" : s === "resolved" ? "success" : "neutral";
}

// -- Conflict handling -------------------------------------------------------

export const TICKET_CONFLICT_MESSAGE =
  "This ticket changed since you loaded it. Nothing was applied. The latest version has been reloaded - review it and try again.";

export function isTicketConflict(e: unknown): boolean {
  return isVersionConflict(e);
}
/** Operator-facing message for a failed mutation. */
export function mutationErrorMessage(e: unknown): string {
  if (isTicketConflict(e)) return TICKET_CONFLICT_MESSAGE;
  const m = (e as { message?: unknown })?.message;
  return typeof m === "string" && m ? m : "Something went wrong. Try again.";
}

// -- Time --------------------------------------------------------------------

export function absoluteTime(ms: number | null | undefined): string {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// -- Response normalisers (tolerant: the callable is the source of truth) ---

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function toMillis(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  const o = rec(v);
  if (typeof o._seconds === "number") return o._seconds * 1000;
  if (typeof o.seconds === "number") return o.seconds * 1000;
  return null;
}

export function normalizeTicket(raw: unknown): Ticket {
  const r = rec(raw);
  const dm = rec(r.deviceMeta);
  const entries = Object.entries(dm).filter(([, v]) => typeof v === "string" || typeof v === "number");
  const deviceMeta = entries.length ? Object.fromEntries(entries.map(([k, v]) => [k, String(v)])) : null;
  const lm = r.lastMessageBy;
  return {
    id: str(r.id) || str(r.ticketId),
    humanId: str(r.humanId),
    uid: str(r.uid),
    email: strOrNull(r.email) ?? strOrNull(r.userEmail),
    status: (STATUSES as string[]).includes(str(r.status)) ? (r.status as TicketStatus) : "open",
    priority: (PRIORITIES as string[]).includes(str(r.priority)) ? (r.priority as TicketPriority) : "normal",
    category: str(r.category) || "other",
    title: str(r.title),
    summary: str(r.summary),
    createdAt: toMillis(r.createdAt),
    updatedAt: toMillis(r.updatedAt),
    lastMessageAt: toMillis(r.lastMessageAt),
    lastMessageBy: lm === "user" || lm === "admin" || lm === "system" ? lm : null,
    assignedToUid: strOrNull(r.assignedToUid),
    assignedToEmail: strOrNull(r.assignedToEmail),
    appVersion: strOrNull(r.appVersion),
    platform: strOrNull(r.platform),
    deviceMeta,
    unreadForAdmin: r.unreadForAdmin === true,
    messageCount: num(r.messageCount),
    attachmentCount: num(r.attachmentCount),
    version: num(r.version),
  };
}

export function normalizeList(raw: unknown): TicketList {
  const r = rec(raw);
  const rows = arr(r.tickets ?? r.rows ?? r.items).map(normalizeTicket).filter((t) => t.id);
  return { tickets: rows, nextCursor: strOrNull(r.nextCursor) };
}

export function normalizeCounts(raw: unknown): TicketCounts {
  const r = rec(raw);
  const src = rec(r.counts ?? r.byStatus ?? r);
  const out = { open: 0, in_progress: 0, waiting_user: 0, resolved: 0, closed: 0, all: 0 } as TicketCounts;
  for (const s of STATUSES) out[s] = num(src[s]);
  out.all =
    typeof src.all === "number" ? src.all
    : typeof src.total === "number" ? src.total
    : typeof r.total === "number" ? r.total
    : STATUSES.reduce((a, s) => a + out[s], 0);
  return out;
}

const ROLES = ["user", "bot", "admin", "system"];
function normalizeMessage(raw: unknown, i: number): TicketMessage {
  const r = rec(raw);
  return {
    id: str(r.id) || `m${i}`,
    role: ROLES.includes(str(r.role)) ? (r.role as TicketMessage["role"]) : "system",
    text: str(r.text),
    createdAt: toMillis(r.createdAt),
    authorName: strOrNull(r.authorName),
    attachments: arr(r.attachments).map((a) => ({ name: str(rec(a).name), type: str(rec(a).type), size: num(rec(a).size) })),
  };
}
function normalizeNote(raw: unknown, i: number): InternalNote {
  const r = rec(raw);
  return { id: str(r.id) || `n${i}`, text: str(r.text), createdAt: toMillis(r.createdAt), authorEmail: strOrNull(r.authorEmail) };
}
function normalizeHistory(raw: unknown, i: number): HistoryEntry {
  const r = rec(raw);
  return {
    id: str(r.id) || `h${i}`, at: toMillis(r.at), actorEmail: strOrNull(r.actorEmail), action: str(r.action),
    from: r.from == null ? null : String(r.from), to: r.to == null ? null : String(r.to),
  };
}
function summarise(v: unknown): string | null {
  if (typeof v === "string") return v || null;
  const o = rec(v);
  const id = str(o.planId) || str(o.effective) || str(o.id) || str(o.name);
  return id ? id + (o.active === false ? " (inactive)" : "") : null;
}
function normalizeUser(raw: unknown): TicketUserContext | null {
  const r = rec(raw);
  if (!Object.keys(r).length) return null;
  return {
    uid: str(r.uid), email: strOrNull(r.email), displayName: strOrNull(r.displayName),
    plan: summarise(r.plan), entitlement: summarise(r.entitlement ?? r.effectiveEntitlement), createdAt: toMillis(r.createdAt),
  };
}

export function normalizeDetail(raw: unknown): TicketDetail {
  const r = rec(raw);
  return {
    ticket: normalizeTicket(r.ticket ?? r),
    messages: arr(r.messages).map(normalizeMessage).sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)),
    notes: arr(r.internalNotes ?? r.internal_notes ?? r.notes).map(normalizeNote).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    history: arr(r.history).map(normalizeHistory).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)),
    user: normalizeUser(r.user ?? r.userContext),
  };
}

/** Human line for a history row. */
export function describeHistory(h: HistoryEntry): string {
  if (h.from !== null || h.to !== null) return `${labelOf(h.action)}: ${h.from ?? "-"} -> ${h.to ?? "-"}`;
  return labelOf(h.action);
}
