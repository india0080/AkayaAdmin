"use client";

import { useCallable } from "@/lib/useCallable";
import { ErrorSummary, PageHeader, Panel, PendingState, Skeleton, Stat, StatStrip, formatNumber } from "@/ui";
import { IntegrationsTable, RecentCalls, useApiCallLog } from "./ApiCallLog";
import { topConsumer } from "./dashboardTypes";
import type { AiUsage, SystemStatus } from "./types";
import { SampleTag } from "./widgets";

/// Which external API is posting the most, so its usage can be controlled.
/// Provider reachability (adminInsights systemStatus) and AI request totals are real
/// today; the per-integration log is the pending apiCallLog contract.
export default function ApiIntegrationsPage() {
  const log = useApiCallLog();
  const usage = useCallable<AiUsage>("adminInsights", { action: "aiUsage", days: 1 });
  const status = useCallable<SystemStatus>("adminInsights", { action: "systemStatus" });
  const top = log.data ? topConsumer(log.data.integrations) : null;
  return (
    <div className="space-y-4">
      <PageHeader title="API Integrations & Call Log" description="Calls, errors, latency and quota per integration." actions={log.data ? <SampleTag /> : null} />
      <ErrorSummary onRetry={() => { usage.reload(); status.reload(); }} errors={[{ label: "AI usage", error: usage.error }, { label: "Provider status", error: status.error }]} />
      <StatStrip>
        <Stat label="AI gateway requests today" value={usage.data?.todayEvents == null ? "—" : formatNumber(usage.data.todayEvents)} />
        <Stat label="Providers reachable" value={status.data ? `${status.data.providers.filter((p) => p.status === "reachable").length}/${status.data.providers.length}` : "—"} />
        <Stat label="Top consumer · 24h" value={top?.name ?? "—"} hint={top ? `${formatNumber(top.calls24h)} calls` : undefined} />
      </StatStrip>
      <Panel title="Integrations" flush>
        {log.pending ? <PendingState title="Per-integration call log is not tracked yet" contract={log.contract} /> : !log.data ? <Skeleton className="m-4 h-48" /> : <IntegrationsTable data={log.data} />}
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Recent calls">
          {log.pending ? <PendingState title="No call log yet" contract={log.contract} /> : !log.data ? <Skeleton className="h-48" /> : <RecentCalls data={log.data} limit={20} />}
        </Panel>
        <Panel title="Provider reachability" description="adminInsights systemStatus · scheduled probes">
          {!status.data ? <Skeleton className="h-48" /> : (
            <ul className="divide-y divide-line text-sm">{status.data.providers.map((p) => (
              <li key={p.id} className="flex justify-between py-2"><span>{p.name}</span><span className={p.status === "reachable" ? "text-success" : "text-danger"}>{p.status}{p.latencyMs != null ? ` · ${p.latencyMs} ms` : ""}</span></li>
            ))}</ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
