"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Timestamp } from "firebase/firestore";
import { usePaginatedCollection } from "@/hooks/usePaginatedCollection";
import { callAdmin } from "@/lib/api";
import { countDocs } from "@/lib/paginate";
import { useCan } from "@/lib/session";
import { Badge, Button, ConfirmAction, DataTable, Notice, PageHeader, Stat, StatStrip, Tabs, relativeTime, useToast, type Column } from "@/ui";

type Status = "pending" | "reviewed" | "dismissed" | "warned" | "suspended";
type Filter = Status | "all";

interface Report {
  id: string;
  userId: string;
  message: string;
  reason: string;
  status: Status;
  createdAt: number | null;
  reviewedBy: string | null;
  version: number;
}

export default function ModerationPage() {
  const can = useCan();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("pending");
  const [change, setChange] = useState<{ r: Report; status: Status } | null>(null);

  const list = usePaginatedCollection<Report>(
    { path: "moderation", orderByField: "createdAt", filter: filter === "all" ? undefined : { field: "status", op: "==", value: filter } },
    (d) => {
      const x = d.data();
      return {
        id: d.id,
        userId: typeof x.userId === "string" ? x.userId : "—",
        message: typeof x.message === "string" ? x.message : "",
        reason: typeof x.reason === "string" ? x.reason : "Flagged",
        status: ["reviewed", "dismissed", "warned", "suspended"].includes(x.status) ? x.status : "pending",
        version: x.version ?? 0,
        createdAt: x.createdAt instanceof Timestamp ? x.createdAt.toMillis() : null,
        reviewedBy: typeof x.reviewedBy === "string" ? x.reviewedBy : null,
      };
    },
  );

  const [stats, setStats] = useState<Record<"total" | "pending" | "reviewed" | "dismissed", number | null>>({ total: null, pending: null, reviewed: null, dismissed: null });
  const refresh = useCallback(async () => {
    try {
      const [total, pending, reviewed, dismissed] = await Promise.all([
        countDocs("moderation"),
        countDocs("moderation", { field: "status", op: "==", value: "pending" }),
        countDocs("moderation", { field: "status", op: "==", value: "reviewed" }),
        countDocs("moderation", { field: "status", op: "==", value: "dismissed" }),
      ]);
      setStats({ total, pending, reviewed, dismissed });
    } catch {
      /* tiles show … */
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const canModerate = can("moderation.modify");
  const cols: Column<Report>[] = [
    { id: "m", header: "Reported message", cell: (r) => <Link href={`/dashboard/moderation/view?id=${encodeURIComponent(r.id)}`} className="line-clamp-2 max-w-xl text-sm text-accent hover:underline">{r.message || "—"}</Link> },
    { id: "why", header: "Reason", cell: (r) => r.reason },
    { id: "u", header: "Reporter (claimed)", hideOnNarrow: true, cell: (r) => <span className="font-mono text-xs">{r.userId}</span> },
    { id: "s", header: "Status", cell: (r) => <Badge tone={r.status === "pending" ? "warning" : r.status === "reviewed" ? "success" : "neutral"}>{r.status}</Badge> },
    { id: "by", header: "Reviewed by", hideOnNarrow: true, cell: (r) => r.reviewedBy ?? "—" },
    { id: "at", header: "Reported", align: "right", cell: (r) => relativeTime(r.createdAt) },
    {
      id: "x", header: "", align: "right",
      cell: (r) =>
        canModerate ? (
          <div className="flex justify-end gap-1">
            {r.status !== "reviewed" ? <Button size="sm" variant="secondary" onClick={() => setChange({ r, status: "reviewed" })}>Reviewed</Button> : null}
            {r.status !== "dismissed" ? <Button size="sm" variant="ghost" onClick={() => setChange({ r, status: "dismissed" })}>Dismiss</Button> : null}
            {r.status !== "pending" ? <Button size="sm" variant="ghost" onClick={() => setChange({ r, status: "pending" })}>Reopen</Button> : null}
          </div>
        ) : null,
    },
  ];

  const n = (v: number | null) => (v === null ? "…" : v.toLocaleString("en-IN"));
  return (
    <>
      <PageHeader title="Moderation" description="Messages users reported from the app. Each decision records the reviewer." />
      <StatStrip className="mb-4">
        <Stat label="Pending" value={n(stats.pending)} tone={stats.pending ? "warning" : "default"} />
        <Stat label="Reviewed" value={n(stats.reviewed)} />
        <Stat label="Dismissed" value={n(stats.dismissed)} />
        <Stat label="All reports" value={n(stats.total)} />
      </StatStrip>
      <div className="mb-3">
        <Notice tone="info">New app reports verify the reporter on the server. AI-content and legacy reports have no verified human subject; account actions are blocked for them.</Notice>
      </div>
      <div className="mb-3">
        <Tabs label="Status" value={filter} onChange={(v) => setFilter(v as Filter)}
          tabs={[{ id: "pending", label: "Pending" }, { id: "reviewed", label: "Reviewed" }, { id: "dismissed", label: "Dismissed" }, { id: "warned", label: "Warned" }, { id: "suspended", label: "Suspended" }, { id: "all", label: "All" }]} />
      </div>
      <DataTable label="Reports" columns={cols} rows={list.items} rowKey={(r) => r.id} loading={list.loading} error={list.error} onRetry={list.reload}
        hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={list.loadMore} empty={{ title: filter === "pending" ? "No reports waiting" : "No reports" }} />
      <ConfirmAction
        open={!!change}
        onClose={() => setChange(null)}
        title={change ? `Mark report ${change.status}` : ""}
        level="confirm"
        confirmLabel="Save"
        impact={<>Recorded with your name in the audit log.</>}
        onConfirm={async (reason) => {
          if (!change) return;
          await callAdmin("adminSupport", { action: "moderate", id: change.r.id, status: change.status, version: change.r.version, reason: reason || undefined });
          toast.success("Report updated", change.status);
          list.reload();
          void refresh();
        }}
      />
    </>
  );
}
