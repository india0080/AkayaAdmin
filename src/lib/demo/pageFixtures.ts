// SAMPLE responses for the existing (real) page callables — dev demo mode
// only; imported solely by ./fixtures, which production never loads.

type Fixture = (data: Record<string, unknown>) => unknown;
const NOW = Date.now();
const DAY = 86_400_000;
const iso = (i: number) => new Date(NOW - i * DAY).toISOString().slice(0, 10);
const wave = (i: number, base: number, amp: number) => Math.round(base + amp * Math.sin(i / 3) + i * base * 0.004);
const COUNTRIES = ["IN", "US", "GB", "AE", "CA", "SG"];
const PLANS = ["appPremium", "allAccess", "floatingPremium"];

function revenue(d: Record<string, unknown>) {
  const days = Number(d.days ?? 30), currency = String(d.currency ?? "INR");
  const series = Array.from({ length: days }, (_, i) => ({ day: iso(days - 1 - i), captured: wave(i, 6_200_000, 900_000), refunded: i % 9 === 0 ? 120_000 : 0, mrr: wave(i, 184_000_000, 3_000_000) }));
  const captured = series.reduce((s, x) => s + x.captured, 0), refunded = series.reduce((s, x) => s + x.refunded, 0);
  return {
    days, currency, generatedAt: NOW, start: NOW - days * DAY, end: NOW, coverageStart: NOW - 400 * DAY,
    captured, refunded, net: captured - refunded, payments: days * 13, capturedGrowth: 8.4, mrrGrowth: 5.1, arppu: 49_900,
    churn: { lost: 61, baseline: 4487, percent: 1.36, at: NOW },
    current: { mrr: 184_200_000, runRate: 2_210_400_000, active: 4548, unknownPrice: 0,
      plans: { appPremium: { monthly: 2140, annual: 1310, recurring: 1820 }, allAccess: { monthly: 610, annual: 488, recurring: 702 } } },
    series, observedLtv: 412_000, twelveMonthLtv: 598_800, matureCustomers: 2210, customers: 4548,
    refundRate: 1.1, undatedRefunds: 0, missingAmount: 0, unknownCurrency: 0, unknownContracts: 0,
    reasons: [{ reason: "customer_request", amount: 640_000, count: 9 }, { reason: "duplicate", amount: 210_000, count: 3 }],
    refunds: [{ id: "rf_1", paymentId: "pay_8Kx2", amount: 49_900, at: NOW - 2 * DAY, currency, reason: "customer_request" }],
    incomplete: false, limit: 5000, adminGrants: 12, currencies: ["INR", "USD"], exponents: { INR: 2, USD: 2 },
    transactions: { page: Number(d.page ?? 1), status: String(d.status ?? "all"), total: 382, hasMore: true,
      rows: Array.from({ length: 10 }, (_, i) => ({ id: `pay_${1000 + i}`, uid: `u${i}`, plan: PLANS[i % 3], billing: i % 2 ? "annual" : "monthly", at: NOW - i * 3_600_000,
        amount: i % 2 ? 499_900 : 49_900, currency, status: i === 4 ? "refunded" : "captured", refunded: i === 4 ? 49_900 : 0, review: false })) },
  };
}

function subAnalytics(d: Record<string, unknown>) {
  return {
    start: NOW - 30 * DAY, end: NOW, startFilter: "", endFilter: "", currency: String(d.currency ?? "INR"), channel: "all", country: "ALL", generatedAt: NOW,
    revenue: 1_850_884_00, subscribers: 4548, mrr: 184_200_000, arr: 2_210_400_000, active: 4548, incomplete: false, missingAmounts: 0, exponent: 2,
    currencies: ["INR", "USD"], availableCountries: COUNTRIES,
    sources: [{ source: "razorpay", revenue: 1_420_000_00, subscribers: 3410, payments: 3020 }, { source: "play", revenue: 330_000_00, subscribers: 860, payments: 790 }, { source: "admin", revenue: 0, subscribers: 12, payments: 0 }],
    countries: COUNTRIES.map((c, i) => ({ country: c, revenue: Math.round(1_200_000_00 / (i + 1)), subscribers: Math.round(3000 / (i + 1)), payments: Math.round(2800 / (i + 1)) })),
    series: Array.from({ length: 30 }, (_, i) => ({ day: iso(29 - i), razorpay: wave(i, 4_700_000, 700_000), play: wave(i, 1_100_000, 200_000) })),
  };
}

