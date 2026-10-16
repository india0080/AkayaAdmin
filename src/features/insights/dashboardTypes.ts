// Payload shapes for the dashboard contracts listed in lib/pending.ts, plus
// the pure maths the pages use (unit-tested in __tests__/dashboard.test.ts).

export type Platform = "android" | "ios" | "macos" | "windows";
export const PLATFORMS: { id: Platform; label: string; icon: string; color: string }[] = [
  { id: "android", label: "Android", icon: "download", color: "#14a36b" },
  { id: "ios", label: "iOS", icon: "download", color: "rgb(var(--chart-1))" },
  { id: "macos", label: "macOS", icon: "monitor", color: "#06b6d4" },
  { id: "windows", label: "Windows", icon: "monitor", color: "#e8930c" },
];

export interface Downloads { platforms: { platform: Platform; downloads: number; delta7dPct: number | null }[] }
export interface PlatformUsers { total: number; byPlatform: Record<Platform, number> }
export type Cycle = "daily" | "monthly" | "yearly";
export interface CycleMix { cycles: { cycle: Cycle; active: number; deltaPct: number | null }[] }

export interface PnlWeek { week: string; revenue: number; aiCost: number; serverCost: number; gatewayFees: number }
export interface ProfitLoss { currency: string; weeks: PnlWeek[] }

export interface ApiIntegration { id: string; name: string; calls24h: number; errorRate: number; p95Ms: number | null; quotaPct: number | null; trend: number[] }
export interface ApiCall { at: number; integration: string; endpoint: string; status: number; latencyMs: number }
export interface ApiCallLog { integrations: ApiIntegration[]; recent: ApiCall[] }

/// Percent shares that always sum to 100 (largest-remainder rounding).
export function shares<T extends string>(rows: { key: T; value: number }[]): { key: T; value: number; pct: number }[] {
  const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0);
  if (!total) return rows.map((r) => ({ ...r, pct: 0 }));
  const raw = rows.map((r) => (Math.max(0, r.value) / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((s, x) => s + x, 0);
  const order = raw.map((x, i) => [x - floors[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) { if (left-- <= 0) break; floors[i]++; }
  return rows.map((r, i) => ({ ...r, pct: floors[i] }));
}

export interface PnlTotals { revenue: number; costs: number; net: number; marginPct: number | null }
export function pnlTotals(weeks: PnlWeek[]): PnlTotals {
  const revenue = weeks.reduce((s, w) => s + w.revenue, 0);
  const costs = weeks.reduce((s, w) => s + w.aiCost + w.serverCost + w.gatewayFees, 0);
  const net = revenue - costs;
  return { revenue, costs, net, marginPct: revenue ? (net / revenue) * 100 : null };
}
export const weekNet = (w: PnlWeek) => w.revenue - w.aiCost - w.serverCost - w.gatewayFees;

/// The integration consuming the most calls (the dashboard's "Top consumer").
export function topConsumer(rows: ApiIntegration[]): ApiIntegration | null {
  return rows.reduce<ApiIntegration | null>((best, r) => (!best || r.calls24h > best.calls24h ? r : best), null);
}

// ── Pending contracts used by the redesigned pages ─────────────────────────
export interface NotificationEngagement { openRate: number; ctr: number; optOutRate: number; deltas: { openRate: number; ctr: number; optOutRate: number } }
export interface SubscriptionFlows { new7d: number; trials: number; newDelta: number; trialDelta: number; daily: number[] }
export interface PlanEntitlements { plans: string[]; features: { feature: string; values: string[] }[] }
export interface GatewayMetrics {
  successRate: number; failed7d: number; successDelta: number; failedDelta: number;
  gateways: { id: string; successRate: number; feePct: number }[];
  daily: { day: string; razorpay: number; stripe: number; play: number }[];
}
export interface ServiceMetrics { errorRatePct: number; errorDelta: number }
export interface Engagement { wau: number; wauDelta: number; features: { label: string; value: number }[] }

/// Uptime % over probe history (reachable / all non-inactive probes).
export function uptimePct(history: { status: string }[]): number | null {
  const live = history.filter((h) => h.status !== "inactive");
  return live.length ? (live.filter((h) => h.status === "reachable").length / live.length) * 100 : null;
}

/// p95 of a numeric list (nearest-rank); null when empty.
export function p95(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}
