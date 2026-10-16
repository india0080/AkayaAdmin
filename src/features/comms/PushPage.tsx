"use client";

import { useState } from "react";
import { useCan } from "@/lib/session";
import { Notice, PageHeader, Tabs } from "@/ui";
import CampaignsPanel from "./CampaignsPanel";
import { commsAccess } from "./campaign";
import Composer from "./Composer";
import LegacySend from "./LegacySend";

const TABS = [
  { id: "campaigns", label: "Campaigns" },
  { id: "compose", label: "New campaign" },
  { id: "quick", label: "Quick send (classic)" },
];

export default function PushPage() {
  const can = useCan();
  const { canRead } = commsAccess(can);
  const [tab, setTab] = useState("campaigns");
  const [refresh, setRefresh] = useState(0);

  if (!canRead) {
    return (
      <>
        <PageHeader title="Notifications" />
        <Notice tone="warning" title="No access">You need the comms.send permission to use notifications.</Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Compose push campaigns with a destination, audience and schedule. Every action is recorded in the audit log."
      />
      <div className="space-y-4">
        <Tabs label="Notifications" tabs={TABS} value={tab} onChange={setTab} />
        <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
          {tab === "campaigns" ? <CampaignsPanel refreshKey={refresh} /> : null}
          {tab === "compose" ? <Composer onSent={() => { setRefresh((n) => n + 1); setTab("campaigns"); }} /> : null}
          {tab === "quick" ? <LegacySend /> : null}
        </div>
      </div>
    </>
  );
}
