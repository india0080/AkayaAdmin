"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCallable } from "@/lib/useCallable";
import { Button, DataTable, ErrorState, Notice, PageHeader, Panel, Skeleton, Stat, StatStrip, formatNumber, useToast } from "@/ui";
import { DailyBars } from "./DailyBars";
import { modelTotals, usd, type AiUsage } from "./types";

export default function AiUsagePage() {
  const toast = useToast();
  const q = useCallable<AiUsage>("adminInsights", { action: "aiUsage", days: 30 });
  const [running, setRunning] = useState(false);
  const d = q.data;

  const days = useMemo(() => [...(d?.days ?? [])].sort((a, b) => a.day.localeCompare(b.day)), [d]);
  const totals = useMemo(() => {
    const t = { requests: 0, served: 0, failed: 0, tokens: 0, cost: 0, unpriced: 0 };
    for (const x of days) {
      t.requests += x.requests;
      t.served += x.served;
      t.failed += x.failed;
      t.tokens += x.estOutTokens;
      t.cost += x.estCostUsd;
      t.unpriced += x.unpricedRequests;
    }
    return t;
  }, [days]);
  const byModel = useMemo(() => modelTotals(days), [days]);

  async function rollupYesterday() {
    setRunning(true);
    try {
      const r = await callAdmin<{ day: string; events: number }>("adminInsights", { action: "rollup" });
      toast.success("Rollup complete", `${r.day}: ${formatNumber(r.events)} events`);
      q.reload();
    } catch (e) {
      toast.error("Rollup failed", (e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <PageHeader
        title="AI Usage & Cost"
        description="Cloud chat requests through the gateway, folded daily. Tokens and cost are ESTIMATED: output tokens ≈ characters ÷ 4 × the catalog price; input tokens are not counted."
        actions={<Button variant="secondary" loading={running} onClick={() => void rollupYesterday()}>Recompute yesterday</Button>}
      />
      {q.error && !d ? <ErrorState message={q.error.message} onRetry={q.reload} /> : !d ? <Skeleton className="h-96 w-full" /> : (
        <div className="space-y-4">
          {d.telemetryOn === false ? (
            <Notice tone="warning" title="Telemetry is off">
              Nothing new is being recorded. Turn on &ldquo;AI usage telemetry&rdquo; on <Link className="underline" href="/dashboard/flags">Feature Flags</Link> to start
              (one small Firestore write per cloud chat request; no message content).
            </Notice>
          ) : d.telemetryOn ? (
            <Notice tone="info">Telemetry is on. {d.todayEvents === null ? "" : `${formatNumber(d.todayEvents)} request(s) recorded today so far; `}each day is folded in at 00:30 UTC.</Notice>
          ) : null}
          {days.length === 0 ? (
            <Panel><p className="text-sm text-fg-muted">No daily rollups yet.</p></Panel>
          ) : (
            <>
              <StatStrip>
                <Stat label={`Requests (${days.length} days)`} value={formatNumber(totals.requests)} />
                <Stat label="Served" value={totals.requests ? `${((totals.served / totals.requests) * 100).toFixed(1)}%` : "—"} tone={totals.failed ? "warning" : "default"} hint={`${formatNumber(totals.failed)} failed`} />
                <Stat label="Output tokens" value={formatNumber(totals.tokens)} estimated />
                <Stat label="Cost" value={usd(totals.cost)} estimated hint={totals.unpriced ? `${formatNumber(totals.unpriced)} served requests had no catalog price` : "Output tokens only"} />
              </StatStrip>
              <Panel title="Requests per day">
                <DailyBars data={days.map((x) => ({ day: x.day, value: x.requests }))} label="Requests per day" unit="Requests" />
              </Panel>
              <DataTable
                label="Usage by model"
                columns={[
                  { id: "m", header: "Served model", cell: (r) => <span className="font-mono text-xs">{r.model}</span> },
                  { id: "r", header: "Requests", align: "right", cell: (r) => formatNumber(r.requests) },
                  { id: "s", header: "Served", align: "right", cell: (r) => formatNumber(r.served) },
                  { id: "t", header: "Output tokens (est.)", align: "right", cell: (r) => formatNumber(r.estOutTokens) },
                  { id: "c", header: "Cost (est.)", align: "right", cell: (r) => usd(r.estCostUsd) },
                ]}
                rows={byModel}
                rowKey={(r) => r.model}
              />
            </>
          )}
        </div>
      )}
    </>
  );
}
