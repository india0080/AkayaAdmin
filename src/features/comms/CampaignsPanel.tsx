"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Badge, Button, ConfirmAction, DataTable, Drawer, ErrorState, Field, Notice, Panel, Select, Skeleton, StatusPill, TextInput, relativeTime, useToast, type Column,
} from "@/ui";
import {
  CONFLICT_MESSAGE, COUNTS_DISCLAIMER, COUNT_ROWS, audienceLabel, canCancel, commsAccess, countValue, friendlyError, isDuplicate, localToMs, normalizeCampaign, planFor,
  statusMeta, validateSchedule, type Campaign,
} from "./campaign";
import { cancelCampaign, listCampaigns, promoteDraft } from "./campaignApi";
import { findDestination } from "./destinations";
import { PushPreview } from "./PushPreview";

const STATUS_FILTERS = ["", "scheduled", "sending", "sent", "failed", "cancelled", "draft"] as const;

function when(c: Campaign): string {
  if (c.status === "scheduled" && c.scheduledAt) return `For ${new Date(c.scheduledAt).toLocaleString()}`;
  return relativeTime(c.sentAt ?? c.createdAt);
}

function destLabel(c: Campaign): string {
  const d = findDestination(c.destination.type);
  return d ? d.label : c.destination.type;
}

export default function CampaignsPanel({ refreshKey }: { refreshKey: number }) {
  const can = useCan();
  const { canSend } = commsAccess(can);
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Campaign[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const gen = useRef(0);

  const load = useCallback(async () => {
    const mine = ++gen.current;
    setLoading(true);
    setError(null);
    try {
      const r = await listCampaigns({ status });
      if (mine !== gen.current) return;
      setRows(r.rows); setHasMore(r.hasMore); setNext(r.next);
    } catch (e) {
      if (mine === gen.current) setError(friendlyError(e as { code?: string; message?: string }, "Could not load campaigns."));
    } finally {
      if (mine === gen.current) setLoading(false);
    }
  }, [status]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  async function more() {
    if (!hasMore || loadingMore || next === null) return;
    const mine = gen.current;
    setLoadingMore(true);
    try {
      const r = await listCampaigns({ status, before: next });
      if (mine !== gen.current) return;
      setRows((prev) => [...prev, ...r.rows.filter((x) => !prev.some((p) => p.id === x.id))]);
      setHasMore(r.hasMore); setNext(r.next);
    } catch (e) {
      setError(friendlyError(e as { code?: string; message?: string }, "Could not load more."));
    } finally {
      setLoadingMore(false);
    }
  }
  const q = { reload: () => void load(), refreshing: loading && rows.length > 0, error, data: rows.length > 0 || !error ? rows : null };

  const cols: Column<Campaign>[] = [
    { id: "t", header: "Campaign", cell: (r) => <div className="max-w-md"><p className="text-sm font-medium">{r.title}</p><p className="line-clamp-1 text-xs text-fg-muted">{r.body}</p></div> },
    { id: "a", header: "Audience", hideOnNarrow: true, cell: (r) => <Badge>{audienceLabel(r.audience)}</Badge> },
    { id: "s", header: "Status", cell: (r) => { const m = statusMeta(r.status); return <StatusPill status={m.pill} label={m.label} />; } },
    {
      id: "c", header: "Accepted by FCM", hideOnNarrow: true, align: "right",
      cell: (r) => (r.counts.accepted === null ? "-" : `${countValue(r.counts.accepted)} of ${countValue(r.counts.tokens)} tokens`),
    },
    { id: "w", header: "When", align: "right", cell: (r) => when(r) },
  ];

  return (
    <>
      <Panel
        title="Campaigns"
        description="Counts are what FCM reported at send time. They are not delivery or read receipts."
        actions={
          <div className="flex items-center gap-2">
            <label htmlFor="campaign-status" className="sr-only">Filter by status</label>
            <Select id="campaign-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-40">
              {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s ? statusMeta(s).label : "All statuses"}</option>)}
            </Select>
            <Button size="sm" onClick={q.reload} loading={q.refreshing}>Refresh</Button>
          </div>
        }
        flush
      >
        {error && rows.length === 0 ? (
          <ErrorState compact message={error} onRetry={q.reload} />
        ) : (
          <DataTable
            label="Notification campaigns"
            columns={cols}
            rows={rows}
            rowKey={(r) => r.id}
            loading={loading && rows.length === 0}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={() => void more()}
            onRowClick={(r) => setOpenId(r.id)}
            empty={{ title: status ? "No campaigns with this status" : "No campaigns yet", body: "Use New campaign to compose one." }}
          />
        )}
      </Panel>
      <CampaignDrawer id={openId} canSend={canSend} onClose={() => setOpenId(null)} onChanged={q.reload} />
    </>
  );
}

