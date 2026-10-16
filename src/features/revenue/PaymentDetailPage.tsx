"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { callAdmin, type AdminApiError } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Button,
  ErrorState,
  Notice,
  PageHeader,
  Panel,
  PlanBadge,
  Skeleton,
  Stat,
  StatStrip,
  StatusPill,
  Textarea,
  relativeTime,
  useToast,
} from "@/ui";
import { ledgerStatus } from "./logic";
import { formatLedgerAmount } from "../pricing/logic";
import type { LedgerRow } from "./types";

export default function PaymentDetailPage() {
  const id = useSearchParams().get("id");
  const can = useCan();
  const toast = useToast();
  const q = useCallable<{ payment: LedgerRow }>(
    "adminBilling",
    id ? { action: "paymentDetail", paymentId: id } : null,
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  if (!id) return <ErrorState title="No payment ID" message="Add ?id=… to the URL." />;
  if (q.loading && !q.data) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full" /></div>;
  if (q.error) return <ErrorState title="Could not load payment" message={q.error.message} onRetry={q.reload} />;

  const p = q.data?.payment;
  if (!p) return <ErrorState title="Payment not found" message="No payment matched this ID." />;

  const st = ledgerStatus(p.status);
  const paymentId = p.paymentId;

  async function markReviewed() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await callAdmin("adminBilling", { action: "markReviewed", paymentId, reason: note.trim() });
      toast.success("Marked reviewed");
      q.reload();
      setNote("");
    } catch (e) {
      toast.error((e as AdminApiError).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title={`Payment ${p.paymentId}`}
        meta={<StatusPill status={st.tone} label={st.label} />}
        actions={
          <Link href="/dashboard/payments">
            <Button variant="ghost" icon="arrow-left">Back to Payments</Button>
          </Link>
        }
      />

      {/* -- KPI strip -- */}
      <StatStrip className="mb-5">
        <Stat label="Amount" value={formatLedgerAmount(p.amount, p.currency)} />
        <Stat label="Plan" value={p.planId ? <PlanBadge plan={p.planId} /> : "—"} />
        <Stat label="Billing" value={p.billing ?? "—"} />
        <Stat label="Refunded" value={p.refundedAmount ? formatLedgerAmount(p.refundedAmount, p.currency) : "—"} tone={p.refundedAmount ? "warning" : undefined} />
      </StatStrip>

      {/* -- Alerts -- */}
      {p.problem ? (
        <div className="mb-4">
          <Notice tone="warning" title="Problem detected">{p.problem}</Notice>
        </div>
      ) : null}

      {p.refundedAmount && p.refundedAmount > 0 ? (
        <div className="mb-4">
          <Notice tone="info" title="Refund recorded">
            {formatLedgerAmount(p.refundedAmount, p.currency)} was refunded. The plan was NOT revoked automatically — check the subscriber page if access should end.
          </Notice>
        </div>
      ) : null}

      {/* -- Detail panels -- */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Payment Details">
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-fg-muted">Payment ID</dt>
            <dd className="break-all font-mono text-xs">{p.paymentId}</dd>
            <dt className="text-fg-muted">Order ID</dt>
            <dd className="break-all font-mono text-xs">{p.orderId ?? "—"}</dd>
            <dt className="text-fg-muted">Status</dt>
            <dd><StatusPill status={st.tone} label={st.label} /></dd>
            <dt className="text-fg-muted">Processed</dt>
            <dd>{p.processedAt ? <span title={new Date(p.processedAt).toLocaleString()}>{relativeTime(p.processedAt)}</span> : "—"}</dd>
            <dt className="text-fg-muted">Activated by</dt>
            <dd>{p.activatedVia ?? "—"}</dd>
            <dt className="text-fg-muted">Currency</dt>
            <dd>{p.currency}</dd>
          </dl>
        </Panel>

        <Panel title="Subscriber">
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-fg-muted">UID</dt>
            <dd>
              {p.uid ? (
                <Link className="text-accent-text hover:underline font-mono text-xs" href={`/dashboard/users/view?uid=${encodeURIComponent(p.uid)}`}>
                  {p.uid}
                </Link>
              ) : "—"}
            </dd>
            <dt className="text-fg-muted">Email</dt>
            <dd>{p.email ?? "—"}</dd>
            <dt className="text-fg-muted">Plan</dt>
            <dd>{p.planId ? <PlanBadge plan={p.planId} /> : "—"}</dd>
          </dl>
        </Panel>
      </div>

      {/* -- Review section -- */}
      {p.needsReview && can("billing.reconcile") ? (
        <div className="mt-5">
          <Notice tone="danger" title="This payment needs review" action={
            <Button variant="primary" size="sm" loading={saving} disabled={!note.trim()} onClick={markReviewed}>
              Mark Reviewed
            </Button>
          }>
            <div className="mt-2">
              <Textarea placeholder="What was decided? (e.g. access kept, plan revoked)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </Notice>
        </div>
      ) : p.reviewNote ? (
        <div className="mt-5">
          <Notice tone="success" title="Reviewed">
            {p.reviewedBy}: &quot;{p.reviewNote}&quot;
          </Notice>
        </div>
      ) : null}
    </>
  );
}
