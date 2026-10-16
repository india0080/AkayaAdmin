// Revenue domain — pure helpers (unit-tested). Amounts are PAISE everywhere
// on the wire; the console converts only for display.

export function formatINR(paise: number | null | undefined, opts: { exact?: boolean } = {}): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return "—";
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: whole && !opts.exact ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/// "₹129" → 12900; accepts "129", "129.5", "₹1,299". Null when not a price.
export function parseRupeesToPaise(raw: string): number | null {
  const s = raw.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export type LedgerStatus =
  | "captured"
  | "partially_refunded"
  | "refunded"
  | "refund_without_payment"
  | "needs_attention"
  | "legacy";

export const LEDGER_STATUS: Record<LedgerStatus, { label: string; tone: "ok" | "degraded" | "down" | "off" | "unknown" }> = {
  captured: { label: "Captured", tone: "ok" },
  partially_refunded: { label: "Partly refunded", tone: "degraded" },
  refunded: { label: "Refunded", tone: "off" },
  refund_without_payment: { label: "Refund, no capture", tone: "down" },
  needs_attention: { label: "Needs attention", tone: "down" },
  legacy: { label: "Pre-ledger (no amount)", tone: "unknown" },
};

export function ledgerStatus(s: string): { label: string; tone: "ok" | "degraded" | "down" | "off" | "unknown" } {
  return LEDGER_STATUS[s as LedgerStatus] ?? { label: s, tone: "unknown" };
}

/// Price change summary for the confirmation dialog: "₹99 → ₹129 (+30%)".
export function priceChange(beforePaise: number | null, afterPaise: number): string {
  if (beforePaise === null || beforePaise === 0) return `${formatINR(afterPaise)} (new)`;
  const pct = Math.round(((afterPaise - beforePaise) / beforePaise) * 100);
  return `${formatINR(beforePaise)} → ${formatINR(afterPaise)} (${pct > 0 ? "+" : ""}${pct}%)`;
}
