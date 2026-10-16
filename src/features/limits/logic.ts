// Effective daily message limits — the SAME rules the chat gateways apply
// (akaya_ai/functions/src/shared.ts getRateLimits + checkAndIncrementUsage).
// The console must show what users actually get, not what a form defaults to.
//
//   1. config/app.rateLimits (map) wins when present — used AS-IS.
//   2. else the legacy flat fields free/silver/goldMessageLimit, merged over
//      the server defaults.
//   3. else the server defaults {free: 50, silver: 500, gold: -1}.
//   A plan missing from the chosen map falls back to that map's `free`, then
//   to 50. -1 means unlimited.

export const SERVER_DEFAULT_LIMITS = { free: 50, silver: 500, gold: -1 } as const;
export type PlanId = "free" | "silver" | "gold";
export const PLANS: PlanId[] = ["free", "silver", "gold"];

export type LimitSource = "rateLimits" | "legacy-fields" | "server-default";

export interface EffectiveLimits {
  limits: Record<PlanId, number>;
  source: LimitSource;
}

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function effectiveRateLimits(appConfig: Record<string, unknown> | null | undefined): EffectiveLimits {
  const raw = appConfig?.rateLimits;
  let map: Record<string, number>;
  let source: LimitSource;
  if (raw && typeof raw === "object") {
    map = raw as Record<string, number>;
    source = "rateLimits";
  } else {
    const flat: Record<string, number> = {};
    const f = num(appConfig?.freeMessageLimit);
    const s = num(appConfig?.silverMessageLimit);
    const g = num(appConfig?.goldMessageLimit);
    if (f !== undefined) flat.free = f;
    if (s !== undefined) flat.silver = s;
    if (g !== undefined) flat.gold = g;
    if (Object.keys(flat).length > 0) {
      map = { ...SERVER_DEFAULT_LIMITS, ...flat };
      source = "legacy-fields";
    } else {
      map = { ...SERVER_DEFAULT_LIMITS };
      source = "server-default";
    }
  }
  const pick = (p: PlanId) => num(map[p]) ?? num(map.free) ?? SERVER_DEFAULT_LIMITS.free;
  return { limits: { free: pick("free"), silver: pick("silver"), gold: pick("gold") }, source };
}

export function describeLimit(n: number): string {
  if (n === -1) return "Unlimited";
  if (n === 0) return "Blocked (0)";
  return `${n.toLocaleString("en-IN")} / day`;
}

/// Settings whose flip affects every user immediately and so deserve a
/// confirmation on save (App Config). Pure, compared against what was loaded.
export interface RiskySwitchInput {
  maintenanceMode: boolean;
  onlineAiEnabled: boolean;
  offlineAiEnabled: boolean;
}

export function riskyChanges(before: RiskySwitchInput, after: RiskySwitchInput): string[] {
  const out: string[] = [];
  if (!before.maintenanceMode && after.maintenanceMode) out.push("Maintenance mode ON — every user sees the maintenance screen");
  if (before.onlineAiEnabled && !after.onlineAiEnabled) out.push("Online AI OFF — cloud chat stops for every user");
  if (before.offlineAiEnabled && !after.offlineAiEnabled) out.push("Offline AI OFF — on-device models stop for every user");
  return out;
}
