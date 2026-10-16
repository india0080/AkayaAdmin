"use client";

import Link from "next/link";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import type { SystemStatus } from "@/features/insights/types";
import type { PlanRow } from "@/features/revenue/types";
import { Badge, Button, ErrorState, Notice, PageHeader, Panel, Skeleton } from "@/ui";

export default function OnboardingPage() {
  const can = useCan();
  const health = useCallable<SystemStatus>("adminInsights", can("system.read") ? { action: "systemStatus" } : null);
  const plans = useCallable<{ plans: PlanRow[] }>("adminBilling", can("plans.read") ? { action: "plans" } : null);
  const keyed = health.data?.providers.filter(p => p.hasKey).length ?? 0;
  const active = plans.data?.plans.filter(p => p.isActive).length ?? 0;
  return <>
    <PageHeader title="Setup Wizard" description="Check current backend configuration, then open the admin tools to resolve missing setup."
      actions={<Button variant="secondary" icon="refresh" loading={health.loading || health.refreshing || plans.loading || plans.refreshing} onClick={() => { health.reload(); plans.reload(); }}>Refresh checks</Button>} />
    <Notice tone="info">These checks show configuration and service reachability. Live AI requests, payment settlement and device notifications need separate end-to-end verification.</Notice>
    <div className="mt-4 space-y-4">
      <Panel title="1. AI providers" description="Provider credentials registered with the backend. Keys stay masked.">
        {!can("system.read") ? <p>System read permission is required.</p> : health.error ? <ErrorState message={health.error.message} onRetry={health.reload} /> : !health.data ? <Skeleton className="h-20 w-full" /> : <>
          <p className="mb-3 text-sm"><Badge tone={keyed ? "success" : "warning"}>{keyed} with keys</Badge> of {health.data.providers.length} registered providers.</p>
          <ul className="space-y-2">{health.data.providers.map(p => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3 text-sm"><span>{p.name}</span><span className="flex flex-wrap gap-2"><Badge tone={p.hasKey ? "success" : "warning"}>{p.hasKey ? "Key configured" : "Missing key"}</Badge><Badge tone={p.status === "reachable" ? "success" : "warning"}>{p.status}</Badge></span></li>)}</ul>
          {!health.data.providers.length ? <p>No providers registered. AI availability has not been verified.</p> : null}
        </>}
        {can("ai.providers.read") ? <Link className="mt-3 inline-block text-sm text-accent-text underline" href="/dashboard/providers">Open providers</Link> : null}
      </Panel>
      <Panel title="2. Subscription plans" description="The plan catalog used by app checkout. Compiled fallback plans are labelled explicitly.">
        {!can("plans.read") ? <p>Plans read permission is required.</p> : plans.error ? <ErrorState message={plans.error.message} onRetry={plans.reload} /> : !plans.data ? <Skeleton className="h-16 w-full" /> : <>
          <p className="mb-3 text-sm"><Badge tone={active ? "success" : "warning"}>{active} active plans</Badge></p>
          <ul className="space-y-2">{plans.data.plans.map(p => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3 text-sm"><span>{p.name || p.id}</span><span className="flex flex-wrap gap-2"><Badge tone={p.isActive ? "success" : "warning"}>{p.isActive ? "Active" : "Hidden"}</Badge><Badge tone={p.stored ? "neutral" : "warning"}>{p.stored ? "Stored catalog" : "Compiled fallback"}</Badge></span></li>)}</ul>
          {!plans.data.plans.length ? <p>No plans returned by the backend.</p> : null}
        </>}
        {can("plans.read") ? <Link className="mt-3 inline-block text-sm text-accent-text underline" href="/dashboard/plans">Open plans and pricing</Link> : null}
      </Panel>
      <Panel title="3. Backend connectivity" description="A Firestore read does not verify external authentication or scheduled jobs.">
        {!can("system.read") ? <p>System read permission is required.</p> : health.error ? <ErrorState message={health.error.message} onRetry={health.reload} /> : !health.data ? <Skeleton className="h-12 w-full" /> : <p className="text-sm">Firestore: <Badge tone={health.data.firestore.ok ? "success" : "danger"}>{health.data.firestore.ok ? "Reachable" : "Unavailable"}</Badge> {health.data.firestore.latencyMs === null ? "" : `${health.data.firestore.latencyMs} ms`}</p>}
        {can("system.read") ? <Link className="mt-3 inline-block text-sm text-accent-text underline" href="/dashboard/health">Open service health</Link> : null}
      </Panel>
    </div>
  </>;
}
