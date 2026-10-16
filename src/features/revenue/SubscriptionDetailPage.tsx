"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Badge, Button, DataTable, EmptyState, ErrorState, Icon, PageHeader, Panel,
  PlanBadge, Skeleton, Stat, StatStrip, StatusPill, relativeTime, type Column,
} from "@/ui";
import { daysLeft } from "@/features/customers/logic";
import { ledgerStatus } from "./logic";
import { formatLedgerAmount, formatTotals, sumByCurrency } from "../pricing/logic";
import type { LedgerRow } from "./types";

interface Sub360 {
  uid: string;
  profile: { email: string | null; displayName: string | null };
  plan: { planId: string; active: boolean; expiresAt: number | null; source: string | null; billing: string | null };
  rawSubscription: {
    planId: string | null; isActive: boolean | null; startedAt: number | null;
    expiresAt: number | null; expiredAt: number | null; source: string | null;
    billing: string | null; paymentId: string | null;
  } | null;
  adminHistory: { id: string; at: number | null; action: string; actorEmail: string; reason: string; changes: { field: string; from: string; to: string }[] }[];
}

const fmtDate = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function SubscriptionDetailPage() {
  const uid = useSearchParams().get("uid") ?? "";
  const can = useCan();
  const q = useCallable<Sub360>("adminUser", uid ? { action: "get360", uid } : null);
  const payments = useCallable<{ rows: LedgerRow[]; nextCursor: string | null }>("adminBilling", uid ? { action: "payments", view: "all" } : null);

  if (!uid) return <EmptyState title="No subscriber selected" action={<Link href="/dashboard/subscriptions" className="text-accent-text underline">Open Subscriptions</Link>} />;
  if (!can("billing.read")) return <ErrorState title="Access denied" message="You do not have permission to view subscription details." />;
  if (q.error && !q.data) return (<><BackLink /><ErrorState title={q.error.kind === "not-found" ? "Subscriber not found" : "Could not load subscriber"} message={q.error.message} onRetry={q.reload} /></>);

  const v = q.data;
  const sub = v?.rawSubscription ?? null;
  const d = v ? daysLeft(v.plan.expiresAt) : null;
  const userPayments = payments.data?.rows.filter((r) => r.uid === uid) ?? [];
  const grantHistory = v?.adminHistory.filter((h) => h.action === "setPlan" || h.action === "grantTokens") ?? [];

  return (
    <>
      <BackLink />
      <PageHeader
        title={v ? v.profile.displayName || v.profile.email || "Unnamed subscriber" : "Loading…"}
        description={v?.profile.email ?? uid}
        meta={v ? <><PlanBadge plan={v.plan.planId} /><StatusPill status={v.plan.active ? "ok" : "off"} label={v.plan.active ? "Active" : "Lapsed"} /></> : null}
        actions={<Link href={`/dashboard/users/view?uid=${encodeURIComponent(uid)}`}><Button variant="secondary" icon="external-link">View Full Account</Button></Link>}
      />
      {!v ? (
        <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-48 w-full" /></div>
      ) : (
        <>
          <StatStrip className="mb-4">
            <Stat label="Current plan" value={<span className="capitalize">{v.plan.planId}</span>} />
            <Stat label="Billing cycle" value={sub?.billing ?? "—"} />
            <Stat label="Days remaining" value={d !== null ? `${d}` : "—"} tone={d !== null && d <= 3 ? "warning" : "default"} />
            <Stat label="Total paid" value={userPayments.length ? formatTotals(sumByCurrency(userPayments.filter((p) => p.status === "captured"))) : "—"} hint={userPayments.length ? `${userPayments.filter((p) => p.status === "captured").length} payment(s)` : undefined} />
          </StatStrip>
          <SubPanel sub={sub} plan={v.plan} />
          <PaymentsPanel rows={userPayments} loading={payments.loading} error={payments.error?.message ?? null} onRetry={payments.reload} />
          <GrantPanel rows={grantHistory} />
        </>
      )}
    </>
  );
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function BackLink() {
  return <Link href="/dashboard/subscriptions" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><Icon name="chevron-left" size={16} /> Subscriptions</Link>;
}

function R({ l, children }: { l: string; children: React.ReactNode }) {
  return <><dt className="text-fg-muted">{l}</dt><dd className="min-w-0 break-words">{children}</dd></>;
}

function SubPanel({ sub, plan }: { sub: Sub360["rawSubscription"]; plan: Sub360["plan"] }) {
  if (!sub) return <Panel title="Current Subscription" className="mb-4"><p className="text-sm text-fg-muted">No subscription record. This user is on the Free plan.</p></Panel>;
  return (
    <Panel title="Current Subscription" className="mb-4">
      <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm sm:grid-cols-[120px_1fr_120px_1fr]">
        <R l="Plan"><PlanBadge plan={sub.planId ?? "free"} /></R>
        <R l="Status"><StatusPill status={plan.active ? "ok" : "off"} label={plan.active ? "Active" : "Lapsed"} /></R>
        <R l="Started">{fmtDate(sub.startedAt)}</R>
        <R l="Expires">{fmtDate(sub.expiresAt)}</R>
        <R l="Source">{sub.source === "admin" ? <Badge tone="info">Admin grant</Badge> : sub.source === "razorpay" ? <Badge>Razorpay</Badge> : (sub.source ?? "—")}</R>
        <R l="Billing">{sub.billing ?? "—"}</R>
        {sub.paymentId ? <R l="Payment ID"><span className="font-mono text-xs">{sub.paymentId}</span></R> : null}
        {sub.expiredAt ? <R l="Lapsed">{fmtDate(sub.expiredAt)}</R> : null}
      </dl>
    </Panel>
  );
}

const PAY_COLS: Column<LedgerRow>[] = [
  { id: "date", header: "Date", cell: (r) => relativeTime(r.processedAt) },
  { id: "amount", header: "Amount", align: "right", cell: (r) => (r.amount !== null ? formatLedgerAmount(r.amount, r.currency) : "—") },
  { id: "plan", header: "Plan", cell: (r) => <span className="inline-flex items-center gap-1.5"><PlanBadge plan={r.planId ?? "free"} /><span className="text-xs text-fg-muted">{r.billing ?? ""}</span></span> },
  { id: "status", header: "Status", cell: (r) => { const s = ledgerStatus(r.status); return <StatusPill status={s.tone} label={s.label} />; } },
  { id: "paymentId", header: "Payment ID", hideOnNarrow: true, cell: (r) => <span className="font-mono text-xs text-fg-muted">{r.paymentId}</span> },
];

function PaymentsPanel({ rows, loading, error, onRetry }: { rows: LedgerRow[]; loading: boolean; error: string | null; onRetry: () => void }) {
  return (
    <Panel title="Payment History" className="mb-4">
      <DataTable label="Payments from this subscriber" columns={PAY_COLS} rows={rows} rowKey={(r) => r.paymentId} loading={loading} error={error} onRetry={onRetry} empty={{ title: "No payments recorded for this subscriber" }} />
    </Panel>
  );
}

function GrantPanel({ rows }: { rows: Sub360["adminHistory"] }) {
  if (!rows.length) return <Panel title="Plan Change History"><p className="text-sm text-fg-muted">No admin plan changes recorded.</p></Panel>;
  return (
    <Panel title="Plan Change History">
      <ol className="space-y-3">
        {rows.map((h) => (
          <li key={h.id} className="rounded-lg border border-line bg-panel p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">{h.action === "setPlan" ? "Plan changed" : "Tokens granted"} <span className="font-normal text-fg-muted">by {h.actorEmail || "unknown"}</span></p>
              <span className="text-xs text-fg-subtle" title={fmtDate(h.at)}>{relativeTime(h.at)}</span>
            </div>
            {h.changes.length > 0 ? <p className="mt-1 font-mono text-xs text-fg-muted">{h.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join(" · ")}</p> : null}
            {h.reason ? <p className="mt-1 text-sm text-fg-muted">&ldquo;{h.reason}&rdquo;</p> : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}
