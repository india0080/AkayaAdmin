// SAMPLE data for dev demo mode only (see ./flag.ts). Loaded through a
// dynamic import guarded by DEMO_MODE, so production never executes it.
// Deterministic (seeded) so screenshots are stable.

import type { PendingKey } from "../pending";
import { PAGE_FIXTURES } from "./pageFixtures";

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const int = (lo: number, hi: number) => Math.round(lo + rnd() * (hi - lo));
const NOW = Date.now();
const day = (i: number) => new Date(NOW - i * 86_400_000).toISOString().slice(0, 10);

const GEO: [string, string, number][] = [["IN", "India", 48210], ["US", "United States", 9120], ["GB", "United Kingdom", 4210], ["AE", "United Arab Emirates", 3380],
  ["CA", "Canada", 2650], ["DE", "Germany", 1980], ["SG", "Singapore", 1430], ["AU", "Australia", 1210], ["BD", "Bangladesh", 980], ["NP", "Nepal", 760],
  ["SA", "Saudi Arabia", 690], ["BR", "Brazil", 420], ["FR", "France", 380], ["ID", "Indonesia", 350], ["JP", "Japan", 220]];

function traffic(days: number) {
  const series = Array.from({ length: days }, (_, i) => {
    const t = days - 1 - i;
    return { day: day(t), dau: 15200 + i * 95 + int(-600, 600), mau: 61000 + i * 210, mauComplete: true };
  });
  return {
    generatedAt: NOW, days, country: "ALL", coverageStart: NOW - 200 * 86_400_000, incomplete: false, revenueIncomplete: false, missingAmount: 0,
    limits: { dailyMemberships: 50000, signups: 5000, payments: 2000 },
    countries: GEO.map(([code, name]) => ({ code, name })),
    series,
    summary: { users: 75980, sessions: 412300, activeMs: 9.1e9, averageSessionMs: 384000, tokens: 18_400_000 },
    geography: GEO.map(([country, , users]) => ({ country, users, sessions: users * 5, activeMs: users * 1.2e5, tokens: users * 240 })),
    devices: [{ platform: "android", sessions: 268000 }, { platform: "ios", sessions: 98000 }, { platform: "macos", sessions: 28400 }, { platform: "windows", sessions: 17900 }],
    cohorts: [], heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, (_, h) => int(20, 80) * (h > 8 && h < 23 ? 4 : 1))),
    revenue: [{ country: "IN", currency: "INR", captured: 184_500_00, refunded: 2_100_00 }], currencyExponents: { INR: 2 },
  };
}

function billing() {
  const daily = Array.from({ length: 30 }, (_, i) => ({ date: day(29 - i), captured: int(42000, 78000) * 100, refunded: 0, count: int(9, 16) }));
  return {
    estimated: { mrrPaise: 18_42_000_00, priceAwareMrrPaise: 18_42_000_00, paidCounts: { appPremium: { monthly: 2140, annual: 1310 }, allAccess: { monthly: 610, annual: 488 } }, note: "Sample" },
    actual: { last30CapturedPaise: daily.reduce((s, d) => s + d.captured, 0), last30RefundedPaise: 21000_00, last30Payments: 382, last30WithoutAmount: 0, ledgerSince: NOW - 3e10,
      hasLedger: true, daily, truncated: false, currency: "INR" },
    counts: { activeTotal: 4548, activeSilver: 0, activeGold: 0, adminGranted: 12, expiring7d: 61, needsReview: 2, activeAppPremium: 3450, activeFloatingPremium: 0, activeAllAccess: 1098 },
    prices: {},
  };
}

const REAL: Record<string, (data: Record<string, unknown>) => unknown> = {
  "adminIam:me": () => ({ uid: "demo", email: "demo@akaya.one", roles: ["super_admin"], permissions: ["*"], legacy: false }),
  "adminInsights:commandCenter": () => ({
    generatedAt: NOW, users: { total: 128450, guests: 9120, newToday: 1286, new7d: 8410 },
    signups: Array.from({ length: 14 }, (_, i) => ({ day: day(13 - i), count: int(900, 1400) })),
    attention: [{ id: "a1", severity: "warning", title: "OpenRouter spend spike", detail: "+38% vs 7-day average", href: "/dashboard/api-integrations" }],
    business: null, aiHealth: null, telemetryOn: true,
  }),
  "adminInsights:aiUsage": () => ({ telemetryOn: true, todayEvents: 214_380, days: Array.from({ length: 30 }, (_, i) => ({
    day: day(29 - i), requests: 200000, served: 198000, failed: 2000, uniqueUsers: 14000, estOutTokens: 9e6, estCostUsd: int(310, 420), unpricedRequests: 0,
    byModel: {}, byPlan: {}, byOutcome: {}, generatedAt: NOW })) }),
  "adminBilling:summary": billing,
  "adminTraffic": (d) => traffic(Number(d.days ?? 30)),
  ...PAGE_FIXTURES,
};

/// Demo response for a REAL callable, or undefined (the call then fails as
/// "not available in demo mode" and the page shows its error state).
export function realFixture(name: string, data: Record<string, unknown> | undefined): unknown {
  const fn = REAL[`${name}:${String(data?.action ?? "")}`] ?? REAL[name];
  return fn ? fn(data ?? {}) : undefined;
}

