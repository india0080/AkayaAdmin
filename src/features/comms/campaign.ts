// Notification campaigns: pure logic (types, validation, payload builders,
// audience builder, schedule rules, honest count labels, permissions, tolerant
// wire parsing). No React / Firebase imports: unit-tested under node --test.
// The wire shapes are ASSUMED from docs/eleven/26_change09_contract.md and
// isolated here; reconcile with docs/eleven/27_change09_backend.md.

import { DESTINATIONS, destinationPayload, validateDestination, type Destination, type DestinationInput } from "./destinations";

// ── Limits (mirror functions/src/admin_comms.ts; the server re-validates) ───
export const TITLE_MAX = 65;
export const BODY_MAX = 240;
export const USERS_MAX = 500;
export const MAX_DEVICES = 20000;
export const LARGE_SEND = 1000;
export const SCHEDULE_MIN_LEAD_MS = 60_000;
export const SCHEDULE_MAX_LEAD_MS = 60 * 24 * 3_600_000;
export const CONFIRM_ALL_PHRASE = "SEND TO ALL";
export const MIN_REASON = 5;

export const ENTITLEMENT_GROUPS = ["free", "app_premium", "floating_premium", "all_access"] as const;
export type EntitlementGroup = (typeof ENTITLEMENT_GROUPS)[number];
export const GROUP_LABEL: Record<EntitlementGroup, string> = {
  free: "Free", app_premium: "App Premium", floating_premium: "Floating Premium", all_access: "All Access",
};
export const PLATFORMS = ["android", "ios"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const UNSUPPORTED_AUDIENCE_NOTE =
  "Not supported: targeting by country or by app version. The app does not store either, so they cannot be used as filters.";

// ── Permissions ─────────────────────────────────────────────────────────────
// adminComms has no separate read permission: list/detail need comms.send, the
// same as the nav entry. Audience "all" additionally needs comms.broadcast
// (the legacy rule; the server stays the authority).
export const COMMS_READ_PERMISSION = "comms.send" as const;
export const COMMS_WRITE_PERMISSION = "comms.send" as const;
export const COMMS_BROADCAST_PERMISSION = "comms.broadcast" as const;
export function commsAccess(can: (p: "comms.send" | "comms.broadcast") => boolean) {
  return { canRead: can(COMMS_READ_PERMISSION), canSend: can(COMMS_WRITE_PERMISSION), canBroadcast: can(COMMS_BROADCAST_PERMISSION) };
}

// ── Text ────────────────────────────────────────────────────────────────────
export interface CharCount { length: number; max: number; over: boolean; label: string }
export function charCount(text: string, max: number): CharCount {
  const length = [...text].length;
  return { length, max, over: length > max, label: `${length}/${max}` };
}
/** Same bracket / control character rule as the other console text inputs. */
export function textProblem(text: string, what: string, max: number, multiline: boolean): string | null {
  const t = text.trim();
  if (!t) return `${what} is required.`;
  if ([...t].length > max) return `${what} is too long (max ${max}).`;
  if (/[<>＜＞]/.test(t)) return `${what} cannot contain < or >.`;
  const ctrl = multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/ : /[\u0000-\u001F\u007F]/;
  if (ctrl.test(t)) return `${what} contains control characters.`;
  return null;
}

// ── Audience ────────────────────────────────────────────────────────────────
export type AudienceKind = "all" | "entitlement" | "users" | "platform" | "language";
export const AUDIENCE_KINDS: { id: AudienceKind; label: string }[] = [
  { id: "entitlement", label: "Entitlement group" },
  { id: "users", label: "Specific users (UIDs)" },
  { id: "platform", label: "Platform" },
  { id: "language", label: "Language" },
  { id: "all", label: "Everyone" },
];

/** platform / language are required for their own kind and optional AND filters for every kind except "all". */
export interface AudienceDraft {
  kind: AudienceKind;
  group: EntitlementGroup;
  usersText: string;
  platform: Platform | "";
  language: string;
}
export const EMPTY_AUDIENCE: AudienceDraft = { kind: "entitlement", group: "free", usersText: "", platform: "", language: "" };

const UID_RE = /^[A-Za-z0-9_-]{6,128}$/;
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const LANG_RE = /^[a-z]{2,3}(-[A-Za-z]{2,4})?$/;

export interface UserList { uids: string[]; emails: string[]; invalid: string[]; total: number }
/** Splits on commas / whitespace / semicolons; dedupes; classifies uid vs email. */
export function parseUserList(text: string): UserList {
  const seen = new Set<string>();
  const uids: string[] = [];
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const t = raw.trim();
    if (!t) continue;
    if (EMAIL_RE.test(t)) {
      const e = t.toLowerCase();
      if (!seen.has(e)) { seen.add(e); emails.push(e); }
    } else if (UID_RE.test(t)) {
      if (!seen.has(t)) { seen.add(t); uids.push(t); }
    } else if (!seen.has(t)) { seen.add(t); invalid.push(t); }
  }
  return { uids, emails, invalid, total: uids.length + emails.length };
}