const person = ["Riya Sharma", "Arjun Mehta", "Neha Kapoor", "Kabir Thakur", "Sana Parveen", "Dev Rao", "Isha Jain", "Rahul Nair"];
function subscriptions(d: Record<string, unknown>) {
  return { nextCursor: null, rows: person.map((name, i) => ({
    uid: `u${i}`, name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, planId: PLANS[i % 3], billing: i % 3 ? "monthly" : "annual",
    source: i % 4 ? "razorpay" : "play", startedAt: NOW - (40 + i * 9) * DAY, expiresAt: NOW + (d.view === "expiring" ? i + 1 : 20 + i * 11) * DAY, expiredAt: d.view === "lapsed" ? NOW - i * DAY : null,
    recurring: { state: "active", cancelAtCycleEnd: i === 2, nextChargeAt: NOW + (5 + i) * DAY, regularAmount: i % 3 ? 49_900 : 499_900 } })) };
}

const plans = () => ({ plans: [
  ["appPremium", "App Premium", 49_900, 499_900], ["floatingPremium", "Floating System Premium", 29_900, 299_900], ["allAccess", "All Access", 79_900, 799_900],
  ["halfYear", "6-month Floating + Offline", null, 499_900],
].map(([id, name, m, a], i) => ({ id, stored: true, name, priceMonthly: m, priceAnnual: a, durationDays: 30, annualDurationDays: id === "halfYear" ? 182 : 365,
  isActive: true, version: 3 + i, updatedAt: NOW - (i + 2) * DAY, fallback: null })) });

const campaigns = () => ({ hasMore: false, next: null, campaigns: [
  ["Diwali offer — 20% off yearly", "sent", 128_450, 119_204], ["New: WhatsApp reminders", "sent", 64_210, 61_008], ["Weekend voice tips", "scheduled", null, null], ["Win-back: we miss you", "draft", null, null],
].map(([title, status, targeted, accepted], i) => ({ id: `c${i}`, title, body: "Sample notification body", status, scheduleMode: status === "scheduled" ? "at" : "now",
  scheduledAt: status === "scheduled" ? NOW + DAY : null, counts: { targeted, tokens: targeted, accepted, failed: accepted ? 812 : null, pruned: accepted ? 140 : null },
  createdByEmail: "demo@akaya.one", createdAt: NOW - (i + 1) * DAY, sentAt: status === "sent" ? NOW - (i + 1) * DAY : null, version: 1, destination: { type: "home", params: {} }, audience: { kind: "all" } })) });

const gateway = (id: string, enabled: boolean, mode: "test" | "live") => ({ id, version: 4, enabled, mode, configured: ["publicKey", "secretKey", "webhookSecret"].slice(0, enabled ? 3 : 1),
  missing: enabled ? [] : ["secretKey", "webhookSecret"], successUrl: "https://akaya.one/pay/success", failureUrl: "https://akaya.one/pay/failed", packageName: "one.akaya.app",
  products: {}, webhookUrl: enabled ? `https://api.akaya.one/webhooks/${id}` : null, topic: null, lastWebhookAt: enabled ? NOW - 120_000 : null,
  check: enabled ? { at: NOW - 3_600_000, detail: "Credentials verified", version: 4 } : null });

const sysStatus = () => ({ checkedAt: NOW, firestore: { ok: true, latencyMs: 38 }, appCheckEnforced: true, lastWebhookAt: NOW - 120_000,
  secrets: ["OPENROUTER_KEY", "GROQ_KEY", "SARVAM_KEY", "RAZORPAY_SECRET"].map((id) => ({ id, source: "env" })),
  providers: [["openrouter", "OpenRouter", 1840], ["groq", "Groq", 420], ["sarvam", "Sarvam", 960], ["openai", "OpenAI", null]].map(([id, name, ms]) => ({
    id, name, category: "llm", hasKey: ms !== null, status: ms === null ? "inactive" : "reachable", httpStatus: ms === null ? null : 200, latencyMs: ms,
    history: Array.from({ length: 24 }, (_, i) => ({ at: NOW - i * 3_600_000, status: ms === null ? "inactive" : i === 7 ? "server_error" : "reachable", httpStatus: 200, latencyMs: ms })) })),
  jobs: [{ id: "billingReconcile", lastRunAt: NOW - 600_000, lastResult: "ok", lastError: null }, { id: "renewalReminders", lastRunAt: NOW - 3_600_000, lastResult: "ok", lastError: null }] });

