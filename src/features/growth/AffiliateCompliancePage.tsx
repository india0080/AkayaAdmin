"use client";

import { useState } from "react";
import { usePendingCallable } from "@/lib/pending";
import { Badge, PageHeader, Panel, PendingState, Skeleton, Tabs, formatNumber } from "@/ui";
import { formatMinor } from "../pricing/logic";
import ComplianceHub from "../support/ComplianceHub";
import { SampleTag } from "../insights/widgets";
import type { Affiliates } from "./referralLogic";

function AffiliatesPanel() {
  const q = usePendingCallable<Affiliates>("affiliates");
  if (q.pending) return <Panel><PendingState compact={false} title="Affiliate programme is not live yet" contract={q.contract} /></Panel>;
  if (!q.data) return <Skeleton className="h-64" />;
  return (
    <Panel title="Affiliate partners" actions={<SampleTag />} flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="text-left text-xs text-fg-muted"><tr>{["Partner", "Code", "Sign-ups", "Paid", "Commission", "KYC / TDS"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{q.data.affiliates.map((a) => (
            <tr key={a.id}>
              <td className="px-4 py-2 font-medium">{a.name}</td><td className="px-4 py-2 font-mono text-xs">{a.code}</td>
              <td className="px-4 py-2 tabular-nums">{formatNumber(a.signups)}</td><td className="px-4 py-2 tabular-nums">{formatNumber(a.paid)}</td>
              <td className="px-4 py-2 tabular-nums">{formatMinor(a.commissionMinor, "INR")}</td>
              <td className="px-4 py-2"><Badge tone={a.kyc === "verified" ? "success" : a.kyc === "pending" ? "warning" : "danger"}>{a.kyc}</Badge></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </Panel>
  );
}

/// Affiliate partners (pending backend) beside the existing, fully wired
/// Compliance hub (DPDP erasure SLAs, consent, retention).
export default function AffiliateCompliancePage() {
  const [tab, setTab] = useState("compliance");
  return (
    <div className="space-y-4">
      {tab === "affiliates" ? <PageHeader title="Affiliate & Compliance" description="Partners, attribution, commission and payout compliance." /> : null}
      <Tabs label="Affiliate and compliance sections" value={tab} onChange={setTab} tabs={[{ id: "compliance", label: "Compliance" }, { id: "affiliates", label: "Affiliates" }]} />
      <div role="tabpanel">{tab === "affiliates" ? <AffiliatesPanel /> : <ComplianceHub />}</div>
    </div>
  );
}
