"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { Button } from "./Button";
import { Checkbox } from "./Field";
import { Icon } from "./Icon";
import { countLabel, nextSort, type SortState } from "./logic";
import { EmptyState, ErrorState, Skeleton } from "./States";

// The console's ONE table. Every list screen uses it so behaviour is the
// same everywhere: sticky header, keyboard-openable rows, honest counts,
// loading/empty/error states, optional selection and server pagination.
//
// Data is never fetched here. Callers pass a bounded page of rows; for big
// collections they drive sort/filter/pagination server-side via callbacks.

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  /// CSS width, e.g. "160px" or "20%".
  width?: string;
  /// Hide below the `md` breakpoint (tablet) to keep rows readable.
  hideOnNarrow?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /// Accessible name for the table.
  label: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  empty?: { title: string; body?: ReactNode; action?: ReactNode };
  sort?: SortState | null;
  onSortChange?: (s: SortState | null) => void;
  onRowClick?: (row: T) => void;
  /// Selection (bulk actions). Controlled.
  selected?: ReadonlySet<string>;
  onSelectedChange?: (next: Set<string>) => void;
  /// Pagination footer.
  total?: number | null;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  footerExtra?: ReactNode;
  rowTone?: (row: T) => "danger" | "warning" | null;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  label,
  loading,
  error,
  onRetry,
  empty,
  sort = null,
  onSortChange,
  onRowClick,
  selected,
  onSelectedChange,
  total = null,
  hasMore = false,
  loadingMore,
  onLoadMore,
  footerExtra,
  rowTone,
}: DataTableProps<T>) {
  const selectable = !!onSelectedChange && !!selected;
  const allKeys = rows.map(rowKey);
  const allSelected = selectable && allKeys.length > 0 && allKeys.every((k) => selected!.has(k));
  const someSelected = selectable && allKeys.some((k) => selected!.has(k));
  const colSpan = columns.length + (selectable ? 1 : 0);
  const showRows = !loading && !error && rows.length > 0;

  return (
    <div className="ui-table-wrap overflow-hidden rounded-lg border border-line bg-panel">
      <div className="max-h-[70vh] overflow-auto">
        <table aria-label={label} aria-busy={loading || undefined} className="w-full text-sm">
          <thead className="ui-thead sticky top-0 z-[1] bg-panel-2">
            <tr className="border-b border-line">
              {selectable ? (
                <th scope="col" className="w-10 px-3 py-2">
                  <Checkbox
                    label="Select all rows on this page"
                    checked={allSelected}
                    indeterminate={!allSelected && someSelected}
                    onChange={(on) => onSelectedChange!(new Set(on ? allKeys : []))}
                  />
                </th>
              ) : null}
              {columns.map((c) => {
                const active = sort?.id === c.id;
                const ariaSort = active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={ariaSort}
                    style={c.width ? { width: c.width } : undefined}
                    className={clsx(
                      "whitespace-nowrap px-3 py-2 text-xs font-semibold text-fg-muted",
                      c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left",
                      c.hideOnNarrow && "hidden md:table-cell",
                    )}
                  >
                    {c.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(nextSort(sort, c.id))}
                        className={clsx(
                          "inline-flex items-center gap-1 rounded hover:text-fg",
                          c.align === "right" && "flex-row-reverse",
                          active && "text-fg",
                        )}
                      >
                        {c.header}
                        <Icon
                          name={active ? (sort!.dir === "asc" ? "sort-asc" : "sort-desc") : "sort"}
                          size={14}
                          className={active ? "" : "opacity-40"}
                        />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="border-b border-line last:border-0">
                    {selectable ? <td className="px-3 py-3" /> : null}
                    {columns.map((c) => (
                      <td key={c.id} className={clsx("px-3 py-3", c.hideOnNarrow && "hidden md:table-cell")}>
                        <Skeleton className="h-3.5 w-3/4" />
                      </td>
                    ))}
                  </tr>
                ))
              : null}
            {!loading && error ? (
              <tr>
                <td colSpan={colSpan}>
                  <ErrorState message={error} onRetry={onRetry} compact />
                </td>
              </tr>
            ) : null}
            {!loading && !error && rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan}>
                  <EmptyState title={empty?.title ?? "Nothing here yet"} action={empty?.action} compact>
                    {empty?.body}
                  </EmptyState>
                </td>
              </tr>
            ) : null}
            {showRows
              ? rows.map((row) => {
                  const key = rowKey(row);
                  const isSel = selectable && selected!.has(key);
                  const tone = rowTone?.(row) ?? null;
                  return (
                    <tr
                      key={key}
                      tabIndex={onRowClick ? 0 : undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (e.key === "Enter" && e.target === e.currentTarget) onRowClick(row);
                            }
                          : undefined
                      }
                      aria-selected={selectable ? isSel : undefined}
                      className={clsx(
                        "border-b border-line last:border-0",
                        onRowClick && "cursor-pointer hover:bg-raised/60 focus-visible:bg-raised/60",
                        isSel && "bg-accent-soft",
                        tone === "danger" && "shadow-[inset_3px_0_0_rgb(var(--danger))]",
                        tone === "warning" && "shadow-[inset_3px_0_0_rgb(var(--warning))]",
                      )}
                    >
                      {selectable ? (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            label="Select row"
                            checked={isSel}
                            onChange={(on) => {
                              const next = new Set(selected);
                              if (on) next.add(key);
                              else next.delete(key);
                              onSelectedChange!(next);
                            }}
                          />
                        </td>
                      ) : null}
                      {columns.map((c) => (
                        <td
                          key={c.id}
                          className={clsx(
                            "px-3 py-2 align-middle text-fg",
                            c.align === "right" ? "tabular text-right" : c.align === "center" ? "text-center" : "text-left",
                            c.hideOnNarrow && "hidden md:table-cell",
                          )}
                        >
                          {c.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              : null}
          </tbody>
        </table>
      </div>
      {showRows || hasMore || footerExtra ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-panel-2 px-3 py-2 text-xs text-fg-muted">
          <span className="tabular">{countLabel(rows.length, total, hasMore)}</span>
          <div className="flex items-center gap-2">
            {footerExtra}
            {hasMore && onLoadMore ? (
              <Button size="sm" variant="secondary" onClick={onLoadMore} loading={loadingMore}>
                Load more
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
