"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import { Badge, Button, ErrorState, Icon, Notice, PageHeader, Panel, Skeleton, StatusPill, formatNumber, relativeTime } from "@/ui";
import { describeAction, resultLabel, resultTone, type AuditEntry } from "../audit/logic";
import { formatMinor } from "../pricing/logic";
import type { BillingSummary } from "../revenue/types";
import { DailyBars } from "./DailyBars";
import type { AiUsage, CommandCenter } from "./types";
import { retainedTotal, type TrafficData } from "./trafficTypes";
import styles from "./OverviewPage.module.css";

const COLORS = ["rgb(var(--accent))", "#a855f7", "#06b6d4", "#10b981", "#f59e0b", "#64748b"];
interface Funnel { steps: { label: string; count: number; rate: number | null }[]; conversion: number | null; incomplete: boolean; note: string }
const n = (value: number | null | undefined) => value == null ? "—" : formatNumber(value);

function Metric({ label, value, hint, icon, color }: { label: string; value: ReactNode; hint: ReactNode; icon: string; color: string }) {
  return <article className={styles.metric} style={{ "--metric-color": color } as CSSProperties}>
    <span className={styles.chip} aria-hidden><Icon name={icon} size={21} /></span>
    <p className={styles.label}>{label}</p><p className={styles.value}>{value}</p><p className={styles.hint}>{hint}</p>
  </article>;
}

function Untracked({ children, icon = "chart" }: { children: ReactNode; icon?: string }) {
  return <div className={styles.empty}><span className={styles.emptyIcon} aria-hidden><Icon name={icon} size={25} /></span>
    <p className="font-medium text-fg">Not tracked yet</p><p className="max-w-sm text-sm text-fg-muted">{children}</p></div>;
}

