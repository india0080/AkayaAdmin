// Subscription enforcement + product availability: pure logic (unit-tested).
// Contract: docs/subscription/04_architecture_and_plan.md (adminConfig target
// "subscription"). The server owns validation; this builds and explains patches.

import type { Snapshot } from "../config/logic";
import { AdminApiError } from "../../lib/apiErrors";

export const SUBSCRIPTION_REQUIRED_KEY = "subscriptionRequired";

export type ProductKey = "appPremium" | "floatingPremium" | "allAccess";

export interface ProductDef {
  key: ProductKey;
  planId: "app_premium" | "floating_premium" | "all_access";
  label: string;
  /** Dotted config key, the same shape the other adminConfig targets use. */
  configKey: string;
  blurb: string;
}

export const PRODUCTS: readonly ProductDef[] = [
  { key: "appPremium", planId: "app_premium", label: "App Premium", configKey: "products.appPremium.active", blurb: "Premium access in the main Akaya app." },
  { key: "floatingPremium", planId: "floating_premium", label: "Floating System Premium", configKey: "products.floatingPremium.active", blurb: "Premium access to the whole Floating System." },
  { key: "allAccess", planId: "all_access", label: "All Access", configKey: "products.allAccess.active", blurb: "App Premium and Floating System Premium together." },
];

export const PRODUCT_NOTE =
  "A product can be purchased only when it is Active here AND its plan in Plans is Active. Entitlement of existing users and master enforcement are separate: turning a product off never removes access from anyone who already owns it.";

export const KILLSWITCH_NOTICE = "Turning enforcement OFF needs the kill-switch permission (operations or super admin).";

export const ENFORCEMENT_COPY = {
  on: "Users require a valid subscription for premium access.",
  off: "Subscription requirements are temporarily disabled. Eligible users receive full App + Floating System premium access without altering billing records.",
} as const;

export interface EnforcementConfirm {
  title: string;
  body: string;
  phrase: "ENABLE" | "DISABLE";
  confirmLabel: string;
  danger: boolean;
}

/** Confirmation copy for moving the master switch TO `next`. */
export function enforcementConfirm(next: boolean): EnforcementConfirm {
  return next
    ? {
        title: "Enable Subscription Requirement?",
        body: "Users will return to access based on their actual verified subscriptions.",
        phrase: "ENABLE",
        confirmLabel: "Enable requirement",
        danger: false,
      }
    : {
        title: "Disable Subscription Requirement?",
        body: "All eligible Akaya users will temporarily receive App Premium and Floating System Premium access. Existing purchases and billing records will not be changed.",
        phrase: "DISABLE",
        confirmLabel: "Disable requirement",
        danger: true,
      };
}

