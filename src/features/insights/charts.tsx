"use client";

// Recharts wrappers shared by the redesigned pages (theme-token colours).
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const tip = { background: "rgb(var(--panel))", border: "1px solid rgb(var(--line))", borderRadius: 8, color: "rgb(var(--fg))" };
const tick = { fontSize: 11, fill: "rgb(var(--fg-muted))" };
export const SERIES_COLORS = ["rgb(var(--accent))", "#f472b6", "#06b6d4", "#14a36b", "#e8930c", "#94a3b8"];

export interface SeriesDef { key: string; name: string; kind?: "area" | "line" | "bar"; color?: string; dashed?: boolean; axis?: "left" | "right" }

export function TrendChart({ data, x, series, height = 240, format }: { data: object[]; x: string; series: SeriesDef[]; height?: number; format?: (v: number) => string }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data as Record<string, unknown>[]}>
          <CartesianGrid stroke="rgb(var(--chart-grid))" vertical={false} />
          <XAxis dataKey={x} tick={tick} minTickGap={24} tickFormatter={(v: string) => String(v).slice(5)} />
          <YAxis yAxisId="left" tick={tick} width={56} tickFormatter={format} />
          <YAxis yAxisId="right" orientation="right" hide />
          <Tooltip contentStyle={tip} formatter={(v) => (format ? format(Number(v)) : v)} />
          {series.map((s, i) => {
            const color = s.color ?? SERIES_COLORS[i];
            const common = { key: s.key, dataKey: s.key, name: s.name, yAxisId: s.axis ?? "left", isAnimationActive: false };
            return s.kind === "bar" ? <Bar {...common} fill={color} radius={3} />
              : s.kind === "line" ? <Line {...common} stroke={color} strokeDasharray={s.dashed ? "4 4" : undefined} dot={false} />
              : <Area {...common} stroke={color} fill={color} fillOpacity={0.15} />;
          })}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, height = 220, format }: { data: { label: string; value: number }[]; height?: number; format?: (v: number) => string }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="label" tick={tick} interval={0} />
          <YAxis tick={tick} width={48} tickFormatter={format} />
          <Tooltip contentStyle={tip} formatter={(v) => (format ? format(Number(v)) : v)} cursor={{ fill: "rgb(var(--raised))" }} />
          <Bar dataKey="value" radius={4} isAnimationActive={false}>{data.map((d, i) => <Cell key={d.label} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/// Donut with centre label and a percentage legend.
export function Donut({ rows, center, sub }: { rows: { key: string; value: number; pct: number }[]; center: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-40 w-40 shrink-0" aria-hidden>
        <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={rows} dataKey="value" nameKey="key" innerRadius="68%" outerRadius="95%" stroke="none" isAnimationActive={false}>{rows.map((r, i) => <Cell key={r.key} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />)}</Pie></PieChart></ResponsiveContainer>
        <span className="absolute inset-0 flex flex-col items-center justify-center"><strong className="text-lg">{center}</strong><span className="text-2xs text-fg-muted">{sub}</span></span>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {rows.map((r, i) => <li key={r.key} className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} /><span className="flex-1 truncate">{r.key}</span><strong className="tabular-nums">{r.pct}%</strong></li>)}
      </ul>
    </div>
  );
}
