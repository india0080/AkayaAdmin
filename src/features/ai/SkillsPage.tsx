"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCan } from "@/lib/session";
import { Badge, DataTable, Drawer, ErrorState, Icon, Notice, PageHeader, StatusPill, type Column } from "@/ui";
import { TargetForm } from "../config/TargetForm";
import { useRegistry, useTarget } from "../config/useConfig";

interface Row {
  id: string;
  enabled: boolean;
  overridden: boolean;
  configured: boolean;
}

export default function SkillsPage() {
  const can = useCan();
  const reg = useRegistry();
  const q = useTarget("skills");
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    if (!reg.data || !q.data) return [];
    const ids: string[] = [];
    for (const f of reg.data.fields) if (f.target === "skills" && f.group && !ids.includes(f.group)) ids.push(f.group);
    const s = q.data.snapshot;
    return ids.map((id) => ({
      id,
      enabled: s[`${id}.isEnabled`] !== false,
      overridden: typeof s[`${id}.adminOverridePrompt`] === "string",
      configured: s[`${id}.isEnabled`] !== null || s[`${id}.adminOverridePrompt`] !== null,
    }));
  }, [reg.data, q.data]);

  const cols: Column<Row>[] = [
    { id: "id", header: "Skill", cell: (r) => <code className="font-mono text-sm">{r.id}</code> },
    { id: "on", header: "State", cell: (r) => <StatusPill status={r.enabled ? "ok" : "off"} label={r.enabled ? "Enabled" : "Disabled"} /> },
    { id: "p", header: "Prompt", cell: (r) => (r.overridden ? <Badge tone="accent">Admin override</Badge> : <span className="text-fg-subtle">Compiled</span>) },
    { id: "c", header: "Source", hideOnNarrow: true, cell: (r) => (r.configured ? "Console" : "App default") },
  ];

  const err = reg.error ?? (q.error && !q.data ? q.error : null);
  return (
    <>
      <PageHeader
        title="Skills"
        description="The assistant's built-in skills. Turn one off or replace its prompt; the app syncs within about 5 minutes. Every change is versioned."
        actions={
          <Link href="/dashboard/config-history" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
            <Icon name="history" size={16} /> History
          </Link>
        }
      />
      <div className="mb-4">
        <Notice tone="info">This list is the app&apos;s real skill ids. The old page listed a &ldquo;voice&rdquo; skill that does not exist and could not manage calendar, relationships, tasks or webfetch.</Notice>
      </div>
      {err ? <ErrorState message={err.message} onRetry={() => { reg.reload(); q.reload(); }} /> : (
        <DataTable label="Skills" columns={cols} rows={rows} rowKey={(r) => r.id} loading={!reg.data || !q.data} onRowClick={(r) => setOpen(r.id)} />
      )}
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ?? ""} subtitle="Skill override" width={640}>
        {open && reg.data ? (
          <TargetForm
            registry={reg.data}
            target="skills"
            query={q}
            title={open}
            canEdit={can("ai.behaviour.configure")}
            only={[`${open}.isEnabled`, `${open}.adminOverridePrompt`]}
          />
        ) : null}
      </Drawer>
    </>
  );
}