function getPath(snap: Snapshot, dotted: string): unknown {
  if (dotted in snap) return snap[dotted];
  let cur: unknown = snap;
  for (const part of dotted.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export interface SubscriptionConfigView {
  /** Effective value; a missing/malformed value is TRUE (secure default). */
  subscriptionRequired: boolean;
  /** True when the value is not explicitly stored. */
  requiredIsDefault: boolean;
  products: Record<ProductKey, boolean>;
}

export function readSubscriptionConfig(snap: Snapshot | null | undefined): SubscriptionConfigView {
  const s = snap ?? {};
  const raw = getPath(s, SUBSCRIPTION_REQUIRED_KEY);
  const products = {} as Record<ProductKey, boolean>;
  for (const p of PRODUCTS) products[p.key] = getPath(s, p.configKey) === true;
  return {
    subscriptionRequired: typeof raw === "boolean" ? raw : true,
    requiredIsDefault: typeof raw !== "boolean",
    products,
  };
}

export function buildEnforcementPatch(next: boolean): Snapshot {
  if (typeof next !== "boolean") throw new Error("subscriptionRequired must be true or false");
  return { [SUBSCRIPTION_REQUIRED_KEY]: next };
}

export function buildProductPatch(key: ProductKey, next: boolean): Snapshot {
  const def = PRODUCTS.find((p) => p.key === key);
  if (!def) throw new Error(`Unknown product: ${String(key)}`);
  if (typeof next !== "boolean") throw new Error("active must be true or false");
  return { [def.configKey]: next };
}

export function productConfirm(key: ProductKey, next: boolean): { title: string; body: string; confirmLabel: string } {
  const def = PRODUCTS.find((p) => p.key === key);
  const label = def ? def.label : String(key);
  return next
    ? {
        title: `Make ${label} available?`,
        body: `${label} can be bought from the upgrade screen. It is purchasable only while its plan in Plans is also Active (set the price there first). This does not change anyone's access or the master switch.`,
        confirmLabel: "Make available",
      }
    : {
        title: `Stop offering ${label}?`,
        body: `${label} is hidden from the upgrade screen. Users who already own it keep their access, and billing records are not changed.`,
        confirmLabel: "Stop offering",
      };
}

export const VERSION_CONFLICT_MESSAGE =
  "This setting changed since you loaded it. Nothing was applied. Reload to see the latest version and try again.";

/** Error thrown for a stale version, so normaliseError keeps this message. */
export function versionConflictError(): AdminApiError {
  return new AdminApiError("conflict", "aborted", VERSION_CONFLICT_MESSAGE);
}

/** True for the adminConfig stale-version rejection (code "aborted"). */
export function isVersionConflict(e: unknown): boolean {
  const code = String((e as { code?: unknown })?.code ?? "").replace(/^functions\//, "");
  const msg = String((e as { message?: unknown })?.message ?? "");
  return code === "aborted" || /changed since you loaded/i.test(msg);
}

// ── Plans ───────────────────────────────────────────────────────────────────

export const NEW_PLAN_IDS = ["app_premium", "floating_premium", "all_access"] as const;

export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  silver: "Silver",
  gold: "Gold",
  app_premium: "App Premium",
  floating_premium: "Floating System Premium",
  all_access: "All Access",
};

export function planLabel(id: string | null | undefined): string {
  if (!id) return "Free";
  return PLAN_LABELS[id] ?? id;
}

/** Entitlements a plan id grants (mirrors the contract's mapping table, 04 section 4.2). */
export const PLAN_ENTITLEMENTS: Record<string, readonly ("app_premium" | "floating_premium")[]> = {
  free: [],
  silver: ["app_premium"],
  gold: ["app_premium", "floating_premium"],
  app_premium: ["app_premium"],
  floating_premium: ["floating_premium"],
  all_access: ["app_premium", "floating_premium"],
};

export function entitlementSummary(planId: string): string {
  const e = PLAN_ENTITLEMENTS[planId];
  if (!e) return "Unknown plan (no access)";
  if (e.length === 0) return "No premium access";
  return e.map((x) => (x === "app_premium" ? "App Premium" : "Floating System Premium")).join(" + ");
}

export interface PlanOption {
  value: string;
  label: string;
}

/** Options for the "Change plan" grant dialog. Free = revoke, kept last. */
export const GRANT_PLAN_OPTIONS: readonly PlanOption[] = [
  { value: "silver", label: `Silver (${entitlementSummary("silver")})` },
  { value: "gold", label: `Gold (${entitlementSummary("gold")})` },
  { value: "app_premium", label: "App Premium (App only)" },
  { value: "floating_premium", label: "Floating System Premium (Floating only)" },
  { value: "all_access", label: "All Access (App + Floating)" },
  { value: "free", label: "Free (revoke paid plan)" },
];

export const PLAN_FILTER_OPTIONS: readonly PlanOption[] = GRANT_PLAN_OPTIONS.filter((o) => o.value !== "free").map((o) => ({
  value: o.value,
  label: PLAN_LABELS[o.value] ?? o.value,
}));
