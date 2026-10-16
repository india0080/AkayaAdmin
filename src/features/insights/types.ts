// Payload types for adminInsights (functions/src/admin_insights.ts).

export interface AttentionItem {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  href: string;
}

export interface CommandCenter {
  generatedAt: number;
  users: { total: number | null; guests: number | null; newToday: number | null; new7d: number | null };
  signups: { day: string; count: number | null }[];
  attention: AttentionItem[];
  business:
    | null
    | { error: true }
    | {
        estimatedMrrPaise: number;
        counts: { activeTotal: number; activeSilver: number; activeGold: number; adminGranted: number; expiring7d: number; needsReview: number | null };
        last30CapturedPaise: number;
        hasLedger: boolean;
      };
  aiHealth: { modelId: string; circuit: string; successes: number; failures: number; consecutiveFailures: number }[] | null;
  telemetryOn: boolean | null;
}

export interface ModelRollup {
  requests: number;
  served: number;
  failed: number;
  outChars: number;
  estOutTokens: number;
  estCostUsd: number | null;
  ttftP50Ms: number | null;
  ttftP95Ms: number | null;
}

export interface DayRollup {
  day: string;
  requests: number;
  served: number;
  failed: number;
  uniqueUsers: number;
  estOutTokens: number;
  estCostUsd: number;
  unpricedRequests: number;
  byModel: Record<string, ModelRollup>;
  byPlan: Record<string, number>;
  byOutcome: Record<string, number>;
  truncated?: boolean;
  generatedAt: number | null;
}

export interface AiUsage {
  telemetryOn: boolean | null;
  todayEvents: number | null;
  days: DayRollup[];
}

export interface SystemStatus {
  checkedAt: number;
  firestore: { ok: boolean; latencyMs: number | null };
  secrets: { id: string; source: "env" | "firestore" | "none" | null }[];
  appCheckEnforced: boolean | null;
  providers: {
    id: string;
    name: string;
    category: string;
    hasKey: boolean;
    status: "reachable" | "server_error" | "unreachable" | "inactive" | "blocked";
    httpStatus: number | null;
    latencyMs: number | null;
    history: { at: number; status: string; httpStatus: number | null; latencyMs: number | null }[];
  }[];
  jobs: { id: string; lastRunAt: number | null; lastResult: string | null; lastError: string | null }[] | null;
  lastWebhookAt?: number | null;
}

/// Sums per-model rollups across days (pure; unit-tested).
export function modelTotals(days: DayRollup[]): { model: string; requests: number; served: number; estOutTokens: number; estCostUsd: number | null }[] {
  const m = new Map<string, { requests: number; served: number; estOutTokens: number; estCostUsd: number | null }>();
  for (const d of days) {
    for (const [model, r] of Object.entries(d.byModel ?? {})) {
      const cur = m.get(model) ?? { requests: 0, served: 0, estOutTokens: 0, estCostUsd: 0 };
      cur.requests += r.requests;
      cur.served += r.served;
      cur.estOutTokens += r.estOutTokens;
      // A model that was ever unpriced has no trustworthy total: show "—".
      cur.estCostUsd = r.estCostUsd === null || cur.estCostUsd === null ? null : cur.estCostUsd + r.estCostUsd;
      m.set(model, cur);
    }
  }
  return [...m.entries()].map(([model, v]) => ({ model, ...v })).sort((a, b) => b.requests - a.requests);
}

/// "46/48 reachable" over the scheduled probe history; null when none.
export function uptimeLabel(history: { status: string }[]): string | null {
  if (!history.length) return null;
  const ok = history.filter((h) => h.status === "reachable").length;
  return `${ok}/${history.length} reachable`;
}

export function usd(n: number | null): string {
  if (n === null) return "—";
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}