export default function OverviewPage() {
  const can = useCan();
  const canBilling = can("billing.read");
  const canAudit = can("audit.read");
  const canUsage = can("ai.usage.read");
  const q = useCallable<CommandCenter>("adminInsights", { action: "commandCenter" });
  const billing = useCallable<BillingSummary>("adminBilling", canBilling ? { action: "summary" } : null);
  const funnel = useCallable<Funnel>("adminInsights", canBilling ? { action: "funnel" } : null);
  const audit = useCallable<{ entries: AuditEntry[] }>("adminAuditLog", canAudit ? { limit: 8 } : null);
  const usage = useCallable<AiUsage>("adminInsights", canUsage ? { action: "aiUsage", days: 1 } : null);
  const canTraffic = can("analytics.read");
  const traffic = useCallable<TrafficData>("adminTraffic", canTraffic ? { days: 90, country: "ALL" } : null);
  const t = canTraffic ? traffic.data : null;
  const reloadTraffic = traffic.reload;
  const [currency, setCurrency] = useState("INR");
  const d = q.data;
  const b = canBilling ? billing.data : null;
  const { reload } = q;
  const reloadBilling = billing.reload;
  const reloadFunnel = funnel.reload;
  const reloadAudit = audit.reload;
  const reloadUsage = usage.reload;
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      reload();
      if (canBilling) reloadBilling();
      if (canBilling) reloadFunnel();
      if (canAudit) reloadAudit();
      if (canUsage) reloadUsage();
      if (canTraffic) reloadTraffic();
    }, 60_000);
    return () => clearInterval(timer);
  }, [reload, reloadBilling, reloadFunnel, reloadAudit, reloadUsage, reloadTraffic, canBilling, canAudit, canUsage, canTraffic]);
  const refreshAll = () => {
    reload();
    if (canBilling) reloadBilling();
    if (canBilling) reloadFunnel();
    if (canAudit) reloadAudit();
    if (canUsage) reloadUsage();
    if (canTraffic) reloadTraffic();
  };
  const currencies = [...new Set(["INR", ...Object.keys(b?.actual.dailyByCurrency ?? {})])];
  const selectedCurrency = currencies.includes(currency) ? currency : "INR";
  const money = (v: number) => formatMinor(v, selectedCurrency, { exponent: b?.actual.currencyExponents?.[selectedCurrency], locale: selectedCurrency === "INR" ? "en-IN" : "en-US" });
  const revenueDays = b?.actual.dailyByCurrency?.[selectedCurrency] ?? (selectedCurrency === "INR" ? b?.actual.daily ?? [] : []);
  const plans = b ? [
    { name: "App Premium", value: b.counts.activeAppPremium ?? 0 },
    { name: "Floating Premium", value: b.counts.activeFloatingPremium ?? 0 },
    { name: "All Access", value: b.counts.activeAllAccess ?? 0 },
    { name: "Silver (legacy)", value: b.counts.activeSilver },
    { name: "Gold (legacy)", value: b.counts.activeGold },
  ] : [];
  if (b) {
    const other = b.counts.activeTotal - plans.reduce((sum, p) => sum + p.value, 0);
    if (other > 0) plans.push({ name: "Other / unclassified", value: other });
  }
  const productCountsKnown = b && b.counts.activeAppPremium != null && b.counts.activeFloatingPremium != null && b.counts.activeAllAccess != null;
  const usageData = canUsage ? usage.data : null;
  const cloudRequests = usageData?.telemetryOn === true ? usageData.todayEvents : null;
  const billingHint = !canBilling ? "Billing access required" : billing.loading ? "Loading billing data…" : billing.error ? "Billing data unavailable" : "No billing data";

  return <>
    <PageHeader title="Akaya Admin" description="Your product at a glance · users, subscriptions and AI activity."
      meta={d ? <span className="text-xs text-fg-subtle">Updated {relativeTime(d.generatedAt)} · refreshes every minute · UTC reporting</span> : null}
      actions={<Button variant="secondary" icon="refresh" loading={q.refreshing || billing.refreshing || audit.refreshing || usage.refreshing} onClick={refreshAll}>Refresh</Button>} />
    {q.error && !d ? <ErrorState message={q.error.message} onRetry={refreshAll} /> : !d ? <Skeleton className="h-96 w-full" /> : <div className={styles.dashboard}>
      {q.error ? <Notice tone="warning">Overview refresh failed. Showing the last successful snapshot. <button className="underline" onClick={refreshAll}>Retry</button></Notice> : null}
      {canBilling && billing.error ? <Notice tone="warning">{b ? "Billing refresh failed; showing the previous snapshot." : "Billing figures could not be loaded."} <button className="underline" onClick={reloadBilling}>Retry billing</button></Notice> : null}
      {canUsage && usage.error ? <Notice tone="warning">AI usage could not be refreshed. {usageData ? "Showing its previous snapshot." : "Request count is unavailable."} <button className="underline" onClick={reloadUsage}>Retry usage</button></Notice> : null}
      <div className={styles.metrics}>
        <Metric label="Total users" value={n(d.users.total)} hint={`${n(d.users.newToday)} new today · ${n(d.users.guests)} guests included`} icon="users" color="rgb(var(--chart-1))" />
        <Metric label="Daily active users" value={n(t?.series[t.series.length - 1]?.dau)} hint={!canTraffic ? "Analytics access required" : traffic.error ? "Traffic refresh failed" : t?.coverageStart ? "Unique users observed today · UTC" : "Waiting for app activity tracking"} icon="activity" color="#06b6d4" />
        <Metric label="Premium access" value={b ? n(b.counts.activeTotal) : "—"} hint={b ? `${n(b.counts.adminGranted)} admin grants included` : billingHint} icon="sparkles" color="#a855f7" />
        <Metric label="Estimated MRR · INR" value={b ? formatMinor(b.estimated.priceAwareMrrPaise ?? b.estimated.mrrPaise, "INR") : "—"} hint={b ? (b.estimated.priceAwareMrrPaise != null ? "Current-price estimate · not captured revenue" : "Legacy Silver/Gold estimate · includes grants") : billingHint} icon="card" color="#10b981" />
        <Metric label="Observed time / session" value={t?.coverageStart && t.summary.averageSessionMs != null ? `${(t.summary.averageSessionMs / 60000).toFixed(1)} min` : "—"} hint="Heartbeat time / sessions started · 90d estimate" icon="clock" color="#f59e0b" />
        <Metric label="Cloud requests today" value={n(cloudRequests)} hint={!canUsage ? "AI usage access required" : usage.loading ? "Loading request count…" : usage.error && !usageData ? "Request count unavailable" : usageData?.telemetryOn === false ? "AI usage telemetry is off" : "Recorded gateway requests · excludes offline use"} icon="bubble" color="#06b6d4" />
      </div>
      <div className={styles.twoColumns}>
        <Panel title="Revenue Trend (30d)" description="Captured payments per UTC day." actions={canBilling ? <Link className={styles.link} href="/dashboard/revenue">Revenue details ↗</Link> : null}>
          {!canBilling ? <p className={styles.message}>Billing access required.</p> : billing.loading && !b ? <Skeleton className="h-64 w-full" /> : !b ? <p className={styles.message}>Revenue data is unavailable.</p> : !b.actual.hasLedger ? <Untracked icon="receipt">No payment-ledger data is available yet. Revenue will appear here when captures are recorded.</Untracked> : <>
            <div className={styles.revenueHead}><div><p className={styles.revenueTotal}>{money(revenueDays.reduce((sum, day) => sum + day.captured, 0))}</p><p className="text-xs text-fg-muted">Captured · refunds shown in Revenue Insights</p></div>
              <label className="text-xs text-fg-muted">Currency <select className={styles.select} aria-label="Revenue currency" value={selectedCurrency} onChange={(e) => setCurrency(e.target.value)}>{currencies.map((c) => <option key={c}>{c}</option>)}</select></label></div>
            <DailyBars data={revenueDays.map((day) => ({ day: day.date, value: day.captured }))} label={`Captured revenue (${selectedCurrency}), last 30 days`} unit="Captured" format={money} />
            {b.actual.truncated ? <p className="mt-3 text-xs text-warning">Totals cover the latest 2,000 ledger records; this period may be incomplete.</p> : null}
            {b.actual.last30WithoutAmount > 0 && selectedCurrency === "INR" ? <p className="mt-2 text-xs text-warning">{b.actual.last30WithoutAmount} older payments have no recorded amount.</p> : null}
          </>}
        </Panel>
        <Panel title="Conversion Funnel" description="A journey from first use to paid activation.">
          {!canBilling ? <p>Billing access required.</p> : funnel.error ? <ErrorState message={funnel.error.message} onRetry={funnel.reload} /> : !funnel.data ? <Skeleton className="h-40" /> : <>
            <ol className={styles.funnel}>{funnel.data.steps.map(step => <li key={step.label}><div><span>{step.label}</span><span>{n(step.count)}{funnel.data?.incomplete ? "+" : ""}</span></div><progress className={styles.track} max={100} value={step.rate ?? 0} aria-label={`${step.label}: ${step.rate?.toFixed(1) ?? '0'}%`} /></li>)}</ol>
            <p className={styles.note}>{funnel.data.conversion == null ? 'No observed cohort yet.' : `${funnel.data.conversion.toFixed(1)}% reached all steps.`} {funnel.data.note} {funnel.data.incomplete ? 'Newest 5,000 observed users only; totals are incomplete.' : ''}</p>
          </>}
        </Panel>
      </div>
      <div className={styles.twoColumns}>
        <Panel title="Traffic by Country" description="Active users · last 90 days · estimated device country." actions={canTraffic ? <Link className={styles.link} href="/dashboard/activity">Traffic analytics ↗</Link> : null}>
          {!canTraffic ? <p className={styles.message}>Analytics access required.</p> : !t ? <p className={styles.message}>{traffic.error ? "Traffic data unavailable." : "Loading traffic data…"}</p> : !t.coverageStart ? <Untracked icon="chart">Updated app observations will start this report. Pricing country stays separate.</Untracked> : <>
            {traffic.error || t.incomplete ? <p className={styles.note}>Snapshot may be stale or incomplete. See Traffic Analytics for coverage.</p> : null}
            {!t.geography.length ? <p className={styles.message}>No activity in this period.</p> : <ul className={styles.legend}>{t.geography.slice(0, 6).map(g => <li key={g.country}><span>{g.country === "UNKNOWN" ? "Unknown" : t.countries.find(c => c.code === g.country)?.name ?? g.country}</span><strong>{n(g.users)}</strong></li>)}</ul>}
          </>}
        </Panel>
        <Panel title="Activity Feed" description="Recent admin actions · refreshes every minute." actions={canAudit ? <Link className={styles.link} href="/dashboard/audit">Audit log ↗</Link> : null} flush>
          {!canAudit ? <p className={styles.message}>Audit access required.</p> : audit.loading && !audit.data ? <div className="p-6"><Skeleton className="h-64 w-full" /></div> : <>
            {audit.error ? <div className="p-4"><Notice tone="warning">{audit.data ? "Refresh failed. Showing previous activity." : "Activity could not be loaded."} <button className="underline" onClick={reloadAudit}>Retry</button></Notice></div> : null}
            {audit.data?.entries.length === 0 ? <p className={styles.message}>No admin activity recorded yet.</p> : null}
            <ul className={styles.feed}>{audit.data?.entries.map((entry) => <li key={entry.id}>
              <span className={styles.feedIcon} aria-hidden><Icon name={entry.action.startsWith("billing.") ? "card" : "activity"} size={18} /></span>
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{describeAction(entry.action)}</p><p className="mt-1 truncate text-xs text-fg-muted" title={entry.targetId}>{entry.targetType}{entry.targetId ? ` · ${entry.targetId}` : ""}</p><p className="mt-1 text-xs text-fg-subtle">{entry.at == null ? "Time unavailable" : relativeTime(entry.at)}</p></div>
              <StatusPill status={resultTone(entry.result)} label={resultLabel(entry.result)} />
            </li>)}</ul>
          </>}
        </Panel>
      </div>
      <div className={styles.threeColumns}>
        <Panel title="Plan Distribution" description="Active premium access · admin grants included.">
          {!canBilling ? <p className={styles.message}>Billing access required.</p> : billing.loading && !b ? <Skeleton className="h-64 w-full" /> : !b ? <p className={styles.message}>Plan data is unavailable.</p> : b.counts.activeTotal === 0 ? <p className={styles.message}>No active premium subscriptions.</p> : <>
            <div className={styles.donut}><div className={styles.donutChart} aria-hidden><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={plans.filter((p) => p.value > 0)} dataKey="value" nameKey="name" isAnimationActive={false} innerRadius="70%" outerRadius="95%" paddingAngle={2} stroke="none">{plans.filter((p) => p.value > 0).map((p) => <Cell key={p.name} fill={COLORS[plans.indexOf(p)]} />)}</Pie></PieChart></ResponsiveContainer></div>
              <div className={styles.donutLabel}><strong>{n(b.counts.activeTotal)}</strong><span>active</span></div></div>
            <ul className={styles.legend} aria-label="Active subscriptions by plan">{plans.filter((p) => p.value > 0 || productCountsKnown || p.name.includes("legacy")).map((p) => <li key={p.name}><span><i style={{ background: COLORS[plans.indexOf(p)] }} aria-hidden />{p.name}</span><strong>{n(p.value)}</strong></li>)}</ul>
            {!productCountsKnown ? <p className={styles.note}>This backend does not provide all product counts; remaining subscriptions are unclassified.</p> : null}
          </>}
        </Panel>
        <Panel title="User Retention" description="Returning users in each signup cohort.">
          <div className={styles.retention}>{[1, 7, 30].map((day, i) => { const r = t ? retainedTotal(t, i) : null; return <div key={day}><div className={styles.retentionRow}><span>Day {day} Retention</span><strong>{r ? `${r.percent.toFixed(1)}%` : "—"}</strong><Badge>{r ? `${n(r.returned)}/${n(r.eligible)}` : "No mature cohort"}</Badge></div><div className={styles.track} aria-hidden /></div>; })}</div>
          <p className={styles.note}>Weighted exact-day returns across eligible signup cohorts in the last 90 days. Tracking starts with the first full UTC day. Churn is not inferred from missing history.{t?.incomplete || traffic.error ? " Traffic snapshot may be incomplete or stale." : ""}</p>
        </Panel>
        <Panel title="Top Skills & Personas" description="Discover what people use most."><Untracked icon="sparkles">Skill and persona popularity is not recorded yet. Model health is available below.</Untracked></Panel>
      </div>
      <div className={styles.twoColumns}>
        <Panel title="Needs attention" description={d.attention.length ? `${d.attention.length} current operational alerts` : "Nothing needs attention right now."} flush>
          {!d.attention.length ? <p className={styles.message}>All clear.</p> : <ul className={styles.alerts}>{d.attention.map((a) => <li key={a.id}><Link href={a.href}><Badge tone={a.severity === "critical" ? "danger" : a.severity === "warning" ? "warning" : "info"}>{a.severity}</Badge><span><strong>{a.title}</strong><span>{a.detail}</span></span><Icon name="chevron-right" size={16} /></Link></li>)}</ul>}
        </Panel>
        <Panel title="AI health" description="Busiest cloud models · cumulative recorded requests." actions={can("ai.models.read") ? <Link className={styles.link} href="/dashboard/model-inventory">Model health ↗</Link> : null}>
          {!d.aiHealth ? <p className={styles.message}>Model health is unavailable.</p> : !d.aiHealth.length ? <p className={styles.message}>No cloud traffic recorded yet.</p> : <ul className={styles.health}>{d.aiHealth.map((m) => <li key={m.modelId}><span className="min-w-0 truncate font-mono text-xs" title={m.modelId}>{m.modelId}</span><span className="shrink-0 text-xs text-fg-muted">{m.successes + m.failures ? `${((m.successes / (m.successes + m.failures)) * 100).toFixed(1)}% ok` : "—"}</span><StatusPill status={m.circuit === "open" ? "down" : m.consecutiveFailures ? "degraded" : "ok"} label={m.circuit} /></li>)}</ul>}
        </Panel>
      </div>
      <Panel title="Signups per day" description={`${n(d.users.new7d)} new in the last 7 days · last 30 UTC days, guests included.`}><DailyBars data={d.signups.map((s) => ({ day: s.day, value: s.count }))} label="Signups per day" unit="Signups" /></Panel>
    </div>}
  </>;
}
