"use client";

import { useCallable } from "@/lib/useCallable";
import { Badge, Button, DataTable, ErrorState, Notice, PageHeader, Panel, Skeleton, Stat, StatStrip, StatusPill, relativeTime } from "@/ui";
import { uptimeLabel, type SystemStatus } from "./types";

const PROBE = {
  reachable: { pill: "ok", label: "Reachable" },
  server_error: { pill: "degraded", label: "Server error" },
  unreachable: { pill: "down", label: "Unreachable" },
  inactive: { pill: "off", label: "Inactive" },
  blocked: { pill: "off", label: "Private address (not probed)" },
} as const;

const SECRET_LABEL: Record<string, string> = { openrouter: "OpenRouter key", huggingface: "HuggingFace token", websearch: "Web search key" };

export default function ServiceHealthPage() {
  const q = useCallable<SystemStatus>("adminInsights", { action: "systemStatus" });
  const d = q.data;
  const active = d?.providers.filter((p) => p.status !== "inactive") ?? [];
  const failing = active.filter((p) => p.status === "server_error" || p.status === "unreachable").length;

  return (
    <>
      <PageHeader
        title="Service Health"
        description="Checks run by the server when you open this page. Nothing here is simulated."
        meta={d ? <span className="text-xs text-fg-subtle">Checked {relativeTime(d.checkedAt)}</span> : null}
        actions={<Button variant="secondary" icon="refresh" loading={q.refreshing || q.loading} onClick={q.reload}>Re-check</Button>}
      />
      {q.error && !d ? <ErrorState message={q.error.message} onRetry={q.reload} /> : !d ? <Skeleton className="h-96 w-full" /> : (
        <div className="space-y-4">
          <StatStrip>
            <Stat label="Firestore" value={d.firestore.ok ? `${d.firestore.latencyMs} ms` : "Failed"} tone={d.firestore.ok ? (d.firestore.latencyMs! > 1500 ? "warning" : "success") : "danger"} hint="One server-side document read" />
            <Stat label="Providers answering" value={`${active.length - failing}/${active.length}`} tone={failing ? "warning" : "success"} hint="Active providers only" />
            <Stat label="App Check" value={d.appCheckEnforced === null ? "Unknown" : d.appCheckEnforced ? "Enforced" : "Not enforced"} tone={d.appCheckEnforced ? "success" : "warning"} />
            <Stat label="Last payment webhook" value={d.lastWebhookAt === undefined ? "Unknown" : d.lastWebhookAt === null ? "Never" : relativeTime(d.lastWebhookAt)} />
          </StatStrip>

          <Panel title="Secrets" description="Which store serves each platform secret. Values are never read into the console.">
            <ul className="grid gap-2 sm:grid-cols-3">
              {d.secrets.map((s) => (
                <li key={s.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
                  <span>{SECRET_LABEL[s.id] ?? s.id}</span>
                  {s.source === null ? <Badge>Unknown</Badge> : s.source === "none" ? <Badge tone="danger">Missing</Badge>
                    : <Badge tone="success">{s.source === "env" ? "Secret Manager" : "Firestore"}</Badge>}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Provider reachability" description="An unauthenticated GET /models from the server. It proves the host answers; a 401 or 404 still counts as reachable, so this is not a health check of the key or model." flush>
            <DataTable
              label="Provider probes"
              columns={[
                { id: "n", header: "Provider", cell: (p) => <div><p className="text-sm">{p.name}</p><p className="font-mono text-xs text-fg-muted">{p.id}</p></div> },
                { id: "c", header: "Used for", cell: (p) => <Badge>{p.category}</Badge> },
                { id: "s", header: "Result", cell: (p) => <StatusPill status={PROBE[p.status].pill} label={PROBE[p.status].label} /> },
                { id: "h", header: "HTTP", align: "right", cell: (p) => p.httpStatus ?? "—" },
                { id: "l", header: "Latency", align: "right", cell: (p) => (p.latencyMs === null ? "—" : `${p.latencyMs} ms`) },
                { id: "u", header: "Last 24 h", hideOnNarrow: true, cell: (p) => uptimeLabel(p.history) ?? <span className="text-fg-subtle">No history yet</span> },
                { id: "k", header: "Key", cell: (p) => (p.hasKey ? <Badge tone="success">Stored</Badge> : <Badge tone="warning">Missing</Badge>) },
              ]}
              rows={d.providers}
              rowKey={(p) => p.id}
              rowTone={(p) => (p.status === "unreachable" || p.status === "server_error" ? "warning" : null)}
              empty={{ title: "No providers registered" }}
            />
          </Panel>

          <Panel title="Scheduled jobs" description="Subscription expiry (daily), AI usage rollup (00:30 UTC) and provider probes (every 30 minutes) record each run.">
            {d.jobs === null ? <p className="text-sm text-fg-muted">Could not read job runs.</p> : d.jobs.length === 0 ? (
              <p className="text-sm text-fg-muted">No recorded runs yet.</p>
            ) : (
              <ul className="space-y-2">
                {d.jobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
                    <span className="font-mono text-xs">{j.id}</span>
                    <span className="flex items-center gap-2 text-xs text-fg-muted">
                      {relativeTime(j.lastRunAt)}
                      <StatusPill status={j.lastResult === "ok" ? "ok" : "down"} label={j.lastResult ?? "unknown"} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Notice tone="info">
            Not covered here: whether every function is deployed (check after a deploy with the endpoint list in the readiness report) and Firebase Auth health (it has no status API).
          </Notice>
        </div>
      )}
    </>
  );
}
