"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Checkbox, DataTable, Icon, Notice, Select, Switch, TextInput, relativeTime, type Column, type SortState } from "@/ui";
import { expectedMonthly, type BulkContext } from "./bulk";
import type { PricingCtx } from "./ctx";
import { exportCsv } from "./csv";
import { withRowEdit } from "./draft";
import { PLAN_LABEL, countryByCode, formatMinor, minorToMajorInput } from "./logic";
import { setEnabledEdit } from "./registry";
import { parseMajorInput, validateRowValues } from "./rules";
import {
  EMPTY_FILTER, PAGE_SIZES, isFilterActive, mergeSelection, paginate, sortTable, tableStats, type TableFilter, type TableRow,
} from "./table";

interface Pending { m?: string; a?: string }

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function PricingTable({
  ctx, filter, setFilter, selected, setSelected, filtered,
}: {
  ctx: PricingCtx;
  filter: TableFilter;
  setFilter: (f: TableFilter) => void;
  selected: ReadonlySet<string>;
  setSelected: (s: Set<string>) => void;
  /// filtered (not sorted) rows, computed by the page so other tabs share them
  filtered: TableRow[];
}) {
  const { registry, planId, canEdit, policyReady } = ctx;
  const [sort, setSort] = useState<SortState | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [pending, setPending] = useState<Record<string, Pending>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const sorted = useMemo(() => sortTable(filtered, sort), [filtered, sort]);
  const pg = paginate(sorted, page, pageSize);
  const stats = useMemo(() => tableStats(ctx.tableRows), [ctx.tableRows]);
  const edit = canEdit;

  const bulkCtx: BulkContext = useMemo(() => ({
    registry, gateway: ctx.gateway, countryByCode: (c) => countryByCode(c), existing: () => null,
  }), [registry, ctx.gateway]);

  const effText = (r: TableRow, f: "m" | "a"): string => {
    const p = pending[r.code];
    const typed = f === "m" ? p?.m : p?.a;
    if (typed !== undefined) return typed;
    const v = f === "m" ? r.priceMonthly : r.priceAnnual;
    return v === null ? "" : minorToMajorInput(v, r.exponent);
  };

  const setErr = (code: string, msg: string | null) => setErrors((e) => {
    const n = { ...e };
    if (msg) n[code] = msg; else delete n[code];
    return n;
  });

  function tryCommit(r: TableRow, next: Pending) {
    const country = countryByCode(r.code);
    if (!country) return;
    const p = { ...pending[r.code], ...next };
    const mText = p.m ?? (r.priceMonthly === null ? "" : minorToMajorInput(r.priceMonthly, r.exponent));
    const aText = p.a ?? (r.priceAnnual === null ? "" : minorToMajorInput(r.priceAnnual, r.exponent));
    if (mText.trim() === "" && aText.trim() === "") { clearPending(r.code); return; }
    if (!r.priced && (mText.trim() === "" || aText.trim() === "")) return; // a new row needs both: wait for the other field
    const m = parseMajorInput(mText, country);
    const a = parseMajorInput(aText, country);
    if (m.minor === null || a.minor === null) { setErr(r.code, `${m.error ? `Monthly: ${m.error}. ` : ""}${a.error ? `Annual: ${a.error}.` : ""}`.trim()); return; }
    const res = validateRowValues(country, { priceMonthly: m.minor, priceAnnual: a.minor, active: r.available ?? true }, { registry, gateway: ctx.gateway });
    const msgs = Object.values(res.errors);
    if (msgs.length) { setErr(r.code, msgs.join(" ")); return; }
    ctx.setDraft((d) => withRowEdit(d, r.rowId, { priceMonthly: m.minor as number, priceAnnual: a.minor as number, active: r.available ?? true }, ctx.baseRows));
    clearPending(r.code);
  }
  function clearPending(code: string) {
    setPending((x) => { const n = { ...x }; delete n[code]; return n; });
    setErr(code, null);
  }
  function setField(r: TableRow, f: "m" | "a", text: string) {
    setPending((x) => ({ ...x, [r.code]: { ...x[r.code], [f]: text } }));
  }
  function toggleAvailable(r: TableRow, on: boolean) {
    if (r.priceMonthly === null || r.priceAnnual === null) return;
    ctx.setDraft((d) => withRowEdit(d, r.rowId, { priceMonthly: r.priceMonthly as number, priceAnnual: r.priceAnnual as number, active: on }, ctx.baseRows));
  }
  function toggleEnabled(r: TableRow, on: boolean) {
    ctx.setDraft((d) => ({ ...d, policy: setEnabledEdit(ctx.basePolicyFlat, d.policy, r.code, on, registry.defaultEnabled) }));
  }
  function removeRow(r: TableRow) {
    if (r.code === "IN") return;
    ctx.setDraft((d) => withRowEdit(d, r.rowId, null, ctx.baseRows));
    clearPending(r.code);
  }

  const warnFor = (r: TableRow): string[] => {
    if (!r.priceEdited || r.priceMonthly === null || r.priceAnnual === null) return [];
    const c = countryByCode(r.code);
    if (!c) return [];
    return validateRowValues(c, { priceMonthly: r.priceMonthly, priceAnnual: r.priceAnnual, active: r.available ?? true }, {
      registry, gateway: ctx.gateway, expectedMonthlyMinor: expectedMonthly(ctx.draft.bulk, c, bulkCtx),
    }).warnings;
  };

  const money = (v: number | null, r: TableRow) => (v === null ? "—" : formatMinor(v, r.currency, { exponent: r.exponent, locale: "en-US", exact: true }));

  const cols: Column<TableRow>[] = [
    {
      id: "country", header: "Country", sortable: true,
      cell: (r) => (
        <div className="min-w-[10rem]">
          <p className="font-medium">{r.name} <span className="font-mono text-xs text-fg-subtle">{r.code}</span></p>
          <p className="text-2xs text-fg-subtle">{r.region}{r.priceEdited || r.enabledEdited ? <Badge tone="info" className="ml-1.5">edited</Badge> : null}</p>
        </div>
      ),
    },
    {
      id: "currency", header: "Currency", sortable: true,
      cell: (r) => <span title={`${r.exponent} decimal places (minor unit exponent ${r.exponent})`}>{r.currency} <span className="text-2xs text-fg-subtle">{r.exponent === 0 ? "no decimals" : `${r.exponent} dp`}</span></span>,
    },
    {
      id: "enabled", header: "Enabled", sortable: true,
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <Switch
            label={`${r.name} enabled`}
            checked={r.enabled}
            disabled={!edit || !policyReady || r.code === "IN"}
            onChange={(v) => toggleEnabled(r, v)}
          />
          {r.code === "IN" ? <span title="India can never be disabled (fallback price list)"><Icon name="lock" size={14} /></span> : null}
        </span>
      ),
    },
    ...(["m", "a"] as const).map((f): Column<TableRow> => ({
      id: f === "m" ? "monthly" : "annual",
      header: `${f === "m" ? "Monthly" : "Annual"} (major units)`,
      sortable: true,
      align: "right",
      cell: (r) => {
        if (!edit) return <span className="tabular">{money(f === "m" ? r.priceMonthly : r.priceAnnual, r)}</span>;
        const err = errors[r.code];
        return (
          <div className="ml-auto w-28">
            <TextInput
              aria-label={`${f === "m" ? "Monthly" : "Annual"} price for ${r.name} in ${r.currency}`}
              aria-invalid={err ? true : undefined}
              inputMode="decimal"
              className="tabular h-8 text-right"
              placeholder={r.exponent === 0 ? "0" : "0." + "0".repeat(r.exponent)}
              value={effText(r, f)}
              onChange={(e) => setField(r, f, e.target.value)}
              onBlur={() => tryCommit(r, {})}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") clearPending(r.code);
              }}
            />
          </div>
        );
      },
    })),
    {
      id: "available", header: "Available", sortable: true,
      cell: (r) => (r.priced
        ? <Switch label={`${PLAN_LABEL[planId]} available in ${r.name}`} checked={r.available === true} disabled={!edit || r.code === "IN"} onChange={(v) => toggleAvailable(r, v)} />
        : <span className="text-fg-subtle">no price</span>),
    },
    { id: "version", header: "priceVersion", sortable: true, hideOnNarrow: true, cell: (r) => (r.version === null ? "—" : <span className="tabular">v{r.version}</span>) },
    {
      id: "updated", header: "Updated", sortable: true, hideOnNarrow: true,
      cell: (r) => (r.updatedAt || r.updatedBy ? <span className="text-xs text-fg-muted" title={r.updatedAt ? new Date(r.updatedAt).toLocaleString() : ""}>{relativeTime(r.updatedAt)}{r.updatedBy ? ` · ${r.updatedBy}` : ""}</span> : "—"),
    },
    {
      id: "act", header: "", align: "right",
      cell: (r) => {
        const w = warnFor(r);
        return (
          <span className="inline-flex items-center gap-1">
            {w.length ? <span title={w.join("\n")} className="text-warning"><Icon name="alert-triangle" size={16} label={w.join(" ")} /></span> : null}
            {edit && r.priced && r.code !== "IN" ? <Button size="sm" variant="danger-ghost" icon="trash" aria-label={`Remove price row for ${r.name}`} onClick={() => removeRow(r)} /> : null}
          </span>
        );
      },
    },
  ];

  const set = (p: Partial<TableFilter>) => { setFilter({ ...filter, ...p }); setPage(1); };
  const rowErrorList = Object.entries(errors);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted" aria-live="polite">
        <Badge>{stats.total} countries</Badge>
        <Badge tone="success">{stats.enabled} enabled</Badge>
        <Badge tone="info">{stats.priced} priced</Badge>
        {stats.unpricedEnabled > 0 ? <Badge tone="warning">{stats.unpricedEnabled} enabled without a price</Badge> : null}
        {stats.edited > 0 ? <Badge tone="accent">{stats.edited} edited in draft</Badge> : null}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <TextInput aria-label="Search countries by name, code or currency" placeholder="Search name, code or currency" value={filter.search} onChange={(e) => set({ search: e.target.value })} className="lg:col-span-2" />
        <Select aria-label="Region group" value={filter.region} onChange={(e) => set({ region: e.target.value })}>
          <option value="">All regions</option>
          {registry.regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
        <Select aria-label="Enabled filter" value={filter.enabled} onChange={(e) => set({ enabled: e.target.value as TableFilter["enabled"] })}>
          <option value="all">Enabled and disabled</option>
          <option value="enabled">Enabled only</option>
          <option value="disabled">Disabled only</option>
        </Select>
        <Select aria-label="Priced filter" value={filter.priced} onChange={(e) => set({ priced: e.target.value as TableFilter["priced"] })}>
          <option value="all">Priced and unpriced</option>
          <option value="priced">Priced only</option>
          <option value="unpriced">Unpriced only</option>
        </Select>
        <Select aria-label="Row available filter" value={filter.available} onChange={(e) => set({ available: e.target.value as TableFilter["available"] })}>
          <option value="all">Available on or off</option>
          <option value="on">Row available: on</option>
          <option value="off">Row available: off</option>
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-2"><Checkbox label="Only rows changed in the draft" checked={filter.changedOnly} onChange={(v) => set({ changedOnly: v })} /> Only changed in draft</label>
        {isFilterActive(filter) ? <Button size="sm" variant="ghost" onClick={() => { setFilter(EMPTY_FILTER); setPage(1); }}>Clear filters</Button> : null}
        <span className="text-fg-muted">{filtered.length === ctx.tableRows.length ? `All ${filtered.length}` : `${filtered.length} of ${ctx.tableRows.length}`} countries</span>
        {selected.size > 0 ? <span className="text-fg-muted">{selected.size} selected <button className="underline" onClick={() => setSelected(new Set())}>clear</button></span> : null}
        {edit && filtered.length > 0 && selected.size < filtered.length ? <button className="text-accent-text underline" onClick={() => setSelected(new Set(filtered.map((r) => r.code)))}>Select all {filtered.length} matching</button> : null}
        <span className="ml-auto inline-flex items-center gap-2">
          <Button size="sm" icon="download" onClick={() => downloadText(`pricing_${planId}_${new Date().toISOString().slice(0, 10)}.csv`, exportCsv(planId, sorted))}>Export CSV ({sorted.length})</Button>
        </span>
      </div>

      {rowErrorList.length > 0 ? (
        <Notice tone="warning" title="Not saved to the draft yet">
          <ul className="list-disc pl-5">
            {rowErrorList.slice(0, 5).map(([code, msg]) => <li key={code}>{countryByCode(code)?.name ?? code}: {msg}</li>)}
          </ul>
        </Notice>
      ) : null}
      {!policyReady && canEdit ? <Notice tone="warning">The pricing policy could not be read, so enabling or disabling countries is switched off. Prices can still be edited.</Notice> : null}

      <DataTable
        label={`${PLAN_LABEL[planId]} prices by country`}
        columns={cols}
        rows={pg.items}
        rowKey={(r) => r.code}
        sort={sort}
        onSortChange={(s) => { setSort(s); setPage(1); }}
        selected={edit ? selected : undefined}
        onSelectedChange={edit ? (next) => setSelected(mergeSelection(selected, pg.items.map((r) => r.code), next)) : undefined}
        rowTone={(r) => (errors[r.code] ? "warning" : null)}
        empty={{ title: "No countries match", body: "Change or clear the filters." }}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-fg-muted">
        <span>{pg.total === 0 ? "No rows" : `Showing ${pg.from}-${pg.to} of ${pg.total}`}</span>
        <span className="inline-flex items-center gap-2">
          <Select aria-label="Rows per page" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="!w-28">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </Select>
          <Button size="sm" disabled={pg.page <= 1} onClick={() => setPage(pg.page - 1)} icon="chevron-left" aria-label="Previous page" />
          <span>Page {pg.page} of {pg.pages}</span>
          <Button size="sm" disabled={pg.page >= pg.pages} onClick={() => setPage(pg.page + 1)} icon="chevron-right" aria-label="Next page" />
        </span>
      </div>
    </div>
  );
}

