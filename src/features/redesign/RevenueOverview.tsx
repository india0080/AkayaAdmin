"use client";

import { useState } from "react";
import { DEMO_MODE } from "@/lib/demo/flag";
import { useCallable } from "@/lib/useCallable";
import { Badge, Panel, Skeleton, formatNumber, relativeTime } from "@/ui";
import { formatMinor } from "../pricing/logic";
import RevenueAnalyticsPage from "../revenue/RevenueAnalyticsPage";
import type { RevenueData } from "../revenue/revenueTypes";
import { shares } from "../insights/dashboardTypes";
import { Donut, TrendChart } from "../insights/charts";
import { compactMoney, KpiRow, MiniTable, PeriodButtons, statusTone } from "../insights/widgets";
import { DesignPage } from "./DesignPage";

interface CountryRows { countries: { country: string; revenue: number; subscribers: number; payments: number }[]; exponent: number }

export default function RevenueOverview() {
  const [days, setDays] = useState(30);
  const q = useCallable<RevenueData>("adminRevenue", { action: "summary", days, currency: "INR", page: 1, status: "all" });
  const geo = useCallable<CountryRows>("adminSubscriptionAnalytics", { action: "summary", channel: "all", country: "ALL", currency: "INR" });
  const d = q.data;
  const fm = (v: number | null | undefined) => compactMoney(v);
  const plans = d ? shares(Object.entries(d.current.plans).flatMap(([id, p]) => [{ key: `${id} · monthly`, value: p.monthly }, { key: `${id} · yearly`, value: p.annual }])) : [];
  return (
    <DesignPage title="Revenue" description="Verified payments and subscription contracts." sample={DEMO_MODE}
      actions={<PeriodButtons value={days} onChange={setDays} />} manage={<RevenueAnalyticsPage />} manageLabel="Detailed analytics">
      <KpiRow items={[
        { label: `Revenue · ${days}d`, value: fm(d?.captured), delta: d?.capturedGrowth ?? null, spark: d?.series.map((s) => s.captured) },
        { label: "MRR", value: fm(d?.current.mrr), delta: d?.mrrGrowth ?? null, spark: d?.series.map((s) => s.mrr ?? 0) },
        { label: "ARR run-rate", value: fm(d?.current.runRate), tone: "accent" },
        { label: "ARPPU", value: fm(d?.arppu), tone: "accent" },
        { label: `Refunds · ${days}d`, value: fm(d?.refunded), tone: d && d.refunded > 0 ? "warning" : "success", hint: d?.refundRate == null ? undefined : <span className="text-xs text-warning">{d.refundRate.toFixed(1)}% refund rate</span> },
      ]} />
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Panel title="Revenue trend" description="Captured per UTC day · MRR on the right axis">
          {!d ? <Skeleton className="h-60" /> : <TrendChart data={d.series} x="day" format={(v) => formatMinor(v, "INR")} series={[
            { key: "captured", name: "Captured", color: "rgb(var(--success))" }, { key: "refunded", name: "Refunded", kind: "bar", color: "rgb(var(--warning))" },
            { key: "mrr", name: "MRR", kind: "line", dashed: true, axis: "right", color: "rgb(var(--accent))" }]} />}
        </Panel>
        <Panel title="Revenue by plan" description="Active contracts by billing cycle">
          {!d ? <Skeleton className="h-40" /> : <Donut rows={plans} center={formatNumber(d.current.active)} sub="active" />}
        </Panel>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Revenue by country" flush>
          {!geo.data ? <Skeleton className="m-4 h-40" /> : <MiniTable head={["Country", "Revenue", "Paid users", "Payments"]} rows={geo.data.countries.slice(0, 8).map((c) => [c.country, <span key="r" className="font-semibold text-success">{formatMinor(c.revenue, "INR")}</span>, formatNumber(c.subscribers), formatNumber(c.payments)])} />}
        </Panel>
        <Panel title="Recent transactions" flush>
          {!d ? <Skeleton className="m-4 h-40" /> : <MiniTable head={["Payment", "Plan", "Amount", "Status", "When"]} rows={d.transactions.rows.slice(0, 8).map((t) => [
            <span key="i" className="font-mono text-xs">{t.id}</span>, t.plan ?? "—", t.amount == null ? "—" : formatMinor(t.amount, t.currency),
            <Badge key="s" tone={statusTone(t.status)}>{t.status}</Badge>, relativeTime(t.at)])} />}
        </Panel>
      </div>
    </DesignPage>
  );
}
