"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { callAdmin, type AdminApiError } from "@/lib/api";
import { Badge, DataTable, Field, PlanBadge, Select, StatusPill, formatNumber, relativeTime, type Column } from "@/ui";
import { formatINR } from "./logic";
import { recurringStatus } from "./recurringLogic";

export interface RecurringRow {
  subscriptionId: string;
  uid: string;
  email: string | null;
  productId: string;
  state: string;
  status: string | null;
  currency: string;
  introAmount: number;
  regularAmount: number;
  paidCount: number;
  nextChargeAt: number | null;
  cancelAtCycleEnd: boolean;
  graceUntil: number | null;
  rzpPlanId: string | null;
  createdAt: number | null;
}

/// Auto-renewing subscriptions: status, next charge, cancel state. Read-only.
export function RecurringSubscriptionsList() {
  const router = useRouter();
  const [state, setState] = useState("");
  const [rows, setRows] = useState<RecurringRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gen = useRef(0);

  const load = useCallback(async (st: string, after?: string) => {
    const mine = after ? gen.current : ++gen.current;
    if (after) setLoadingMore(true);
    else { setLoading(true); setError(null); }
    try {
      const res = await callAdmin<{ rows: RecurringRow[]; counts: Record<string, number>; nextCursor: string | null }>("adminBilling", {
        action: "recurring", state: st || undefined, cursor: after, limit: 25,
      });
      if (mine !== gen.current) return;
      setRows((r) => (after ? [...r, ...res.rows] : res.rows));
      setCounts(res.counts);
      setCursor(res.nextCursor);
    } catch (e) {
      if (mine === gen.current) setError((e as AdminApiError).message);
    } finally {
      if (mine === gen.current) { setLoading(false); setLoadingMore(false); }
    }
  }, []);

  useEffect(() => { void load(state); }, [state, load]);

  const cols: Column<RecurringRow>[] = [
    { id: "user", header: "Subscriber", cell: (r) => <span className="truncate text-sm">{r.email ?? <span className="font-mono text-xs">{r.uid}</span>}</span> },
    { id: "plan", header: "Plan", cell: (r) => <PlanBadge plan={r.productId} /> },
    { id: "status", header: "Status", cell: (r) => <StatusPill status={recurringStatus(r.status, r.state).tone} label={recurringStatus(r.status, r.state).label} /> },
    { id: "amount", header: "Renews at", align: "right", cell: (r) => `${formatINR(r.regularAmount)} / mo` },
    { id: "intro", header: "Intro", hideOnNarrow: true, align: "right", cell: (r) => (r.paidCount === 0 && r.state !== "created" ? <Badge tone="info">{formatINR(r.introAmount)} first month</Badge> : "—") },
    {
      id: "next", header: "Next charge", align: "right",
      cell: (r) => (r.cancelAtCycleEnd ? <Badge tone="warning">Cancels at period end</Badge> : r.nextChargeAt && !["cancelled", "completed", "expired"].includes(r.state) ? <span title={new Date(r.nextChargeAt).toLocaleString()}>{relativeTime(r.nextChargeAt)}</span> : "—"),
    },
    { id: "paid", header: "Renewals", hideOnNarrow: true, align: "right", cell: (r) => formatNumber(r.paidCount) },
  ];

  const summary = ["active", "authenticated", "pending", "halted", "cancelled", "paused"].filter((k) => counts[k] !== undefined).map((k) => `${formatNumber(counts[k])} ${k}`).join(" · ");
  return (
    <div className="pt-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-fg-muted" data-testid="recurring-counts">{summary || "No auto-renewing subscriptions yet."}</p>
        <Field label="State" className="w-56">
          {(p) => (
            <Select {...p} value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">All states</option>
              {["active", "authenticated", "pending", "halted", "cancelled", "paused", "completed", "created"].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <DataTable
        label="Auto-renewing subscriptions"
        columns={cols}
        rows={rows}
        rowKey={(r) => r.subscriptionId}
        loading={loading && rows.length === 0}
        error={error}
        onRetry={() => void load(state)}
        onRowClick={(r) => router.push(`/dashboard/users/view?uid=${encodeURIComponent(r.uid)}`)}
        rowTone={(r) => (r.state === "halted" || r.state === "pending" ? "warning" : null)}
        hasMore={!!cursor}
        onLoadMore={() => cursor && void load(state, cursor)}
        loadingMore={loadingMore}
        empty={{ title: "No auto-renewing subscriptions in this view" }}
      />
    </div>
  );
}
