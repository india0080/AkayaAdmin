"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCan } from "@/lib/session";
import { Badge, DataTable, Drawer, ErrorState, Icon, Notice, PageHeader, StatusPill, type Column } from "@/ui";
import { TargetForm } from "./TargetForm";
import { useRegistry, useTarget } from "./useConfig";

const LISTS = ["strong", "verbs", "objects", "weak", "blockers", "regexes"] as const;

interface Row {
  id: string;
  enabled: boolean;
  extra: number;
  priority: number | null;
  configured: boolean;
}

/// Extra trigger phrases for the on-device intent engine, versioned and
/// audited (adminConfig target "intentRules"). The intent list comes from
/// the server registry, which mirrors the app's compiled rule bank.
export default function IntentRulesPage() {
  const can = useCan();
  const reg = useRegistry();
  const q = useTarget("intentRules");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    if (!reg.data || !q.data) return [];
    const ids: string[] = [];
    for (const f of reg.data.fields) if (f.target === "intentRules" && f.group && !ids.includes(f.group)) ids.push(f.group);
    const s = q.data.snapshot;
    return ids.map((id) => {
      const extra = LISTS.reduce((n, k) => n + ((s[`${id}.${k}`] as string[] | null)?.length ?? 0), 0);
      const configured = [`${id}.enabled`, `${id}.priority`, ...LISTS.map((k) => `${id}.${k}`)].some((k) => s[k] !== null);
      return { id, enabled: s[`${id}.enabled`] !== false, extra, priority: (s[`${id}.priority`] as number | null) ?? null, configured };
    });
  }, [reg.data, q.data]);

  const cols: Column<Row>[] = [
    { id: "i", header: "Intent", cell: (r) => <code className="font-mono text-sm">{r.id}</code> },
    { id: "s", header: "State", cell: (r) => <StatusPill status={r.enabled ? "ok" : "off"} label={r.enabled ? "Enabled" : "Disabled"} /> },
    { id: "p", header: "Priority", align: "right", cell: (r) => r.priority ?? <span className="text-fg-subtle">compiled</span> },
    { id: "t", header: "Extra triggers", align: "right", cell: (r) => r.extra },
    { id: "c", header: "Source", hideOnNarrow: true, cell: (r) => (r.configured ? <Badge tone="accent">Console</Badge> : "App default") },
  ];

  const err = reg.error ?? (q.error && !q.data ? q.error : null);
  return (
    <>
      <PageHeader
        title="Intelligence"
        description="Extra trigger phrases for the on-device intent engine. They ADD to the app's built-in trigger banks and never replace them. Every change is versioned."
        actions={
          <Link href="/dashboard/config-history" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
            <Icon name="history" size={16} /> History
          </Link>
        }
      />
      <div className="mb-4">
        <Notice tone="info">
          The intent engine, planner, validator, web search and smart reply switches are on{" "}
          <Link className="underline" href="/dashboard/flags">Feature Flags &amp; Kill Switches</Link>. The app syncs these rules every
          5 minutes. Widen trigger banks carefully: common phrases like &ldquo;karna hai&rdquo; occur in ordinary chat.
        </Notice>
      </div>
      {err ? <ErrorState message={err.message} onRetry={() => { reg.reload(); q.reload(); }} /> : (
        <DataTable label="Intent trigger rules" columns={cols} rows={rows} rowKey={(r) => r.id} loading={!reg.data || !q.data} onRowClick={(r) => setOpen(r.id)} />
      )}
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ?? ""} subtitle="Additive to the built-in trigger bank" width={680}>
        {open && reg.data ? (
          <TargetForm
            registry={reg.data}
            target="intentRules"
            query={q}
            title={open}
            canEdit={can("ai.behaviour.configure")}
            only={[`${open}.enabled`, `${open}.priority`, ...LISTS.map((k) => `${open}.${k}`)]}
          />
        ) : null}
      </Drawer>
    </>
  );
}
