"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Badge,
  Button,
  ConfirmAction,
  ErrorState,
  Notice,
  PageHeader,
  Panel,
  Skeleton,
  relativeTime,
  useToast,
} from "@/ui";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ActionEntry {
  action: string;
  by: string;
  reason: string | null;
  at: number | null;
}

interface CaseDetail {
  id: string;
  version: number;
  subjectType: string;
  status: "pending" | "reviewed" | "dismissed" | "warned" | "suspended";
  category: string;
  description: string;
  createdAt: number | null;
  reporter: { uid: string; displayName: string | null };
  reported: { uid: string; displayName: string | null };
  content: { text: string; context: string | null };
  history: ActionEntry[];
}

const STATUS_TONE: Record<string, "warning" | "success" | "danger" | "neutral"> = {
  pending: "warning",
  reviewed: "success",
  dismissed: "neutral",
  warned: "warning",
  suspended: "danger",
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmtDate = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function UserLink({ uid, name }: { uid: string; name: string | null }) {
  if (!uid) return <span className="text-fg-muted">No verified human subject</span>;
  return (
    <Link href={`/dashboard/users/view?uid=${encodeURIComponent(uid)}`} className="font-mono text-xs text-accent hover:underline">
      {name ?? uid}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

type Decision = "dismiss" | "warn" | "suspend";

export default function ModerationCasePage() {
  const params = useSearchParams();
  const caseId = params.get("id") ?? "";
  const can = useCan();
  const toast = useToast();
  const q = useCallable<CaseDetail>("adminSupport", caseId ? { action: "caseDetail", caseId } : null);
  const [confirm, setConfirm] = useState<Decision | null>(null);

  if (!caseId) return <ErrorState title="No case ID" message="Add ?id=… to the URL." />;
  if (q.loading) return <Skeleton className="h-64" />;
  if (q.error) return <ErrorState title="Failed to load case" message={q.error.message} onRetry={q.reload} />;
  if (!q.data) return null;

  const c = q.data;
  const canModerate = can("moderation.modify");

  const DECISIONS: { key: Decision; label: string; variant: "secondary" | "primary" | "danger" }[] = [
    { key: "dismiss", label: "Dismiss", variant: "secondary" },
    { key: "warn", label: "Warn User", variant: "primary" },
    { key: "suspend", label: "Suspend User", variant: "danger" },
  ];

  return (
    <>
      <PageHeader
        title={`Case ${c.id}`}
        meta={<Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{c.status}</Badge>}
        actions={
          <Link href="/dashboard/moderation">
            <Button variant="ghost" size="sm">Back to Moderation</Button>
          </Link>
        }
      />

      {/* Report details */}
      <Panel title="Report Details" className="mb-4">
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <Row label="Reporter"><UserLink uid={c.reporter.uid} name={c.reporter.displayName} /></Row>
          <Row label="Reported user"><UserLink uid={c.reported.uid} name={c.reported.displayName} /></Row>
          <Row label="Category"><Badge tone="neutral">{c.category}</Badge></Row>
          <Row label="Reported">{fmtDate(c.createdAt)}</Row>
          <Row label="Description">{c.description || "—"}</Row>
        </dl>
      </Panel>

      {/* Flagged content */}
      <Panel title="Flagged Content" className="mb-4">
        <div className="space-y-2 text-sm">
          <p className="whitespace-pre-wrap rounded-md border border-line bg-panel-2 p-3 text-fg">{c.content.text || "—"}</p>
          {c.content.context ? (
            <p className="text-fg-muted"><span className="font-medium">Context:</span> {c.content.context}</p>
          ) : null}
        </div>
      </Panel>

      {/* Action history */}
      <Panel title="Action History" className="mb-4">
        {c.history.length === 0 ? (
          <p className="text-sm text-fg-muted">No actions taken yet.</p>
        ) : (
          <ul className="space-y-2">
            {c.history.map((h, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <Badge tone={STATUS_TONE[h.action] ?? "neutral"}>{h.action}</Badge>
                <div className="min-w-0">
                  <p className="text-fg">by <span className="font-medium">{h.by}</span> {relativeTime(h.at)}</p>
                  {h.reason ? <p className="text-fg-muted">{h.reason}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Actions */}
      {canModerate ? (
        <Panel title="Take Action">
          <div className="flex flex-wrap gap-2">
            {DECISIONS.map((d) => (
              <Button key={d.key} variant={d.variant} size="sm" disabled={d.key !== "dismiss" && (!c.reported.uid || (d.key === "suspend" && !can("users.disable")))} onClick={() => setConfirm(d.key)}>
                {d.label}
              </Button>
            ))}
          </div>
        </Panel>
      ) : (
        <Notice tone="info">You do not have permission to moderate cases.</Notice>
      )}

      <ConfirmAction
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm === "dismiss" ? "Dismiss case" : confirm === "warn" ? "Warn user" : "Suspend user"}
        level="reason"
        confirmLabel={confirm === "dismiss" ? "Dismiss" : confirm === "warn" ? "Warn" : "Suspend"}
        danger={confirm === "suspend"}
        impact={
          confirm === "dismiss"
            ? <>This case will be marked dismissed. No action is taken against the reported user.</>
            : confirm === "warn"
              ? <>A warning will be issued to the reported user. This is recorded in their profile.</>
              : <>The reported user will be suspended. They will lose access until manually re-enabled.</>
        }
        onConfirm={async (reason) => {
          const status = confirm === "dismiss" ? "dismissed" : confirm === "warn" ? "warned" : "suspended";
          await callAdmin("adminSupport", { action: "moderate", id: c.id, status, version: c.version, reason });
          toast.success("Action recorded", status);
          q.reload();
        }}
      />
    </>
  );
}