const weeks = Array.from({ length: 12 }, (_, i) => {
  const revenue = (310000 + i * 14000 + int(-20000, 20000)) * 100;
  return { week: day((11 - i) * 7), revenue, aiCost: Math.round(revenue * 0.31), serverCost: 42000_00, gatewayFees: Math.round(revenue * 0.02) };
});
weeks[2].aiCost = weeks[2].revenue; // one loss week, so the red state is visible

const PENDING_FIXTURES: Record<PendingKey, unknown> = {
  notificationEngagement: { openRate: 18.6, ctr: 6.2, optOutRate: 0.4, deltas: { openRate: 1.4, ctr: 0.8, optOutRate: -0.1 } },
  subscriptionFlows: { new7d: 3912, trials: 6280, newDelta: 8.1, trialDelta: 4.4, daily: Array.from({ length: 14 }, () => int(420, 640)) },
  planEntitlements: { plans: ["free", "appPremium", "floatingPremium", "allAccess"], features: [
    ["AI chat messages / day", "20", "Unlimited", "50", "Unlimited"], ["Floating bubble", "—", "—", "✓", "✓"], ["Voice minutes / mo", "—", "300", "600", "Unlimited"],
    ["WhatsApp reminders", "—", "✓", "—", "✓"], ["Offline models", "1", "All", "All", "All"], ["App control agent", "—", "—", "✓", "✓"]].map(([feature, ...values]) => ({ feature, values })) },
  gatewayMetrics: { successRate: 96.4, failed7d: 1284, successDelta: 0.8, failedDelta: -3.1,
    gateways: [{ id: "razorpay", successRate: 97.8, feePct: 2.0 }, { id: "stripe", successRate: 95.1, feePct: 2.9 }, { id: "play", successRate: 93.4, feePct: 15 }],
    daily: Array.from({ length: 14 }, (_, i) => ({ day: day(13 - i), razorpay: 96 + rnd() * 3, stripe: 93 + rnd() * 4, play: 91 + rnd() * 4 })) },
  serviceMetrics: { errorRatePct: 0.21, errorDelta: -0.05 },
  engagement: { wau: 41_380, wauDelta: 3.2, features: [["Chat", 15_200], ["Floating", 9_800], ["Voice", 7_400], ["Reminders", 5_100], ["App control", 3_300], ["Offline", 2_900]].map(([label, value]) => ({ label, value })) },
  downloads: { platforms: [{ platform: "android", downloads: 812_430, delta7dPct: 6.2 }, { platform: "ios", downloads: 296_118, delta7dPct: 4.1 },
    { platform: "macos", downloads: 48_906, delta7dPct: 11.8 }, { platform: "windows", downloads: 37_552, delta7dPct: -1.3 }] },
  platformUsers: { total: 128_450, byPlatform: { android: 83_120, ios: 31_870, macos: 7_640, windows: 5_820 } },
  billingCycleMix: { cycles: [{ cycle: "daily", active: 640, deltaPct: 3.4 }, { cycle: "monthly", active: 2750, deltaPct: 1.2 }, { cycle: "yearly", active: 1798, deltaPct: 5.6 }] },
  profitLoss: { currency: "INR", weeks },
  apiCallLog: {
    integrations: [["openrouter", "OpenRouter", 182_400, 0.6, 1840, 72], ["groq", "Groq", 96_200, 0.3, 420, 41], ["sarvam", "Sarvam STT/TTS", 41_800, 1.4, 960, 58],
      ["gmail", "Gmail API", 22_150, 0.2, 310, 12], ["razorpay", "Razorpay", 3_420, 0.1, 280, null], ["fcm", "Firebase Cloud Messaging", 61_300, 0.9, 190, null]]
      .map(([id, name, calls24h, errorRate, p95Ms, quotaPct]) => ({ id, name, calls24h, errorRate, p95Ms, quotaPct, trend: Array.from({ length: 12 }, () => int(40, 100)) })),
    recent: Array.from({ length: 10 }, (_, i) => ({ at: NOW - i * 7000, integration: ["OpenRouter", "Groq", "Sarvam STT/TTS", "Gmail API", "FCM"][i % 5],
      endpoint: ["/chat/completions", "/openai/v1/chat", "/speech-to-text", "/users/me/messages", "/v1/send"][i % 5], status: i === 3 ? 429 : i === 7 ? 502 : 200, latencyMs: int(120, 2200) })),
  },
  referral: {
    participants: 1_284, verifiedReferrals: 18_960, paidReferrals: 2_412, pendingRefundWindow: 318, giftsClaimed: 3, flaggedFraud: 41,
    leaders: [["Riya S.", 12, 100, 31], ["Arjun M.", 30, 94, 27], ["Neha K.", 41, 88, 22], ["Kabir T.", 55, 70, 18], ["Sana P.", 63, 52, 11], ["Dev R.", 80, 21, 4]]
      .map(([name, ago, referred, paid], i) => ({ uid: `u${i}`, name, joinedAt: NOW - Number(ago) * 86_400_000, referred, paid })),
  },
  affiliates: { affiliates: [["Tech Guru Hindi", "TGH10", 4210, 612, 1_84_000_00, "verified"], ["StudyWithPriya", "PRIYA", 2980, 401, 1_20_300_00, "verified"],
    ["GadgetBazaar", "GBZ", 1430, 118, 35_400_00, "pending"], ["AI Tools India", "AITI", 820, 64, 19_200_00, "missing"]]
    .map(([name, code, signups, paid, commissionMinor, kyc], i) => ({ id: `a${i}`, name, code, signups, paid, commissionMinor, kyc })) },
};

export function pendingFixture(key: PendingKey): unknown {
  return PENDING_FIXTURES[key];
}