export interface TicketLock { ticketId: string; ownerUid: string | null }

/** Field-keyed audience errors. A ticket lock overrides the draft entirely. */
export function validateAudience(a: AudienceDraft, ticket: TicketLock | null): Record<string, string> {
  const e: Record<string, string> = {};
  if (ticket) return e;
  switch (a.kind) {
    case "users": {
      const l = parseUserList(a.usersText);
      if (l.total === 0 && l.invalid.length === 0) e.users = "Enter at least one user ID.";
      else if (l.emails.length) e.users = "Emails are not accepted by the server (user IDs only). Find the UID in the User Directory.";
      else if (l.invalid.length) e.users = `Not a valid user ID: ${l.invalid.slice(0, 3).join(", ")}${l.invalid.length > 3 ? ` (+${l.invalid.length - 3} more)` : ""}.`;
      else if (l.total > USERS_MAX) e.users = `At most ${USERS_MAX} users per campaign (you entered ${l.total}).`;
      break;
    }
    case "language":
      if (!LANG_RE.test(a.language.trim())) e.language = "Use a language code such as en, hi or pt-BR.";
      break;
    case "entitlement":
      if (!ENTITLEMENT_GROUPS.includes(a.group)) e.group = "Choose a group.";
      break;
    case "platform":
      if (!a.platform || !PLATFORMS.includes(a.platform)) e.platform = "Choose a platform.";
      break;
    default:
  }
  // Optional AND filters (any kind except all).
  if (a.kind !== "all") {
    if (a.kind !== "platform" && a.platform && !PLATFORMS.includes(a.platform)) e.platform = "Choose a platform.";
    if (a.kind !== "language" && a.language.trim() && !LANG_RE.test(a.language.trim())) e.language = "Use a language code such as en, hi or pt-BR.";
  }
  return e;
}

export type WireAudience = {
  kind: AudienceKind | "ticket_owner";
  group?: EntitlementGroup;
  uids?: string[];
  platform?: Platform;
  language?: string;
  ticketId?: string;
};

export function audiencePayload(a: AudienceDraft, ticket: TicketLock | null): WireAudience {
  if (ticket) return { kind: "ticket_owner", ticketId: ticket.ticketId };
  if (a.kind === "all") return { kind: "all" };
  const out: WireAudience = { kind: a.kind };
  if (a.kind === "entitlement") out.group = a.group;
  if (a.kind === "users") out.uids = parseUserList(a.usersText).uids;
  if (a.platform) out.platform = a.platform;
  if (a.language.trim()) out.language = a.language.trim().toLowerCase();
  return out;
}

