"use client";

import { useState } from "react";
import { DEMO_MODE } from "@/lib/demo/flag";
import { usePendingCallable } from "@/lib/pending";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import { Notice, formatNumber } from "@/ui";
import CampaignsPanel from "../comms/CampaignsPanel";
import Composer from "../comms/Composer";
import LegacySend from "../comms/LegacySend";
import { commsAccess, listRequest, normalizeCampaignList } from "../comms/campaign";
import type { NotificationEngagement } from "../insights/dashboardTypes";
import { KpiRow } from "../insights/widgets";
import { DesignPage } from "./DesignPage";

/// Notifications: KPIs, composer with live phone preview, campaign list.
/// Sent + FCM acceptance are real (adminComms); opens/clicks/opt-outs need
/// app-side events (pending `notificationEngagement`).
export default function NotificationsOverview() {
  const can = useCan();
  const { canRead } = commsAccess(can);
  const [refresh, setRefresh] = useState(0);
  const list = useCallable<unknown>("adminComms", canRead ? listRequest({ limit: 50 }) : null);
  const eng = usePendingCallable<NotificationEngagement>("notificationEngagement");
  if (!canRead) return <Notice tone="warning" title="No access">You need the comms.send permission to use notifications.</Notice>;
  const sent = normalizeCampaignList(list.data).filter((c) => c.status === "sent");
  const targeted = sent.reduce((s, c) => s + (c.counts.targeted ?? 0), 0), accepted = sent.reduce((s, c) => s + (c.counts.accepted ?? 0), 0);
  const failed = sent.reduce((s, c) => s + (c.counts.failed ?? 0), 0);
  const pend = (v: number | undefined, suf = "%") => (eng.pending ? "—" : v == null ? "—" : `${v.toFixed(1)}${suf}`);
  const pendHint = eng.pending ? <span className="text-xs text-warning">Awaiting backend</span> : undefined;
  return (
    <DesignPage title="Notifications" description="Push campaigns with destination, audience and schedule. Every action is audited." sample={DEMO_MODE}
      manage={<LegacySend />} manageLabel="Quick send (classic)">
      <KpiRow items={[
        { label: "Push sent (recent)", value: list.data ? formatNumber(targeted) : "—", tone: "accent", hint: <span className="text-xs text-fg-muted">{sent.length} campaigns</span> },
        { label: "Accepted by FCM", value: targeted ? `${((accepted / targeted) * 100).toFixed(1)}%` : "—", tone: failed > targeted * 0.05 ? "warning" : "success", hint: <span className="text-xs text-danger">{formatNumber(failed)} failed</span> },
        { label: "Open rate", value: pend(eng.data?.openRate), delta: eng.data?.deltas.openRate, hint: pendHint },
        { label: "Click-through", value: pend(eng.data?.ctr), delta: eng.data?.deltas.ctr, hint: pendHint },
        { label: "Opt-out", value: pend(eng.data?.optOutRate), delta: eng.data?.deltas.optOutRate, invert: true, hint: pendHint },
      ]} />
      <Composer onSent={() => { setRefresh((n) => n + 1); list.reload(); }} />
      <CampaignsPanel refreshKey={refresh} />
    </DesignPage>
  );
}
