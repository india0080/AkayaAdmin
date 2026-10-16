"use client";

import { useMemo } from "react";
import { useCallable } from "@/lib/useCallable";
import { Badge, Button, DataTable, ErrorState, Notice, PageHeader, Panel, Stat, StatStrip, StatusPill, formatNumber, relativeTime, type Column } from "@/ui";
import { healthVerdict, successRate } from "./logic";

interface HealthRow {
  modelId: string;
  circuit: string;
  successes: number;
  failures: number;
  consecutiveFailures: number;
  p50Ms: number | null;
  p95Ms: number | null;
  ttftP50Ms: number | null;
  ttftP95Ms: number | null;
  lastSuccessTs: number | null;
  lastFailureTs: number | null;
}

interface ProviderRow {
  providerId: string;
  name: string;
  type: string | null;
  category: string | null;
  model: string | null;
  enabled: boolean;
  hasKey: boolean;
}

interface Inventory {
  summary: {
    openRouterCatalog: { totalSynced: number; enabled: number; selectable: number; unavailable: number };
    directProviders: { registered: number; withKeyConfigured: number };
  };
  health: HealthRow[];
  providers: ProviderRow[];
  providerIdsWithKey: string[];
  activeFallbackChains: { free: string[]; vision: string[]; visionFloor?: string[] };
}

const ms = (v: number | null) => (v === null ? "—" : `${formatNumber(Math.round(v))} ms`);

export default function HealthPage() {
  const q = useCallable<Inventory>("adminModelInventory", {});
  const d = q.data;

  const health = useMemo(
    () => [...(d?.health ?? [])].sort((a, b) => b.consecutiveFailures - a.consecutiveFailures || a.modelId.localeCompare(b.modelId)),
    [d],
  );
  const open = health.filter((h) => h.circuit === "open").length;

  const hcols: Column<HealthRow>[] = [
    { id: "m", header: "Model", cell: (h) => <span className="font-mono text-xs">{h.modelId}</span> },
    {
      id: "s", header: "Circuit",
      cell: (h) => {
        const v = healthVerdict(h);
        return <StatusPill status={v} label={h.circuit === "closed" && v === "degraded" ? `closed · ${h.consecutiveFailures} failing` : h.circuit} />;
      },
    },
    {
      id: "r", header: "Success", align: "right",
      cell: (h) => {
        const r = successRate(h.successes, h.failures);
        return <span className="tabular-nums" title={`${h.successes} ok / ${h.failures} failed`}>{r === null ? "—" : `${(r * 100).toFixed(1)}%`}</span>;
      },
    },
    { id: "p", header: "Headers p50 · p95", align: "right", hideOnNarrow: true, cell: (h) => <span className="tabular-nums">{ms(h.p50Ms)} · {ms(h.p95Ms)}</span> },
    { id: "t", header: "First token p50 · p95", align: "right", hideOnNarrow: true, cell: (h) => <span className="tabular-nums">{ms(h.ttftP50Ms)} · {ms(h.ttftP95Ms)}</span> },
    { id: "l", header: "Last failure", align: "right", hideOnNarrow: true, cell: (h) => relativeTime(h.lastFailureTs) },
  ];

  const pcols: Column<ProviderRow>[] = [
    { id: "n", header: "Provider", cell: (p) => <div><p className="text-sm">{p.name}</p><p className="font-mono text-xs text-fg-muted">{p.providerId}</p></div> },
    { id: "c", header: "Category", cell: (p) => <Badge>{p.category ?? "chat"}</Badge> },
    { id: "m", header: "Model", hideOnNarrow: true, cell: (p) => <span className="font-mono text-xs">{p.model ?? "—"}</span> },
    { id: "a", header: "Active", cell: (p) => <StatusPill status={p.enabled ? "ok" : "off"} label={p.enabled ? "Active" : "Inactive"} /> },
    { id: "k", header: "Key", cell: (p) => (d?.providerIdsWithKey.includes(p.providerId) ? <Badge tone="success">Stored</Badge> : <Badge tone="warning">Missing</Badge>) },
  ];

  return (
    <>
      <PageHeader
        title="Model Health"
        description="Per-model circuit state and latency as recorded by the chat gateway across all instances. Numbers are from real traffic, not probes."
        actions={<Button variant="secondary" icon="refresh" loading={q.refreshing} onClick={q.reload}>Refresh</Button>}
      />
      {q.error && !d ? <ErrorState message={q.error.message} onRetry={q.reload} /> : (
        <div className="space-y-4">
          <StatStrip>
            <Stat label="Models with traffic" value={d ? formatNumber(health.length) : "…"} />
            <Stat label="Circuits open" value={d ? formatNumber(open) : "…"} tone={open ? "danger" : "success"} />
            <Stat label="Selectable in app" value={d ? formatNumber(d.summary.openRouterCatalog.selectable) : "…"} hint={d ? `of ${formatNumber(d.summary.openRouterCatalog.totalSynced)} synced` : undefined} />
            <Stat label="Direct providers" value={d ? `${d.summary.directProviders.withKeyConfigured}/${d.summary.directProviders.registered}` : "…"} hint="with a stored key" />
          </StatStrip>
          <Notice tone="info">
            &ldquo;Headers&rdquo; is time until the upstream accepted the request; &ldquo;First token&rdquo; is time from request arrival to the first streamed word. Only chat traffic through the gateway is measured.
          </Notice>
          <DataTable
            label="Model health"
            columns={hcols}
            rows={health}
            rowKey={(h) => h.modelId}
            loading={q.loading && !d}
            rowTone={(h) => (h.circuit === "open" ? "danger" : h.consecutiveFailures > 0 ? "warning" : null)}
            empty={{ title: "No traffic recorded yet", body: "Health appears after the gateway serves requests." }}
          />
          {d ? (
            <Panel title="Effective gateway fallback chains" description="After the catalog filter (disabled, unavailable and unsuitable models removed).">
              <dl className="grid gap-3 text-sm md:grid-cols-3">
                {(["free", "vision", "visionFloor"] as const).map((k) => (
                  <div key={k}>
                    <dt className="mb-1 text-xs font-medium uppercase text-fg-muted">{k === "free" ? "Text" : k === "vision" ? "Vision" : "Paid vision floor"}</dt>
                    <dd className="space-y-0.5 font-mono text-xs">
                      {(d.activeFallbackChains[k] ?? []).length ? (d.activeFallbackChains[k] ?? []).map((m) => <p key={m}>{m}</p>) : <p className="text-fg-subtle">(none)</p>}
                    </dd>
                  </div>
                ))}
              </dl>
            </Panel>
          ) : null}
          <DataTable label="Direct providers" columns={pcols} rows={d?.providers ?? []} rowKey={(p) => p.providerId} loading={q.loading && !d}
            empty={{ title: "No direct providers registered" }} />
        </div>
      )}
    </>
  );
}