/** Human summary of a wire audience (tolerates unknown shapes). */
export function audienceLabel(a: Record<string, unknown> | null | undefined): string {
  if (!a) return "Unknown audience";
  const filters = [a.platform ? `platform ${String(a.platform)}` : "", a.language ? `language ${String(a.language)}` : ""].filter(Boolean);
  const f = (base: string) => (filters.length && a.kind !== "platform" && a.kind !== "language" ? `${base} + ${filters.join(", ")}` : base);
  switch (a.kind) {
    case "all": return "Everyone";
    case "entitlement": {
      const g = String(a.group ?? "");
      return f(`Entitlement: ${GROUP_LABEL[g as EntitlementGroup] ?? (g || "unknown")}`);
    }
    case "plan": return f(`Plan: ${String(a.planId ?? "unknown")}`);
    case "users": {
      const n = Array.isArray(a.uids) ? a.uids.length : 0;
      return f(`${n} specific user${n === 1 ? "" : "s"}`);
    }
    case "platform": return `Platform: ${String(a.platform ?? "?")}${a.language ? ` + language ${String(a.language)}` : ""}`;
    case "language": return `Language: ${String(a.language ?? "?")}${a.platform ? ` + platform ${String(a.platform)}` : ""}`;
    case "ticket_owner": return "Ticket owner";
    default: return String(a.kind ?? "Unknown audience");
  }
}

// ── Schedule ────────────────────────────────────────────────────────────────
/** "draft" stores the campaign without sending; it is promoted later with sendCampaign {campaignId, schedule}. */
export interface ScheduleDraft { mode: "now" | "at" | "draft"; local: string }
export type WireSchedule = { mode: "now" } | { mode: "draft" } | { mode: "at"; at: number };
export const EMPTY_SCHEDULE: ScheduleDraft = { mode: "now", local: "" };

/** `datetime-local` value (browser time zone) -> epoch ms. */
export function localToMs(v: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}
export function validateSchedule(s: ScheduleDraft, now: number = Date.now()): Record<string, string> {
  const e: Record<string, string> = {};
  if (s.mode !== "at") return e;
  const t = localToMs(s.local);
  if (t === null) e.at = "Pick a date and time.";
  else if (t < now + SCHEDULE_MIN_LEAD_MS) e.at = "Schedule at least 1 minute from now.";
  else if (t > now + SCHEDULE_MAX_LEAD_MS) e.at = "Schedule at most 60 days ahead.";
  return e;
}
export function schedulePayload(s: ScheduleDraft): WireSchedule {
  if (s.mode === "draft") return { mode: "draft" };
  if (s.mode === "at") { const t = localToMs(s.local); if (t !== null) return { mode: "at", at: t }; }
  return { mode: "now" };
}
/** offsetMinutes is Date#getTimezoneOffset() (inverted sign). */
export function timezoneNote(tz: string | null | undefined, offsetMinutes: number): string {
  const sign = offsetMinutes <= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `Times are in your browser time zone (${tz || "local"}, UTC${sign}${hh}:${mm}). The campaign is stored as an exact instant and sends within about a minute of it.`;
}

// ── Whole draft ─────────────────────────────────────────────────────────────
export interface ImageRef { url: string; name?: string }
export interface CampaignDraft {
  title: string;
  body: string;
  image: ImageRef | null;
  destination: DestinationInput;
  audience: AudienceDraft;
  schedule: ScheduleDraft;
  ticket: TicketLock | null;
}
export const EMPTY_DRAFT: CampaignDraft = {
  title: "", body: "", image: null, destination: { type: "home", params: {} },
  audience: EMPTY_AUDIENCE, schedule: EMPTY_SCHEDULE, ticket: null,
};

/** The ticket lock is active only while the destination is support_ticket. */
export function activeTicket(d: Pick<CampaignDraft, "destination" | "ticket">): TicketLock | null {
  return d.destination.type === "support_ticket" ? d.ticket : null;
}

