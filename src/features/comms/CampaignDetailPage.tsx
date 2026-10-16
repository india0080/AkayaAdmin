"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Badge,
  Button,
  DataTable,
  ErrorState,
  Notice,
  PageHeader,
  Panel,
  Skeleton,
  Stat,
  StatStrip,
  StatusPill,
  formatNumber,
  relativeTime,
  type Column,
} from "@/ui";
import { deliveryLabel, type HistoryRow } from "./logic";

/* ---------- types ---------- */

interface DeliveryAttempt {
  recipient: string;
  status: "delivered" | "failed" | "pending";
  timestamp: number | null;
  error?: string | null;
}

interface CampaignDetail extends HistoryRow {
  audienceCount: number | null;
  attempts: DeliveryAttempt[];
}

/* ---------- helpers ---------- */

function statusFor(state: HistoryRow["state"]) {
  if (state === "delivered") return "ok" as const;
  if (state === "partial" || state === "topic") return "degraded" as const;
  if (state === "queued") return "pending" as const;
  if (state === "no-audience") return "off" as const;
  return "down" as const;
}
const attemptCols: Column<DeliveryAttempt>[] = [
  { id: "r", header: "Recipient", cell: (r) => <span className="font-mono text-xs">{r.recipient}</span> },
  {
    id: "s",
    header: "Status",
    cell: (r) => (
      <StatusPill
        status={r.status === "delivered" ? "ok" : r.status === "pending" ? "pending" : "down"}
        label={r.status}
      />
    ),
  },
  { id: "e", header: "Error", hideOnNarrow: true, cell: (r) => r.error ?? "—" },
  { id: "t", header: "Time", align: "right", cell: (r) => relativeTime(r.timestamp) },
];

/* ---------- component ---------- */

export default function CampaignDetailPage() {
  const can = useCan();
  const id = useSearchParams().get("id");

  const q = useCallable<{ campaign: CampaignDetail }>(
    "adminComms",
    id ? { action: "campaignDetail", campaignId: id } : null,
  );

  if (!can("comms.send")) {
    return <ErrorState message="You do not have permission to view campaign details." />;
  }

  if (!id) {
    return <ErrorState message="No campaign ID provided." />;
  }

  if (q.loading && !q.data) {
    return <Skeleton className="h-96" />;
  }

  if (q.error && !q.data) {
    return <ErrorState message={q.error.message} onRetry={q.reload} />;
  }

  const c = q.data?.campaign;
  if (!c) return <ErrorState message="Campaign not found." />;

  const failed = (c.attempted ?? 0) - (c.delivered ?? 0);

  return (
    <>
      <PageHeader
        title={c.title}
        meta={<StatusPill status={statusFor(c.state)} label={deliveryLabel(c)} />}
        actions={
          <Link href="/dashboard/notifications">
            <Button variant="secondary">Back to Notifications</Button>
          </Link>
        }
      />
      <div className="space-y-4">
        <StatStrip>
          <Stat label="Total sent" value={formatNumber(c.attempted ?? 0)} />
          <Stat label="Delivered" value={formatNumber(c.delivered ?? 0)} tone={c.delivered ? "success" : "default"} />
          <Stat label="Failed" value={formatNumber(failed)} tone={failed > 0 ? "danger" : "default"} />
          <Stat label="Audience" value={formatNumber(c.audienceCount ?? 0)} />
        </StatStrip>

        {c.error ? (
          <Notice tone="danger" title="Delivery error">
            {c.error}
          </Notice>
        ) : null}

        <Panel title="Content">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-muted">Title</dt>
              <dd className="font-medium text-fg">{c.title}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Body</dt>
              <dd className="text-fg">{c.body}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Sent at</dt>
              <dd className="text-fg">{relativeTime(c.at)}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Sent by</dt>
              <dd className="text-fg">{c.sentByEmail ?? "(legacy console)"}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Audience">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-muted">Target</dt>
              <dd>{c.target === "user" ? <span className="font-mono text-xs">{c.targetUid}</span> : <Badge>{c.target}</Badge>}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Audience size</dt>
              <dd className="text-fg">{formatNumber(c.audienceCount ?? 0)} device(s)</dd>
            </div>
          </dl>
        </Panel>

        {c.attempts.length > 0 ? (
          <Panel title="Delivery Report" flush>
            <DataTable
              label="Delivery attempts"
              columns={attemptCols}
              rows={c.attempts}
              rowKey={(r) => r.recipient + r.timestamp}
              empty={{ title: "No delivery attempts recorded" }}
            />
          </Panel>
        ) : null}
      </div>
    </>
  );
}

