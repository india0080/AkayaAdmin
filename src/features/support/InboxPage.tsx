"use client";

import { useCallback, useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { usePaginatedCollection } from "@/hooks/usePaginatedCollection";
import { callAdmin } from "@/lib/api";
import { countDocs } from "@/lib/paginate";
import { useCan } from "@/lib/session";
import { Badge, Button, ConfirmAction, DataTable, Drawer, PageHeader, Tabs, relativeTime, useToast, type Column, type Tone } from "@/ui";

type Tab = "contact" | "enquiries" | "applications";
type Col = "contact_requests" | "affiliate_enquiries" | "affiliate_applications";

interface Item {
  id: string;
  name: string;
  email: string;
  status: string;
  read: boolean;
  createdAt: number | null;
  reviewedBy: string | null;
  fields: [string, string][];
}

const ms = (v: unknown): number | null => {
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "string" || typeof v === "number") {
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
  }
  return null;
};

function mapper(col: Col) {
  return (d: { id: string; data: () => Record<string, unknown> }): Item => {
    const u = d.data();
    const s = (k: string) => (typeof u[k] === "string" ? (u[k] as string) : "");
    const fields: [string, string][] =
      col === "contact_requests" ? [["Topic", s("topic")], ["Message", s("message")]]
      : col === "affiliate_enquiries" ? [["Phone", s("phone")], ["Country", s("country")], ["Platform", s("platform")], ["Handle", s("handle")], ["Followers", s("followers")], ["Message", s("message")]]
      : [
          ["Phone", s("phone")], ["Location", [s("city"), s("state"), s("country")].filter(Boolean).join(", ")],
          ["Socials", (Array.isArray(u.socials) ? (u.socials as { platform?: string; url?: string; followers?: string }[]) : []).map((x) => `${x.platform ?? ""} ${x.url ?? ""} (${x.followers ?? "?"})`).join("\n")],
          ["Audiences", Array.isArray(u.audiences) ? (u.audiences as string[]).join(", ") : ""],
          ["Promotion plan", s("promotionPlan")], ["Experience", s("experience")],
        ];
    return {
      id: d.id,
      name: s("name"),
      email: s("email"),
      status: s("status") || (col === "affiliate_enquiries" ? "new" : "pending"),
      read: u.read === true,
      createdAt: ms(u.createdAt),
      reviewedBy: typeof u.reviewedBy === "string" ? u.reviewedBy : null,
      fields: fields.filter(([, v]) => v),
    };
  };
}

const TONE: Record<string, Tone> = { new: "info", pending: "warning", reviewed: "neutral", approved: "success", rejected: "danger" };
const STATUSES: Record<Exclude<Col, "contact_requests">, string[]> = {
  affiliate_enquiries: ["new", "reviewed", "approved", "rejected"],
  affiliate_applications: ["pending", "reviewed", "approved", "rejected"],
};
const TAB_COL: Record<Tab, Col> = { contact: "contact_requests", enquiries: "affiliate_enquiries", applications: "affiliate_applications" };

