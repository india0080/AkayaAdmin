"use client";

import { useState } from "react";
import { useCallable } from "@/lib/useCallable";
import { DataTable, ErrorState, Notice, PageHeader, Panel, Select, Skeleton, Stat, StatStrip, formatNumber } from "@/ui";
import { DailyBars } from "./DailyBars";
import TrafficPage from "./TrafficPage";
import ActivityMonitor from "./ActivityMonitor";

interface Activity {
  generatedAt: number;
  series: { day: string; total: number | null; guests: number | null }[];
  mix: { total: number | null; guests: number | null; silver: number | null; gold: number | null };
}

export default function ActivityPage() {
  return <ActivityMonitor><TrafficPage><AcquisitionSnapshot /></TrafficPage></ActivityMonitor>;
}

function AcquisitionSnapshot() {
  const [days, setDays] = useState(30);
  const q = useCallable<Activity>("adminInsights", { action: "activity", days });
  const d = q.data;
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatNumber(v));
  const sum = (k: "total" | "guests") => d?.series.reduce((s, x) => (x[k] === null || s === null ? null : s + (x[k] as number)), 0 as number | null) ?? null;
  const periodTotal = sum("total");
  const periodGuests = sum("guests");
  const accounts = d && d.mix.total !== null && d.mix.guests !== null ? d.mix.total - d.mix.guests : null;

  return (
    <>
      <PageHeader
        title="Acquisition & Activity"
        description="New accounts per UTC day and today's plan mix. Server counts only."
        actions={
          <Select aria-label="Period" value={String(days)} onChange={(e) => setDays(Number(e.target.value))}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </Select>
        }
      />
      {q.error && !d ? <ErrorState message={q.error.message} onRetry={q.reload} /> : !d ? <Skeleton className="h-96 w-full" /> : (
        <div className="space-y-4">
          <StatStrip>
            <Stat label={`Signups, ${days} days`} value={n(periodTotal)} />
            <Stat label="of which guests" value={n(periodGuests)} hint={periodTotal ? `${Math.round(((periodGuests ?? 0) / periodTotal) * 100)}%` : undefined} />
          </StatStrip>
          <Panel title="Signups per day" description="Every new user document, guests included.">
            <DailyBars data={d.series.map((s) => ({ day: s.day, value: s.total }))} label="Signups per day" unit="Signups" />
          </Panel>
          <Panel title="Today's mix" description="A snapshot of current accounts, not a conversion funnel.">
            <StatStrip>
              <Stat label="All users" value={n(d.mix.total)} />
              <Stat label="Guests" value={n(d.mix.guests)} />
              <Stat label="Signed-in accounts" value={n(accounts)} hint="All users minus guests" />
              <Stat label="Active Silver" value={n(d.mix.silver)} />
              <Stat label="Active Gold" value={n(d.mix.gold)} />
            </StatStrip>
            <div className="mt-3">
              <Notice tone="info">
                Conversion rates (guest → account → paid) are not shown: the app records no sign-up or upgrade events, so a
                real funnel cannot be measured. The previous page labelled new paid signups as &ldquo;Plan upgraded&rdquo;; that event does not exist.
              </Notice>
            </div>
          </Panel>
          <DataTable
            label="Signups by day"
            columns={[
              { id: "d", header: "Day (UTC)", cell: (r) => r.day },
              { id: "t", header: "Signups", align: "right", cell: (r) => n(r.total) },
              { id: "g", header: "Guests", align: "right", cell: (r) => n(r.guests) },
              { id: "a", header: "Accounts", align: "right", cell: (r) => (r.total === null || r.guests === null ? "—" : formatNumber(r.total - r.guests)) },
            ]}
            rows={[...d.series].reverse()}
            rowKey={(r) => r.day}
          />
        </div>
      )}
    </>
  );
}
