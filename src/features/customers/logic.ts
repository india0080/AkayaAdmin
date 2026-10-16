// Customers domain — response shapes of the adminUser callable and pure
// helpers (unit-tested).

export interface PlanSnapshot {
  planId: string;
  active: boolean;
  expiresAt: number | null;
  source: string | null;
  billing: string | null;
}

export interface DirectoryRow {
  uid: string;
  email: string | null;
  displayName: string | null;
  isGuest: boolean;
  createdAt: number | null;
  tokenBalance: number | null;
  plan: PlanSnapshot;
  pricingCountry?: string | null;
  accountStatus?: "enabled" | "disabled" | "unavailable";
  lastSignInAt?: number | null;
  spend?: { totals: Record<string, number>; complete: boolean } | null;
}

export interface UsageDay {
  date: string;
  messages: number;
  voice: number;
  tts: number;
  images: number;
  videos: number;
  webSearch: number;
  webFetch: number;
}

export interface User360 {
  uid: string;
  piiVisible: boolean;
  profile: {
    email: string | null;
    phone: string | null;
    displayName: string | null;
    languagePreference: string | null;
    isGuest: boolean;
    createdAt: number | null;
    tokenBalance: number | null;
    voiceUnlimited: boolean;
    isAdmin: boolean;
  };
  auth:
    | { exists: false }
    | {
        exists: true;
        disabled: boolean;
        providers: string[];
        anonymous: boolean;
        lastSignInAt: number | null;
        lastRefreshAt: number | null;
        tokensValidAfter: number | null;
      };
  plan: PlanSnapshot;
  rawSubscription: {
    planId: string | null;
    isActive: boolean | null;
    startedAt: number | null;
    expiresAt: number | null;
    expiredAt: number | null;
    source: string | null;
    billing: string | null;
    paymentId: string | null;
  } | null;
  usage: UsageDay[];
  realtimeSessions: { date: string; sessions: number }[];
  media: { count: number | null; recent: { id: string; type: string; createdAt: number | null }[] };
  devices: { platform: string; updatedAt: number | null; tokenHint: string }[];
  support: {
    feedbackCount: number | null;
    reports: { id: string; reason: string | null; status: string; createdAt: number | null }[];
  };
  adminHistory: {
    id: string;
    at: number | null;
    action: string;
    actorEmail: string;
    reason: string;
    result: string;
    changes: { field: string; from: string; to: string }[];
  }[];
  erasure: { failedSteps: string[]; resolved: boolean } | null;
}

export const PROVIDER_LABELS: Record<string, string> = {
  "google.com": "Google",
  phone: "Phone OTP",
  password: "Email + password",
  "apple.com": "Apple",
};

export function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id;
}

/// Sums the usage window into the totals row shown above the daily table.
export function usageTotals(days: readonly UsageDay[]): Omit<UsageDay, "date"> & { activeDays: number } {
  const t = { messages: 0, voice: 0, tts: 0, images: 0, videos: 0, webSearch: 0, webFetch: 0, activeDays: 0 };
  for (const d of days) {
    t.messages += d.messages;
    t.voice += d.voice;
    t.tts += d.tts;
    t.images += d.images;
    t.videos += d.videos;
    t.webSearch += d.webSearch;
    t.webFetch += d.webFetch;
    if (d.messages + d.voice + d.tts + d.images + d.videos + d.webSearch + d.webFetch > 0) t.activeDays++;
  }
  return t;
}

/// Days until a paid plan lapses; null for free / no expiry. Negative = lapsed.
export function daysLeft(expiresAt: number | null, now = Date.now()): number | null {
  if (!expiresAt) return null;
  return Math.ceil((expiresAt - now) / 86_400_000);
}

/// Account status as one word, for the 360 header.
export function accountStatus(v: Pick<User360, "auth" | "erasure">): {
  label: string;
  tone: "ok" | "off" | "down" | "degraded";
} {
  if (!v.auth.exists) return v.erasure ? { label: "Deleted (erasure pending)", tone: "down" } : { label: "No sign-in record", tone: "degraded" };
  if (v.auth.disabled) return { label: "Disabled", tone: "off" };
  return { label: "Active", tone: "ok" };
}

export const PLAN_DURATIONS = [30, 60, 90, 365] as const;
export const MAX_TOKEN_GRANT = 1_000_000;

export function validTokenGrant(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 1 && n <= MAX_TOKEN_GRANT ? n : null;
}
