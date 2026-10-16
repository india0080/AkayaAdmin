"use client";

import clsx from "clsx";
import { usePendingCallable } from "@/lib/pending";
import { Badge, Panel, PendingState, Skeleton, formatNumber, relativeTime } from "@/ui";
import { topConsumer, type ApiCallLog as Log } from "./dashboardTypes";
import { SampleTag, Sparkline } from "./widgets";

export function useApiCallLog() {
  return usePendingCallable<Log>("apiCallLog");
}

export function IntegrationsTable({ data }: { data: Log }) {
  const top = topConsumer(data.integrations);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs text-fg-muted"><tr>{["Integration", "Calls (24h)", "Trend", "Errors", "p95", "Quota"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {[...data.integrations].sort((a, b) => b.calls24h - a.calls24h).map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 font-medium">{r.name} {r.id === top?.id ? <Badge tone="accent">Top consumer</Badge> : null}</td>
              <td className="px-3 py-2 tabular-nums">{formatNumber(r.calls24h)}</td>
              <td className="px-3 py-2"><Sparkline values={r.trend} className="h-6 w-20" /></td>
              <td className={clsx("px-3 py-2 tabular-nums", r.errorRate >= 1 ? "text-danger" : "text-fg-muted")}>{r.errorRate.toFixed(1)}%</td>
              <td className="px-3 py-2 tabular-nums text-fg-muted">{r.p95Ms == null ? "—" : `${formatNumber(r.p95Ms)} ms`}</td>
              <td className="px-3 py-2">{r.quotaPct == null ? <span className="text-fg-subtle">—</span> : <span className={clsx("tabular-nums", r.quotaPct >= 70 ? "text-warning" : "text-fg-muted")}>{r.quotaPct}%</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RecentCalls({ data, limit = 8 }: { data: Log; limit?: number }) {
  return (
    <ul className="divide-y divide-line text-sm">
      {data.recent.slice(0, limit).map((c) => (
        <li key={`${c.at}-${c.endpoint}`} className="flex items-center gap-3 py-2">
          <span className={clsx("w-10 shrink-0 rounded px-1 text-center font-mono text-xs", c.status >= 400 ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>{c.status}</span>
          <span className="min-w-0 flex-1 truncate"><span className="font-medium">{c.integration}</span> <span className="font-mono text-xs text-fg-muted">{c.endpoint}</span></span>
          <span className="shrink-0 text-xs tabular-nums text-fg-subtle">{formatNumber(c.latencyMs)} ms · {relativeTime(c.at)}</span>
        </li>
      ))}
    </ul>
  );
}

/// Dashboard panel: which API is posting the most, plus the live log.
export function ApiCallLogPanel({ todayRequests }: { todayRequests?: number | null }) {
  const q = useApiCallLog();
  return (
    <Panel title="API integrations & call log" description={todayRequests != null ? `${formatNumber(todayRequests)} AI gateway requests recorded today` : "Calls per integration · last 24h"} actions={q.data ? <SampleTag /> : null}>
      {q.pending ? <PendingState title="Per-integration call log is not tracked yet" contract={q.contract} /> : !q.data ? <Skeleton className="h-48 w-full" /> : (
        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]"><IntegrationsTable data={q.data} /><RecentCalls data={q.data} /></div>
      )}
    </Panel>
  );
}
