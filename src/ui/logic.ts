// Pure UI logic (no React, no aliases) — unit-tested under node --test.

export type ConfirmLevel = "confirm" | "reason" | "typed";
export const MIN_REASON = 5;

/// Can a ConfirmAction's confirm button be pressed?
export function canConfirm(level: ConfirmLevel, reason: string, typed: string, phrase?: string): boolean {
  if (level === "confirm") return true;
  if (reason.trim().length < MIN_REASON) return false;
  if (level === "typed") return !!phrase && typed.trim() === phrase;
  return true;
}

export type SortDir = "asc" | "desc";
export interface SortState {
  id: string;
  dir: SortDir;
}

/// Next sort state when a header is activated: asc → desc → off.
export function nextSort(current: SortState | null, id: string): SortState | null {
  if (!current || current.id !== id) return { id, dir: "asc" };
  if (current.dir === "asc") return { id, dir: "desc" };
  return null;
}

/// Stable client-side sort for SMALL, already-bounded lists only. Large
/// collections must sort server-side (the table takes `sort` + a callback).
/// Nullish values always sink to the bottom regardless of direction.
export function sortRows<T>(rows: readonly T[], sort: SortState | null, value: (row: T, id: string) => unknown): T[] {
  if (!sort) return [...rows];
  const factor = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: value(row, sort.id) }))
    .sort((a, b) => {
      const an = a.v === null || a.v === undefined || a.v === "";
      const bn = b.v === null || b.v === undefined || b.v === "";
      if (an && bn) return a.i - b.i;
      if (an) return 1;
      if (bn) return -1;
      let c: number;
      if (typeof a.v === "number" && typeof b.v === "number") c = a.v - b.v;
      else if (a.v instanceof Date && b.v instanceof Date) c = a.v.getTime() - b.v.getTime();
      else c = String(a.v).localeCompare(String(b.v), undefined, { numeric: true, sensitivity: "base" });
      return c !== 0 ? c * factor : a.i - b.i;
    })
    .map((x) => x.row);
}

/// "Showing 25 of 1,204" — never claims a total it does not know.
export function countLabel(shown: number, total: number | null, hasMore: boolean): string {
  const fmt = (n: number) => n.toLocaleString("en-IN");
  if (total !== null) return shown >= total ? `All ${fmt(total)}` : `Showing ${fmt(shown)} of ${fmt(total)}`;
  return hasMore ? `Showing ${fmt(shown)} (more available)` : `${fmt(shown)} shown`;
}

/// Formats a number with the Indian digit grouping used across the product.
export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-IN");
}

/// Relative time for tables ("3m ago", "2d ago", else a date). `now` is
/// injectable for tests.
export function relativeTime(ms: number | null | undefined, now: number = Date.now()): string {
  if (!ms) return "—";
  const s = Math.round((now - ms) / 1000);
  if (s < 0) return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