export function validateDraft(d: CampaignDraft, now: number = Date.now(), reg: readonly Destination[] = DESTINATIONS): Record<string, string> {
  const e: Record<string, string> = {};
  const t = textProblem(d.title, "Title", TITLE_MAX, false); if (t) e.title = t;
  const b = textProblem(d.body, "Message", BODY_MAX, true); if (b) e.body = b;
  if (d.image && !/^https:\/\//.test(d.image.url)) e.image = "The image URL must be https.";
  for (const [k, v] of Object.entries(validateDestination(d.destination, reg))) e[`dest.${k}`] = v;
  if (d.destination.type === "support_ticket") {
    if (!d.ticket) e.ticket = "Look up the ticket first: this destination only goes to that ticket's owner.";
    else if ((d.destination.params.ticketId ?? "").trim() !== d.ticket.ticketId) e["dest.ticketId"] = "The ticket ID changed after lookup. Look it up again.";
  }
  for (const [k, v] of Object.entries(validateAudience(d.audience, activeTicket(d)))) e[`aud.${k}`] = v;
  for (const [k, v] of Object.entries(validateSchedule(d.schedule, now))) e[`sched.${k}`] = v;
  return e;
}

export interface ComposePayload {
  title: string;
  body: string;
  imageUrl?: string;
  destination: { type: string; params: Record<string, string> };
  audience: WireAudience;
  schedule: WireSchedule;
}
export function composePayload(d: CampaignDraft, reg: readonly Destination[] = DESTINATIONS): ComposePayload {
  return {
    title: d.title.trim(),
    body: d.body.trim(),
    ...(d.image ? { imageUrl: d.image.url } : {}),
    destination: destinationPayload(d.destination, reg),
    audience: audiencePayload(d.audience, activeTicket(d)),
    schedule: schedulePayload(d.schedule),
  };
}

export function composeValidateRequest(d: CampaignDraft, reg: readonly Destination[] = DESTINATIONS) { return { action: "composeValidate", ...composePayload(d, reg) }; }
export function testSendRequest(d: CampaignDraft, reg: readonly Destination[] = DESTINATIONS) {
  const p = composePayload(d, reg);
  // The test goes only to the calling admin: audience and schedule are irrelevant.
  return { action: "testSendToSelf", title: p.title, body: p.body, ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}), destination: p.destination };
}
/** force:true only ever after the server refused a duplicate (already-exists) and the admin confirmed. */
export function sendRequest(d: CampaignDraft, opts: { reason?: string; confirmAll?: boolean; force?: boolean; registry?: readonly Destination[] }) {
  const p = composePayload(d, opts.registry ?? DESTINATIONS);
  return {
    action: "sendCampaign", ...p,
    ...(opts.reason ? { reason: opts.reason } : {}),
    ...(p.audience.kind === "all" ? { confirmAll: opts.confirmAll === true } : {}),
    ...(opts.force ? { force: true } : {}),
  };
}
/** Promote a stored draft: stored content wins, only the schedule (and confirmations) are sent. */
export function promoteRequest(campaignId: string, schedule: WireSchedule, opts: { reason?: string; confirmAll?: boolean; force?: boolean }) {
  return {
    action: "sendCampaign", campaignId, schedule,
    ...(opts.reason ? { reason: opts.reason } : {}),
    ...(opts.confirmAll ? { confirmAll: true } : {}),
    ...(opts.force ? { force: true } : {}),
  };
}
export function cancelRequest(campaignId: string, expectedVersion: number | null, reason: string) {
  return { action: "cancelCampaign", campaignId, ...(expectedVersion !== null ? { expectedVersion } : {}), ...(reason ? { reason } : {}) };
}
export function listRequest(opts: { status?: string; before?: number | null; limit?: number }) {
  return { action: "listCampaigns", limit: opts.limit ?? 30, ...(opts.status ? { status: opts.status } : {}), ...(opts.before ? { before: opts.before } : {}) };
}

// ── Confirmation policy ─────────────────────────────────────────────────────
export type ConfirmPlan =
  | { level: "typed"; phrase: string; why: string }
  | { level: "reason"; why: string }
  | { level: "confirm"; why: string };

/** Server: "all" (also scheduled/draft) needs confirmAll:true + reason >= 5 + comms.broadcast. */
export function planFor(audienceKind: string, mode: "now" | "at" | "draft", estimate: number | null): ConfirmPlan {
  if (audienceKind === "all") return { level: "typed", phrase: CONFIRM_ALL_PHRASE, why: "This goes to every user and cannot be recalled." };
  if (mode === "draft") return { level: "confirm", why: "The draft is saved and not sent." };
  if (mode === "at") return { level: "reason", why: "Scheduled sends are recorded with a reason." };
  if (estimate !== null && estimate >= LARGE_SEND) return { level: "reason", why: `Large send (${estimate} recipients).` };
  return { level: "confirm", why: "A push cannot be recalled once it is sent." };
}
export function confirmPlan(d: CampaignDraft, estimate: number | null): ConfirmPlan {
  return planFor(audiencePayload(d.audience, activeTicket(d)).kind, d.schedule.mode, estimate);
}

