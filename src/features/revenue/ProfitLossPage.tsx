"use client";

import { useCallable } from "@/lib/useCallable";
import { ErrorSummary, PageHeader, Panel, PendingState, Skeleton, Stat, StatStrip } from "@/ui";
import { formatMinor } from "../pricing/logic";
import { pnlTotals } from "../insights/dashboardTypes";
import { modelTotals, usd, type AiUsage } from "../insights/types";
import { SampleTag } from "../insights/widgets";
import type { BillingSummary } from "./types";
import { PnlBreakdown, WeeklyNetBars, useProfitLoss } from "./ProfitLossCard";

/// Profit & Loss. The full P&L needs the adminFinance contract (costs are
/// not recorded anywhere yet); the two inputs that DO exist today — captured
/// revenue and estimated AI spend — are shown from their real callables.
export default function ProfitLossPage() {
  const pnl = useProfitLoss();
  const billing = useCallable<BillingSummary>("adminBilling", { action: "summary" });
  const usage = useCallable<AiUsage>("adminInsights", { action: "aiUsage", days: 30 });
  const t = pnl.data ? pnlTotals(pnl.data.weeks) : null;
  const aiSpend = usage.data ? usage.data.days.reduce<number | null>((s, d) => (s == null ? null : s + d.estCostUsd), 0) : null;
  const topModels = usage.data ? modelTotals(usage.data.days).slice(0, 5) : [];
  return (
    <div className="space-y-4">
      <PageHeader title="Profit & Loss" description="Revenue minus AI/API, infrastructure and payment-gateway cost." actions={pnl.data ? <SampleTag /> : null} />
      <ErrorSummary onRetry={() => { billing.reload(); usage.reload(); }} errors={[{ label: "Billing", error: billing.error }, { label: "AI usage", error: usage.error }]} />
      <StatStrip>
        <Stat label="Captured revenue · 30d" value={billing.data ? formatMinor(billing.data.actual.last30CapturedPaise, "INR") : "—"} hint="adminBilling · payment ledger" />
        <Stat label="Refunded · 30d" value={billing.data ? formatMinor(billing.data.actual.last30RefundedPaise, "INR") : "—"} />
        <Stat label="Estimated AI spend · 30d" value={usd(aiSpend)} hint="adminInsights aiUsage · priced requests only" estimated />
        <Stat label="Net margin · 12 weeks" value={t?.marginPct == null ? "—" : `${t.marginPct.toFixed(1)}%`} tone={t && t.net < 0 ? "danger" : "default"} />
      </StatStrip>
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel title="Weekly net" description="Green = profit, red = loss">
          {pnl.pending ? <PendingState title="Cost ledger not connected" contract={pnl.contract} /> : !pnl.data ? <Skeleton className="h-64" /> : <WeeklyNetBars data={pnl.data} height={260} />}
        </Panel>
        <Panel title="Breakdown · 12 weeks">
          {pnl.pending ? <PendingState title="Cost ledger not connected" contract={pnl.contract} /> : !pnl.data ? <Skeleton className="h-64" /> : <PnlBreakdown data={pnl.data} />}
        </Panel>
      </div>
      <Panel title="Biggest AI cost drivers · 30d" description="Real gateway telemetry">
        {!usage.data ? <Skeleton className="h-32" /> : !topModels.length ? <p className="text-sm text-fg-muted">No AI usage recorded in this period.</p> : (
          <ul className="divide-y divide-line text-sm">{topModels.map((m) => <li key={m.model} className="flex justify-between py-2"><span className="truncate font-mono text-xs">{m.model}</span><span className="tabular-nums">{usd(m.estCostUsd)}</span></li>)}</ul>
        )}
      </Panel>
    </div>
  );
}
