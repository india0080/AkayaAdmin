"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import {
  Badge, Button, ConfirmAction, DataTable, Drawer, ErrorState, Field, Notice, PageHeader, Select, Stat, StatStrip,
  StatusPill, TextInput, formatNumber, useToast, type Column,
} from "@/ui";
import {
  EMPTY_FILTER, STATUS_LABEL, catalogStatus, contextLabel, filterCatalog, priceLabel,
  type CatalogFilter, type CatalogModel, type CatalogStatus,
} from "./logic";
import { useCatalog } from "./useCatalog";

const STATUS_PILL: Record<CatalogStatus, "ok" | "degraded" | "down" | "off" | "unknown"> = {
  live: "ok",
  "not-listed": "unknown",
  "circuit-open": "down",
  unavailable: "degraded",
  disabled: "off",
};

type Change = { model: CatalogModel; patch: { enabled?: boolean; tierRequired?: "silver" | "gold" | null } };

export default function CatalogPage() {
  const can = useCan();
  const toast = useToast();
  const q = useCatalog();
  const [f, setF] = useState<CatalogFilter>(EMPTY_FILTER);
  const [open, setOpen] = useState<CatalogModel | null>(null);
  const [change, setChange] = useState<Change | null>(null);
  const [syncing, setSyncing] = useState(false);

  const models = useMemo(() => q.data?.models ?? [], [q.data]);
  const rows = useMemo(() => filterCatalog(models, f).sort((a, b) => a.modelId.localeCompare(b.modelId)), [models, f]);
  const counts = useMemo(() => {
    const c = { live: 0, disabled: 0, unavailable: 0, notListed: 0, gated: 0 };
    for (const m of models) {
      const s = catalogStatus(m);
      if (s === "live") c.live++;
      if (s === "disabled") c.disabled++;
      if (s === "unavailable") c.unavailable++;
      if (s === "not-listed") c.notListed++;
      if (m.tierRequired) c.gated++;
    }
    return c;
  }, [models]);

  async function sync() {
    setSyncing(true);
    try {
      const r = await callAdmin<{ count: number; delisted?: number }>("syncOpenRouterCatalog", {});
      toast.success("Catalog synced", `${formatNumber(r.count)} models${r.delisted ? ` · ${r.delisted} delisted upstream` : ""}.`);
      q.reload();
    } catch (e) {
      toast.error("Sync failed", (e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  const cols: Column<CatalogModel>[] = [
    {
      id: "model", header: "Model",
      cell: (m) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs">{m.modelId}</p>
          <p className="truncate text-xs text-fg-muted">{m.name}</p>
        </div>
      ),
    },
    { id: "status", header: "Status", cell: (m) => <StatusPill status={STATUS_PILL[catalogStatus(m)]} label={STATUS_LABEL[catalogStatus(m)]} /> },
    { id: "tier", header: "Plan", cell: (m) => (m.tierRequired ? <Badge tone="accent">{m.tierRequired} +</Badge> : <span className="text-fg-subtle">Any paid</span>) },
    {
      id: "caps", header: "Capabilities", hideOnNarrow: true,
      cell: (m) => (
        <div className="flex flex-wrap gap-1">
          {m.vision ? <Badge>vision</Badge> : null}
          {m.tools ? <Badge>tools</Badge> : null}
          {m.reasoning ? <Badge>reasoning</Badge> : null}
          {m.audioIn ? <Badge>audio</Badge> : null}
          {!m.textOut ? <Badge tone="warning">no text out</Badge> : null}
        </div>
      ),
    },
    { id: "ctx", header: "Context", align: "right", hideOnNarrow: true, cell: (m) => contextLabel(m.contextLength) },
    { id: "price", header: "$ / M in · out", align: "right", hideOnNarrow: true, cell: (m) => <span className="tabular-nums">{priceLabel(m)}</span> },
  ];

  const set = (k: keyof CatalogFilter, v: string) => setF((x) => ({ ...x, [k]: v }));

  return (
    <>
      <PageHeader
        title="Cloud Model Catalog"
        description="Every OpenRouter model as last synced. Disable a model to stop the gateway serving it — even when the app asks for it by id — or restrict it to a plan."
        actions={
          can("ai.models.configure") ? (
            <Button variant="secondary" icon="refresh" loading={syncing} onClick={() => void sync()}>Sync catalog</Button>
          ) : null
        }
      />
      {q.error && !q.data ? <ErrorState message={q.error.message} onRetry={q.reload} /> : (
        <>
          <StatStrip className="mb-4">
            <Stat label="Synced models" value={q.data ? formatNumber(models.length) : "…"} />
            <Stat label="Live in app" value={q.data ? formatNumber(counts.live) : "…"} tone="success" />
            <Stat label="Served, not in picker" value={q.data ? formatNumber(counts.notListed) : "…"} hint="No enabled field: the app lists only enabled = true" />
            <Stat label="Unavailable upstream" value={q.data ? formatNumber(counts.unavailable) : "…"} tone={counts.unavailable ? "warning" : "default"} />
            <Stat label="Disabled" value={q.data ? formatNumber(counts.disabled) : "…"} />
            <Stat label="Plan-gated" value={q.data ? formatNumber(counts.gated) : "…"} />
          </StatStrip>
          {q.data?.truncated ? <div className="mb-4"><Notice tone="warning">Showing the first 2,000 models only.</Notice></div> : null}
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Field label="Search" className="w-full sm:w-72">
              {(p) => <TextInput {...p} value={f.q} placeholder="Model id or name" onChange={(e) => set("q", e.target.value)} />}
            </Field>
            <Field label="Status">
              {(p) => (
                <Select {...p} value={f.status} onChange={(e) => set("status", e.target.value)}>
                  <option value="all">All</option>
                  {(Object.keys(STATUS_LABEL) as CatalogStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Capability">
              {(p) => (
                <Select {...p} value={f.capability} onChange={(e) => set("capability", e.target.value)}>
                  <option value="all">Any</option>
                  <option value="vision">Vision</option>
                  <option value="tools">Tool calling</option>
                  <option value="reasoning">Reasoning</option>
                  <option value="audioIn">Audio input</option>
                  <option value="free">Free</option>
                </Select>
              )}
            </Field>
            <Field label="Plan">
              {(p) => (
                <Select {...p} value={f.tier} onChange={(e) => set("tier", e.target.value)}>
                  <option value="all">Any</option>
                  <option value="none">Not gated</option>
                  <option value="silver">Silver +</option>
                  <option value="gold">Gold only</option>
                </Select>
              )}
            </Field>
          </div>
          <DataTable
            label="Cloud models"
            columns={cols}
            rows={rows}
            rowKey={(m) => m.modelId}
            loading={q.loading && !q.data}
            onRowClick={setOpen}
            total={rows.length}
            empty={{ title: models.length ? "No model matches these filters" : "The catalog is empty", body: models.length ? undefined : "Run Sync catalog to pull OpenRouter's model list." }}
            rowTone={(m) => (catalogStatus(m) === "circuit-open" ? "danger" : null)}
          />
        </>
      )}

      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ""} subtitle={<code className="font-mono text-xs">{open?.modelId}</code>}>
        {open ? <ModelDetail m={open} canEdit={can("ai.models.configure")} onChange={(patch) => setChange({ model: open, patch })} /> : null}
      </Drawer>

      <ConfirmAction
        open={!!change}
        onClose={() => setChange(null)}
        title={change ? describe(change) : ""}
        level={change && (change.patch.enabled === false || change.patch.tierRequired) ? "reason" : "confirm"}
        danger={change?.patch.enabled === false}
        confirmLabel="Apply"
        impact={change ? impact(change) : null}
        onConfirm={async (reason) => {
          if (!change) return;
          await callAdmin("adminModels", { action: "setModel", modelId: change.model.modelId, ...change.patch, reason });
          toast.success("Saved", "The gateway picks this up within a minute; the app picker within 10 minutes.");
          setOpen(null);
          q.reload();
        }}
      />
    </>
  );
}

function describe(c: Change): string {
  if (c.patch.enabled !== undefined) return `${c.patch.enabled ? "Enable" : "Disable"} ${c.model.modelId}`;
  return `Plan access for ${c.model.modelId}`;
}

function impact(c: Change) {
  if (c.patch.enabled === false) {
    return <>The gateway stops serving this model for every user, including requests that name it directly, and drops it from every fallback chain. Routes that use it as primary fall through to their fallbacks.</>;
  }
  if (c.patch.enabled === true) {
    return <>The model becomes servable and appears in the app&apos;s model picker (if it is available upstream).</>;
  }
  if (c.patch.tierRequired) {
    return <>Users below {c.patch.tierRequired} are routed to another model instead. The app picker does not yet read this field, so they may still see it listed.</>;
  }
  return <>Every paid plan may use this model again.</>;
}

function ModelDetail({ m, canEdit, onChange }: { m: CatalogModel; canEdit: boolean; onChange: (p: Change["patch"]) => void }) {
  const s = catalogStatus(m);
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <dt className="text-fg-muted">Status</dt><dd><StatusPill status={STATUS_PILL[s]} label={STATUS_LABEL[s]} /></dd>
        <dt className="text-fg-muted">Upstream</dt><dd>{m.available ? "Available" : `Unavailable${m.availabilityReason ? ` — ${m.availabilityReason}` : ""}`}</dd>
        <dt className="text-fg-muted">Circuit</dt><dd>{m.health ? `${m.health.circuit} · ${m.health.consecutiveFailures} consecutive failures` : "No traffic recorded"}</dd>
        <dt className="text-fg-muted">Context</dt><dd>{contextLabel(m.contextLength)}</dd>
        <dt className="text-fg-muted">Price (per M tokens)</dt><dd>{priceLabel(m)}</dd>
      </dl>
      {s === "not-listed" ? (
        <Notice tone="info">This model has no <code>enabled</code> field, so the gateway serves it but the app&apos;s picker does not list it. Enable it to list it.</Notice>
      ) : null}
      {canEdit ? (
        <div className="space-y-3 rounded-md border border-line p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Admin switch</p>
              <p className="text-xs text-fg-muted">{m.enabled ? (m.appListed ? "Enabled" : "Enabled by default (field not set)") : "Disabled"}</p>
            </div>
            {m.enabled && m.appListed ? (
              <Button variant="danger" onClick={() => onChange({ enabled: false })}>Disable</Button>
            ) : (
              <Button variant="primary" onClick={() => onChange({ enabled: true })}>{m.enabled ? "List in app" : "Enable"}</Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Plan access</p>
              <p className="text-xs text-fg-muted">Free users never get cloud models.</p>
            </div>
            <Select
              aria-label="Plan access"
              value={m.tierRequired ?? "none"}
              onChange={(e) => {
                const v = e.target.value === "none" ? null : (e.target.value as "silver" | "gold");
                if (v !== m.tierRequired) onChange({ tierRequired: v });
              }}
            >
              <option value="none">Any paid plan</option>
              <option value="silver">Silver and Gold</option>
              <option value="gold">Gold only</option>
            </Select>
          </div>
        </div>
      ) : <Badge>View only</Badge>}
      <p className="text-xs text-fg-muted">
        Use it in a route on <Link className="underline" href="/dashboard/routing">Routing &amp; Fallbacks</Link>.
      </p>
    </div>
  );
}