// ── Errors ──────────────────────────────────────────────────────────────────
export const DUPLICATE_MESSAGE = "An identical campaign from you was sent in the last 10 minutes. Nothing was sent.";
export const RATE_LIMIT_MESSAGE = "Rate limit reached for this hour (20 sends, 3 to everyone, 30 test sends). Try again later.";
export function isDuplicate(e: { code?: string } | null | undefined): boolean { return e?.code === "already-exists"; }
export function isRateLimited(e: { code?: string } | null | undefined): boolean { return e?.code === "resource-exhausted"; }
/** Operator-readable message for a failed campaign action. */
export function friendlyError(e: { code?: string; message?: string } | null | undefined, fallback: string): string {
  if (isDuplicate(e)) return DUPLICATE_MESSAGE;
  if (isRateLimited(e)) return RATE_LIMIT_MESSAGE;
  return e?.message || fallback;
}

// ── Honest counts ───────────────────────────────────────────────────────────
export interface Counts { targeted: number | null; tokens: number | null; accepted: number | null; failed: number | null; pruned: number | null }
export const COUNT_ROWS: { key: keyof Counts; label: string; hint: string }[] = [
  { key: "targeted", label: "Targeted users", hint: "Users matched by the audience when the send started." },
  { key: "tokens", label: "Device tokens", hint: "Registered devices belonging to those users." },
  { key: "accepted", label: "Accepted by FCM", hint: "Firebase Cloud Messaging accepted the message for these devices." },
  { key: "failed", label: "Failed", hint: "FCM rejected the message for these devices." },
  { key: "pruned", label: "Dead tokens removed", hint: "Tokens FCM reported as no longer registered; deleted." },
];
export const COUNTS_DISCLAIMER =
  "Accepted by FCM means Google took the message for that device. It does not tell us the message reached the phone or that anyone opened it, so no delivery or read figure is shown.";
export function countValue(n: number | null): string { return n === null ? "-" : n.toLocaleString("en-US"); }

// ── Status ──────────────────────────────────────────────────────────────────
export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "failed" | "cancelled";
export const STATUS_META: Record<CampaignStatus, { label: string; pill: "ok" | "degraded" | "down" | "pending" | "off" | "unknown" }> = {
  draft: { label: "Draft", pill: "off" },
  scheduled: { label: "Scheduled", pill: "pending" },
  sending: { label: "Sending", pill: "pending" },
  sent: { label: "Sent", pill: "ok" },
  failed: { label: "Failed", pill: "down" },
  cancelled: { label: "Cancelled", pill: "off" },
};
export function statusMeta(s: string) {
  return STATUS_META[s as CampaignStatus] ?? { label: s || "Unknown", pill: "unknown" as const };
}

// ── Wire parsing (tolerant) ─────────────────────────────────────────────────
export interface Campaign {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  destination: { type: string; params: Record<string, string> };
  audience: Record<string, unknown>;
  scheduleMode: "now" | "at";
  scheduledAt: number | null;
  status: string;
  counts: Counts;
  createdByEmail: string | null;
  createdAt: number | null;
  sentAt: number | null;
  version: number | null;
  error: string | null;
  reason: string | null;
  note: string | null;
  cancelledAt: number | null;
}

