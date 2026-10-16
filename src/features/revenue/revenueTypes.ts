export interface RevenueData {
  days: number; currency: string; generatedAt: number; start: number; end: number; coverageStart: number | null;
  captured: number; refunded: number; net: number; payments: number; capturedGrowth: number | null; mrrGrowth: number | null; arppu: number | null;
  churn: { lost: number; baseline: number; percent: number; at: number } | null;
  current: { mrr: number; runRate: number; active: number; unknownPrice: number; plans: Record<string, { monthly: number; annual: number; recurring: number }> };
  series: { day: string; captured: number; refunded: number; mrr: number | null }[];
  observedLtv: number | null; twelveMonthLtv: number | null; matureCustomers: number; customers: number;
  refundRate: number | null; undatedRefunds: number; missingAmount: number; unknownCurrency: number; unknownContracts: number;
  reasons: { reason: string; amount: number; count: number }[];
  refunds: { id: string; paymentId: string; amount: number; at: number; currency: string; reason: string }[];
  incomplete: boolean; limit: number; adminGrants: number; currencies: string[]; exponents: Record<string, number>;
  transactions: { page: number; status: string; total: number; hasMore: boolean; rows: { id: string; uid: string | null; plan: string | null; billing: string | null; at: number; amount: number | null; currency: string; status: string; refunded: number; review: boolean }[] };
}
export const refundCategories = ["unknown", "customer_request", "duplicate", "service_issue", "billing_error", "goodwill", "other"];
export const categoryLabel = (s: string) => s.replace(/_/g, " ");
export const revenueSnapshotMatches = (d: RevenueData | null, days: number, currency: string, page: number, status: string) => !!d && d.days === days && d.currency === currency && d.transactions.page === page && d.transactions.status === status;
