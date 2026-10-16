"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, DataTable, formatNumber } from "@/ui";

/// One series of daily bars with a hover tooltip and a table view (the
/// accessible alternative). Days with an unknown value (a failed count) are
/// drawn empty and shown as "—" in the table, never as 0.
export function DailyBars({
  data,
  label,
  unit,
  format = formatNumber,
}: {
  data: { day: string; value: number | null }[];
  label: string;
  unit: string;
  format?: (n: number) => string;
}) {
  const [table, setTable] = useState(false);
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setTable((t) => !t)}>{table ? "Show chart" : "Show as table"}</Button>
      </div>
      {table ? (
        <DataTable
          label={label}
          columns={[
            { id: "d", header: "Day (UTC)", cell: (r) => r.day },
            { id: "v", header: unit, align: "right", cell: (r) => (r.value === null ? "—" : format(r.value)) },
          ]}
          rows={[...data].reverse()}
          rowKey={(r) => r.day}
        />
      ) : (
        <div className="h-56" role="img" aria-label={`Bar chart: ${label}. Use Show as table for the values.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke="rgb(var(--chart-grid))" />
              <XAxis dataKey="day" tickFormatter={(v: string) => v.slice(5)} tick={{ fill: "rgb(var(--fg-subtle))", fontSize: 11 }} tickLine={false} axisLine={{ stroke: "rgb(var(--line))" }} interval={4} />
              <YAxis allowDecimals={false} tickFormatter={(v: number) => format(v)} tick={{ fill: "rgb(var(--fg-subtle))", fontSize: 11 }} tickLine={false} axisLine={false} width={56} />
              <Tooltip
                cursor={{ fill: "rgb(var(--raised))" }}
                contentStyle={{ background: "rgb(var(--panel))", border: "1px solid rgb(var(--line))", borderRadius: 8, fontSize: 12, color: "rgb(var(--fg))" }}
                labelStyle={{ color: "rgb(var(--fg-muted))" }}
                formatter={(v) => [v === null || v === undefined ? "—" : format(Number(v)), unit]}
              />
              <Bar dataKey="value" fill="rgb(var(--chart-1))" radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
