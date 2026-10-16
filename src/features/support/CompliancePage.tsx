"use client";

import { useState } from "react";
import Link from "next/link";
import { callAdmin } from "@/lib/api";
import { useCallable } from "@/lib/useCallable";
import {
  Badge, Button, DataTable, EmptyState, ErrorState, Notice, PageHeader,
  Panel, Stat, StatStrip, type Column,
} from "@/ui";

interface ErasureRequest {
  uid: string;
  status: "pending" | "in_progress" | "overdue";
  requestedAt: number | null;
  slaDays: number;
}

interface RetentionPolicy {
  dataType: string;
  retentionDays: number;
  violations: number;
  lastAudit: string;
}

interface ConsentStat {
  type: string;
  collected: number;
  pending: number;
  rate: string;
}

const RETENTION_POLICIES: RetentionPolicy[] = [
  { dataType: "Chat messages", retentionDays: 365, violations: 0, lastAudit: "—" },
  { dataType: "Voice recordings", retentionDays: 90, violations: 0, lastAudit: "—" },
  { dataType: "Usage analytics", retentionDays: 730, violations: 0, lastAudit: "—" },
  { dataType: "Account PII", retentionDays: 0, violations: 0, lastAudit: "—" },
  { dataType: "Payment records", retentionDays: 2555, violations: 0, lastAudit: "—" },
];

const CONSENT_STATS: ConsentStat[] = [
  { type: "Data processing", collected: 0, pending: 0, rate: "—" },
  { type: "Marketing comms", collected: 0, pending: 0, rate: "—" },
  { type: "Analytics tracking", collected: 0, pending: 0, rate: "—" },
  { type: "Third-party sharing", collected: 0, pending: 0, rate: "—" },
];

export default function CompliancePage() {
  const q = useCallable<{ rows: ErasureRequest[] }>("adminCompliance", { action: "erasureQueue" });
  const rows = q.data?.rows ?? [];
  const backendMissing = q.error?.message?.includes("not-found") || q.error?.message?.includes("NOT_FOUND");

  const erasureCols: Column<ErasureRequest>[] = [
    { id: "uid", header: "User ID", cell: (r) => <span className="font-mono text-xs">{r.uid}</span> },
    {
      id: "status", header: "Status",
      cell: (r) => (
        <Badge tone={r.status === "overdue" ? "danger" : r.status === "in_progress" ? "warning" : "info"}>
          {r.status.replace("_", " ")}
        </Badge>
      ),
    },
    { id: "sla", header: "SLA (days)", align: "right", cell: (r) => r.slaDays },
    {
      id: "link", header: "", align: "right",
      cell: (r) => (
        <Link href={`/dashboard/erasure`} className="text-sm font-medium text-accent hover:underline">
          View in Erasure
        </Link>
      ),
    },
  ];

  const retentionCols: Column<RetentionPolicy>[] = [
    { id: "type", header: "Data type", cell: (r) => r.dataType },
    { id: "days", header: "Retention (days)", align: "right", cell: (r) => (r.retentionDays === 0 ? "Until erasure" : r.retentionDays) },
    {
      id: "violations", header: "Violations",
      cell: (r) => <Badge tone={r.violations > 0 ? "danger" : "success"}>{r.violations}</Badge>,
    },
    { id: "audit", header: "Last audit", align: "right", cell: (r) => r.lastAudit },
  ];

  const consentCols: Column<ConsentStat>[] = [
    { id: "type", header: "Consent type", cell: (r) => r.type },
    { id: "collected", header: "Collected", align: "right", cell: (r) => r.collected || "—" },
    { id: "pending", header: "Pending", align: "right", cell: (r) => r.pending || "—" },
    { id: "rate", header: "Collection rate", align: "right", cell: (r) => r.rate },
  ];

  return (
    <>
      <PageHeader
        title="DPDP Compliance"
        description="Dashboard for India's Digital Personal Data Protection Act — erasure SLAs, data retention policies, and consent tracking."
      />
      <div className="mb-4">
        <Notice tone="info" title="Backend deployment required">
          This dashboard requires the <code className="rounded bg-raised px-1 font-mono text-xs">adminCompliance</code> Cloud
          Function to be deployed. Erasure queue data will appear once the function is live.
        </Notice>
      </div>
      <StatStrip className="mb-6">
        <Stat label="Pending erasure requests" value="—" />
        <Stat label="Avg SLA (days)" value="—" />
        <Stat label="Consent records" value="—" />
        <Stat label="Retention violations" value="—" />
      </StatStrip>

      <div className="space-y-6">
        <Panel title="Erasure Requests" description="Queue of pending data erasure requests under DPDP" flush>
          {backendMissing ? (
            <ErrorState
              title="Backend not deployed"
              message="The adminCompliance Cloud Function was not found. Deploy it to populate the erasure queue."
              onRetry={q.reload}
            />
          ) : (
            <DataTable
              label="Erasure requests"
              columns={erasureCols}
              rows={rows}
              rowKey={(r) => r.uid}
              loading={q.loading}
              error={!backendMissing && q.error ? q.error.message : null}
              onRetry={q.reload}
              empty={{ title: "No pending erasure requests", body: "All requests have been processed." }}
            />
          )}
        </Panel>

        <Panel title="Data Retention" description="Retention policies by data type — violations are flagged automatically">
          <div className="mb-3">
            <Notice tone="info" title="Placeholder data">
              These retention policies are illustrative defaults. Real values will load from the backend once the adminCompliance function is deployed.
            </Notice>
          </div>
          <DataTable
            label="Retention policies"
            columns={retentionCols}
            rows={RETENTION_POLICIES}
            rowKey={(r) => r.dataType}
            loading={false}
            error={null}
            empty={{ title: "No policies configured" }}
          />
        </Panel>

        <Panel title="Consent Tracking" description="Consent collection statistics across consent types">
          <div className="mb-3">
            <Notice tone="info" title="Placeholder data">
              Consent statistics are placeholders. Live data requires the adminCompliance backend function.
            </Notice>
          </div>
          <DataTable
            label="Consent stats"
            columns={consentCols}
            rows={CONSENT_STATS}
            rowKey={(r) => r.type}
            loading={false}
            error={null}
            empty={{ title: "No consent data" }}
          />
        </Panel>
      </div>
    </>
  );
}
