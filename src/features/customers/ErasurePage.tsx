"use client";

import { useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCallable } from "@/lib/useCallable";
import { Badge, Button, ConfirmAction, DataTable, Notice, PageHeader, StatusPill, relativeTime, useToast, type Column } from "@/ui";

interface ErasureRow {
  uid: string;
  failedSteps: string[];
  attemptedAt: number | null;
  resolved: boolean;
  resolvedAt: number | null;
}

export default function ErasurePage() {
  const toast = useToast();
  const q = useCallable<{ rows: ErasureRow[]; truncated: boolean }>("adminUser", { action: "erasures" });
  const [retry, setRetry] = useState<ErasureRow | null>(null);
  const rows = q.data?.rows ?? [];
  const open = rows.filter((r) => !r.resolved).length;

  const cols: Column<ErasureRow>[] = [
    { id: "uid", header: "Deleted account (uid)", cell: (r) => <span className="font-mono text-xs">{r.uid}</span> },
    {
      id: "steps",
      header: "Failed steps",
      cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.failedSteps.map((s) => (
            <Badge key={s} tone={r.resolved ? "neutral" : "danger"}>{s}</Badge>
          ))}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (r.resolved ? <StatusPill status="ok" label="Completed" /> : <StatusPill status="down" label="Incomplete" />),
    },
    { id: "when", header: "Attempted", align: "right", cell: (r) => relativeTime(r.attemptedAt) },
    {
      id: "act",
      header: "",
      align: "right",
      cell: (r) =>
        r.resolved ? null : (
          <Button size="sm" onClick={(e) => { e.stopPropagation(); setRetry(r); }}>
            Retry erasure
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Account Erasure"
        description="Accounts whose data deletion did not fully complete when the user deleted their account. Each retry re-runs every deletion step; steps that already succeeded are harmless to repeat."
        actions={<Button icon="refresh" onClick={q.reload} loading={q.refreshing}>Refresh</Button>}
      />
      {open > 0 ? (
        <div className="mb-4">
          <Notice tone="warning" title={`${open} incomplete erasure${open === 1 ? "" : "s"}`}>
            Personal data may still exist for these deleted accounts. Retry, and escalate any step that keeps failing.
          </Notice>
        </div>
      ) : null}
      <DataTable
        label="Erasure queue"
        columns={cols}
        rows={rows}
        rowKey={(r) => r.uid}
        loading={q.loading}
        error={q.error?.message ?? null}
        onRetry={q.reload}
        rowTone={(r) => (r.resolved ? null : "danger")}
        empty={{ title: "Every account deletion completed", body: "Nothing to retry." }}
      />
      <ConfirmAction
        open={!!retry}
        onClose={() => setRetry(null)}
        title="Retry account erasure"
        level="reason"
        danger
        confirmLabel="Retry erasure"
        impact={<>Deletes any remaining data for the already-deleted account <span className="font-mono">{retry?.uid}</span>. This cannot be undone. It refuses to run if the account still exists.</>}
        onConfirm={async (reason) => {
          const res = await callAdmin<{ success: boolean; failures: string[] }>("adminRetryErasure", { uid: retry!.uid, reason });
          if (res.success) toast.success("Erasure completed");
          else toast.error("Erasure still incomplete", `Failed: ${res.failures.join(", ")}`);
          q.reload();
        }}
      />
    </>
  );
}
