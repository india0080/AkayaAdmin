// Country pricing: in-page change history (adminConfig history for the targets
// planPrices and pricingPolicy) and the rollback request. Pure. Rollback uses
// the SAME machinery as Config History (action "rollback" with expectedVersion).
export type HistoryTarget = "planPrices" | "pricingPolicy";

export interface HistoryEntry {
  id: string;
  target: HistoryTarget;
  version: number;
  kind: "apply" | "rollback";
  rolledBackFrom: number | null;
  reason: string;
  actorEmail: string;
  at: number | null;
  /// "n changes" summary + first lines
  changeCount: number;
  lines: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseHistory(raw: unknown): HistoryEntry[] {
  const rows = isObj(raw) && Array.isArray(raw.rows) ? raw.rows : [];
  const out: HistoryEntry[] = [];
  for (const r of rows) {
    if (!isObj(r)) continue;
    const target = r.target;
    if (target !== "planPrices" && target !== "pricingPolicy") continue;
    if (typeof r.version !== "number") continue;
    const changes = Array.isArray(r.changes) ? r.changes.filter(isObj) : [];
    out.push({
      id: typeof r.id === "string" ? r.id : `${target}_${r.version}`,
      target,
      version: r.version,
      kind: r.kind === "rollback" ? "rollback" : "apply",
      rolledBackFrom: typeof r.rolledBackFrom === "number" ? r.rolledBackFrom : null,
      reason: typeof r.reason === "string" ? r.reason : "",
      actorEmail: typeof r.actorEmail === "string" ? r.actorEmail : "",
      at: typeof r.at === "number" ? r.at : null,
      changeCount: changes.length,
      lines: changes.slice(0, 4).map((c) => `${String(c.field ?? "")}: ${String(c.from ?? "")} -> ${String(c.to ?? "")}`),
    });
  }
  return out;
}

/// The newest version of a target in a history list (a rollback can only
/// restore a version that exists).
export function latestVersion(entries: readonly HistoryEntry[], target: HistoryTarget): number | null {
  const v = entries.filter((e) => e.target === target).map((e) => e.version);
  return v.length ? Math.max(...v) : null;
}

export function rollbackRequest(entry: HistoryEntry, currentVersion: number, reason: string): Record<string, unknown> {
  return { action: "rollback", target: entry.target, version: entry.version, side: "before", expectedVersion: currentVersion, reason: reason.trim() };
}

/// Plain-language description of what an undo restores.
export function rollbackImpact(entry: HistoryEntry): string {
  return entry.target === "planPrices"
    ? `Restores the price rows as they were before version ${entry.version} (only the rows that version changed). Applies to NEW orders only.`
    : `Restores the pricing policy keys as they were before version ${entry.version} (only the keys that version changed).`;
}
