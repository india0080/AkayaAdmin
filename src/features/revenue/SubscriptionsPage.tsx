"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { callAdmin, type AdminApiError } from "@/lib/api";
import { useCallable } from "@/lib/useCallable";
import { Badge, DataTable, Field, PageHeader, PlanBadge, Select, Stat, StatStrip, Tabs, formatNumber, relativeTime, type Column } from "@/ui";
import { daysLeft } from "@/features/customers/logic";
import type { BillingSummary } from "./types";
import { SubscriptionPanels } from "./SubscriptionPanels";
import { PLAN_FILTER_OPTIONS } from "./subscriptionLogic";
import { RecurringSubscriptionsList } from "./RecurringSubscriptionsList";
import { recurringStatus } from "./recurringLogic";
import { SubscriptionAnalyticsPanel, SubscriptionReminders } from "./SubscriptionAnalyticsPanel";
import { SubscriptionCouponsPanel } from "./SubscriptionCouponsPanel";

interface SubRow {
  uid: string;
  name: string | null;
  email: string | null;
  planId: string | null;
  billing: string | null;
  source: string | null;
  startedAt: number | null;
  expiresAt: number | null;
  expiredAt: number | null;
  recurring?: { state: string | null; cancelAtCycleEnd: boolean; nextChargeAt: number | null; regularAmount: number | null } | null;
}

type View = "active" | "expiring" | "lapsed" | "recurring";

function paidHint(c: { activeSilver: number; activeGold: number; activeAppPremium?: number; activeFloatingPremium?: number; activeAllAccess?: number }): string {
  const parts = [`${formatNumber(c.activeSilver)} Silver`, `${formatNumber(c.activeGold)} Gold`];
  if (typeof c.activeAppPremium === "number") parts.push(`${formatNumber(c.activeAppPremium)} App Premium`);
  if (typeof c.activeFloatingPremium === "number") parts.push(`${formatNumber(c.activeFloatingPremium)} Floating`);
  if (typeof c.activeAllAccess === "number") parts.push(`${formatNumber(c.activeAllAccess)} All Access`);
  return parts.join(" · ");
}

