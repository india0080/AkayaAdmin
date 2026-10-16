"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { callAdmin, type AdminApiError } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Badge,
  Button,
  ConfirmAction,
  DataTable,
  Drawer,
  Notice,
  PageHeader,
  PlanBadge,
  StatusPill,
  Tabs,
  relativeTime,
  useToast,
  type Column,
} from "@/ui";
import { ledgerStatus } from "./logic";
import { ledgerTypeLabel } from "./recurringLogic";
import { formatByCurrency, formatLedgerAmount } from "../pricing/logic";
import type { CurrencyTotals } from "./types";

function mergeTotals(a: Record<string, CurrencyTotals> | null, b?: Record<string, CurrencyTotals>): Record<string, CurrencyTotals> | null {
  if (!b) return a;
  const out: Record<string, CurrencyTotals> = { ...(a ?? {}) };
  for (const [c, t] of Object.entries(b)) {
    const p = out[c] ?? { captured: 0, refunded: 0, payments: 0, withoutAmount: 0 };
    out[c] = { captured: p.captured + t.captured, refunded: p.refunded + t.refunded, payments: p.payments + t.payments, withoutAmount: p.withoutAmount + t.withoutAmount };
  }
  return out;
}
import type { BillingSummary, LedgerRow } from "./types";

type View = "all" | "review" | "refunds";

