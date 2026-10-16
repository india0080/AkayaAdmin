// AI Platform — pure helpers (unit-tested).

export interface CatalogModel {
  modelId: string;
  name: string;
  /// Gateway view: absent field = enabled.
  enabled: boolean;
  /// App picker view: only enabled == true is listed.
  appListed: boolean;
  tierRequired: "silver" | "gold" | null;
  available: boolean;
  availabilityReason: string | null;
  contextLength: number | null;
  usdPerMIn: number | null;
  usdPerMOut: number | null;
  free: boolean;
  vision: boolean;
  tools: boolean;
  reasoning: boolean;
  audioIn: boolean;
  textOut: boolean;
  health: { circuit: string; consecutiveFailures: number } | null;
}

export interface CatalogResponse {
  truncated: boolean;
  models: CatalogModel[];
}

export type CatalogStatus = "disabled" | "unavailable" | "not-listed" | "circuit-open" | "live";

/// One word for the row, in priority order: the admin's switch, then
/// upstream availability, then app visibility, then health.
export function catalogStatus(m: CatalogModel): CatalogStatus {
  if (!m.enabled) return "disabled";
  if (!m.available) return "unavailable";
  if (!m.appListed) return "not-listed";
  if (m.health?.circuit === "open") return "circuit-open";
  return "live";
}

export const STATUS_LABEL: Record<CatalogStatus, string> = {
  disabled: "Disabled",
  unavailable: "Unavailable upstream",
  "not-listed": "Served, not in app picker",
  "circuit-open": "Circuit open",
  live: "Live",
};

export interface CatalogFilter {
  q: string;
  status: CatalogStatus | "all";
  capability: "all" | "vision" | "tools" | "reasoning" | "audioIn" | "free";
  tier: "all" | "none" | "silver" | "gold";
}

export const EMPTY_FILTER: CatalogFilter = { q: "", status: "all", capability: "all", tier: "all" };

export function filterCatalog(models: readonly CatalogModel[], f: CatalogFilter): CatalogModel[] {
  const q = f.q.trim().toLowerCase();
  return models.filter((m) => {
    if (q && !m.modelId.toLowerCase().includes(q) && !m.name.toLowerCase().includes(q)) return false;
    if (f.status !== "all" && catalogStatus(m) !== f.status) return false;
    if (f.capability !== "all" && !m[f.capability]) return false;
    if (f.tier === "none" && m.tierRequired !== null) return false;
    if ((f.tier === "silver" || f.tier === "gold") && m.tierRequired !== f.tier) return false;
    return true;
  });
}

/// "$0.15 / $0.60" per million tokens; "Free"; "—" when unknown.
export function priceLabel(m: Pick<CatalogModel, "usdPerMIn" | "usdPerMOut" | "free">): string {
  if (m.free) return "Free";
  if (m.usdPerMIn === null || m.usdPerMOut === null) return "—";
  const f = (n: number) => (n < 0.01 ? n.toPrecision(2) : n.toFixed(2));
  return `$${f(m.usdPerMIn)} / $${f(m.usdPerMOut)}`;
}

export function contextLabel(n: number | null): string {
  if (!n) return "—";
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M` : `${Math.round(n / 1000)}K`;
}

/// Health row verdict from persisted circuit + failure streak.
export function healthVerdict(h: { circuit: string; consecutiveFailures: number }): "ok" | "degraded" | "down" {
  if (h.circuit === "open") return "down";
  if (h.circuit === "half-open" || h.consecutiveFailures > 0) return "degraded";
  return "ok";
}

export function successRate(successes: number, failures: number): number | null {
  const n = successes + failures;
  return n === 0 ? null : successes / n;
}
