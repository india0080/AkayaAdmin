// Country pricing: the country table for ONE product (249 rows): building it
// from server rows + local draft, search / filters / sort / pagination.
// Pure and fast (no per-row allocations beyond the row object).
import { sortRows, type SortState } from "../../ui/logic";
import { docId, type CountryDef, type PlanId, type PriceRow } from "./logic";
import { isCountryEnabled, type PolicyState } from "./registry";
import type { RowValues } from "./rules";

/// A pending edit for one row id: complete values, or null = delete the row.
export type RowEdit = RowValues | null;
export type RowEdits = Record<string, RowEdit>;

export function indexRows(rows: readonly PriceRow[]): Map<string, PriceRow> {
  return new Map(rows.map((r) => [r.id, r]));
}

export interface TableRow {
  rowId: string;
  code: string;
  name: string;
  region: string;
  currency: string;
  exponent: number;
  locale: string;
  enabled: boolean;
  enabledBase: boolean;
  /// effective values (draft over server); null = no price row
  priced: boolean;
  priceMonthly: number | null;
  priceAnnual: number | null;
  available: boolean | null;
  version: number | null;
  updatedAt: number | null;
  updatedBy: string | null;
  /// pending local edit (price/available) / enabled flag differs from the server
  priceEdited: boolean;
  enabledEdited: boolean;
  /// server row (before any draft edit)
  base: PriceRow | null;
}

export function buildTableRows(
  planId: PlanId,
  countries: readonly CountryDef[],
  base: ReadonlyMap<string, PriceRow>,
  edits: RowEdits,
  policy: PolicyState,
  basePolicy: PolicyState,
  defaultEnabled: readonly string[],
): TableRow[] {
  return countries.map((c) => {
    const rowId = docId(planId, c.code);
    const b = base.get(rowId) ?? null;
    const has = Object.prototype.hasOwnProperty.call(edits, rowId);
    const e = has ? edits[rowId] : undefined;
    const eff: RowValues | null = e !== undefined ? e : b ? { priceMonthly: b.priceMonthly, priceAnnual: b.priceAnnual, active: b.active } : null;
    const enabled = isCountryEnabled(policy, c.code, defaultEnabled);
    const enabledBase = isCountryEnabled(basePolicy, c.code, defaultEnabled);
    return {
      rowId, code: c.code, name: c.name, region: c.region, currency: c.currency, exponent: c.minorUnitExponent, locale: c.defaultLocale,
      enabled, enabledBase, enabledEdited: enabled !== enabledBase,
      priced: eff !== null,
      priceMonthly: eff ? eff.priceMonthly : null,
      priceAnnual: eff ? eff.priceAnnual : null,
      available: eff ? eff.active : null,
      version: b?.version ?? null,
      updatedAt: b?.updatedAt ?? null,
      updatedBy: b?.updatedBy ?? null,
      priceEdited: has,
      base: b,
    };
  });
}

// ── Filters ─────────────────────────────────────────────────────────────────

export interface TableFilter {
  search: string;
  /// "" = all regions
  region: string;
  enabled: "all" | "enabled" | "disabled";
  priced: "all" | "priced" | "unpriced";
  available: "all" | "on" | "off";
  /// only rows with a pending draft change
  changedOnly: boolean;
}

export const EMPTY_FILTER: TableFilter = { search: "", region: "", enabled: "all", priced: "all", available: "all", changedOnly: false };

export const isFilterActive = (f: TableFilter): boolean =>
  f.search.trim() !== "" || f.region !== "" || f.enabled !== "all" || f.priced !== "all" || f.available !== "all" || f.changedOnly;

/// Lower-case, accent-folded text for matching.
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function filterRows(rows: readonly TableRow[], f: TableFilter): TableRow[] {
  const tokens = fold(f.search).split(/\s+/).filter(Boolean);
  return rows.filter((r) => {
    if (f.region && r.region !== f.region) return false;
    if (f.enabled === "enabled" && !r.enabled) return false;
    if (f.enabled === "disabled" && r.enabled) return false;
    if (f.priced === "priced" && !r.priced) return false;
    if (f.priced === "unpriced" && r.priced) return false;
    if (f.available === "on" && r.available !== true) return false;
    if (f.available === "off" && r.available !== false) return false;
    if (f.changedOnly && !r.priceEdited && !r.enabledEdited) return false;
    if (tokens.length) {
      const hay = fold(`${r.name} ${r.code} ${r.currency}`);
      for (const t of tokens) if (!hay.includes(t)) return false;
    }
    return true;
  });
}

export const TABLE_SORT_IDS = ["country", "currency", "enabled", "monthly", "annual", "available", "version", "updated"] as const;

function sortValue(r: TableRow, id: string): unknown {
  switch (id) {
    case "country": return r.name;
    case "currency": return r.currency;
    case "enabled": return r.enabled ? 1 : 0;
    case "monthly": return r.priceMonthly;
    case "annual": return r.priceAnnual;
    case "available": return r.available === null ? null : r.available ? 1 : 0;
    case "version": return r.version;
    case "updated": return r.updatedAt;
    default: return r.name;
  }
}

/// Stable sort; empty values sink to the bottom. Default: country name.
export function sortTable(rows: readonly TableRow[], sort: SortState | null): TableRow[] {
  return sortRows(rows, sort ?? { id: "country", dir: "asc" }, sortValue);
}

// ── Pagination ──────────────────────────────────────────────────────────────

export const PAGE_SIZES = [25, 50, 100] as const;

export interface Page<T> { items: T[]; page: number; pages: number; total: number; from: number; to: number }

/// 1-based page, clamped into range (a filter change can shrink the list).
export function paginate<T>(rows: readonly T[], page: number, pageSize: number): Page<T> {
  const size = Math.max(1, Math.floor(pageSize) || 1);
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  const start = (p - 1) * size;
  const items = rows.slice(start, start + size);
  return { items, page: p, pages, total, from: total === 0 ? 0 : start + 1, to: start + items.length };
}

// ── Facet counts (header chips) ─────────────────────────────────────────────

export interface TableStats { total: number; enabled: number; priced: number; pricedEnabled: number; unpricedEnabled: number; edited: number }

export function tableStats(rows: readonly TableRow[]): TableStats {
  const s: TableStats = { total: rows.length, enabled: 0, priced: 0, pricedEnabled: 0, unpricedEnabled: 0, edited: 0 };
  for (const r of rows) {
    if (r.enabled) s.enabled++;
    if (r.priced) s.priced++;
    if (r.enabled && r.priced) s.pricedEnabled++;
    if (r.enabled && !r.priced) s.unpricedEnabled++;
    if (r.priceEdited || r.enabledEdited) s.edited++;
  }
  return s;
}

// ── Selection across pages ──────────────────────────────────────────────────

/// The table control reports the selection of the CURRENT page only; keep what
/// was selected on other pages and replace this page's part.
export function mergeSelection(prev: ReadonlySet<string>, pageKeys: readonly string[], next: ReadonlySet<string>): Set<string> {
  const page = new Set(pageKeys);
  const out = new Set<string>();
  for (const k of prev) if (!page.has(k)) out.add(k);
  for (const k of next) if (page.has(k)) out.add(k);
  return out;
}
