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

export function Delta({ pct, suffix = "vs last week" }: { pct: number | null | undefined; suffix?: string }) {
  if (pct == null) return <span className="text-xs text-fg-subtle">No comparison yet</span>;
  const up = pct >= 0;
  return (
    <span className={clsx("text-xs font-semibold", up ? "text-success" : "text-danger")}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% <span className="font-normal text-fg-subtle">{suffix}</span>
    </span>
  );
}

export function KpiCard({ label, value, footer, icon, color, spark, highlight }: {
  label: string; value: ReactNode; footer?: ReactNode; icon?: string; color?: string; spark?: number[]; highlight?: boolean;
}) {
  return (
    <article className={clsx("ui-panel flex min-w-0 flex-col gap-2 rounded-xl border p-4",
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
