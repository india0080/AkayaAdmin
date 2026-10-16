// 90-day Refer Challenge — the approved rules, as pure data + functions.
//   • Only holders of the ₹4,999 (6-month Floating + offline) plan may join.
//   • Within 90 days of joining: 100 verified referrals, 30 of them paid.
//   • A paid referral counts only after its refund window, and only if it
//     was paid inside the 90 days. Single level only (no multi-level).
//   • Milestones: 5 paid → 1 month free, 10 → AI credit pack, 20 → 3 months
//     free, 30 → iPhone 18 or a gift worth up to ₹75,000 (KYC + TDS 194R).

export const CHALLENGE = {
  days: 90,
  eligiblePlanPriceInr: 4999,
  targetReferrals: 100,
  targetPaid: 30,
  giftCapInr: 75000,
  milestones: [
    { paid: 5, reward: "1 month free" },
    { paid: 10, reward: "AI credits pack" },
    { paid: 20, reward: "3 months free" },
    { paid: 30, reward: "iPhone 18 or gift up to ₹75,000" },
  ],
} as const;

export interface ReferralLeader { uid: string; name: string; joinedAt: number; referred: number; paid: number }
export interface ReferralSummary {
  participants: number;
  verifiedReferrals: number;
  paidReferrals: number;
  pendingRefundWindow: number;
  giftsClaimed: number;
  flaggedFraud: number;
  leaders: ReferralLeader[];
}

const DAY = 86_400_000;
export function daysLeft(joinedAt: number, now: number): number {
  return Math.max(0, CHALLENGE.days - Math.floor((now - joinedAt) / DAY));
}

export function progress(l: Pick<ReferralLeader, "referred" | "paid">): { referredPct: number; paidPct: number; qualified: boolean; nextMilestone: number | null } {
  const next = CHALLENGE.milestones.find((m) => l.paid < m.paid);
  return {
    referredPct: Math.min(100, (l.referred / CHALLENGE.targetReferrals) * 100),
    paidPct: Math.min(100, (l.paid / CHALLENGE.targetPaid) * 100),
    qualified: l.referred >= CHALLENGE.targetReferrals && l.paid >= CHALLENGE.targetPaid,
    nextMilestone: next ? next.paid : null,
  };
}

/// Net revenue the paid referrals bring before the gift (GST 18% + ~2% gateway).
export function challengeEconomics(paid: number, priceInr: number = CHALLENGE.eligiblePlanPriceInr) {
  const gross = paid * priceInr;
  const net = (gross / 1.18) * 0.98;
  return { gross, net: Math.round(net), surplusAfterGift: Math.round(net - CHALLENGE.giftCapInr) };
}

export interface Affiliate { id: string; name: string; code: string; signups: number; paid: number; commissionMinor: number; kyc: "verified" | "pending" | "missing" }
export interface Affiliates { affiliates: Affiliate[] }
