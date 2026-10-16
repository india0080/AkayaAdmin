"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCan } from "@/lib/session";
import { Badge, Button, ErrorState, Notice, PageHeader, Panel, PlanBadge, Skeleton } from "@/ui";
import { PLANS, describeLimit, effectiveRateLimits, type EffectiveLimits, type LimitSource } from "./logic";

const SOURCE_LABEL: Record<LimitSource, string> = {
  rateLimits: "config/app → rateLimits",
  "legacy-fields": "config/app → legacy per-plan fields",
  "server-default": "Server defaults (nothing configured)",
};

export default function ChatLimitsPage() {
  const can = useCan();
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: EffectiveLimits | null }>({
    loading: true,
    error: null,
    data: null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const snap = await getDoc(doc(db, "config", "app"));
      setState({ loading: false, error: null, data: effectiveRateLimits(snap.exists() ? snap.data() : null) });
    } catch {
      setState({ loading: false, error: "Could not read config/app. Check your connection and permissions.", data: null });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="Chat Limits"
        description="Daily message caps per plan, exactly as the chat gateways enforce them today."
        actions={
          <>
            <Button icon="refresh" onClick={() => void load()} loading={state.loading && !!state.data}>
              Refresh
            </Button>
            {can("config.limits") ? (
              <Link href="/dashboard/config" className="inline-flex h-9 items-center rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
                Edit in App Config
              </Link>
            ) : null}
          </>
        }
      />

      <div className="mb-4">
        <Notice tone="info" title="Message volume is not collected yet">
          Per-day message and model usage arrives with AI request telemetry (roadmap: Telemetry &amp; Command Center). This page
          previously showed a simulated volume chart; it has been removed so no invented number appears in the console.
        </Notice>
      </div>

      <Panel
        flush
        title="Effective daily limits"
        description={state.data ? <>Source: <Badge>{SOURCE_LABEL[state.data.source]}</Badge></> : undefined}
      >
        {state.error ? (
          <ErrorState message={state.error} onRetry={() => void load()} compact />
        ) : (
          <table className="w-full text-sm" aria-label="Daily message limits by plan">
            <thead className="bg-panel-2">
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="px-4 py-2 font-semibold">Plan</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">Messages per day</th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((p) => (
                <tr key={p} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">
                    <PlanBadge plan={p} />
                  </td>
                  <td className="tabular px-4 py-2.5 text-right font-medium">
                    {state.loading || !state.data ? <Skeleton className="ml-auto h-4 w-24" /> : describeLimit(state.data.limits[p])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="mt-3 text-xs text-fg-subtle">
        Paid plans also skip the token balance while active. A plan missing from the configured map falls back to the Free limit — the same rule the server applies.
      </p>
    </>
  );
}