export default function PaymentsPage() {
  const can = useCan();
  const toast = useToast();
  const summary = useCallable<BillingSummary>("adminBilling", { action: "summary" });
  const [view, setView] = useState<View>("all");
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LedgerRow | null>(null);
  const [confirm, setConfirm] = useState(false);
  const gen = useRef(0);
  const [pageTotals, setPageTotals] = useState<Record<string, CurrencyTotals> | null>(null);

  const load = useCallback(async (v: View, after?: string) => {
    const mine = after ? gen.current : ++gen.current;
    if (after) setLoadingMore(true);
    else {
      setLoading(true);
      setError(null);
    }
    try {
      const res = await callAdmin<{ rows: LedgerRow[]; nextCursor: string | null; pageTotalsByCurrency?: Record<string, CurrencyTotals> }>("adminBilling", { action: "payments", view: v, cursor: after, limit: 25 });
      if (mine !== gen.current) return;
      setRows((r) => (after ? [...r, ...res.rows] : res.rows));
      setCursor(res.nextCursor);
      setPageTotals((t) => (after ? mergeTotals(t, res.pageTotalsByCurrency) : res.pageTotalsByCurrency ?? null));
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
    void load(view);
  }, [view, load]);

  const cols: Column<LedgerRow>[] = [
    { id: "when", header: "When", width: "110px", cell: (r) => <span title={r.processedAt ? new Date(r.processedAt).toLocaleString() : ""}>{relativeTime(r.processedAt)}</span> },
    {
      id: "who",
      header: "Customer",
      cell: (r) => <span className="truncate text-sm">{r.email ?? (r.uid ? <span className="font-mono text-xs">{r.uid}</span> : "—")}</span>,
    },
    { id: "plan", header: "Plan", cell: (r) => (r.planId ? <span className="inline-flex items-center gap-1.5"><PlanBadge plan={r.planId} /><span className="text-xs text-fg-muted">{r.billing}</span></span> : "—") },
    { id: "type", header: "Type", hideOnNarrow: true, cell: (r) => (r.recurringKind ? <Badge tone={r.isIntro ? "info" : "success"}>{ledgerTypeLabel(r)}</Badge> : <span className="text-xs text-fg-muted">One-time</span>) },
    { id: "amount", header: "Amount", align: "right", cell: (r) => formatLedgerAmount(r.amount, r.currency) },
    { id: "refunded", header: "Refunded", align: "right", hideOnNarrow: true, cell: (r) => (r.refundedAmount ? formatLedgerAmount(r.refundedAmount, r.currency) : "—") },
    { id: "status", header: "Status", cell: (r) => <StatusPill status={ledgerStatus(r.status).tone} label={ledgerStatus(r.status).label} /> },
    {
      id: "via",
      header: "Activated by",
      hideOnNarrow: true,
      cell: (r) => (r.activatedVia === "webhook" ? <Badge tone="info">Webhook (recovered)</Badge> : r.activatedVia === "client" ? <Badge>App</Badge> : "—"),
    },
  ];

  const s = summary.data?.actual;
  return (
    <>
      <PageHeader
        title="Payments"
        actions={<Link href="/dashboard/payment-gateway"><Button>Manage gateways</Button></Link>}
        description="Verified payment ledger. Google Play receipts without settlement amounts remain unpriced."
      />
      {s && !s.hasLedger ? (
        <div className="mb-4">
          <Notice tone="info" title="The ledger starts when this release is deployed">
            Payments processed before it carry no amount and show as “Pre-ledger”. Revenue history before that date cannot be reconstructed from Firestore.
          </Notice>
        </div>
      ) : null}
      {summary.data?.counts.needsReview ? (
        <div className="mb-4">
          <Notice tone="warning" title={`${summary.data.counts.needsReview} payment${summary.data.counts.needsReview === 1 ? " needs" : "s need"} review`}>
            Refunds, and payments that could not be activated automatically, wait here for Finance.
          </Notice>
        </div>
      ) : null}

      {pageTotals && Object.keys(pageTotals).length > 0 ? (
        <p className="mb-2 text-xs text-fg-muted" data-testid="page-totals">
          Loaded rows, per currency (never added together): captured {formatByCurrency(pageTotals, "captured")} · refunded {formatByCurrency(pageTotals, "refunded")}
        </p>
      ) : null}
      <Tabs
        label="Payment view"
        value={view}
        onChange={(v) => setView(v as View)}
        tabs={[
          { id: "all", label: "All payments" },
          { id: "review", label: "Needs review", count: summary.data?.counts.needsReview ?? undefined },
          { id: "refunds", label: "Refunds" },
        ]}
      />
      <div id={`tabpanel-${view}`} role="tabpanel" aria-labelledby={`tab-${view}`} className="pt-4">
        <DataTable
          label="Payments"
          columns={cols}
          rows={rows}
          rowKey={(r) => r.paymentId}
          loading={loading && rows.length === 0}
          error={error}
          onRetry={() => void load(view)}
          onRowClick={setSelected}
          hasMore={!!cursor}
          onLoadMore={() => cursor && void load(view, cursor)}
          loadingMore={loadingMore}
          rowTone={(r) => (r.needsReview ? "warning" : null)}
          empty={{ title: view === "review" ? "Nothing needs review" : view === "refunds" ? "No refunds recorded" : "No payments recorded yet" }}
        />
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? formatLedgerAmount(selected.amount, selected.currency) + (selected.planId ? ` · ${selected.planId}` : "") : ""}
        subtitle={selected ? <StatusPill status={ledgerStatus(selected.status).tone} label={ledgerStatus(selected.status).label} /> : null}
        footer={
          selected?.needsReview && can("billing.reconcile") ? (
            <Button variant="primary" onClick={() => setConfirm(true)}>Mark reviewed</Button>
          ) : undefined
        }
      >
        {selected ? (
          <div className="space-y-4">
            {selected.problem ? <Notice tone="danger" title="Not activated automatically">{selected.problem}</Notice> : null}
            {selected.status === "refunded" || selected.status === "partially_refunded" ? (
              <Notice tone="warning">The plan was NOT revoked automatically. Decide whether this refund should end access, and change the plan from the customer&apos;s page if so.</Notice>
            ) : null}
            <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-sm">
              <dt className="text-fg-muted">Payment ID</dt><dd className="break-all font-mono text-xs">{selected.paymentId}</dd>
              <dt className="text-fg-muted">Order ID</dt><dd className="break-all font-mono text-xs">{selected.orderId ?? "—"}</dd>
              <dt className="text-fg-muted">Customer</dt>
              <dd>{selected.uid ? <Link className="text-accent-text hover:underline" href={`/dashboard/users/view?uid=${encodeURIComponent(selected.uid)}`}>{selected.email ?? selected.uid}</Link> : "—"}</dd>
              <dt className="text-fg-muted">Amount</dt><dd>{formatLedgerAmount(selected.amount, selected.currency, true)} ({selected.currency || "INR"})</dd>
              <dt className="text-fg-muted">Refunded</dt><dd>{selected.refundedAmount ? formatLedgerAmount(selected.refundedAmount, selected.currency, true) : "—"}</dd>
              <dt className="text-fg-muted">Type</dt><dd>{ledgerTypeLabel(selected)}{selected.subscriptionId ? <span className="ml-2 font-mono text-xs">{selected.subscriptionId}</span> : null}</dd>
              <dt className="text-fg-muted">Activated by</dt><dd>{selected.activatedVia ?? "—"}</dd>
              <dt className="text-fg-muted">Processed</dt><dd>{selected.processedAt ? new Date(selected.processedAt).toLocaleString() : "—"}</dd>
              {selected.reviewNote ? (<><dt className="text-fg-muted">Reviewed</dt><dd>{selected.reviewedBy}: “{selected.reviewNote}”</dd></>) : null}
            </dl>
          </div>
        ) : null}
      </Drawer>
      <ConfirmAction
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Mark payment reviewed"
        level="reason"
        confirmLabel="Mark reviewed"
        impact={<>Removes this payment from the review queue. Record what was decided (e.g. access kept, plan revoked, refunded manually).</>}
        onConfirm={async (reason) => {
          await callAdmin("adminBilling", { action: "markReviewed", paymentId: selected!.paymentId, reason });
          toast.success("Marked reviewed");
          setSelected(null);
          summary.reload();
          void load(view);
        }}
      />
    </>
  );
}
