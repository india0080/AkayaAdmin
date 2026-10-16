// Recurring (auto-renewing) subscriptions: console pure logic (unit-tested).
// Contract: docs/subscription/14_recurring_subscriptions.md. Settings live in
// adminConfig target "subscription" under `recurring.*` (versioned, audited,
// rollbackable); the server validates, this builds and explains patches.

import type { Snapshot } from "../config/logic";

export const RECURRING_ENABLED_KEY = "recurring.enabled";
export const RECURRING_GRACE_KEY = "recurring.graceDays";
export const RECURRING_ALLOW_KEY = "recurring.allowUids";

export interface RecurringProductDef {
  key: "appPremium" | "floatingPremium" | "allAccess";
  planId: "app_premium" | "floating_premium" | "all_access";
  label: string;
  /** Suggested real monthly price (rupees) used to prefill the price helper. */
  suggestedMonthlyRupees: number;
}

export const RECURRING_PRODUCTS: readonly RecurringProductDef[] = [
  { key: "appPremium", planId: "app_premium", label: "App Premium", suggestedMonthlyRupees: 99 },
  { key: "floatingPremium", planId: "floating_premium", label: "Floating System Premium", suggestedMonthlyRupees: 149 },
  { key: "allAccess", planId: "all_access", label: "All Access", suggestedMonthlyRupees: 199 },
];

export const enabledKey = (k: RecurringProductDef["key"]) => `recurring.products.${k}.enabled`;
export const introKey = (k: RecurringProductDef["key"]) => `recurring.products.${k}.introAmountInr`;

function getPath(snap: Snapshot, dotted: string): unknown {
  if (dotted in snap) return snap[dotted];
  let cur: unknown = snap;
  for (const part of dotted.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export interface RecurringConfigView {
  enabled: boolean;
  graceDays: number;
  allowUids: string[];
  products: Record<RecurringProductDef["key"], { enabled: boolean; introPaise: number }>;
}

/** Effective values; anything missing or malformed reads as the OFF default. */
export function readRecurringConfig(snap: Snapshot | null | undefined): RecurringConfigView {
  const s = snap ?? {};
  const grace = getPath(s, RECURRING_GRACE_KEY);
  const allow = getPath(s, RECURRING_ALLOW_KEY);
  const products = {} as RecurringConfigView["products"];
  for (const p of RECURRING_PRODUCTS) {
    const intro = getPath(s, introKey(p.key));
    products[p.key] = {
      enabled: getPath(s, enabledKey(p.key)) === true,
      introPaise: typeof intro === "number" && Number.isInteger(intro) && intro >= 100 ? intro : 100,
    };
  }
  return {
    enabled: getPath(s, RECURRING_ENABLED_KEY) === true,
    graceDays: typeof grace === "number" && Number.isInteger(grace) && grace >= 0 && grace <= 14 ? grace : 3,
    allowUids: Array.isArray(allow) ? allow.filter((u): u is string => typeof u === "string") : [],
    products,
  };
}

export function buildRecurringMasterPatch(next: boolean): Snapshot {
  if (typeof next !== "boolean") throw new Error("enabled must be true or false");
  return { [RECURRING_ENABLED_KEY]: next };
}

export function buildRecurringProductPatch(key: RecurringProductDef["key"], enabled: boolean, introPaise?: number): Snapshot {
  const def = RECURRING_PRODUCTS.find((p) => p.key === key);
  if (!def) throw new Error(`Unknown product: ${String(key)}`);
  if (typeof enabled !== "boolean") throw new Error("enabled must be true or false");
  const patch: Snapshot = { [enabledKey(key)]: enabled };
  if (introPaise !== undefined) {
    if (!Number.isInteger(introPaise) || introPaise < 100) throw new Error("The first-month price must be at least 100 paise (INR 1).");
    patch[introKey(key)] = introPaise;
  }
  return patch;
}

/** The rollout list as typed (comma / space / newline separated Firebase uids). */
export function parseUidList(raw: string): { ok: true; uids: string[] } | { ok: false; message: string } {
  const uids = raw.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
  const bad = uids.find((u) => !/^[A-Za-z0-9]{20,40}$/.test(u));
  if (bad) return { ok: false, message: `"${bad}" is not a Firebase user id.` };
  if (uids.length > 50) return { ok: false, message: "At most 50 user ids." };
  return { ok: true, uids: [...new Set(uids)] };
}

export function buildAllowListPatch(uids: string[]): Snapshot {
  return { [RECURRING_ALLOW_KEY]: uids };
}

/** Same rule as the server: 12 x monthly x 0.80, rounded to whole rupees (paise out). */
export function annualFromMonthlyPaise(monthlyPaise: number): number {
  return Math.round((12 * monthlyPaise * 0.8) / 100) * 100;
}

export function recurringMasterConfirm(next: boolean): { title: string; body: string; confirmLabel: string } {
  return next
    ? {
        title: "Turn on auto-renewing subscriptions?",
        body: "Products switched on below are sold as monthly subscriptions: the first month at the intro price, then the real price is debited every month until the customer cancels. Old app versions keep the one-time purchase. If a rollout list is set, only those users see it.",
        confirmLabel: "Turn on",
      }
    : {
        title: "Turn off auto-renewing subscriptions?",
        body: "New purchases go back to one-time payments. Existing auto-renewing subscribers keep renewing and keep access: this only stops NEW subscriptions.",
        confirmLabel: "Turn off",
      };
}

export interface StatusView { label: string; tone: "ok" | "degraded" | "down" | "off" | "unknown" }

/** Console wording for the server's `status` of a recurring subscription. */
export function recurringStatus(status: string | null | undefined, state?: string | null): StatusView {
  switch (status) {
    case "active": return { label: "Active", tone: "ok" };
    case "cancelling": return { label: "Cancelled (access until period end)", tone: "degraded" };
    case "pending_payment": return { label: "Payment failed (grace)", tone: "degraded" };
    case "halted": return { label: "Halted (retries exhausted)", tone: "down" };
    case "paused": return { label: "Paused", tone: "degraded" };
    case "ended": return { label: "Ended", tone: "off" };
    case "awaiting_payment": return { label: "Checkout not completed", tone: "unknown" };
    default: return { label: state ?? "Unknown", tone: "unknown" };
  }
}

export const RECURRING_TABS = ["all", "active", "pending", "halted", "cancelled"] as const;

/** Ledger "Type" label for the Payments table. */
export function ledgerTypeLabel(r: { recurringKind?: string | null; isIntro?: boolean; cycle?: number | null }): string {
  if (!r.recurringKind) return "One-time";
  if (r.isIntro) return "Intro month";
  if (r.recurringKind === "recurring_failed") return "Failed renewal";
  return r.cycle ? `Renewal ${r.cycle}` : "Renewal";
}