export function canCancel(c: Pick<Campaign, "status">, canSend: boolean): boolean {
  return canSend && (c.status === "scheduled" || c.status === "draft");
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
function ms(v: unknown): number | null {
  if (typeof v === "number") return v;
  const r = rec(v);
  if (typeof r._seconds === "number") return r._seconds * 1000;
  if (typeof r.seconds === "number") return r.seconds * 1000;
  if (typeof v === "string") { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  return null;
}

export function normalizeCampaign(raw: unknown): Campaign {
  const r = rec(raw);
  const d = rec(r.destination);
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec(d.params))) if (typeof v === "string") params[k] = v;
  const s = rec(r.schedule);
  const c = rec(r.counts);
  return {
    id: str(r.id) ?? str(r.campaignId) ?? "",
    title: str(r.title) ?? "",
    body: str(r.body) ?? "",
    imageUrl: str(r.imageUrl),
    destination: { type: str(d.type) ?? "home", params },
    audience: rec(r.audience),
    scheduleMode: s.mode === "at" ? "at" : "now",
    scheduledAt: ms(s.at),
    status: str(r.status) ?? "unknown",
    counts: { targeted: num(c.targeted), tokens: num(c.tokens), accepted: num(c.accepted), failed: num(c.failed), pruned: num(c.pruned) },
    createdByEmail: str(r.createdByEmail) ?? str(r.createdBy),
    createdAt: ms(r.createdAt),
    sentAt: ms(r.sentAt),
    version: num(r.version),
    error: str(r.error),
    reason: str(r.reason),
    note: str(r.note),
    cancelledAt: ms(r.cancelledAt),
  };
}
export function listMeta(raw: unknown): { hasMore: boolean; next: number | null } {
  const r = rec(raw);
  return { hasMore: r.hasMore === true, next: num(r.next) };
}
export function normalizeCampaignList(raw: unknown): Campaign[] {
  const r = rec(raw);
  const list = Array.isArray(r.campaigns) ? r.campaigns : Array.isArray(r.rows) ? r.rows : Array.isArray(raw) ? raw : [];
  return list.map(normalizeCampaign).filter((c) => c.id);
}

export interface FieldError { field: string; message: string }
export interface ValidateResult {
  valid: boolean;
  errors: FieldError[];
  warnings: string[];
  /** Distinct users with a device; null for audience "all" (only a device count exists). */
  users: number | null;
  tokens: number | null;
  capped: boolean;
  exact: boolean;
  requiresConfirmAll: boolean;
}
/** composeValidate: valid:false + errors[{field,message}] (not an exception). */
export function normalizeValidate(raw: unknown): ValidateResult {
  const r = rec(raw);
  const au = rec(r.audience);
  const errors: FieldError[] = Array.isArray(r.errors)
    ? r.errors.map((e) => (typeof e === "string" ? { field: "", message: e } : { field: str(rec(e).field) ?? "", message: str(rec(e).message) ?? "Invalid" }))
    : [];
  return {
    valid: r.valid === true && errors.length === 0,
    errors,
    warnings: Array.isArray(r.warnings) ? r.warnings.filter((w): w is string => typeof w === "string") : [],
    users: num(au.users),
    tokens: num(au.tokens),
    capped: au.capped === true,
    exact: au.exact !== false,
    requiresConfirmAll: au.requiresConfirmAll === true,
  };
}
/** True when the device estimate exceeds the per-campaign cap (the send would be refused). */
export function overDeviceCap(v: ValidateResult | null): boolean { return !!v && v.tokens !== null && v.tokens > MAX_DEVICES; }
export function estimateLabel(v: ValidateResult | null): string {
  if (!v) return "Not checked yet.";
  if (!v.valid) return "The server rejected this campaign.";
  if (v.tokens === 0) return "No devices match: nobody would receive this.";
  const n = (x: number) => x.toLocaleString("en-US");
  const approx = v.exact ? "" : "About ";
  const cap = v.capped ? " (capped: the real audience is larger)" : "";
  if (v.users === null) return `${approx}${v.tokens !== null ? n(v.tokens) : "?"} device(s) (user count is not available for everyone)${cap}.`;
  return `${approx}${n(v.users)} user(s)${v.tokens !== null ? ` on ${n(v.tokens)} device(s)` : ""}${cap}. Only users with a registered device are counted.`;
}

export const CONFLICT_MESSAGE = "This campaign changed since you loaded it (it may already be sending). The list was reloaded.";
