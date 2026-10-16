"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import { Button, ErrorState, Notice, PageHeader, Panel, PlanBadge, Select, Skeleton, Stat, StatStrip } from "@/ui";
import { formatMinor } from "../pricing/logic";
import type { TrafficData } from "../insights/trafficTypes";
import { categoryLabel, refundCategories, revenueSnapshotMatches, type RevenueData } from "./revenueTypes";
import styles from "./RevenuePage.module.css";

const colors = ["rgb(var(--chart-1))", "#a855f7", "#06b6d4", "#10b981", "#f59e0b"];
const tip = { background: "rgb(var(--panel))", border: "1px solid rgb(var(--line))", borderRadius: 10, color: "rgb(var(--fg))", fontSize: 12 };
export default function RevenueAnalyticsPage() {
  const can = useCan();
  const [days, setDays] = useState(30), [currency, setCurrency] = useState("INR"), [page, setPage] = useState(0), [status, setStatus] = useState("all");
  const [asTable, setAsTable] = useState(false), [saving, setSaving] = useState<string | null>(null), [saveError, setSaveError] = useState<string | null>(null);
  const q = useCallable<RevenueData>("adminRevenue", { action: "summary", days, currency, page, status });
  const traffic = useCallable<TrafficData>("adminTraffic", can("analytics.read") ? { days, country: "ALL" } : null);
  const d = revenueSnapshotMatches(q.data, days, currency, page, status) ? q.data : null;
  const t = traffic.data?.days === days ? traffic.data : null;
  const reload = q.reload, reloadTraffic = traffic.reload;
  useEffect(() => { const timer = setInterval(() => { if (document.visibilityState !== "hidden") { reload(); reloadTraffic(); } }, 60000); return () => clearInterval(timer); }, [reload, reloadTraffic]);
  const fm = (v: number | null | undefined) => v == null ? "—" : formatMinor(v, currency, { exponent: d?.exponents[currency] ?? 2 });
  const observedArpu = d && t?.coverageStart != null && t.summary.users && !t.incomplete && !traffic.error ? d.net / t.summary.users : null;
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}:00`, sessions: t?.heatmap.reduce((sum, day) => sum + day[h], 0) ?? 0 }));
  const distribution = Object.entries(d?.current.plans ?? {}).map(([plan, x]) => ({ plan, ...x, total: x.monthly + x.annual }));
  const change = (n: number, c = currency) => { setDays(n); setCurrency(c); setPage(0); };
  async function saveCategory(paymentId: string, refundId: string, reason: string) {
    setSaving(refundId); setSaveError(null);
    try { await callAdmin("adminRevenue", { action: "refundReason", paymentId, refundId, reason }); reload(); }
    catch (e) { setSaveError((e as Error).message); }
    finally { setSaving(null); }
  }
  const chart = (kind: "mrr" | "revenue") => <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={d?.series ?? []}><CartesianGrid vertical={false} stroke="currentColor" opacity={.08} /><XAxis dataKey="day" tickFormatter={s => s.slice(5)} minTickGap={25} /><YAxis tickFormatter={fm} width={75} /><Tooltip contentStyle={tip} formatter={v => fm(Number(v))} /><Legend />{kind === "mrr" ? <Line dataKey="mrr" name="Recurring MRR" stroke="rgb(var(--chart-1))" connectNulls={false} dot={{ r: 2 }} isAnimationActive={false} /> : <><Bar dataKey="captured" name="Captured" fill="rgb(var(--chart-1))" isAnimationActive={false} /><Bar dataKey="refunded" name="Refunded" fill="#f59e0b" isAnimationActive={false} /></>}</ComposedChart></ResponsiveContainer></div>;
  return <>
    <PageHeader title="Revenue" description="Financial performance from verified payments and subscription contracts." actions={<div className={styles.controls}>{[7, 30, 90].map(n => <button className={styles.period} key={n} aria-pressed={days === n} onClick={() => change(n)}>{n} Days</button>)}<Select aria-label="Revenue currency" value={currency} onChange={e => change(days, e.target.value)}>{[...new Set([currency, ...(q.data?.currencies ?? ["INR"])])].map(c => <option key={c}>{c}</option>)}</Select><Button icon="refresh" variant="secondary" loading={q.refreshing} onClick={() => { reload(); reloadTraffic(); }}>Refresh</Button></div>} />
    {q.error ? d ? <Notice tone="warning" title="Refresh failed — showing the last successful snapshot">{q.error.message}<Button size="sm" onClick={reload}>Retry</Button></Notice> : <ErrorState message={q.error.message} onRetry={reload} /> : null}
    {!d && !q.error ? <Skeleton className="h-80 w-full" /> : null}
    {d ? <div className={styles.page}>
      <StatStrip>
        <Stat label={`Recurring MRR (${currency})`} value={fm(d.current.mrr)} hint={d.mrrGrowth == null ? "Current auto-renew contracts; no comparable start snapshot" : `${d.mrrGrowth >= 0 ? "+" : ""}${d.mrrGrowth.toFixed(1)}% since period-start observation`} />
        <Stat label="Total revenue" value={fm(d.captured)} hint={d.capturedGrowth == null ? "Gross captured; no comparable previous receipts" : `${d.capturedGrowth >= 0 ? "+" : ""}${d.capturedGrowth.toFixed(1)}% vs equal previous window`} />
        <Stat label="Avg revenue / active user" value={fm(observedArpu)} hint="Net / observed active users; requires analytics access and tracking" />
        <Stat label="Active paid subscriptions" value={d.current.active} hint={`${currency} contracts · excludes ${d.adminGrants} admin grants (all currencies)`} />
        <Stat label="Subscriber churn" value={d.churn ? `${d.churn.percent.toFixed(1)}%` : "—"} hint={d.churn ? `${d.churn.lost} of ${d.churn.baseline} baseline customers lack paid access now` : "Needs a complete period-start snapshot"} />
      </StatStrip>
      <p className={styles.note}>Updated {new Date(d.generatedAt).toLocaleString()} · UTC dates · Ledger observed since {d.coverageStart ? new Date(d.coverageStart).toLocaleDateString() : "not available"}. Currency totals are never combined. Today is a partial day.</p>
      {!d.coverageStart ? <Notice tone="info" title="Payment coverage not established">Recorded amounts are observations only. Missing payment history is not zero revenue.</Notice> : d.coverageStart > d.start ? <Notice tone="info">Ledger coverage begins inside this window. Earlier receipts are unavailable.</Notice> : null}
      {d.incomplete || d.missingAmount || d.unknownCurrency || d.unknownContracts || d.current.unknownPrice ? <Notice tone="warning" title="Some figures are incomplete">Read limit: {d.limit.toLocaleString()} ledger rows and active contracts. {d.incomplete ? "Limit reached. " : ""}{d.missingAmount} missing amounts, {d.unknownCurrency} unknown payment currencies, {d.unknownContracts} unknown contract currencies, {d.current.unknownPrice} unknown contract prices. These amounts are excluded, not estimated.</Notice> : null}
      <div className={styles.two}>
        <Panel title="MRR Over Time" description="First daily observation at 00:05 UTC. Missing snapshots remain gaps; current MRR is shown above.">{!d.series.some(x => x.mrr !== null) ? <div className={styles.empty}>MRR history will appear after daily snapshots begin.</div> : chart("mrr")}</Panel>
        <Panel title="Daily Revenue" description="Captured on payment observation date; dated refunds on refund processing observation date." actions={<Button size="sm" variant="ghost" onClick={() => setAsTable(!asTable)}>{asTable ? "Show chart" : "Show as table"}</Button>}>
          {asTable ? <div className={styles.scroll}><table className={styles.table}><thead><tr><th>UTC date</th><th>Captured</th><th>Refunded</th><th>MRR</th></tr></thead><tbody>{[...d.series].reverse().map(x => <tr key={x.day}><td>{x.day}</td><td>{fm(x.captured)}</td><td>{fm(x.refunded)}</td><td>{fm(x.mrr)}</td></tr>)}</tbody></table></div> : chart("revenue")}
        </Panel>
      </div>
      <div className={styles.mix}>
        <Panel title="Subscription Distribution" description={`Current paid access in ${currency}; cancelled contracts remain here until paid access ends.`}>
          {!distribution.length ? <div className={styles.empty}>No paid subscriptions with a verified currency.</div> : <><div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={distribution} dataKey="total" nameKey="plan" innerRadius="60%" outerRadius="90%" stroke="none" isAnimationActive={false}>{distribution.map((x, i) => <Cell key={x.plan} fill={colors[i % colors.length]} />)}</Pie><Tooltip contentStyle={tip} /></PieChart></ResponsiveContainer></div><div className={styles.scroll}><table className={styles.table}><thead><tr><th>Plan</th><th>Monthly</th><th>Yearly</th><th>Auto-renew</th></tr></thead><tbody>{distribution.map(x => <tr key={x.plan}><td><PlanBadge plan={x.plan} /></td><td>{x.monthly}</td><td>{x.annual}</td><td>{x.recurring}</td></tr>)}</tbody></table></div></>}
          <p className={styles.note}>Paid-access run rate: {fm(d.current.runRate)} / month. Includes one-time access at its charged price, annual / 12. Recurring MRR excludes one-time purchases, paused/pending contracts and cancelling renewals. Annualised recurring run rate: {fm(d.current.mrr * 12)}. <Link href="/dashboard/plans">Open Plans & Pricing ↗</Link></p>
        </Panel>
        <Panel title="Recent Transactions" actions={<Select aria-label="Transaction status" value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>{["all", "captured", "refunded", "failed", "review"].map(s => <option key={s} value={s}>{categoryLabel(s)}</option>)}</Select>}>
          <div className={styles.scroll}><table className={styles.table}><thead><tr>{["ID", "User", "Plan", "Amount", "Status", "Date (UTC)"].map(s => <th key={s}>{s}</th>)}</tr></thead><tbody>{d.transactions.rows.map(r => <tr key={r.id}><td title={r.id}><Link href="/dashboard/payments">{r.id.length > 20 ? `${r.id.slice(0, 17)}…` : r.id}</Link></td><td>{r.uid ?? "Unknown"}</td><td>{r.plan ? <PlanBadge plan={r.plan} /> : "—"}<span className={styles.muted}> {r.billing}</span></td><td>{fm(r.amount)}</td><td>{categoryLabel(r.status)}{r.review ? " · review" : ""}</td><td>{new Date(r.at).toISOString().slice(0, 16).replace("T", " ")}</td></tr>)}</tbody></table></div>
          {!d.transactions.rows.length ? <div className={styles.empty}>No transactions for this period, currency and status.</div> : null}
          <div className={styles.pager}><Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button><span>Page {page + 1} · {d.transactions.total} recorded transactions</span><Button size="sm" disabled={!d.transactions.hasMore} onClick={() => setPage(page + 1)}>Next</Button></div>
          <p className={styles.note}><Link href="/dashboard/payments">Open Payments for reconciliation and transaction details ↗</Link></p>
        </Panel>
      </div>
      <Panel title="LTV & Refunds" description="Observed ledger history, not predicted customer lifetime value.">
        <StatStrip><Stat label="Observed net / paying customer" value={fm(d.observedLtv)} hint={`${d.customers} customers in available ledger`} /><Stat label="Observed 12-month value" value={fm(d.twelveMonthLtv)} hint={`${d.matureCustomers} customers with 12 months since first recorded payment`} /><Stat label="Total dated refunds" value={fm(d.refunded)} /><Stat label="Refund outflow / captures" value={d.refundRate == null ? "—" : `${d.refundRate.toFixed(1)}%`} hint="Can exceed 100% when refunding older purchases" /></StatStrip>
        <p className={styles.note}>Net cash flow: {fm(d.net)} · Gross / paying customer in this period: {fm(d.arppu)}. Observed LTV can omit earlier purchases. Historical refunds without timestamps are excluded from period charts. Churn compares daily sampled endpoints; intervening losses/reactivations are not counted.</p>
        {d.undatedRefunds > 0 ? <Notice tone="warning">{fm(d.undatedRefunds)} of historical refunds have no verified processing date. Period refund totals are incomplete.</Notice> : null}
        <div className={`${styles.two} mt-6`}>
          <div><h3 className="font-semibold">Refunds by Reason</h3>{!d.refunds.length ? <div className={styles.empty}>No dated refunds for this period.</div> : <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={d.reasons.filter(r => r.count > 0)}><CartesianGrid vertical={false} stroke="currentColor" opacity={.08} /><XAxis dataKey="reason" tickFormatter={categoryLabel} /><YAxis tickFormatter={fm} width={75} /><Tooltip contentStyle={tip} formatter={v => fm(Number(v))} /><Bar dataKey="amount" name="Refunded" fill="rgb(var(--chart-1))" isAnimationActive={false} /></BarChart></ResponsiveContainer></div>}</div>
          <div><h3 className="font-semibold">Peak Usage by Hour (UTC)</h3>{!can("analytics.read") ? <div className={styles.empty}>Analytics permission required.</div> : traffic.error ? <ErrorState message={traffic.error.message} onRetry={reloadTraffic} /> : !t ? <Skeleton className="h-56 w-full" /> : t.coverageStart == null ? <div className={styles.empty}>Activity tracking has not started.</div> : <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><BarChart data={hours}><XAxis dataKey="hour" interval={5} /><YAxis allowDecimals={false} /><Tooltip contentStyle={tip} /><Bar dataKey="sessions" name="Sessions started" fill="#a855f7" isAnimationActive={false} /></BarChart></ResponsiveContainer></div>}<p className={styles.note}>All observed app sessions, independent of payment currency. {t?.incomplete ? "Activity read limit reached. " : ""}{t?.coverageStart && t.coverageStart > d.start ? "Activity coverage begins inside this period." : ""}</p></div>
        </div>
        {d.refunds.length ? <details><summary className="cursor-pointer text-sm text-accent">Refund observations & Finance categories ({d.refunds.length})</summary>{saveError ? <Notice tone="warning">{saveError}</Notice> : null}<div className={styles.scroll}><table className={styles.table}><thead><tr><th>Refund</th><th>Payment</th><th>Processed (UTC)</th><th>Amount</th><th>Category</th></tr></thead><tbody>{d.refunds.map(r => <tr key={`${r.paymentId}/${r.id}`}><td>{r.id}</td><td>{r.paymentId}</td><td>{new Date(r.at).toISOString().slice(0, 16)}</td><td>{fm(r.amount)}</td><td>{can("billing.reconcile") ? <Select aria-label={`Category for ${r.id}`} disabled={saving !== null} value={r.reason} onChange={e => void saveCategory(r.paymentId, r.id, e.target.value)}>{refundCategories.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}</Select> : categoryLabel(r.reason)}</td></tr>)}</tbody></table></div><p className={styles.note}>Category changes are audited. This control does not issue refunds or change access/token balances.</p></details> : null}
      </Panel>
    </div> : null}
  </>;
}
