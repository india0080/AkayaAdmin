"use client";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Area, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCallable } from "@/lib/useCallable";
import { Button, ErrorState, Notice, PageHeader, Panel, Select, Skeleton, Stat, StatStrip, formatNumber } from "@/ui";
import { formatMinor } from "../pricing/logic";
import type { TrafficData } from "./trafficTypes";
import paths from "./worldPaths.json";
import styles from "./TrafficPage.module.css";

const colors = ["rgb(var(--chart-1))", "#a855f7", "#06b6d4", "#10b981", "#f59e0b", "#64748b"];
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const n = (value: number | null | undefined) => value == null ? "—" : formatNumber(value);
export default function TrafficPage({ children }: { children?: ReactNode }) {
  const [days, setDays] = useState(30), [country, setCountry] = useState("ALL"), [hover, setHover] = useState<string | null>(null);
  const q = useCallable<TrafficData>("adminTraffic", { days, country });
  // useCallable keeps a prior snapshot while refreshing. Never present the
  // previous country's numbers under the newly selected filter.
  const d = q.data?.days === days && q.data?.country === country ? q.data : null;
  const reload = q.reload;
  useEffect(() => { const t = setInterval(() => { if (document.visibilityState !== "hidden") reload(); }, 60000); return () => clearInterval(t); }, [reload]);
  const countries = q.data?.countries ?? [], name = (code: string) => code === "UNKNOWN" ? "Unknown country" : countries.find(c => c.code === code)?.name ?? paths.find(p => p.code === code)?.name ?? code;
  const geo = new Map(d?.geography.map(g => [g.country, g]) ?? []), max = Math.max(1, ...[...geo.values()].map(g => g.users));
  const heatMax = Math.max(0, ...d?.heatmap.flat() ?? []), totalSessions = d?.devices.reduce((sum, x) => sum + x.sessions, 0) ?? 0;
  const tracked = d?.coverageStart != null, money = (amount: number, currency: string) => formatMinor(amount, currency, { exponent: d?.currencyExponents[currency] ?? 2 });
  const hovered = hover ?? (country !== "ALL" ? country : null), hoveredGeo = hovered ? geo.get(hovered) : null;
  const pickCountry = (code: string) => { if (countries.some(c => c.code === code) || code === "UNKNOWN") { setCountry(code); setHover(null); } };
  return <>
    <PageHeader title="Traffic Analytics" description="User acquisition, estimated geography & engagement."
      actions={<div className={styles.controls}>{[7, 30, 90].map(x => <button key={x} className={styles.period} aria-pressed={days === x} onClick={() => setDays(x)}>{x} Days</button>)}<Button variant="secondary" icon="refresh" onClick={reload} loading={q.refreshing}>Refresh</Button></div>} />
    {q.error && !d ? <ErrorState message={q.error.message} onRetry={reload} /> : !d ? <Skeleton className="h-96 w-full" /> : <div className={styles.page}>
      {q.error ? <Notice tone="warning">Refresh failed; showing the previous successful snapshot. <button onClick={reload} className="underline">Retry</button></Notice> : null}
      <Notice tone="info">{tracked ? `Tracking started ${new Date(d.coverageStart!).toLocaleString()}.` : "No app activity recorded yet. Install the updated app and open it while signed in to begin tracking."} Reports use UTC. Country comes from device SIM/network/locale signals; it is an estimate, not GPS or billing location. MAU needs 30 days of coverage. Cohorts start with the first full tracked UTC signup day.</Notice>
      {d.incomplete ? <Notice tone="warning">Incomplete report: read limit reached ({n(d.limits.dailyMemberships)} daily memberships / {n(d.limits.signups)} signups). Counts and retention may be unreliable.</Notice> : null}
      <StatStrip><Stat label="Active users in period" value={tracked ? n(d.summary.users) : "—"} /><Stat label="Sessions started" value={tracked ? n(d.summary.sessions) : "—"} /><Stat label="Wallet tokens used" value={n(d.summary.tokens)} hint="Actual wallet deductions; excludes unlimited usage" /><Stat label="Observed foreground time" value={tracked ? `${(d.summary.activeMs / 60000).toFixed(1)} min` : "—"} /></StatStrip>
      <div className={styles.top}>
        <Panel title="User Distribution Map" description="Unique active users by estimated device country." actions={<Select aria-label="Country filter" value={country} onChange={e => { setCountry(e.target.value); setHover(null); }}><option value="ALL">All Countries</option><option value="UNKNOWN">Unknown country</option>{countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}</Select>}>
          <svg className={styles.map} viewBox="0 0 720 300" aria-label="World map of estimated user countries" role="group">
            {paths.map(p => { const users = geo.get(p.code)?.users ?? 0; const supported = countries.some(c => c.code === p.code); return <path key={p.name} d={p.d} fill={users ? `rgb(var(--chart-1) / ${.25 + .75 * users / max})` : "rgb(var(--raised))"} role={supported ? "button" : undefined} tabIndex={supported ? 0 : undefined} aria-label={p.name} aria-pressed={country === p.code} onMouseEnter={() => setHover(p.code)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p.code)} onBlur={() => setHover(null)} onClick={() => pickCountry(p.code)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pickCountry(p.code); } }} />; })}
          </svg>
          <div className={styles.legend}><span>Low activity</span><span className={styles.gradient} /><span>High activity</span></div>
          <div className={styles.mapInfo} aria-live="polite">{hovered ? <><strong>{name(hovered)}</strong> · {country !== "ALL" && hovered !== country ? "Outside selected filter" : !tracked ? "Not tracked yet" : `${n(hoveredGeo?.users ?? 0)} active users · ${n(hoveredGeo?.sessions ?? 0)} sessions · ${n(hoveredGeo?.tokens ?? 0)} wallet tokens`}{d.revenue?.filter(r => r.country === hovered).map(r => <span key={r.currency}> · Billing-country net: {money(r.captured - r.refunded, r.currency)}</span>)}</> : "Hover or focus a country for details; click to filter. Small territories are available in the country selector."}</div>
          <p className={styles.note}>Map: Natural Earth 5.1.2, public domain. Country boundaries are illustrative. Unknown country remains visible in the table.</p>
        </Panel>
        <Panel title="Device Breakdown" description="Share of sessions started on each platform.">
          {!totalSessions ? <div className={styles.empty}>No sessions recorded for this filter.</div> : <><div className={styles.donut}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={d.devices.filter(x => x.sessions > 0)} dataKey="sessions" nameKey="platform" innerRadius="65%" outerRadius="90%" stroke="none" isAnimationActive={false}>{d.devices.map((x, i) => <Cell key={x.platform} fill={colors[i % colors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><ul className={styles.devices}>{d.devices.filter(x => x.sessions > 0).map((x, i) => <li key={x.platform}><span style={{ color: colors[i % colors.length] }}>{x.platform}</span><strong>{n(x.sessions)} · {(x.sessions / totalSessions * 100).toFixed(1)}%</strong></li>)}</ul></>}
        </Panel>
      </div>
      <Panel title="DAU / MAU Trends" description="Unique active users per UTC day; MAU is the rolling 30-day union.">
        {!tracked ? <div className={styles.empty}>Activity history will appear after tracking starts.</div> : <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={d.series}><CartesianGrid stroke="currentColor" opacity={.08} vertical={false} /><XAxis dataKey="day" tickFormatter={day => day.slice(5)} minTickGap={25} /><YAxis allowDecimals={false} /><Tooltip contentStyle={{ background: "rgb(var(--panel))", borderColor: "rgb(var(--line))", color: "rgb(var(--fg))" }} /><Legend /><Area name="MAU (available coverage)" type="monotone" dataKey="mau" fill="#a855f7" fillOpacity={.1} stroke="#a855f7" isAnimationActive={false} /><Line name="DAU" dataKey="dau" stroke="rgb(var(--chart-1))" dot={false} isAnimationActive={false} /></ComposedChart></ResponsiveContainer></div>}
        {tracked && d.series.some(x => !x.mauComplete) ? <p className={styles.note}>Some MAU points have less than 30 days of tracking coverage. They show observed users only.</p> : null}
      </Panel>
      <Panel title="Retention Cohort Analysis" description={country === "ALL" ? "Signup-day cohorts; return activity on exact Day 1, 7 and 30." : "Users observed in this country on signup day; return activity in this country."}>
        <div className={styles.scroll}><table className={styles.table}><thead><tr>{["Cohort (UTC)", "Users", "Day 1", "Day 7", "Day 30"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{d.cohorts.map(c => <tr key={c.cohort}><td>{c.cohort}</td><td>{n(c.users)}</td>{c.retention.map((r, i) => <td key={i}>{r ? <span className={styles.retention} title={`${r.returned} of ${r.eligible} returned`}>{r.percent.toFixed(1)}%</span> : <span title="Target UTC day has not finished">—</span>}</td>)}</tr>)}</tbody></table></div>
        {!d.cohorts.length ? <p className={styles.empty}>No eligible signup cohorts for this period.</p> : null}
        <p className={styles.note}>A dash means the target day has not finished. Users created before tracking began are excluded; absent historical activity is not treated as churn.</p>
      </Panel>
      <Panel title="Peak Usage Heatmap" description="Sessions started by UTC hour × day of week. Brighter = more sessions.">
        {!tracked ? <div className={styles.empty}>No tracked sessions yet.</div> : <><div className={styles.scroll}><div className={styles.heatmap}><span />{Array.from({ length: 24 }, (_, h) => <span className={styles.hour} key={h}>{h % 3 === 0 ? `${h}:00` : ""}</span>)}{weekdays.map((day, i) => <Fragment key={day}><span className={styles.day}>{day}</span>{d.heatmap[i].map((count, h) => <div tabIndex={0} key={h} className={styles.cell} aria-label={`${day} ${h}:00 UTC: ${count} sessions`} title={`${day} ${h}:00–${h + 1}:00 UTC · ${n(count)} sessions`} style={{ background: count ? `rgb(var(--chart-1) / ${.2 + .8 * count / heatMax})` : "rgb(var(--fg)/.05)" }} />)}</Fragment>)}</div></div><div className={styles.legend}><span>Zero</span><span className={styles.gradient} /><span>{n(heatMax)} sessions</span></div></>}
      </Panel>
      <Panel title="Geographic Breakdown" description="Estimated device country; token totals are wallet consumption, not provider billing.">
        <div className={styles.scroll}><table className={styles.table}><thead><tr>{["Country", "Active users", "Sessions started", "Wallet tokens used", "User share"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{d.geography.map(g => <tr key={g.country}><td><button onClick={() => pickCountry(g.country)}>{name(g.country)}</button></td><td>{n(g.users)}</td><td>{n(g.sessions)}</td><td>{n(g.tokens)}</td><td><div className={styles.bar}><span style={{ width: `${d.summary.users ? g.users / d.summary.users * 100 : 0}%` }} /></div><span className="text-xs text-fg-muted">{d.summary.users ? (g.users / d.summary.users * 100).toFixed(1) : "0"}%</span></td></tr>)}</tbody></table></div>
        {!d.geography.length ? <div className={styles.empty}>No data available for this period.</div> : null}
        <p className={styles.note}>A travelling user can appear in multiple countries, so country shares may exceed 100% together. Session starts use a shared 30-minute inactivity window across devices. Foreground time counts contiguous observations only; background/offline gaps are excluded.</p>
      </Panel>
      <Panel title="Revenue by Billing Country" description="Captured payments in the selected period; refunds are current reconciled amounts. Separate from traffic geography.">
        {d.revenue === null ? <p className={styles.empty}>Billing access required.</p> : !d.revenue.length ? <p className={styles.empty}>No recorded payments for this filter.</p> : <div className={styles.scroll}><table className={styles.table}><thead><tr>{["Billing country", "Currency", "Captured", "Refunded", "Net"].map(x => <th key={x}>{x}</th>)}</tr></thead><tbody>{d.revenue.map(r => <tr key={`${r.country}_${r.currency}`}><td>{name(r.country)}</td><td>{r.currency}</td><td>{money(r.captured, r.currency)}</td><td>{money(r.refunded, r.currency)}</td><td>{money(r.captured - r.refunded, r.currency)}</td></tr>)}</tbody></table></div>}
        {d.revenueIncomplete || d.missingAmount ? <p className={styles.note}>Revenue may be incomplete: {n(d.missingAmount)} records lack a valid amount/currency; query limit {n(d.limits.payments)} payments{d.revenueIncomplete ? " reached" : ""}.</p> : null}
      </Panel>
      {children ? <details><summary className="cursor-pointer text-sm font-semibold text-accent">Existing signup analytics & current plan mix</summary><div className="mt-6">{children}</div></details> : null}
    </div>}
  </>;
}