const sysMonitor = () => ({ checkedAt: NOW,
  runtime: { instanceId: "akaya-fn-7f3c", region: "us-central1", scope: "admin", cpuPercent: 23.4, sampleMs: 1000, heapUsed: 182e6, heapLimit: 512e6, rss: 260e6, uptimeSeconds: 86_400 * 3 },
  firestore: { ok: true, latencyMs: 38 }, alerts: [{ id: "a1", severity: "warning", message: "OpenRouter p95 latency above 1.5s" }],
  logs: Array.from({ length: 8 }, (_, i) => ({ id: `l${i}`, at: NOW - i * 45_000, level: i === 2 ? "WARN" : i === 5 ? "ERROR" : "INFO", source: ["gateway", "billing", "push"][i % 3], message: ["Request served", "Webhook processed", "FCM batch accepted"][i % 3] })),
  sources: { jobs: true, probes: true, gateways: true, incomplete: false },
  traffic: { available: true, windowMinutes: 5, total: 3120, incomplete: false, countries: COUNTRIES.map((c, i) => ({ country: c, active: Math.round(2000 / (i + 1)) })), countrySource: "device" },
  restart: { supported: false, reason: "Managed by Cloud Functions" } });

function activityMonitor(d: Record<string, unknown>) {
  return { generatedAt: NOW, active: 3120, tokens: 18_400, sessions: 212, newThisHour: 54, countries: Object.fromEntries(COUNTRIES.map((c, i) => [c, Math.round(2000 / (i + 1))])),
    minutes: Array.from({ length: 30 }, (_, i) => ({ at: NOW - (29 - i) * 60_000, tokens: wave(i, 18_000, 3000), sessions: wave(i, 200, 30) })),
    events: Array.from({ length: 10 }, (_, i) => ({ id: `e${i}`, uid: `u${i}`, kind: ["session", "tokens", "purchase", "subscription"][i % 4], at: NOW - i * 20_000, country: COUNTRIES[i % 6], platform: ["android", "ios", "windows", "macos"][i % 4], tokens: i % 4 === 1 ? 420 : 0 })),
    total: 10, hasNext: false, inactive: d.mode === "inactive" ? [{ uid: "u9", at: NOW - 9 * DAY, country: "IN", platform: "android" }] : null,
    incomplete: false, coverageStart: NOW - 200 * DAY, spike: null, usersAllowed: true };
}

export const PAGE_FIXTURES: Record<string, Fixture> = {
  "adminRevenue:summary": revenue,
  "adminSubscriptionAnalytics:summary": subAnalytics,
  "adminBilling:subscriptions": subscriptions,
  "adminBilling:plans": plans,
  "adminBilling:planVersions": () => ({ rows: [{ version: 3, before: { priceAnnual: 449_900 }, after: { priceAnnual: 499_900 }, reason: "Festive repricing", actorEmail: "demo@akaya.one", at: NOW - 5 * DAY }] }),
  "adminComms:listCampaigns": campaigns,
  "adminComms:destinations": () => ({}),
  "adminPaymentGateways:status": () => ({ gateways: [gateway("razorpay", true, "live"), gateway("stripe", false, "test"), gateway("play", true, "live")], routing: { india: "razorpay", global: "stripe" } }),
  "adminInsights:systemStatus": sysStatus,
  "adminSystemMonitor:snapshot": sysMonitor,
  "adminActivityMonitor": activityMonitor,
  "adminInsights:activity": (d) => { const days = Number(d.days ?? 30); return { generatedAt: NOW, series: Array.from({ length: days }, (_, i) => ({ day: iso(days - 1 - i), total: wave(i, 1150, 180), guests: wave(i, 90, 20) })), mix: { total: 128_450, guests: 9120, silver: 0, gold: 0 } }; },
  "adminInsights:funnel": () => ({ steps: [{ label: "Installed & opened", count: 128_450, rate: 100 }, { label: "Signed in", count: 119_330, rate: 92.9 }, { label: "First AI chat", count: 96_110, rate: 74.8 }, { label: "Paid", count: 4548, rate: 3.5 }], conversion: 3.5, incomplete: false, note: "Sample cohort." }),
  "adminAuditLog": () => ({ entries: [] }),
  "adminConfig:get": (d) => ({ target: d.target, snapshot: { recurring: { enabled: true, graceDays: 3 } }, version: 7, updatedAt: NOW - 3 * DAY, updatedByEmail: "demo@akaya.one" }),
  "adminBilling:recurringPlans": () => ({ razorpayPlans: [{ key: "appPremium_monthly", productId: "appPremium", currency: "INR", amount: 49_900, priceVersion: 3, rzpPlanId: "plan_DEMO1", createdAt: NOW - 30 * DAY }],
    products: plans().plans.map((p) => ({ id: p.id, priceMonthly: p.priceMonthly, priceAnnual: p.priceAnnual, isActive: true })) }),
  "adminTokenPolicies:read": () => ({ version: 2, plans: {
    free: { enabled: true, unlimited: false, amount: 2000, cycle: "daily", rollover: 0 }, app_premium: { enabled: true, unlimited: false, amount: 400_000, cycle: "monthly", rollover: 20 },
    all_access: { enabled: true, unlimited: true, amount: 0, cycle: "monthly", rollover: 0 } } }),
};
