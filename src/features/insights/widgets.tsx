"use client";

// Dashboard building blocks shared by Overview, Profit & Loss, API
// Integrations and Referral. Theme-token colours only.

import clsx from "clsx";
import type { ReactNode } from "react";
import { Icon } from "@/ui";

export function Sparkline({ values, color = "rgb(var(--accent))", className }: { values: number[]; color?: string; className?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className={clsx("h-8 w-24", className)} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export type Tone = "success" | "danger" | "warning" | "accent";
export const TONE_COLOR: Record<Tone, string> = { success: "rgb(var(--success))", danger: "rgb(var(--danger))", warning: "rgb(var(--warning))", accent: "rgb(var(--accent))" };

/// % change, coloured by meaning: green when good, red when bad. `invert`
/// for metrics where going down is good (churn, errors, failed payments).
export function Delta({ pct, suffix = "vs last week", invert }: { pct: number | null | undefined; suffix?: string; invert?: boolean }) {
  if (pct == null) return <span className="text-xs text-fg-subtle">No comparison yet</span>;
  const up = pct >= 0;
  const good = invert ? !up : up;
  return (
    <span className={clsx("text-xs font-semibold", good ? "text-success" : "text-danger")}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% <span className="font-normal text-fg-subtle">{suffix}</span>
    </span>
  );
}

export function KpiCard({ label, value, footer, icon, color, spark, highlight, tone }: {
  label: string; value: ReactNode; footer?: ReactNode; icon?: string; color?: string; spark?: number[]; highlight?: boolean; tone?: Tone;
}) {
  if (tone && !color) color = TONE_COLOR[tone];
  return (
    <article style={!highlight && tone ? { boxShadow: `inset 0 3px 0 ${TONE_COLOR[tone]}` } : undefined} className={clsx("ui-panel flex min-w-0 flex-col gap-2 rounded-xl border p-4",
      highlight ? "border-transparent bg-gradient-to-br from-[#7c5cff] to-[#c06cff] text-white" : "border-line bg-panel")}>
      <div className="flex items-center gap-2">
        {icon ? <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-white" style={{ background: color ?? "rgb(var(--accent))" }} aria-hidden><Icon name={icon} size={15} /></span> : null}
        <p className={clsx("truncate text-sm", highlight ? "text-white/90" : "text-fg-muted")}>{label}</p>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
        {spark ? <Sparkline values={spark} color={color} /> : null}
      </div>
      {footer ? <div className={highlight ? "text-white/90" : undefined}>{footer}</div> : null}
    </article>
  );
}

/// Horizontal stacked share bar with a legend.
export function ShareBar({ rows }: { rows: { label: string; pct: number; color: string }[] }) {
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-raised" role="img" aria-label={rows.map((r) => `${r.label} ${r.pct}%`).join(", ")}>
        {rows.map((r) => <span key={r.label} style={{ width: `${r.pct}%`, background: r.color }} />)}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {rows.map((r) => <li key={r.label} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: r.color }} />{r.label} {r.pct}%</li>)}
      </ul>
    </div>
  );
}

export const SampleTag = () => <span className="rounded-full bg-warning-soft px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-warning">Sample data</span>;

/// 24h / 7 / 30 / 90-day switch used by every redesigned page header.
export function PeriodButtons({ value, onChange, options = [7, 30, 90] }: { value: number; onChange: (d: number) => void; options?: number[] }) {
  return (
    <div role="group" aria-label="Period" className="inline-flex rounded-lg border border-line bg-panel p-0.5">
      {options.map((d) => (
        <button key={d} type="button" aria-pressed={value === d} onClick={() => onChange(d)}
          className={clsx("h-7 rounded-md px-3 text-xs font-medium", value === d ? "bg-accent-solid text-on-accent" : "text-fg-muted hover:text-fg")}>
          {d === 1 ? "24h" : `${d} days`}
        </button>
      ))}
    </div>
  );
}

export interface Kpi { label: string; value: ReactNode; delta?: number | null; spark?: number[]; hint?: ReactNode; color?: string; tone?: Tone; invert?: boolean }
/// The design's KPI top row: value, % change and sparkline per card.
export function KpiRow({ items }: { items: Kpi[] }) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Key metrics">
      {items.map((k) => (
        <KpiCard key={k.label} label={k.label} value={k.value} spark={k.spark} color={k.color}
          tone={k.tone ?? autoTone(k)}
          footer={k.hint ?? (k.delta !== undefined ? <Delta pct={k.delta} suffix="vs prev." invert={k.invert} /> : null)} />
      ))}
    </section>
  );
}

/// Tone from the delta's meaning when the caller didn't pick one.
function autoTone(k: Kpi): Tone | undefined {
  if (k.delta == null) return undefined;
  return (k.invert ? k.delta <= 0 : k.delta >= 0) ? "success" : "danger";
}

/// Status → semantic tone used by pills, cells and bars across pages.
export function statusTone(s: string): Tone {
  const v = s.toLowerCase();
  if (/(fail|error|down|invalid|unreach|declin|lost|loss|cancel|missing|5\d\d|4\d\d)/.test(v)) return "danger";
  if (/(pend|warn|refund|spike|degrad|schedul|review|trial|expir|test|draft)/.test(v)) return "warning";
  return "success";
}

/// 7 × 24 intensity grid (rows = weekday, cols = hour).
export function Heatmap({ grid, label }: { grid: number[][]; label: string }) {
  const max = Math.max(1, ...grid.flat());
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <div className="overflow-x-auto" role="img" aria-label={label}>
      <div className="grid min-w-[520px] gap-[3px]" style={{ gridTemplateColumns: "32px repeat(24, 1fr)" }}>
        {grid.map((row, i) => [
          <span key={`d${i}`} className="text-2xs text-fg-subtle">{days[i]}</span>,
          ...row.map((v, h) => <span key={`${i}-${h}`} title={`${days[i]} ${h}:00 · ${v}`} className="h-4 rounded-[3px]" style={{ background: `rgb(var(--accent) / ${0.08 + 0.92 * (v / max)})` }} />),
        ])}
      </div>
    </div>
  );
}

/// Probe history as thin uptime bars (green ok, red failed, grey no data).
export function UptimeBars({ history }: { history: { status: string }[] }) {
  return (
    <span className="flex h-5 items-end gap-[2px]" aria-label={`${history.filter((h) => h.status === "reachable").length}/${history.length} probes ok`}>
      {history.slice(-24).map((h, i) => <span key={i} className={clsx("h-full w-1 rounded-sm", h.status === "reachable" ? "bg-success" : h.status === "inactive" ? "bg-raised" : "bg-danger")} />)}
    </span>
  );
}

/// Small bordered table used by the redesigned pages (horizontal scroll on mobile).
export function MiniTable({ head, rows, minWidth = 520 }: { head: string[]; rows: ReactNode[][]; minWidth?: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth }}>
        <thead className="text-left text-xs text-fg-muted"><tr>{head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-2">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export const pctChange = (cur?: number | null, prev?: number | null) => (cur != null && prev ? ((cur - prev) / prev) * 100 : null);
