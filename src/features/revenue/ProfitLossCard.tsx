"use client";

import clsx from "clsx";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { usePendingCallable } from "@/lib/pending";
import { Panel, PendingState, Skeleton } from "@/ui";
import { formatMinor } from "../pricing/logic";
import { pnlTotals, weekNet, type ProfitLoss } from "../insights/dashboardTypes";
import { SampleTag } from "../insights/widgets";

export function useProfitLoss() {
  return usePendingCallable<ProfitLoss>("profitLoss");
}

export function PnlBreakdown({ data }: { data: ProfitLoss }) {
  const sum = (k: "revenue" | "aiCost" | "serverCost" | "gatewayFees") => data.weeks.reduce((s, w) => s + w[k], 0);
  const t = pnlTotals(data.weeks);
  const money = (v: number) => formatMinor(v, data.currency);
  const rows: [string, number][] = [["Revenue", sum("revenue")], ["AI / API cost", -sum("aiCost")], ["Server & infrastructure", -sum("serverCost")], ["Payment gateway fees", -sum("gatewayFees")]];
  return (
    <dl className="divide-y divide-line text-sm">
      {rows.map(([k, v]) => <div key={k} className="flex justify-between py-2"><dt className="text-fg-muted">{k}</dt><dd className={clsx("font-semibold tabular-nums", v < 0 ? "text-danger" : "text-success")}>{v < 0 ? "−" : "+"}{money(Math.abs(v))}</dd></div>)}
      <div className="flex justify-between py-2 font-bold"><dt>Net {t.net < 0 ? "loss" : "profit"}</dt><dd className={t.net < 0 ? "text-danger" : "text-success"}>{money(t.net)}</dd></div>
    </dl>
  );
}

export function WeeklyNetBars({ data, height = 120 }: { data: ProfitLoss; height?: number }) {
  const rows = data.weeks.map((w) => ({ week: w.week.slice(5), net: weekNet(w) }));
  return (
    <div style={{ height }} aria-label="Weekly net profit, last 12 weeks" role="img">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <XAxis dataKey="week" hide />
          <Tooltip formatter={(v) => formatMinor(Number(v), data.currency)} cursor={{ fill: "rgb(var(--raised))" }} contentStyle={{ background: "rgb(var(--panel))", border: "1px solid rgb(var(--line))" }} />
          <Bar dataKey="net" radius={3} isAnimationActive={false}>
            {rows.map((r) => <Cell key={r.week} fill={r.net < 0 ? "rgb(var(--danger))" : "rgb(var(--success))"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/// Dashboard card: net profit/loss, margin, breakdown, 12-week trend.
export function ProfitLossCard() {
  const q = useProfitLoss();
  const t = q.data ? pnlTotals(q.data.weeks) : null;
  return (
    <Panel title="Profit / Loss" description="Last 12 weeks · revenue minus all costs" actions={<>{t ? <span className={clsx("rounded-full px-2 py-0.5 text-xs font-semibold", t.net < 0 ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>{t.net < 0 ? "▼ Net loss" : "▲ Net profit"}</span> : null}{q.data ? <SampleTag /> : null}</>}>
      {q.pending ? <PendingState title="Profit & loss is not tracked yet" contract={q.contract} /> : !q.data || !t ? <Skeleton className="h-48 w-full" /> : (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs text-fg-muted">Net {t.net < 0 ? "loss" : "profit"}</p>
            <p className={clsx("text-3xl font-bold tabular-nums", t.net < 0 ? "text-danger" : "text-success")}>{formatMinor(t.net, q.data.currency)}</p>
            <p className="text-xs text-fg-muted">{t.marginPct == null ? "—" : `${t.marginPct.toFixed(1)}% margin`}</p>
            <WeeklyNetBars data={q.data} />
          </div>
          <PnlBreakdown data={q.data} />
        </div>
      )}
    </Panel>
  );
}
