"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Area, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import { usePendingCallable } from "@/lib/pending";
import { ErrorSummary, Notice, PageHeader, Panel, PendingState, Skeleton, formatNumber } from "@/ui";
import { formatMinor } from "../pricing/logic";
import type { BillingSummary } from "../revenue/types";
import { ProfitLossCard } from "../revenue/ProfitLossCard";
import { ApiCallLogPanel } from "./ApiCallLog";
import { PLATFORMS, shares, type CycleMix, type Downloads, type PlatformUsers } from "./dashboardTypes";
import type { AiUsage, CommandCenter } from "./types";
import type { TrafficData } from "./trafficTypes";
import { Delta, KpiCard, SampleTag, ShareBar } from "./widgets";
import { WorldMap } from "./WorldMap";

const n = (v: number | null | undefined) => (v == null ? "—" : formatNumber(v));
const tooltipStyle = { background: "rgb(var(--panel))", border: "1px solid rgb(var(--line))", borderRadius: 8 };

function greeting(h: number) {
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function OverviewPage() {
  const can = useCan();
  const canBilling = can("billing.read"), canTraffic = can("analytics.read"), canUsage = can("ai.usage.read");
  const cc = useCallable<CommandCenter>("adminInsights", { action: "commandCenter" });
  const billing = useCallable<BillingSummary>("adminBilling", canBilling ? { action: "summary" } : null);
  const traffic = useCallable<TrafficData>("adminTraffic", canTraffic ? { days: 30, country: "ALL" } : null);
  const usage = useCallable<AiUsage>("adminInsights", canUsage ? { action: "aiUsage", days: 1 } : null);
  const downloads = usePendingCallable<Downloads>("downloads");
  const platformUsers = usePendingCallable<PlatformUsers>("platformUsers");
  const daily = usePendingCallable<CycleMix>("billingCycleMix");

  const reloads = [cc.reload, billing.reload, traffic.reload, usage.reload];
  const retryAll = () => reloads.forEach((r) => r());
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState !== "hidden") reloads.forEach((r) => r()); }, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload callbacks are stable
  }, []);

  const d = cc.data, t = traffic.data, b = billing.data;
  const last = t?.series[t.series.length - 1], prev = t?.series[t.series.length - 8];
  const pct = (a?: number | null, z?: number | null) => (a != null && z ? ((a - z) / z) * 100 : null);
  const signupsToday = d?.users.newToday ?? null;
  const signupSpark = d?.signups.map((s) => s.count ?? 0);

  // Subscription mix: monthly + yearly are real (adminBilling paidCounts);
  // the daily pass comes from the pending cycleMix contract.
  const paid = b ? Object.values(b.estimated.paidCounts) : [];
  const monthly = paid.reduce((s, p) => s + p.monthly, 0), yearly = paid.reduce((s, p) => s + p.annual, 0);
  const dailyActive = daily.data?.cycles.find((c) => c.cycle === "daily")?.active ?? 0;
  const mix = shares([{ key: "Daily", value: dailyActive }, { key: "Monthly", value: monthly }, { key: "Yearly", value: yearly }]);
  const MIX_COLORS = ["#f472b6", "rgb(var(--accent))", "#4c2fd1"];

  const devices = shares((t?.devices ?? []).map((x) => ({ key: x.platform, value: x.sessions })));
  const platformColor = (p: string) => PLATFORMS.find((x) => x.id === p)?.color ?? "#64748b";

  return (
    <div className="space-y-4">
      <PageHeader title={`${greeting(new Date().getHours())} 👋`} description={`How Akaya is doing worldwide · updated ${new Date(d?.generatedAt ?? Date.now()).toLocaleString()}`} />
      <ErrorSummary onRetry={retryAll} errors={[
        { label: "Users & sign-ups", error: cc.error }, { label: "Billing", error: billing.error },
        { label: "Traffic", error: traffic.error }, { label: "AI usage", error: usage.error },
      ]} />
      {d?.attention.length ? <ul className="space-y-2" aria-label="Needs attention">{d.attention.slice(0, 3).map((a) => (
        <li key={a.id}><Notice tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warning" : "info"} title={a.title} action={<Link className="font-medium underline" href={a.href}>Open</Link>}>{a.detail}</Notice></li>
      ))}</ul> : null}

      <section aria-label="Downloads" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {downloads.pending ? <div className="ui-panel rounded-xl border border-line bg-panel sm:col-span-2 xl:col-span-4"><PendingState title="Downloads per platform are not tracked yet" contract={downloads.contract} /></div>
          : PLATFORMS.map((p) => {
            const row = downloads.data?.platforms.find((x) => x.platform === p.id);
            return <KpiCard key={p.id} label={`${p.label} downloads`} icon={p.icon} color={p.color} value={n(row?.downloads)} footer={<Delta pct={row?.delta7dPct} />} />;
          })}
      </section>

      <section aria-label="Key metrics" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard highlight label="Total users · all platforms" value={n(d?.users.total)}
          footer={platformUsers.data ? <ShareBar rows={shares(PLATFORMS.map((p) => ({ key: p.label, value: platformUsers.data!.byPlatform[p.id] }))).map((s, i) => ({ label: s.key, pct: s.pct, color: ["#34d399", "#93c5fd", "#e5e7eb", "#38bdf8"][i] }))} />
            : <span className="text-xs">{n(d?.users.guests)} guests included</span>} />
        <KpiCard label="Daily active users" value={canTraffic ? n(last?.dau) : "—"} footer={<Delta pct={pct(last?.dau, prev?.dau)} />} spark={t?.series.map((s) => s.dau ?? 0)} />
        <KpiCard label="Monthly active" value={canTraffic ? n(last?.mau) : "—"} footer={<Delta pct={pct(last?.mau, prev?.mau)} />} spark={t?.series.map((s) => s.mau ?? 0)} />
        <KpiCard label="Revenue · last 30d" value={b ? formatMinor(b.actual.last30CapturedPaise, "INR") : "—"}
          footer={<span className="text-xs text-fg-muted">{b ? `${n(b.actual.last30Payments)} captured payments` : canBilling ? "Loading…" : "Billing access required"}</span>}
          spark={b?.actual.daily.map((x) => x.captured)} />
        <KpiCard label="New sign-ups today" value={n(signupsToday)} footer={<span className="text-xs text-fg-muted">{n(d?.users.new7d)} in the last 7 days</span>} spark={signupSpark} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <ProfitLossCard />
        <Panel title="Subscription mix" description="Active paid subscriptions by billing cycle" actions={daily.data ? <SampleTag /> : null}>
          {!canBilling ? <p className="text-sm text-fg-muted">Billing access required.</p> : !b ? <Skeleton className="h-48 w-full" /> : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="relative h-40 w-40 shrink-0" aria-hidden>
                <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={mix} dataKey="value" nameKey="key" innerRadius="68%" outerRadius="95%" stroke="none" isAnimationActive={false}>{mix.map((m, i) => <Cell key={m.key} fill={MIX_COLORS[i]} />)}</Pie></PieChart></ResponsiveContainer>
                <span className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-xl">{n(monthly + yearly + dailyActive)}</strong><span className="text-2xs text-fg-muted">paid subs</span></span>
              </div>
              <ul className="w-full space-y-2 text-sm">
                {mix.map((m, i) => (
                  <li key={m.key} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: MIX_COLORS[i] }} />
                    <span className="flex-1">{m.key}</span>
                    <strong className="tabular-nums">{m.key === "Daily" && daily.pending ? "—" : `${m.pct}%`}</strong>
                    <span className="w-16 text-right text-xs tabular-nums text-fg-muted">{m.key === "Daily" && daily.pending ? "pending" : n(m.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[3fr_1fr]">
        <Panel title="Active users" description="DAU vs MAU · last 30 days (UTC)">
          {!canTraffic ? <p className="text-sm text-fg-muted">Analytics access required.</p> : !t ? <Skeleton className="h-64 w-full" /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={t.series}>
                  <CartesianGrid stroke="rgb(var(--chart-grid))" vertical={false} />
                  <XAxis dataKey="day" tickFormatter={(x: string) => x.slice(5)} minTickGap={24} tick={{ fontSize: 11, fill: "rgb(var(--fg-muted))" }} />
                  <YAxis yAxisId="dau" tick={{ fontSize: 11, fill: "rgb(var(--fg-muted))" }} width={48} />
                  <YAxis yAxisId="mau" orientation="right" hide />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area yAxisId="dau" dataKey="dau" name="DAU" stroke="rgb(var(--accent))" fill="rgb(var(--accent) / 0.18)" isAnimationActive={false} />
                  <Line yAxisId="mau" dataKey="mau" name="MAU" stroke="#f472b6" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title="Platform split" description="Sessions by platform · 30 days">
          {!t ? <Skeleton className="h-64 w-full" /> : !devices.length ? <p className="text-sm text-fg-muted">No sessions recorded yet.</p> : <>
            <div className="mx-auto h-40 w-40" aria-hidden><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={devices} dataKey="value" nameKey="key" innerRadius="65%" outerRadius="95%" stroke="none" isAnimationActive={false}>{devices.map((x) => <Cell key={x.key} fill={platformColor(x.key)} />)}</Pie></PieChart></ResponsiveContainer></div>
            <ul className="mt-3 space-y-1.5 text-sm">{devices.map((x) => <li key={x.key} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: platformColor(x.key) }} /><span className="flex-1 capitalize">{PLATFORMS.find((p) => p.id === x.key)?.label ?? x.key}</span><strong>{x.pct}%</strong></li>)}</ul>
          </>}
        </Panel>
      </div>

      <ApiCallLogPanel todayRequests={usage.data?.todayEvents} />

      <Panel title="Traffic by country" description="Active users · last 30 days · hover a country" actions={canTraffic ? <Link className="text-sm font-medium text-accent-text" href="/dashboard/traffic">Traffic details ↗</Link> : null}>
        {!canTraffic ? <p className="text-sm text-fg-muted">Analytics access required.</p> : !t ? <Skeleton className="h-72 w-full" /> : (
          <div className="grid gap-4 xl:grid-cols-[3fr_1fr]">
            <WorldMap data={t.geography} />
            <ol className="space-y-2 text-sm">
              {t.geography.slice(0, 8).map((g) => (
                <li key={g.country} className="flex justify-between gap-2"><span className="truncate">{t.countries.find((c) => c.code === g.country)?.name ?? g.country}</span><strong className="tabular-nums">{n(g.users)}</strong></li>
              ))}
              {!t.geography.length ? <li className="text-fg-muted">No tracked activity yet.</li> : null}
            </ol>
          </div>
        )}
      </Panel>
    </div>
  );
}
