"use client";

import { usePendingCallable } from "@/lib/pending";
import { Badge, PageHeader, Panel, PendingState, Skeleton, Stat, StatStrip, formatNumber } from "@/ui";
import { SampleTag } from "../insights/widgets";
import { CHALLENGE, challengeEconomics, daysLeft, progress, type ReferralSummary } from "./referralLogic";

const inr = (v: number) => `₹${v.toLocaleString("en-IN")}`;

function Bar({ pct, tone = "accent" }: { pct: number; tone?: "accent" | "success" }) {
  return <span className="block h-1.5 w-full overflow-hidden rounded-full bg-raised"><span className={tone === "success" ? "block h-full bg-success" : "block h-full bg-accent"} style={{ width: `${pct}%` }} /></span>;
}

export default function ReferralPage() {
  const q = usePendingCallable<ReferralSummary>("referral");
  const econ = challengeEconomics(CHALLENGE.targetPaid);
  const now = Date.now();
  return (
    <div className="space-y-4">
      <PageHeader title="Referral · 90-day Refer Challenge" description="Single-level referrals. Rewards count only real paid subscriptions after the refund window." actions={q.data ? <SampleTag /> : null} />
      <Panel title="Challenge rules">
        <div className="grid gap-4 lg:grid-cols-2">
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-fg-muted">
            <li>Only holders of the ₹{CHALLENGE.eligiblePlanPriceInr.toLocaleString("en-IN")} plan (6 months Floating + all offline features) can join and generate a referral link.</li>
            <li>Within {CHALLENGE.days} days of joining: {CHALLENGE.targetReferrals} OTP-verified referrals (new phone + new device), {CHALLENGE.targetPaid} of them paid.</li>
            <li>A paid referral counts after its refund window, and only if paid inside the {CHALLENGE.days} days. Self-referral is not allowed.</li>
            <li>Grand prize: iPhone 18 or a gift worth up to {inr(CHALLENGE.giftCapInr)}, after KYC; TDS under section 194R applies. Organiser: CreditX Fintech India.</li>
          </ol>
          <div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CHALLENGE.milestones.map((m) => <li key={m.paid} className="rounded-lg border border-line p-3 text-center"><p className="text-xl font-bold">{m.paid}</p><p className="text-2xs text-fg-muted">paid</p><p className="mt-1 text-xs font-medium">{m.reward}</p></li>)}
            </ul>
            <p className="mt-3 text-xs text-fg-muted">Economics per winner: {CHALLENGE.targetPaid} × ₹{CHALLENGE.eligiblePlanPriceInr} = {inr(econ.gross)} gross → ~{inr(econ.net)} after GST and gateway fees → ~{inr(econ.surplusAfterGift)} left after the gift cap.</p>
          </div>
        </div>
      </Panel>
      {q.pending ? <Panel><PendingState compact={false} title="Referral tracking is not live yet" contract={q.contract} /></Panel> : !q.data ? <Skeleton className="h-64" /> : <>
        <StatStrip>
          <Stat label="Participants" value={formatNumber(q.data.participants)} />
          <Stat label="Verified referrals" value={formatNumber(q.data.verifiedReferrals)} />
          <Stat label="Paid referrals" value={formatNumber(q.data.paidReferrals)} hint={`${formatNumber(q.data.pendingRefundWindow)} in refund window`} />
          <Stat label="Gifts claimed" value={formatNumber(q.data.giftsClaimed)} />
          <Stat label="Flagged as fraud" value={formatNumber(q.data.flaggedFraud)} tone={q.data.flaggedFraud ? "warning" : "default"} />
        </StatStrip>
        <Panel title="Leaderboard" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="text-left text-xs text-fg-muted"><tr>{["Participant", "Days left", `Referred / ${CHALLENGE.targetReferrals}`, `Paid / ${CHALLENGE.targetPaid}`, "Status"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {q.data.leaders.map((l) => {
                  const p = progress(l);
                  return (
                    <tr key={l.uid}>
                      <td className="px-4 py-2 font-medium">{l.name}</td>
                      <td className="px-4 py-2 tabular-nums">{daysLeft(l.joinedAt, now)}</td>
                      <td className="px-4 py-2"><span className="tabular-nums">{l.referred}</span><Bar pct={p.referredPct} /></td>
                      <td className="px-4 py-2"><span className="tabular-nums">{l.paid}</span><Bar pct={p.paidPct} tone="success" /></td>
                      <td className="px-4 py-2">{p.qualified ? <Badge tone="success">Qualified</Badge> : <Badge tone="neutral">Next: {p.nextMilestone} paid</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </>}
    </div>
  );
}
