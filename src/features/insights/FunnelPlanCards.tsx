"use client";

import Link from "next/link";
import { useCallable } from "@/lib/useCallable";
import { Panel, Skeleton, formatNumber } from "@/ui";
import type { BillingSummary } from "../revenue/types";
import { shares } from "./dashboardTypes";
import { ShareBar } from "./widgets";

interface Funnel { steps: { label: string; count: number; rate: number | null }[]; conversion: number | null; incomplete: boolean; note: string }
const PLAN_COLORS = ["rgb(var(--accent))", "#c06cff", "#06b6d4", "#94a3b8"];

/// Compact Conversion Funnel + Plan Distribution (restored from the previous
/// Overview). Both are real: adminInsights funnel and adminBilling summary.
export function FunnelPlanCards({ billing, canBilling }: { billing: BillingSummary | null; canBilling: boolean }) {
  const funnel = useCallable<Funnel>("adminInsights", canBilling ? { action: "funnel" } : null);
  const c = billing?.counts;
  const plans = c ? shares([
    { key: "App Premium", value: c.activeAppPremium ?? c.activeSilver },
    { key: "Floating Premium", value: c.activeFloatingPremium ?? 0 },
    { key: "All Access", value: c.activeAllAccess ?? c.activeGold },
    { key: "Admin grants", value: c.adminGranted },
  ]) : [];
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Conversion funnel" description="First use → paid activation" actions={<Link className="text-sm font-medium text-accent-text" href="/dashboard/activity">Activity ↗</Link>}>
        {!canBilling ? <p className="text-sm text-fg-muted">Billing access required.</p> : !funnel.data ? (funnel.error ? <p className="text-sm text-fg-muted">Funnel unavailable.</p> : <Skeleton className="h-32" />) : (
          <ol className="space-y-2 text-sm">
            {funnel.data.steps.map((s) => (
              <li key={s.label}>
                <div className="flex justify-between"><span>{s.label}</span><span className="tabular-nums text-fg-muted">{formatNumber(s.count)}{funnel.data?.incomplete ? "+" : ""} · {s.rate == null ? "—" : `${s.rate.toFixed(1)}%`}</span></div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-raised"><span className="block h-full bg-accent" style={{ width: `${s.rate ?? 0}%` }} /></span>
              </li>
            ))}
          </ol>
        )}
      </Panel>
      <Panel title="Plan distribution" description="Active premium access · admin grants included" actions={<Link className="text-sm font-medium text-accent-text" href="/dashboard/subscriptions">Subscriptions ↗</Link>}>
        {!canBilling ? <p className="text-sm text-fg-muted">Billing access required.</p> : !c ? <Skeleton className="h-32" /> : c.activeTotal === 0 ? <p className="text-sm text-fg-muted">No active premium subscriptions.</p> : <>
          <p className="mb-3 text-2xl font-bold tabular-nums">{formatNumber(c.activeTotal)} <span className="text-sm font-normal text-fg-muted">active · {formatNumber(c.expiring7d)} expiring in 7 days</span></p>
          <ShareBar rows={plans.map((p, i) => ({ label: p.key, pct: p.pct, color: PLAN_COLORS[i] }))} />
        </>}
      </Panel>
    </div>
  );
}
