"use client";

import { useState } from "react";
import { DataTable, EmptyState, ErrorState, Field, Notice, Panel, Select, Skeleton, Stat, StatStrip, type Column } from "@/ui";
import { humanize, summarizeCos, summarizeTelemetry, type CosMetrics } from "./logic";
import { useCosTelemetry } from "./useCos";

function CosMetricsPanel({ metrics }: { metrics: CosMetrics | null }) {
  if (!metrics || metrics.days.length === 0) {
    return (
      <Panel title="Conversation OS quality metrics">
        <EmptyState compact title="No Conversation OS metrics yet" icon="info">
          {metrics?.enabled
            ? "Collection is on, but no device has reported in this window."
            : "Collection is off. Turn on \"Report anonymous quality metrics\" in the Quality gate tab and publish to start (default off)."}
        </EmptyState>
      </Panel>
    );
  }
  const s = summarizeCos(metrics.days);
  const cols: Column<(typeof s.breakdown)[number]>[] = [
    { id: "k", header: "Dimension", cell: (r) => humanize(r.kind) },
    { id: "v", header: "Value", cell: (r) => humanize(r.key) },
    { id: "t", header: "Turns", cell: (r) => r.turns, align: "right" },
    { id: "f", header: "Gate failed", cell: (r) => r.failed, align: "right" },
  ];
  const vcols: Column<(typeof s.violations)[number]>[] = [
    { id: "c", header: "Violation", cell: (r) => humanize(r.code) },
    { id: "n", header: "Count", cell: (r) => r.count, align: "right" },
  ];
  return (
    <Panel title="Conversation OS quality metrics" description="Aggregated daily counters reported by the app. No user text, prompts or per-user data.">
      {!metrics.enabled ? (
        <Notice tone="warning" title="Collection is switched off">
          New events are not being accepted (config telemetryEnabled). The numbers below may be old.
        </Notice>
      ) : null}
      <StatStrip>
        <Stat label="Turns" value={s.turns} hint={`${s.days} day(s) with data`} />
        <Stat label="Gate pass rate" value={s.passRate === null ? "-" : `${s.passRate}%`} tone={s.passRate !== null && s.passRate < 90 ? "warning" : "success"} />
        <Stat label="Repaired" value={s.repairRate === null ? "-" : `${s.repairRate}%`} hint={`${s.repaired} turn(s)`} />
        <Stat label="Escalated" value={s.escalationRate === null ? "-" : `${s.escalationRate}%`} hint={`${s.escalated} turn(s)`} />
        <Stat label="Avg response" value={s.avgTotalMs === null ? "-" : `${s.avgTotalMs} ms`} hint={s.avgGateMs === null ? undefined : `gate ${s.avgGateMs} ms`} />
      </StatStrip>
      <div className="mt-4 space-y-4">
        <DataTable label="Turns by channel, intent and language" columns={cols} rows={s.breakdown} rowKey={(r) => r.kind + ":" + r.key} empty={{ title: "No breakdown yet" }} />
        {s.violations.length > 0 ? (
          <DataTable label="Gate violations" columns={vcols} rows={s.violations} rowKey={(r) => r.code} empty={{ title: "No violations" }} />
        ) : null}
      </div>
    </Panel>
  );
}

export function TelemetryTab() {
  const [days, setDays] = useState(7);
  const t = useCosTelemetry(days);

  if (t.loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (t.error) return <ErrorState message={t.error.message} onRetry={t.reload} />;
  const data = t.data;
  if (!data) return null;
  const s = summarizeTelemetry(data.rows);
  const cols: Column<(typeof s.models)[number]>[] = [
    { id: "m", header: "Model", cell: (r) => <span className="break-all">{r.model}</span> },
    { id: "r", header: "Requests", cell: (r) => r.requests, align: "right" },
    { id: "f", header: "Failed", cell: (r) => r.failed, align: "right" },
    { id: "p50", header: "TTFT p50", cell: (r) => (r.ttftP50Ms === null ? "-" : `${r.ttftP50Ms} ms`), align: "right" },
    { id: "p95", header: "TTFT p95", cell: (r) => (r.ttftP95Ms === null ? "-" : `${r.ttftP95Ms} ms`), align: "right" },
  ];

  return (
    <div className="space-y-4">
      <Notice tone="info" title="Read-only">
        The first block comes from the existing daily AI usage rollups, the Conversation OS block from the app-reported daily counters (cos_telemetry_daily). Both
        hold ids, counts and latencies only; never user text or prompts, and no per-user rows.
      </Notice>
      {!data.telemetryEnabled ? (
        <Notice tone="warning" title="AI telemetry is switched off">
          New events are not being recorded (feature flag ai_telemetry_enabled). Existing rollups below may be old.
        </Notice>
      ) : null}
      <div className="flex justify-end">
        <Field label="Window" className="w-40">
          {(p) => (
            <Select {...p} value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={1}>Today</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            </Select>
          )}
        </Field>
      </div>
      {data.rows.length === 0 ? (
        <EmptyState title="No telemetry in this window" icon="chart">
          Nothing has been rolled up for the last {days} day(s). Enable ai_telemetry_enabled in Feature Flags to start collecting.
        </EmptyState>
      ) : (
        <>
          <StatStrip>
            <Stat label="Requests" value={s.requests} hint={`${s.days} day(s) with data`} />
            <Stat label="Served" value={s.served} tone="success" />
            <Stat label="Failed" value={s.failed} tone={s.failed > 0 ? "warning" : "default"} />
            <Stat label="Success rate" value={s.successRate === null ? "-" : `${s.successRate}%`} />
          </StatStrip>
          <Panel title="By model" flush>
            <DataTable label="Requests by model" columns={cols} rows={s.models} rowKey={(r) => r.model} empty={{ title: "No per-model data" }} />
          </Panel>
        </>
      )}
      <CosMetricsPanel metrics={data.cosMetrics} />
    </div>
  );
}
