"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Badge, Button, DataTable, Drawer, PageHeader, PermissionDenied, Select, Tabs, TextInput, relativeTime,
  type Column,
} from "@/ui";
import TicketDetail from "./TicketDetail";
import {
  CATEGORIES, EMPTY_FILTERS, PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL, absoluteTime, applyTicketUpdate,
  buildListPayload, labelOf, mergePage, normalizeCounts, normalizeList, priorityTone, statusTone,
} from "./logic";
import type { QueueFilters, Ticket, TicketStatus } from "./types";

type AssigneeMode = "" | "me" | "unassigned" | "uid";

export default function TicketsPage() {
  const can = useCan();
  const allowed = can("support.read");

  const [status, setStatus] = useState<QueueFilters["status"]>(EMPTY_FILTERS.status);
  const [priority, setPriority] = useState<QueueFilters["priority"]>("");
  const [category, setCategory] = useState("");
  const [mode, setMode] = useState<AssigneeMode>("");
  const [uidText, setUidText] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");

  const assignee = mode === "uid" ? uidText.trim() : mode;
  const filters: QueueFilters = { status, priority, assignee, category, search };
  const fkey = JSON.stringify(filters);

  const counts = useCallable<unknown>("adminTickets", allowed ? { action: "counts" } : null);
  const c = counts.data ? normalizeCounts(counts.data) : null;

  const [rows, setRows] = useState<Ticket[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const gen = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const loadFirst = useCallback(async () => {
    const mine = ++gen.current;
    setLoading(true);
    setError(null);
    try {
      const res = normalizeList(await callAdmin("adminTickets", buildListPayload(filtersRef.current)));
      if (mine !== gen.current) return;
      setRows(mergePage([], res.tickets));
      setCursor(res.nextCursor);
    } catch (e) {
      if (mine === gen.current) setError((e as Error).message);
    } finally {
      if (mine === gen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    void loadFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fkey, allowed]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    const mine = gen.current;
    setLoadingMore(true);
    try {
      const res = normalizeList(await callAdmin("adminTickets", buildListPayload(filtersRef.current, cursor)));
      if (mine !== gen.current) return;
      setRows((r) => mergePage(r, res.tickets));
      setCursor(res.nextCursor);
    } catch (e) {
      if (mine === gen.current) setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  const countsReload = counts.reload;
  const onTicketChanged = useCallback(
    (t: Ticket) => {
      setRows((r) => applyTicketUpdate(r, t, filtersRef.current));
      countsReload();
    },
    [countsReload],
  );

  if (!allowed) return <PermissionDenied permission="support.read" />;

  const cols: Column<Ticket>[] = [
    {
      id: "t", header: "Ticket",
      cell: (t) => (
        <div className="flex min-w-0 items-start gap-2">
          <span
            className={t.unreadForAdmin ? "mt-1.5 h-2 w-2 shrink-0 rounded-full bg-info" : "mt-1.5 h-2 w-2 shrink-0"}
            role={t.unreadForAdmin ? "img" : undefined}
            aria-label={t.unreadForAdmin ? "Unread" : undefined}
          />
          <div className="min-w-0">
            <p className={t.unreadForAdmin ? "truncate text-sm font-semibold" : "truncate text-sm"}>
              <span className="mr-2 font-mono text-xs text-fg-muted">{t.humanId}</span>{t.title}
            </p>
            <p className="truncate text-xs text-fg-muted">{t.email ?? t.uid}</p>
          </div>
        </div>
      ),
    },
    { id: "p", header: "Priority", cell: (t) => <Badge tone={priorityTone(t.priority)}>{PRIORITY_LABEL[t.priority]}</Badge> },
    { id: "s", header: "Status", cell: (t) => <Badge tone={statusTone(t.status)}>{STATUS_LABEL[t.status]}</Badge> },
    { id: "c", header: "Category", hideOnNarrow: true, cell: (t) => labelOf(t.category) },
    { id: "a", header: "Assignee", hideOnNarrow: true, cell: (t) => t.assignedToEmail ?? (t.assignedToUid ? t.assignedToUid : <span className="text-fg-muted">Unassigned</span>) },
    {
      id: "u", header: "Updated", align: "right",
      cell: (t) => (
        <div title={absoluteTime(t.updatedAt)}>
          <p className="text-sm">{relativeTime(t.updatedAt)}</p>
          <p className="hidden text-xs text-fg-muted lg:block">{absoluteTime(t.updatedAt)}</p>
        </div>
      ),
    },
  ];

  const opened = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Support"
        description="User support tickets raised from the app. Replies are visible to the user; internal notes are not."
        actions={<Button icon="refresh" onClick={() => { counts.reload(); void loadFirst(); }}>Refresh</Button>}
      />
      <div className="mb-3">
        <Tabs
          label="Ticket status"
          value={status}
          onChange={(v) => setStatus(v as QueueFilters["status"])}
          tabs={[
            ...STATUSES.map((s) => ({ id: s, label: STATUS_LABEL[s], count: c ? c[s] : undefined })),
            { id: "all", label: "All", count: c ? c.all : undefined },
          ]}
        />
      </div>
      <form
        className="mb-4 flex flex-wrap items-end gap-2"
        role="search"
        onSubmit={(e) => { e.preventDefault(); setSearch(searchDraft.trim()); }}
      >
        <div className="min-w-[200px] flex-1">
          <label htmlFor="tk-search" className="sr-only">Search tickets</label>
          <TextInput id="tk-search" type="search" placeholder="Search ticket ID, title, uid or email" value={searchDraft} maxLength={100}
            onChange={(e) => { setSearchDraft(e.target.value); if (!e.target.value) setSearch(""); }} />
        </div>
        <Button type="submit">Search</Button>
        <Select aria-label="Priority filter" className="w-36" value={priority} onChange={(e) => setPriority(e.target.value as QueueFilters["priority"])}>
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </Select>
        <Select aria-label="Category filter" className="w-40" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Any category</option>
          {CATEGORIES.map((x) => <option key={x} value={x}>{labelOf(x)}</option>)}
        </Select>
        <Select aria-label="Assignee filter" className="w-40" value={mode} onChange={(e) => setMode(e.target.value as AssigneeMode)}>
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
          <option value="uid">Specific admin...</option>
        </Select>
        {mode === "uid" ? (
          <TextInput aria-label="Assignee admin uid" className="w-44" placeholder="Admin uid" value={uidText} onChange={(e) => setUidText(e.target.value)} />
        ) : null}
      </form>
      <DataTable
        label="Support tickets"
        columns={cols}
        rows={rows}
        rowKey={(t) => t.id}
        loading={loading}
        error={error}
        onRetry={() => void loadFirst()}
        hasMore={cursor !== null}
        loadingMore={loadingMore}
        onLoadMore={() => void loadMore()}
        onRowClick={(t) => setOpenId(t.id)}
        empty={{ title: "No tickets match", body: "Try a different status tab or clear the filters." }}
      />
      <Drawer
        open={openId !== null}
        onClose={() => setOpenId(null)}
        title={opened ? `${opened.humanId} ${opened.title}` : "Ticket"}
        subtitle={opened ? <span>{STATUS_LABEL[opened.status as TicketStatus]}</span> : undefined}
        width={720}
      >
        {openId ? <TicketDetail key={openId} ticketId={openId} onTicketChanged={onTicketChanged} /> : null}
      </Drawer>
    </>
  );
}
