"use client";

// Backend contracts the console is designed against but which are NOT
// deployed yet. Pages read them through usePendingCallable(): in production
// it never calls the network and reports `pending`, so the page shows an
// honest "awaiting backend" empty state instead of fake numbers. In dev demo
// mode it serves the sample fixture.
//
// When a callable ships: move its read to useCallable() and delete the entry.

import { useEffect, useState } from "react";
import { DEMO_MODE } from "./demo/flag";

export interface PendingContract {
  /// Cloud Function (callable) name + action the page will call.
  callable: string;
  action: string;
  /// Firestore collection(s) the function aggregates.
  collections: string[];
  summary: string;
}

export const PENDING = {
  downloads: { callable: "adminInsights", action: "downloads", collections: ["analytics_downloads", "analytics_installs"],
    summary: "Store + website download/install counts per platform (Play Console, App Store Connect, akaya.one desktop clicks)." },
  platformUsers: { callable: "adminInsights", action: "platformUsers", collections: ["users"],
    summary: "Total users split by last-seen platform (android/ios/macos/windows)." },
  billingCycleMix: { callable: "adminBilling", action: "cycleMix", collections: ["subscriptions"],
    summary: "Active subscriptions by billing cycle including the daily pass." },
  profitLoss: { callable: "adminFinance", action: "profitLoss", collections: ["finance_costs", "payments", "ai_usage_daily"],
    summary: "Weekly revenue, AI/API, server and gateway cost, net profit." },
  apiCallLog: { callable: "adminInsights", action: "apiCallLog", collections: ["api_call_log", "api_call_rollups"],
    summary: "Per-integration call counts, errors, latency, quota and the latest calls." },
  referral: { callable: "adminReferral", action: "summary", collections: ["referral_challenges", "referrals"],
    summary: "90-day challenge participants, verified/paid referrals, milestones and gift claims." },
  affiliates: { callable: "adminAffiliate", action: "list", collections: ["affiliates", "affiliate_payouts"],
    summary: "Affiliate partners, attributed sign-ups, commission and KYC/TDS status." },
} satisfies Record<string, PendingContract>;

export type PendingKey = keyof typeof PENDING;

export interface PendingQuery<T> {
  data: T | null;
  /// True when the backend is not deployed (always, outside demo mode).
  pending: boolean;
  contract: PendingContract;
}

export function usePendingCallable<T>(key: PendingKey): PendingQuery<T> {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    // Inline NODE_ENV check: webpack drops this branch (and the fixtures chunk) in production.
    if (process.env.NODE_ENV !== "production" && DEMO_MODE) {
      void import("./demo/fixtures").then((m) => { if (live) setData(m.pendingFixture(key) as T); });
    }
    return () => { live = false; };
  }, [key]);
  return { data, pending: !DEMO_MODE, contract: PENDING[key] };
}