export default function SubscriptionsPage() {
  const router = useRouter();
  const [section, setSection] = useState("sub-revenue");
  const summary = useCallable<BillingSummary>("adminBilling", section === "subscribers" ? { action: "summary" } : null);
  const [view, setView] = useState<View>("active");
  const [plan, setPlan] = useState("");
  const [rows, setRows] = useState<SubRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const load = useCallback(async (v: Exclude<View, "recurring">, p: string, after?: string) => {
    const mine = after ? gen.current : ++gen.current;
    if (after) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await callAdmin<{ rows: SubRow[]; nextCursor: string | null }>("adminBilling", {
        action: "subscriptions", view: v, plan: p || undefined, cursor: after, limit: 25,
      });
      if (mine !== gen.current) return;
      setRows((r) => (after ? [...r, ...res.rows] : res.rows));
      setCursor(res.nextCursor);
    } catch (e) {
      if (mine === gen.current) setError((e as AdminApiError).message);
    } finally {
      if (mine === gen.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    if (section === "subscribers" && view !== "recurring") void load(view, plan);
  }, [view, plan, load, section]);

  const c = summary.data?.counts;
  const cols: Column<SubRow>[] = [
    {
      id: "user",
      header: "Subscriber",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.name ?? <span className="text-fg-subtle">No name</span>}</p>
          <p className="truncate text-xs text-fg-muted">{r.email ?? r.uid}</p>
        </div>
      ),
    },
    {
      id: "plan",
      header: "Plan",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <PlanBadge plan={r.planId ?? "free"} />
          <span className="text-xs text-fg-muted">{r.billing ?? ""}</span>
        </span>
      ),
    },
    {
      id: "source",
      header: "Source",
      hideOnNarrow: true,
      cell: (r) => (r.source === "admin" ? <Badge tone="info">Admin grant</Badge> : r.source === "razorpay" ? <Badge>Razorpay</Badge> : r.source === "razorpay_subscription" ? <Badge tone="success">Auto-renew</Badge> : "—"),
    },
    {
      id: "renewal",
      header: "Renewal",
      hideOnNarrow: true,
      cell: (r) =>
        r.recurring?.state ? (
          <span className="text-xs text-fg-muted" title={r.recurring.nextChargeAt ? new Date(r.recurring.nextChargeAt).toLocaleString() : ""}>
            {r.recurring.cancelAtCycleEnd ? "Cancels at period end" : recurringStatus(r.recurring.state === "pending" ? "pending_payment" : r.recurring.state === "authenticated" ? "active" : r.recurring.state, r.recurring.state).label}
            {r.recurring.nextChargeAt && !r.recurring.cancelAtCycleEnd ? ` · next ${relativeTime(r.recurring.nextChargeAt)}` : ""}
          </span>
        ) : (
          "—"
        ),
    },
    view === "lapsed"
      ? { id: "lapsed", header: "Lapsed", align: "right", cell: (r) => relativeTime(r.expiredAt) }
      : {
          id: "expires",
          header: "Expires",
          align: "right",
          cell: (r) => {
            const d = daysLeft(r.expiresAt);
            return (
              <span className={d !== null && d <= 3 ? "font-medium text-warning" : ""} title={r.expiresAt ? new Date(r.expiresAt).toLocaleString() : ""}>
                {d === null ? "—" : `${d} day${d === 1 ? "" : "s"}`}
              </span>
            );
          },
        },
  ];

  return (
    <>
      <PageHeader title="Subscription Management" description="Manage plans, billing and renewals." actions={<SubscriptionReminders />} />
      <Tabs label="Subscription management" value={section} onChange={setSection} tabs={[{id:"sub-revenue",label:"Revenue Analytics"},{id:"sub-overview",label:"Overview"},{id:"subscribers",label:"Subscribers"},{id:"sub-coupons",label:"Coupons"}]} />
      <div id={`tabpanel-${section}`} role="tabpanel" aria-labelledby={`tab-${section}`} className="pt-6">
      {section === "sub-revenue" ? <SubscriptionAnalyticsPanel /> : section === "sub-overview" ? <SubscriptionPanels /> : section === "sub-coupons" ? <SubscriptionCouponsPanel/> : <>
      <StatStrip className="mb-4">
        <Stat label="Active paid" value={c ? formatNumber(c.activeTotal) : "—"} hint={c ? paidHint(c) : undefined} />
        <Stat label="Expiring in 7 days" value={c ? formatNumber(c.expiring7d) : "—"} tone={c && c.expiring7d > 0 ? "warning" : "default"} />
        <Stat label="Admin grants" value={c ? formatNumber(c.adminGranted) : "—"} hint="Active, no payment" />
      </StatStrip>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs
          label="Subscription view"
          value={view}
          onChange={(v) => setView(v as View)}
          tabs={[
            { id: "active", label: "Active" },
            { id: "expiring", label: "Expiring ≤ 7 days", count: c?.expiring7d },
            { id: "lapsed", label: "Lapsed" },
            { id: "recurring", label: "Auto-renewing" },
          ]}
        />
        {view === "recurring" ? null : (
          <Field label="Plan" className="mb-2 w-56">
            {(p) => (
              <Select {...p} value={plan} onChange={(e) => setPlan(e.target.value)}>
                <option value="">All plans</option>
                {PLAN_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>
      <div id={`tabpanel-${view}`} role="tabpanel" aria-labelledby={`tab-${view}`} className="pt-4">
        {view === "recurring" ? <RecurringSubscriptionsList /> : <DataTable
          label="Subscriptions"
          columns={cols}
          rows={rows}
          rowKey={(r) => r.uid}
          loading={loading && rows.length === 0}
          error={error}
          onRetry={() => void load(view, plan)}
          onRowClick={(r) => router.push(`/dashboard/users/view?uid=${encodeURIComponent(r.uid)}`)}
          hasMore={!!cursor}
          onLoadMore={() => cursor && void load(view, plan, cursor)}
          loadingMore={loadingMore}
          empty={{ title: view === "lapsed" ? "No lapsed subscriptions" : "No subscriptions in this view" }}
        />}
      </div>
      </>}
      </div>
    </>
  );
}
