"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { callAdmin } from "@/lib/api";
import { DEMO_MODE } from "@/lib/demo/flag";
import { usePendingCallable } from "@/lib/pending";
import { useCallable } from "@/lib/useCallable";
import { Badge, Button, ErrorState, Panel, PlanBadge, Select, Skeleton, TextInput, formatNumber, relativeTime } from "@/ui";
import { formatMinor } from "../pricing/logic";
import SubscriptionsPage from "../revenue/SubscriptionsPage";
import type { RevenueData } from "../revenue/revenueTypes";
import type { SubscriptionFlows } from "../insights/dashboardTypes";
import { KpiRow, MiniTable } from "../insights/widgets";
import { DesignPage } from "./DesignPage";

interface SubRow { uid: string; name: string | null; email: string | null; planId: string | null; billing: string | null; source: string | null; startedAt: number | null; expiresAt: number | null;
  recurring?: { state: string | null; cancelAtCycleEnd: boolean; nextChargeAt: number | null; regularAmount: number | null } | null }

function statusOf(r: SubRow): { label: string; tone: "success" | "warning" | "danger" } {
  if (r.recurring?.cancelAtCycleEnd) return { label: "Cancels at renewal", tone: "warning" };
  if (r.expiresAt != null && r.expiresAt < Date.now()) return { label: "Lapsed", tone: "danger" };
  if (r.expiresAt != null && r.expiresAt - Date.now() < 7 * 86_400_000) return { label: "Expiring", tone: "warning" };
  return { label: "Active", tone: "success" };
}

/// Subscription Management: KPIs, searchable subscriber table and a side
/// panel for the selected subscriber (actions open the existing 360 view).
export default function SubscriptionsOverview() {
  const [view, setView] = useState("active");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<SubRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SubRow | null>(null);
  const [nonce, setNonce] = useState(0);
  const rev = useCallable<RevenueData>("adminRevenue", { action: "summary", days: 30, currency: "INR", page: 1, status: "all" });
  const flows = usePendingCallable<SubscriptionFlows>("subscriptionFlows");
  useEffect(() => {
    let live = true;
    setRows(null); setError(null);
    callAdmin<{ rows: SubRow[] }>("adminBilling", { action: "subscriptions", view, limit: 50 })
      .then((r) => { if (live) { setRows(r.rows); setSelected(r.rows[0] ?? null); } })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [view, nonce]);
  const d = rev.data;
  const shown = (rows ?? []).filter((r) => !search || `${r.name} ${r.email} ${r.uid}`.toLowerCase().includes(search.toLowerCase()));
  const pendingHint = flows.pending ? <span className="text-xs text-warning">Awaiting backend</span> : undefined;
  return (
    <DesignPage title="Subscription Management" description="Subscribers, renewals and billing actions." sample={DEMO_MODE} manage={<SubscriptionsPage />} manageLabel="Analytics, coupons & reminders">
      <KpiRow items={[
        { label: "Active subscriptions", value: d ? formatNumber(d.current.active) : "—", tone: "success", delta: d?.mrrGrowth ?? null },
        { label: "New · 7d", value: flows.data ? formatNumber(flows.data.new7d) : "—", delta: flows.data?.newDelta, spark: flows.data?.daily, hint: pendingHint },
        { label: "Churned · 30d", value: d?.churn ? formatNumber(d.churn.lost) : "—", tone: "danger" },
        { label: "Churn rate", value: d?.churn ? `${d.churn.percent.toFixed(1)}%` : "—", tone: d?.churn && d.churn.percent > 5 ? "danger" : "warning" },
        { label: "Trials", value: flows.data ? formatNumber(flows.data.trials) : "—", delta: flows.data?.trialDelta, tone: "warning", hint: pendingHint },
      ]} />
      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Panel title="Subscribers" actions={<div className="flex flex-wrap gap-2">
          <TextInput aria-label="Search subscribers" placeholder="Search name, email, UID" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select aria-label="View" value={view} onChange={(e) => setView(e.target.value)}>{["active", "expiring", "lapsed", "recurring"].map((v) => <option key={v} value={v}>{v}</option>)}</Select>
        </div>} flush>
          {error ? <ErrorState message={error} onRetry={() => setNonce((n) => n + 1)} /> : !rows ? <Skeleton className="m-4 h-60" /> : (
            <MiniTable minWidth={640} head={["User", "Plan", "Billing", "Status", "Renews / expires", "Source"]} rows={shown.map((r) => {
              const st = statusOf(r);
              return [
                <button key="u" type="button" onClick={() => setSelected(r)} className={selected?.uid === r.uid ? "text-left font-semibold text-accent-text" : "text-left font-medium"}>{r.name ?? r.email ?? r.uid}</button>,
                <PlanBadge key="p" plan={r.planId ?? "free"} />, r.billing ?? "—", <Badge key="s" tone={st.tone}>{st.label}</Badge>,
                r.expiresAt ? relativeTime(r.expiresAt) : "—", r.source ?? "—"];
            })} />
          )}
        </Panel>
        <Panel title={selected ? `Selected · ${selected.name ?? selected.uid}` : "Selected subscriber"}>
          {!selected ? <p className="text-sm text-fg-muted">Pick a subscriber.</p> : <>
            <dl className="divide-y divide-line text-sm">
              {[["Email", selected.email ?? "—"], ["Plan", `${selected.planId ?? "—"} · ${selected.billing ?? "—"}`], ["Started", selected.startedAt ? new Date(selected.startedAt).toLocaleDateString() : "—"],
                ["Next charge", selected.recurring?.nextChargeAt ? new Date(selected.recurring.nextChargeAt).toLocaleDateString() : "—"],
                ["Amount", selected.recurring?.regularAmount != null ? formatMinor(selected.recurring.regularAmount, "INR") : "—"]].map(([k, v]) => <div key={k} className="flex justify-between gap-2 py-2"><dt className="text-fg-muted">{k}</dt><dd className="truncate">{v}</dd></div>)}
            </dl>
            <div className="mt-4 grid gap-2">
              <Link href={`/dashboard/subscriptions/view?uid=${encodeURIComponent(selected.uid)}`}><Button variant="primary" className="w-full">Extend / grant days</Button></Link>
              <Link href={`/dashboard/subscriptions/view?uid=${encodeURIComponent(selected.uid)}`}><Button className="w-full">Change plan</Button></Link>
              <Link href="/dashboard/payments"><Button className="w-full">Issue refund</Button></Link>
              <Link href={`/dashboard/users/view?uid=${encodeURIComponent(selected.uid)}`} className="text-center text-sm font-medium text-accent-text">Open user 360 ↗</Link>
            </div>
          </>}
        </Panel>
      </div>
    </DesignPage>
  );
}