export default function InboxPage() {
  const can = useCan();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("contact");
  const [open, setOpen] = useState<Item | null>(null);
  const [change, setChange] = useState<{ item: Item; status: string } | null>(null);

  const lists = {
    contact: usePaginatedCollection<Item>({ path: "contact_requests", orderByField: "createdAt" }, mapper("contact_requests")),
    enquiries: usePaginatedCollection<Item>({ path: "affiliate_enquiries", orderByField: "createdAt" }, mapper("affiliate_enquiries")),
    applications: usePaginatedCollection<Item>({ path: "affiliate_applications", orderByField: "createdAt" }, mapper("affiliate_applications")),
  };
  const list = lists[tab];
  const col = TAB_COL[tab];

  // Server aggregates: a count over one page is not a count.
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const refreshCounts = useCallback(async () => {
    try {
      const [unread, newEnq, pendingApp] = await Promise.all([
        countDocs("contact_requests", { field: "read", op: "==", value: false }),
        countDocs("affiliate_enquiries", { field: "status", op: "==", value: "new" }),
        countDocs("affiliate_applications", { field: "status", op: "==", value: "pending" }),
      ]);
      setCounts({ contact: unread, enquiries: newEnq, applications: pendingApp });
    } catch {
      setCounts({});
    }
  }, []);
  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  async function openItem(item: Item) {
    setOpen(item);
    if (col === "contact_requests" && !item.read && can("support.modify")) {
      try {
        await callAdmin("adminSupport", { action: "inbox", collection: col, id: item.id, read: true });
        lists.contact.patch(item.id, { read: true });
        void refreshCounts();
      } catch (e) {
        toast.error("Could not mark as read", (e as Error).message);
      }
    }
  }

  const cols: Column<Item>[] = [
    {
      id: "who", header: "From",
      cell: (i) => (
        <div className={col === "contact_requests" && !i.read ? "font-semibold" : ""}>
          <p className="text-sm">{i.name || "—"}</p>
          <p className="text-xs text-fg-muted">{i.email}</p>
        </div>
      ),
    },
    col === "contact_requests"
      ? { id: "s", header: "State", cell: (i) => (i.read ? <Badge>Read</Badge> : <Badge tone="info">Unread</Badge>) }
      : { id: "s", header: "Status", cell: (i) => <Badge tone={TONE[i.status] ?? "neutral"}>{i.status}</Badge> },
    { id: "sum", header: "Summary", hideOnNarrow: true, cell: (i) => <span className="line-clamp-1 text-sm text-fg-muted">{i.fields[0]?.[1] ?? ""}</span> },
    { id: "r", header: "Reviewed by", hideOnNarrow: true, cell: (i) => i.reviewedBy ?? "—" },
    { id: "at", header: "Received", align: "right", cell: (i) => relativeTime(i.createdAt) },
  ];

  return (
    <>
      <PageHeader title="Inbox" description="Website contact requests and affiliate enquiries and applications. Decisions record who made them." />
      <div className="mb-3">
        <Tabs
          label="Inbox"
          value={tab}
          onChange={(v) => setTab(v as Tab)}
          tabs={[
            { id: "contact", label: "Contact", count: counts.contact ?? undefined },
            { id: "enquiries", label: "Affiliate enquiries", count: counts.enquiries ?? undefined },
            { id: "applications", label: "Affiliate applications", count: counts.applications ?? undefined },
          ]}
        />
      </div>
      <DataTable
        label="Inbox items"
        columns={cols}
        rows={list.items}
        rowKey={(i) => i.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        hasMore={list.hasMore}
        loadingMore={list.loadingMore}
        onLoadMore={list.loadMore}
        onRowClick={(i) => void openItem(i)}
        empty={{ title: "Nothing here yet" }}
      />
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.name || open?.email || ""} subtitle={open?.email} width={600}
        footer={open && col !== "contact_requests" && can("support.modify") ? (
          <div className="flex flex-wrap gap-2">
            {STATUSES[col].filter((s) => s !== open.status).map((s) => (
              <Button key={s} variant={s === "rejected" ? "danger-ghost" : s === "approved" ? "primary" : "secondary"} onClick={() => setChange({ item: open, status: s })}>
                Mark {s}
              </Button>
            ))}
          </div>
        ) : open && col === "contact_requests" && open.email ? (
          <a className="inline-flex h-9 items-center rounded-md border border-line px-4 text-sm font-medium hover:bg-raised" href={`mailto:${open.email}`}>Reply by email</a>
        ) : null}>
        {open ? (
          <dl className="space-y-3 text-sm">
            {open.fields.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-medium uppercase text-fg-muted">{k}</dt>
                <dd className="whitespace-pre-wrap">{v}</dd>
              </div>
            ))}
            <div>
              <dt className="text-xs font-medium uppercase text-fg-muted">Received</dt>
              <dd>{open.createdAt ? new Date(open.createdAt).toLocaleString() : "—"}</dd>
            </div>
            {open.reviewedBy ? <div><dt className="text-xs font-medium uppercase text-fg-muted">Last decision by</dt><dd>{open.reviewedBy}</dd></div> : null}
          </dl>
        ) : null}
      </Drawer>
      <ConfirmAction
        open={!!change}
        onClose={() => setChange(null)}
        title={change ? `Mark ${change.item.name || change.item.email} ${change.status}` : ""}
        level={change && (change.status === "approved" || change.status === "rejected") ? "reason" : "confirm"}
        danger={change?.status === "rejected"}
        confirmLabel={change ? `Mark ${change.status}` : ""}
        impact={<>Recorded with your name in the audit log. The applicant is not notified automatically.</>}
        onConfirm={async (reason) => {
          if (!change) return;
          await callAdmin("adminSupport", { action: "inbox", collection: col, id: change.item.id, status: change.status, reason: reason || undefined });
          list.patch(change.item.id, { status: change.status });
          setOpen((o) => (o && o.id === change.item.id ? { ...o, status: change.status } : o));
          toast.success("Updated", `${change.item.email}: ${change.status}`);
          void refreshCounts();
        }}
      />
    </>
  );
}
