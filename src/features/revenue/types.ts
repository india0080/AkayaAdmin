// Response shapes of the adminBilling callable.

export interface BillingSummary {
  estimated: {
    mrrPaise: number;
    priceAwareMrrPaise?: number;
    paidCounts: Record<string, { monthly: number; annual: number }>;
    note: string;
  };
  actual: {
    last30CapturedPaise: number;
    last30RefundedPaise: number;
    last30Payments: number;
    last30WithoutAmount: number;
    ledgerSince: number | null;
    hasLedger: boolean;
    daily: { date: string; captured: number; refunded: number; count: number }[];
    truncated: boolean;
    /// Additive (Change 11). The legacy fields above are INR-only.
    currency?: string;
    byCurrency?: Record<string, CurrencyTotals>;
    dailyByCurrency?: Record<string, { date: string; captured: number; refunded: number; count: number }[]>;
    currencyExponents?: Record<string, number>;
  };
  counts: {
    activeTotal: number;
    activeSilver: number;
    activeGold: number;
    adminGranted: number;
    expiring7d: number;
    needsReview: number | null;
    /// Present when the backend summary carries the product plans.
    activeAppPremium?: number;
    activeFloatingPremium?: number;
    activeAllAccess?: number;
  };
  prices: Record<string, { priceMonthly: number; priceAnnual: number }>;
}

export interface CurrencyTotals { captured: number; refunded: number; payments: number; withoutAmount: number }

export interface LedgerRow {
  country?: string | null;
  priceVersion?: number | null;
  paymentId: string;
  orderId: string | null;
  uid: string | null;
  email: string | null;
  planId: string | null;
  billing: string | null;
  amount: number | null;
  currency: string;
  status: string;
  activatedVia: string | null;
  /// Additive (docs/subscription/14): set for auto-renewing charges.
  recurringKind?: string | null;
  isIntro?: boolean;
  cycle?: number | null;
  subscriptionId?: string | null;
  refundedAmount: number | null;
  needsReview: boolean;
  problem: string | null;
  reviewNote: string | null;
  reviewedBy: string | null;
  processedAt: number | null;
}

export interface PlanRow {
  id: string;
  stored: boolean;
  name: string;
  priceMonthly: number | null;
  priceAnnual: number | null;
  durationDays: number | null;
  annualDurationDays: number | null;
  isActive: boolean;
  version: number;
  updatedAt: number | null;
  /** null for products with no compiled INR fallback (App Premium, Floating System Premium, All Access). */
  fallback: { priceMonthly: number; priceAnnual: number; durationDays: number; annualDurationDays: number } | null;
}
