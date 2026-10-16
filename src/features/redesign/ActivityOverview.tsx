"use client";

import { useState } from "react";
import { DEMO_MODE } from "@/lib/demo/flag";
import { usePendingCallable } from "@/lib/pending";
import { useCallable } from "@/lib/useCallable";
import { Panel, PendingState, Skeleton, formatNumber } from "@/ui";
import ActivityPage from "../insights/ActivityPage";
import { PLATFORMS, type Engagement } from "../insights/dashboardTypes";
import type { TrafficData } from "../insights/trafficTypes";
import { Bars, TrendChart } from "../insights/charts";
import { Heatmap, KpiRow, PeriodButtons, pctChange, statusTone } from "../insights/widgets";
import { DesignPage } from "./DesignPage";

interface Feed { events: { id: string; uid: string; kind: string; at: number; country: string; platform: string }[] }

export default function ActivityOverview() {
  const [days, setDays] = useState(30);
  const t = useCallable<TrafficData>("adminTraffic", { days, country: "ALL" });
  const feed = useCallable<Feed>("adminActivityMonitor", { mode: "live", page: 1 });
  const eng = usePendingCallable<Engagement>("engagement");
  const d = t.data, s = d?.series ?? [];
  const last = s[s.length - 1], prev = s[s.length - 8];
  const ratio = last?.dau != null && last.mau ? (last.dau / last.mau) * 100 : null;
  return (
    <DesignPage title="Activity" description="Who is active, on which platform, using what — and when." sample={DEMO_MODE}
      actions={<PeriodButtons value={days} onChange={setDays} />} manage={<ActivityPage />} manageLabel="Live monitor, history & inactive users">
      <KpiRow items={[
        { label: "DAU", value: formatNumber(last?.dau), delta: pctChange(last?.dau, prev?.dau), spark: s.map((x) => x.dau ?? 0) },
        { label: "WAU", value: eng.data ? formatNumber(eng.data.wau) : "—", delta: eng.data?.wauDelta, hint: eng.pending ? <span className="text-xs text-warning">Awaiting backend</span> : undefined },
        { label: "MAU", value: formatNumber(last?.mau), delta: pctChange(last?.mau, prev?.mau), spark: s.map((x) => x.mau ?? 0) },
        { label: "DAU / MAU", value: ratio == null ? "—" : `${ratio.toFixed(1)}%`, tone: ratio == null ? undefined : ratio >= 20 ? "success" : "warning" },
        { label: "Avg. session", value: d?.summary.averageSessionMs != null ? `${(d.summary.averageSessionMs / 60000).toFixed(1)} min` : "—", tone: "accent" },
      ]} />
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Panel title="Daily active users" description="DAU vs MAU (UTC)">
          {!d ? <Skeleton className="h-60" /> : <TrendChart data={s} x="day" series={[{ key: "dau", name: "DAU" }, { key: "mau", name: "MAU", kind: "line", dashed: true, axis: "right", color: "#f472b6" }]} />}
        </Panel>
        <Panel title="Feature usage" description="Users per feature today">
          {eng.pending ? <PendingState title="Feature events not aggregated yet" contract={eng.contract} /> : !eng.data ? <Skeleton className="h-52" /> : <Bars data={eng.data.features} format={(v) => formatNumber(v)} />}
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr_1.2fr]">
        <Panel title="Hourly activity heatmap" description="Sessions by UTC hour × weekday">
          {!d ? <Skeleton className="h-40" /> : <Heatmap grid={d.heatmap} label="Sessions by hour and weekday" />}
        </Panel>
        <Panel title="Sessions by platform">
          {!d ? <Skeleton className="h-60" /> : <Bars data={d.devices.map((x) => ({ label: PLATFORMS.find((p) => p.id === x.platform)?.label ?? x.platform, value: x.sessions }))} format={(v) => formatNumber(v)} />}
        </Panel>
        <Panel title="Live activity feed" description="Last events · refresh in Manage">
          {!feed.data ? <Skeleton className="h-52" /> : !feed.data.events.length ? <p className="text-sm text-fg-muted">No recent events.</p> : (
            <ul className="space-y-1.5 font-mono text-xs">{feed.data.events.slice(0, 10).map((e) => {
              const tone = e.kind === "purchase" || e.kind === "subscription" ? "success" : statusTone(e.kind);
              return <li key={e.id} className="flex gap-2"><span className="shrink-0 whitespace-nowrap text-fg-subtle">{new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}</span><span className={tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-warning"}>{e.kind}</span><span className="truncate">{e.uid} · {e.platform} · {e.country}</span></li>;
            })}</ul>
          )}
        </Panel>
      </div>
    </DesignPage>
  );
}
