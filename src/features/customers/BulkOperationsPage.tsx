"use client";

import { useRef, useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCallable } from "@/lib/useCallable";
import { useCan } from "@/lib/session";
import {
  Badge, Button, ConfirmAction, DataTable, Field, Notice, PageHeader,
  Panel, Select, Stat, StatStrip, Textarea, TextInput, useToast,
  type Column,
} from "@/ui";

interface HistoryRow {
  id: string;
  type: string;
  count: number;
  status: "completed" | "failed" | "partial";
  executedBy: string;
  executedAt: number;
  reason: string;
}

export default function BulkOperationsPage() {
  const toast = useToast();
  const can = useCan();

  // --- Plan Changes state ---
  const [targetPlan, setTargetPlan] = useState("");
  const [planUids, setPlanUids] = useState("");
  const [confirmPlan, setConfirmPlan] = useState(false);

  // --- Grant Tokens state ---
  const [tokenAmount, setTokenAmount] = useState("");
  const [tokenUids, setTokenUids] = useState("");
  const [confirmTokens, setConfirmTokens] = useState(false);
  const tokenRequestId = useRef<string | null>(null);

  // --- Operation History ---
  const history = useCallable<{ rows: HistoryRow[] }>("adminUser", { action: "bulkHistory" });
  const historyRows = history.data?.rows ?? [];

  const parseUids = (raw: string) =>
    [...new Set(raw.split(/[\n,;\s]+/).map((s) => s.trim()).filter(Boolean))];

  const planCount = parseUids(planUids).length;
  const tokenCount = parseUids(tokenUids).length;

  const historyCols: Column<HistoryRow>[] = [
    { id: "type", header: "Operation", cell: (r) => r.type },
    { id: "count", header: "Affected", align: "right", cell: (r) => r.count.toLocaleString("en-IN") },
    {
      id: "status", header: "Status",
      cell: (r) => (
        <Badge tone={r.status === "completed" ? "success" : r.status === "failed" ? "danger" : "warning"}>
          {r.status}
        </Badge>
      ),
    },
    { id: "by", header: "Executed by", cell: (r) => r.executedBy },
    { id: "reason", header: "Reason", hideOnNarrow: true, cell: (r) => <span className="line-clamp-1 text-sm">{r.reason}</span> },
    {
      id: "at", header: "When", align: "right",
      cell: (r) => (r.executedAt ? new Date(r.executedAt).toLocaleString() : "—"),
    },
  ];

  return (
    <>
      <PageHeader
        title="Bulk Operations"
        description="Batch user management — plan changes, token grants, and operation history."
      />
      <div className="mb-4">
        <Notice tone="warning" title="Irreversible actions">
          Bulk operations apply changes to many users at once. Review carefully before executing —
          these changes cannot be undone automatically.
        </Notice>
      </div>
      <div className="space-y-6">
        <Panel title="Plan Changes" description="Move a batch of users to a different subscription plan">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Target plan">
              {(p) => (
                <Select {...p} value={targetPlan} onChange={(e) => setTargetPlan(e.target.value)}>
                  <option value="">Select a plan...</option>
                  <option value="free">Free</option>
                  <option value="silver">Silver</option>
                  <option value="gold">Gold</option>
                </Select>
              )}
            </Field>
            <Field label={`User IDs (${planCount} entered)`} hint="Paste UIDs separated by newlines, commas, or spaces">
              {(p) => <Textarea {...p} value={planUids} onChange={(e) => setPlanUids(e.target.value)} rows={4} placeholder="uid1, uid2, uid3..." />}
            </Field>
          </div>
          <div className="mt-4">
            <Button
              variant="primary"
              disabled={!targetPlan || planCount === 0}
              onClick={() => setConfirmPlan(true)}
            >
              Preview &amp; execute plan change
            </Button>
          </div>
        </Panel>

        <Panel title="Grant Tokens" description="Bulk grant tokens to a list of users">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Token amount">
              {(p) => <TextInput {...p} value={tokenAmount} onChange={(e) => setTokenAmount(e.target.value)} type="number" placeholder="e.g. 500" />}
            </Field>
            <Field label={`User IDs (${tokenCount} entered)`} hint="Paste UIDs separated by newlines, commas, or spaces">
              {(p) => <Textarea {...p} value={tokenUids} onChange={(e) => setTokenUids(e.target.value)} rows={4} placeholder="uid1, uid2, uid3..." />}
            </Field>
          </div>
          <div className="mt-4">
            <Button
              variant="primary"
              disabled={!can("billing.grant") || !tokenAmount || tokenCount === 0}
              onClick={() => setConfirmTokens(true)}
            >
              Preview &amp; grant tokens
            </Button>
          </div>
        </Panel>

        <Panel title="Operation History" description="Log of past bulk operations" flush>
          <DataTable
            label="Bulk operation history"
            columns={historyCols}
            rows={historyRows}
            rowKey={(r) => r.id}
            loading={history.loading}
            error={history.error?.message ?? null}
            onRetry={history.reload}
            empty={{ title: "No bulk operations yet", body: "Completed operations will appear here." }}
          />
        </Panel>
      </div>

      <ConfirmAction
        open={confirmPlan}
        onClose={() => setConfirmPlan(false)}
        title="Execute bulk plan change"
        level="reason"
        danger
        confirmLabel={`Change ${planCount} user${planCount === 1 ? "" : "s"} to ${targetPlan}`}
        impact={<>This will change the subscription plan for <strong>{planCount}</strong> user{planCount === 1 ? "" : "s"} to <strong>{targetPlan}</strong>. This change is irreversible without individual corrections.</>}
        onConfirm={async (reason) => {
          await callAdmin("adminUser", { action: "bulkPlanChange", plan: targetPlan, uids: parseUids(planUids), reason });
          toast.success("Plan change submitted", `${planCount} users queued for plan change`);
          setPlanUids("");
          setTargetPlan("");
          history.reload();
        }}
      />
      <ConfirmAction
        open={confirmTokens}
        onClose={() => setConfirmTokens(false)}
        title="Execute bulk token grant"
        level="reason"
        danger
        confirmLabel={`Grant ${tokenAmount} tokens to ${tokenCount} user${tokenCount === 1 ? "" : "s"}`}
        impact={<>This will grant <strong>{tokenAmount}</strong> tokens to <strong>{tokenCount}</strong> user{tokenCount === 1 ? "" : "s"}. Granted tokens cannot be reclaimed.</>}
        onConfirm={async (reason) => {
          tokenRequestId.current ??= crypto.randomUUID();
          const result = await callAdmin<{ ok: number; failed: number; failedUids: string[] }>("adminUser", { action: "bulkGrantTokens", amount: Number(tokenAmount), uids: parseUids(tokenUids), reason, requestId: tokenRequestId.current });
          if (result.failed) {
            toast.error("Some grants failed", `${result.ok} succeeded; ${result.failed} failed. The remaining IDs can be retried safely.`);
            setTokenUids(result.failedUids.join("\n"));
          } else {
            toast.success("Tokens granted", `${result.ok} users credited`);
            setTokenUids("");
            setTokenAmount("");
            tokenRequestId.current = null;
          }
          history.reload();
        }}
      />
    </>
  );
}
