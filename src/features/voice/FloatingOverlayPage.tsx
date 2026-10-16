"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCan } from "@/lib/session";
import { Badge, DataTable, Drawer, ErrorState, Icon, Notice, PageHeader, Panel, Skeleton, StatusPill, type Column } from "@/ui";
import { TargetForm } from "../config/TargetForm";
import { useRegistry, useTarget } from "../config/useConfig";

interface ActionRow {
  id: string;
  shown: boolean;
  label: string | null;
  order: number | null;
}

export default function FloatingOverlayPage() {
  const can = useCan();
  const reg = useRegistry();
  const qa = useTarget("quickActions");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo<ActionRow[]>(() => {
    if (!reg.data || !qa.data) return [];
    const ids: string[] = [];
    for (const f of reg.data.fields) if (f.target === "quickActions" && f.group && !ids.includes(f.group)) ids.push(f.group);
    const s = qa.data.snapshot;
    return ids
      .map((id, i) => ({
        id,
        shown: s[`${id}.isEnabled`] !== false,
        label: (s[`${id}.label`] as string | null) ?? null,
        order: (s[`${id}.order`] as number | null) ?? null,
        idx: i,
      }))
      .sort((a, b) => (a.order ?? a.idx) - (b.order ?? b.idx));
  }, [reg.data, qa.data]);

  const cols: Column<ActionRow>[] = [
    { id: "id", header: "Action", cell: (r) => <code className="font-mono text-sm">{r.id}</code> },
    { id: "l", header: "Label", cell: (r) => r.label ?? <span className="text-fg-subtle">Compiled</span> },
    { id: "o", header: "Position", align: "right", cell: (r) => r.order ?? <span className="text-fg-subtle">default</span> },
    { id: "s", header: "State", cell: (r) => <StatusPill status={r.shown ? "ok" : "off"} label={r.shown ? "Shown" : "Hidden"} /> },
  ];

  if (reg.error) return <ErrorState message={reg.error.message} onRetry={reg.reload} />;
  return (
    <>
      <PageHeader
        title="Floating Overlay"
        description="The floating bubble: master switch, features, blocked apps and the radial menu. Versioned: every change needs a reason and can be rolled back."
        actions={
          <Link href="/dashboard/config-history" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
            <Icon name="history" size={16} /> History
          </Link>
        }
      />
      <div className="mb-4">
        <Notice tone="info">
          The overlay&apos;s pipeline, models and emergency switch live on the <Link className="underline" href="/dashboard/floating-system">Floating Control Plane</Link>.
          The app reads these settings at start-up and every 10 minutes. Position, permission policy, theme colours and particle effects
          were stored by the old page but are not read by the app, so they are not shown here.
        </Notice>
      </div>
      {!reg.data ? <Skeleton className="h-96 w-full" /> : (
        <div className="space-y-4">
          <TargetForm registry={reg.data} target="floating" canEdit={can("floating.configure")} title="Overlay settings"
            description="Turning the master switch off is a kill switch: new overlay sessions stop starting." />
          <Panel title="Radial menu" description="The 14 built-in quick actions. Hide, rename or reorder; icons are compiled into the app." flush>
            {qa.error && !qa.data ? <ErrorState compact message={qa.error.message} onRetry={qa.reload} /> : (
              <DataTable label="Quick actions" columns={cols} rows={rows} rowKey={(r) => r.id} loading={!qa.data} onRowClick={(r) => setOpen(r.id)} />
            )}
          </Panel>
          <OverlayEvents />
        </div>
      )}
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ?? ""} subtitle="Quick action" width={560}>
        {open && reg.data ? (
          <TargetForm registry={reg.data} target="quickActions" query={qa} title={open} canEdit={can("floating.configure")}
            only={[`${open}.isEnabled`, `${open}.label`, `${open}.order`]} />
        ) : null}
      </Drawer>
    </>
  );
}

interface Ev {
  id: string;
  type: string;
  at: number | null;
}

/// The 200 most recent overlay events, counted by type. A sample, and
/// labelled as one: a daily rollup is what real analytics would need.
function OverlayEvents() {
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getDocs(query(collection(db, "floating_analytics_events"), orderBy("timestamp", "desc"), limit(200)))
      .then((snap) =>
        setEvents(snap.docs.map((d) => {
          const x = d.data();
          const t = x.timestamp as { toMillis?: () => number } | number | undefined;
          return {
            id: d.id,
            type: typeof x.type === "string" ? x.type : "unknown",
            at: typeof t === "number" ? t : t?.toMillis ? t.toMillis() : null,
          };
        })),
      )
      .catch(() => setError("Could not read overlay events."));
  }, []);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events ?? []) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [events]);
  const span = events && events.length > 1 && events[0].at && events[events.length - 1].at
    ? `${new Date(events[events.length - 1].at!).toLocaleString()} – ${new Date(events[0].at!).toLocaleString()}` : null;
  return (
    <Panel title="Recent overlay events" description={`The latest ${events?.length ?? 200} events only — a sample, not totals.${span ? ` Covers ${span}.` : ""}`}>
      {error ? <ErrorState compact message={error} /> : !events ? <Skeleton className="h-16 w-full" /> : events.length === 0 ? (
        <p className="text-sm text-fg-muted">No events recorded yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {counts.map(([t, n]) => <Badge key={t}>{t}: {n}</Badge>)}
        </div>
      )}
    </Panel>
  );
}
