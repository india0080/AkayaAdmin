"use client";

import { DEMO_MODE } from "@/lib/demo/flag";
import { usePendingCallable } from "@/lib/pending";
import { useCallable } from "@/lib/useCallable";
import { Badge, Panel, Skeleton, relativeTime } from "@/ui";
import SystemMonitor from "../insights/SystemMonitor";
import { p95, uptimePct, type ServiceMetrics } from "../insights/dashboardTypes";
import type { SystemStatus } from "../insights/types";
import { TrendChart } from "../insights/charts";
import { KpiRow, MiniTable, UptimeBars, statusTone } from "../insights/widgets";
import { DesignPage } from "./DesignPage";

interface Alerts { alerts: { id: string; severity: string; message: string }[]; checkedAt: number }

/// System Health: uptime / latency / error KPIs, latency chart, incidents,
/// services with uptime bars. Probes + alerts are real; error rate pending.
export default function HealthOverview() {
  const st = useCallable<SystemStatus>("adminInsights", { action: "systemStatus" });
  const mon = useCallable<Alerts>("adminSystemMonitor", { action: "snapshot" });
  const err = usePendingCallable<ServiceMetrics>("serviceMetrics");
  const providers = st.data?.providers ?? [];
  const all = providers.flatMap((p) => p.history);
  const up = uptimePct(all);
  const lat = p95(all.flatMap((h) => (h.latencyMs == null ? [] : [h.latencyMs])));
  const hours = [...new Set(all.map((h) => Math.floor(h.at / 3_600_000)))].sort().map((hr) => {
    const row: Record<string, number | string> = { day: new Date(hr * 3_600_000).toISOString().slice(0, 13).replace("T", " ") };
    for (const p of providers) { const h = p.history.find((x) => Math.floor(x.at / 3_600_000) === hr); if (h?.latencyMs != null) row[p.id] = h.latencyMs; }
    return row;
  });
  const incidents = mon.data?.alerts ?? [];
  return (
    <DesignPage title="System Health" description="Uptime, latency and incidents across providers and functions." sample={DEMO_MODE} manage={<SystemMonitor />} manageLabel="Live monitor & logs">
      <KpiRow items={[
        { label: "Provider uptime · 24h", value: up == null ? "—" : `${up.toFixed(2)}%`, tone: up == null ? undefined : up >= 99 ? "success" : up >= 95 ? "warning" : "danger" },
        { label: "Provider p95 latency", value: lat == null ? "—" : `${lat} ms`, tone: lat == null ? undefined : lat < 1000 ? "success" : lat < 2000 ? "warning" : "danger" },
        { label: "Firestore", value: st.data ? (st.data.firestore.ok ? `${st.data.firestore.latencyMs ?? "—"} ms` : "Down") : "—", tone: st.data ? (st.data.firestore.ok ? "success" : "danger") : undefined },
        { label: "Error rate", value: err.data ? `${err.data.errorRatePct.toFixed(2)}%` : "—", delta: err.data?.errorDelta, invert: true, hint: err.pending ? <span className="text-xs text-warning">Awaiting backend</span> : undefined },
        { label: "Open incidents", value: mon.data ? String(incidents.length) : "—", tone: incidents.length ? "warning" : "success" },
      ]} />
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Panel title="Latency by provider" description="Scheduled probes · ms">
          {!st.data ? <Skeleton className="h-56" /> : <TrendChart data={hours} x="day" series={providers.filter((p) => p.hasKey).map((p) => ({ key: p.id, name: p.name, kind: "line" as const }))} />}
        </Panel>
        <Panel title="Incidents" description="Active alerts from the system monitor">
          {!mon.data ? <Skeleton className="h-40" /> : !incidents.length ? <p className="text-sm text-success">All clear — no active incidents.</p> : (
            <ul className="space-y-2 text-sm">{incidents.map((a) => <li key={a.id} className="flex items-start gap-2"><Badge tone={a.severity === "critical" ? "danger" : "warning"}>{a.severity}</Badge><span>{a.message}</span></li>)}</ul>
          )}
        </Panel>
      </div>
      <Panel title="Services" flush>
        {!st.data ? <Skeleton className="m-4 h-40" /> : <MiniTable minWidth={640} head={["Service", "Status", "Uptime", "Latency", "Last 24 probes"]} rows={[
          ["Firestore", <Badge key="s" tone={st.data.firestore.ok ? "success" : "danger"}>{st.data.firestore.ok ? "Operational" : "Down"}</Badge>, "—", st.data.firestore.latencyMs != null ? `${st.data.firestore.latencyMs} ms` : "—", "—"],
          ...providers.map((p) => {
            const u = uptimePct(p.history);
            return [p.name, <Badge key="s" tone={p.status === "inactive" ? "neutral" : statusTone(p.status === "reachable" ? "ok" : p.status)}>{p.status === "reachable" ? "Operational" : p.status}</Badge>,
              <span key="u" className={u == null ? "text-fg-subtle" : u >= 99 ? "text-success" : u >= 95 ? "text-warning" : "text-danger"}>{u == null ? "—" : `${u.toFixed(2)}%`}</span>,
              p.latencyMs != null ? `${p.latencyMs} ms` : "—", <UptimeBars key="b" history={p.history} />];
          }),
          ...(st.data.jobs ?? []).map((j) => [`Job · ${j.id}`, <Badge key="s" tone={j.lastError ? "danger" : "success"}>{j.lastError ? "Failing" : "Healthy"}</Badge>, "—", j.lastRunAt ? relativeTime(j.lastRunAt) : "—", j.lastError ?? ""]),
        ]} />}
      </Panel>
    </DesignPage>
  );
}
