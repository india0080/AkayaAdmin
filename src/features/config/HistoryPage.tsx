"use client";

import { useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import { Badge, Button, ConfirmAction, DataTable, Field, PageHeader, Select, relativeTime, useToast, type Column } from "@/ui";
import { TARGET_LABELS, showValue, type Target } from "./logic";

interface VersionRow {
  id: string;
  target: Target;
  version: number;
  kind: "apply" | "rollback";
  rolledBackFrom: number | null;
  changes: { field: string; from: string; to: string }[];
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  dangerous: string[];
  reason: string;
  actorEmail: string;
  at: number | null;
}

export default function HistoryPage() {
  const can = useCan();
  const toast = useToast();
  const [target, setTarget] = useState<"" | Target>("");
  const q = useCallable<{ rows: VersionRow[] }>("adminConfig", { action: "history", ...(target ? { target } : {}), limit: 100 });
  const [undo, setUndo] = useState<VersionRow | null>(null);

  const cols: Column<VersionRow>[] = [
    { id: "when", header: "When", width: "110px", cell: (r) => <span title={r.at ? new Date(r.at).toLocaleString() : ""}>{relativeTime(r.at)}</span> },
    { id: "what", header: "Target", cell: (r) => <span className="inline-flex items-center gap-1.5">{TARGET_LABELS[r.target]} <Badge>v{r.version}</Badge></span> },
    {
      id: "changes",
      header: "Change",
      cell: (r) => (
        <div className="min-w-0 space-y-0.5 text-xs">
          {r.kind === "rollback" ? <Badge tone="info">Rollback of v{r.rolledBackFrom}</Badge> : null}
          {r.dangerous.length ? <Badge tone="danger">Kill switch</Badge> : null}
          {r.changes.slice(0, 3).map((c) => (
            <p key={c.field} className="truncate font-mono">{c.field}: {c.from} → {c.to}</p>
          ))}
          {r.changes.length > 3 ? <p className="text-fg-subtle">+{r.changes.length - 3} more</p> : null}
        </div>
      ),
    },
    { id: "who", header: "By", hideOnNarrow: true, cell: (r) => <div className="min-w-0"><p className="truncate">{r.actorEmail}</p><p className="truncate text-xs text-fg-muted">{r.reason}</p></div> },
    {
      id: "act",
      header: "",
      align: "right",
      cell: (r) => (can(r.target === "planPrices" || r.target === "pricingPolicy" ? "plans.modify" : "config.activate") ? <Button size="sm" onClick={(e) => { e.stopPropagation(); setUndo(r); }}>Undo</Button> : null),
    },
  ];

  return (
    <>
      <PageHeader title="Config History" description="Every change to flags, app settings, limits and tools, newest first. Undo re-applies the previous values as a new version — history is never rewritten." />
      <Field label="Show" className="mb-3 w-56">
        {(p) => (
          <Select {...p} value={target} onChange={(e) => setTarget(e.target.value as "" | Target)}>
            <option value="">All configuration</option>
            {(Object.keys(TARGET_LABELS) as Target[]).map((t) => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
          </Select>
        )}
      </Field>
      <DataTable
        label="Configuration versions"
        columns={cols}
        rows={q.data?.rows ?? []}
        rowKey={(r) => r.id}
        loading={q.loading}
        error={q.error?.message ?? null}
        onRetry={q.reload}
        rowTone={(r) => (r.dangerous.length ? "warning" : null)}
        empty={{ title: "No configuration changes yet", body: "Changes made in Feature Flags, App Config and Device Tools appear here." }}
      />
      {undo ? (
        <ConfirmAction
          open
          onClose={() => setUndo(null)}
          title={`Undo ${TARGET_LABELS[undo.target]} v${undo.version}`}
          level="typed"
          phrase="UNDO"
          danger
          confirmLabel="Undo change"
          impact={
            <>
              Restores these values as a new version:
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(undo.before).map(([k, v]) => <li key={k}><strong>{k}</strong> → {showValue(v)}</li>)}
              </ul>
              Only these keys are touched; anything changed since in other fields stays.
            </>
          }
          onConfirm={async (reason) => {
            const cur = await callAdmin<{ version: number }>("adminConfig", { action: "get", target: undo.target });
            await callAdmin("adminConfig", { action: "rollback", target: undo.target, version: undo.version, side: "before", expectedVersion: cur.version, reason });
            toast.success("Change undone");
            setUndo(null);
            q.reload();
          }}
        />
      ) : null}
    </>
  );
}