function CampaignDrawer({ id, canSend, onClose, onChanged }: { id: string | null; canSend: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const q = useCallable<unknown>("adminComms", id ? { action: "getCampaign", campaignId: id } : null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [promote, setPromote] = useState<null | "normal" | "force">(null);
  const [promoLocal, setPromoLocal] = useState("");
  const [dupSeen, setDupSeen] = useState(false);
  useEffect(() => { setConflict(false); setCancelOpen(false); setPromote(null); setPromoLocal(""); setDupSeen(false); }, [id]);
  const raw = q.data as { campaign?: unknown } | null;
  const c = id && raw ? normalizeCampaign(raw.campaign ?? raw) : null;

  return (
    <Drawer open={!!id} onClose={onClose} title={c?.title || "Campaign"} subtitle={c ? statusMeta(c.status).label : undefined} width={560}
      footer={c && canCancel(c, canSend) ? <Button variant="danger" onClick={() => setCancelOpen(true)}>Cancel campaign</Button> : undefined}>
      {q.loading && !q.data ? <Skeleton className="h-64" /> : q.error && !q.data ? (
        <ErrorState compact message={q.error.message} onRetry={q.reload} />
      ) : c ? (
        <div className="space-y-5">
          {conflict ? <Notice tone="warning" title="Changed">{CONFLICT_MESSAGE}</Notice> : null}
          {c.error ? <Notice tone="danger" title="Error">{c.error}</Notice> : null}
          <PushPreview title={c.title} body={c.body} imageUrl={c.imageUrl} />
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Item k="Audience" v={audienceLabel(c.audience)} />
            <Item k="Opens" v={`${destLabel(c)}${Object.keys(c.destination.params).length ? ` (${Object.entries(c.destination.params).map(([k, v]) => `${k}=${v}`).join(", ")})` : ""}`} />
            <Item k="Schedule" v={c.scheduleMode === "at" && c.scheduledAt ? new Date(c.scheduledAt).toLocaleString() : "Sent immediately"} />
            <Item k="Created" v={`${relativeTime(c.createdAt)}${c.createdByEmail ? ` by ${c.createdByEmail}` : ""}`} />
            {c.sentAt ? <Item k="Sent" v={relativeTime(c.sentAt)} /> : null}
            {c.version !== null ? <Item k="Version" v={String(c.version)} /> : null}
          </dl>
          {c.note === "no_recipients" ? <Notice tone="warning" title="No recipients">The audience had no registered devices when this was sent, so nothing was sent.</Notice> : null}
          {c.reason ? <Item k="Reason" v={c.reason} /> : null}
          {c.status === "draft" && canSend ? (
            <section aria-label="Send draft" className="space-y-3 rounded-md border border-line p-3">
              <h3 className="text-sm font-semibold">Send or schedule this draft</h3>
              <Field label="Date and time (optional)" error={promoLocal ? validateSchedule({ mode: "at", local: promoLocal }).at ?? null : null} hint="Leave empty to send now. 1 minute to 60 days ahead, in your browser time zone.">
                {(p) => <TextInput {...p} type="datetime-local" value={promoLocal} onChange={(e) => setPromoLocal(e.target.value)} />}
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" disabled={!!promoLocal && !!validateSchedule({ mode: "at", local: promoLocal }).at} onClick={() => setPromote("normal")}>{promoLocal ? "Schedule draft" : "Send draft now"}</Button>
                {dupSeen ? <Button variant="secondary" onClick={() => setPromote("force")}>Send anyway</Button> : null}
              </div>
              {dupSeen ? <p className="text-xs text-warning">Refused as a duplicate of a campaign sent in the last 10 minutes.</p> : null}
            </section>
          ) : null}
          <section aria-label="Counts">
            <h3 className="mb-2 text-sm font-semibold">Counts</h3>
            <dl className="divide-y divide-line rounded-md border border-line">
              {COUNT_ROWS.map((r) => (
                <div key={r.key} className="flex items-baseline justify-between gap-4 px-3 py-2">
                  <div><dt className="text-sm">{r.label}</dt><dd className="text-xs text-fg-subtle">{r.hint}</dd></div>
                  <span className="text-sm font-semibold tabular-nums">{countValue(c.counts[r.key])}</span>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-fg-subtle">{COUNTS_DISCLAIMER}</p>
          </section>
        </div>
      ) : <ErrorState compact message="Campaign not found." />}
      {c && c.status === "draft" ? (
        <ConfirmAction
          open={promote !== null}
          onClose={() => setPromote(null)}
          title={promote === "force" ? "Send anyway (duplicate)" : promoLocal ? "Schedule draft" : "Send draft"}
          level={(() => { const p = planFor(String(c.audience.kind), promoLocal ? "at" : "now", c.counts.targeted); return promote === "force" && p.level === "confirm" ? "reason" : p.level; })()}
          phrase={planFor(String(c.audience.kind), promoLocal ? "at" : "now", null).level === "typed" ? "SEND TO ALL" : undefined}
          danger
          confirmLabel={promote === "force" ? "Send anyway" : promoLocal ? "Schedule" : "Send now"}
          impact={<p>&quot;{c.title}&quot; to {audienceLabel(c.audience)}. A push cannot be recalled once sent.</p>}
          onConfirm={async (reason) => {
            const at = promoLocal ? localToMs(promoLocal) : null;
            try {
              const r = await promoteDraft(c.id, at !== null ? { mode: "at", at } : { mode: "now" }, {
                reason: reason || undefined, confirmAll: c.audience.kind === "all", force: promote === "force",
              });
              if (!r.success) toast.error("Campaign failed", r.error ?? "See the counts.");
              else toast.success(at !== null ? "Draft scheduled" : "Draft sent");
            } catch (e) {
              const ex = e as { code?: string; message?: string };
              if (isDuplicate(ex)) setDupSeen(true);
              throw new Error(friendlyError(ex, "Not sent."));
            }
            q.reload();
            onChanged();
          }}
        />
      ) : null}
      {c ? (
        <ConfirmAction
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          title={c.status === "draft" ? "Cancel draft" : "Cancel scheduled campaign"}
          level="reason"
          danger
          confirmLabel="Cancel campaign"
          impact={<p>&quot;{c.title}&quot; will not be sent. This cannot be undone; compose a new campaign to send it later. A campaign that already started or was sent cannot be cancelled.</p>}
          onConfirm={async (reason) => {
            try {
              await cancelCampaign(c.id, c.version, reason);
            } catch (e) {
              if (e instanceof AdminApiError && e.code === "aborted") {
                setConflict(true);
                q.reload();
                onChanged();
                throw new Error(CONFLICT_MESSAGE);
              }
              throw e;
            }
            toast.success("Campaign cancelled");
            q.reload();
            onChanged();
          }}
        />
      ) : null}
    </Drawer>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return <div><dt className="text-fg-muted">{k}</dt><dd className="break-words text-fg">{v}</dd></div>;
}
