"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Field, Notice, Panel, Select, TextInput, type Tone } from "@/ui";
import {
  RATES_NOTICE, ROUNDING_OPTIONS, bulkEdits, currenciesMissingRate, parseRatesText, previewBulk, ratesToText, type BulkContext, type BulkSettings, type BulkStatus,
} from "./bulk";
import type { PricingCtx } from "./ctx";
import { withRowEdits } from "./draft";
import { PLAN_LABEL, countryByCode, formatMinor } from "./logic";
import { paginate, type TableRow } from "./table";
import { downloadText } from "./PricingTable";

const TONE: Record<BulkStatus, Tone> = { new: "success", changed: "info", unchanged: "neutral", invalid: "danger", skipped: "neutral" };

export function BulkPanel({ ctx, selected, filtered }: { ctx: PricingCtx; selected: ReadonlySet<string>; filtered: TableRow[] }) {
  const s = ctx.draft.bulk;
  const [scope, setScope] = useState<"selected" | "filtered">(selected.size > 0 ? "selected" : "filtered");
  const [ratesText, setRatesText] = useState("");
  const [ratesMsg, setRatesMsg] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState<number | null>(null);

  const setBulk = (p: Partial<BulkSettings>) => { ctx.setDraft((d) => ({ ...d, bulk: { ...d.bulk, ...p } })); setApplied(null); };

  const scopeRows = useMemo(() => (scope === "selected" ? ctx.tableRows.filter((r) => selected.has(r.code)) : filtered), [scope, selected, filtered, ctx.tableRows]);
  const targets = useMemo(() => scopeRows.map((r) => countryByCode(r.code)!).filter(Boolean), [scopeRows]);
  const existing = useMemo(() => {
    const m = new Map(ctx.tableRows.map((r) => [r.code, r]));
    return (code: string) => {
      const r = m.get(code);
      return r && r.priceMonthly !== null && r.priceAnnual !== null ? { priceMonthly: r.priceMonthly, priceAnnual: r.priceAnnual, active: r.available !== false } : null;
    };
  }, [ctx.tableRows]);
  const bctx: BulkContext = useMemo(() => ({ registry: ctx.registry, gateway: ctx.gateway, countryByCode: (c) => countryByCode(c), existing }), [ctx.registry, ctx.gateway, existing]);

  const preview = useMemo(() => previewBulk(s, targets, bctx), [s, targets, bctx]);
  const missing = useMemo(() => currenciesMissingRate(s, targets, ctx.registry), [s, targets, ctx.registry]);
  const currencies = useMemo(() => [...new Set(targets.map((c) => c.currency))].sort(), [targets]);
  const base = countryByCode(s.baseCountry);
  const pg = paginate(preview.rows, page, 25);
  const apply = Object.keys(bulkEdits(ctx.planId, preview)).length;

  const fmt = (v: number | null, cur: string, exp: number) => (v === null ? "—" : formatMinor(v, cur, { exponent: exp, locale: "en-US", exact: true }));

  return (
    <div className="space-y-4">
      <Notice tone="warning" title="Rates are manual, verify before publishing">
        {RATES_NOTICE} They are kept only in this browser session (your draft) and in the rates CSV you export; nothing is sent to the server except the final prices you publish.
      </Notice>

      <Panel title={`Base price for ${PLAN_LABEL[ctx.planId]}`} description="Prices of the other countries are computed from this price, the rate of their currency and an optional multiplier, then rounded.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Base country">
            {(p) => (
              <Select {...p} value={s.baseCountry} onChange={(e) => setBulk({ baseCountry: e.target.value })}>
                {ctx.registry.countries.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code}) {c.currency}</option>)}
              </Select>
            )}
          </Field>
          <Field label={`Base monthly (${base?.currency ?? ""}, major units)`}>
            {(p) => <TextInput {...p} inputMode="decimal" value={s.baseMonthly} onChange={(e) => setBulk({ baseMonthly: e.target.value })} placeholder={base?.minorUnitExponent === 0 ? "499" : "499.00"} />}
          </Field>
          <Field label={`Base annual (${base?.currency ?? ""}, major units)`}>
            {(p) => <TextInput {...p} inputMode="decimal" value={s.baseAnnual} onChange={(e) => setBulk({ baseAnnual: e.target.value })} placeholder={base?.minorUnitExponent === 0 ? "4999" : "4999.00"} />}
          </Field>
          <Field label="Rounding" hint="Applied per currency exponent (3-decimal currencies always end in 0).">
            {(p) => (
              <Select {...p} value={s.rounding} onChange={(e) => setBulk({ rounding: e.target.value })}>
                {ROUNDING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Field label="Apply to" className="w-72">
            {(p) => (
              <Select {...p} value={scope} onChange={(e) => { setScope(e.target.value as "selected" | "filtered"); setPage(1); }}>
                <option value="selected">Selected rows ({selected.size})</option>
                <option value="filtered">Countries matching the current filters ({filtered.length})</option>
              </Select>
            )}
          </Field>
          <p className="text-fg-muted">{targets.length} countries in scope, {currencies.length} currencies.</p>
        </div>
      </Panel>

      <Panel
        title="Manual rate table"
        description={`Target-currency units per 1 ${base?.currency ?? "base"} (for example USD 0.012 means 1 ${base?.currency ?? "INR"} = 0.012 USD). The base currency defaults to 1.`}
        actions={<Button size="sm" onClick={() => downloadText(`rates_${s.baseCountry}.csv`, ratesToText(s.rates))} disabled={Object.keys(s.rates).length === 0}>Export rates CSV</Button>}
      >
        {missing.length > 0 ? <p className="mb-2 text-sm text-warning">Missing a rate: {missing.slice(0, 30).join(", ")}{missing.length > 30 ? ` and ${missing.length - 30} more` : ""}</p> : null}
        <div className="grid max-h-64 gap-2 overflow-auto sm:grid-cols-3 lg:grid-cols-6">
          {currencies.map((cur) => (
            <label key={cur} className="flex items-center gap-2 text-sm">
              <span className="w-10 font-mono text-xs">{cur}</span>
              <TextInput aria-label={`Rate for ${cur}`} inputMode="decimal" className="h-8" value={s.rates[cur] ?? ""} placeholder={cur === base?.currency ? "1" : "rate"} onChange={(e) => setBulk({ rates: { ...s.rates, [cur]: e.target.value } })} />
            </label>
          ))}
          {currencies.length === 0 ? <p className="text-sm text-fg-muted">Select rows or change the filters to see their currencies.</p> : null}
        </div>
        <details className="mt-3">
          <summary className="cursor-pointer text-sm text-accent-text">Paste rates (one &quot;CUR,rate&quot; per line)</summary>
          <textarea
            aria-label="Paste rates"
            className="mt-2 block h-24 w-full rounded-md border border-line bg-panel p-2 font-mono text-xs"
            value={ratesText}
            onChange={(e) => setRatesText(e.target.value)}
            placeholder={"USD,0.012\nEUR,0.011"}
          />
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => {
              const r = parseRatesText(ratesText, new Set(Object.keys(ctx.registry.currencies)));
              if (Object.keys(r.rates).length) setBulk({ rates: { ...s.rates, ...r.rates } });
              setRatesMsg(`${Object.keys(r.rates).length} rates loaded${r.errors.length ? `; ${r.errors.length} lines ignored: ${r.errors.slice(0, 3).join(" ")}` : "."}`);
            }}>Load rates</Button>
            {ratesMsg ? <span className="text-xs text-fg-muted">{ratesMsg}</span> : null}
          </div>
        </details>
      </Panel>

      <Panel
        title="Preview (nothing is in the draft yet)"
        description="Every computed price is listed here first. Only new and changed rows without errors enter the draft when you confirm."
        actions={
          <>
            <Badge tone="success">{preview.counts.new} new</Badge>
            <Badge tone="info">{preview.counts.changed} changed</Badge>
            <Badge>{preview.counts.unchanged} unchanged</Badge>
            {preview.counts.invalid ? <Badge tone="danger">{preview.counts.invalid} invalid</Badge> : null}
          </>
        }
      >
        {preview.errors.length ? <Notice tone="info">{preview.errors.join(" ")}</Notice> : null}
        {preview.rows.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full text-sm" aria-label="Bulk fill preview">
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th className="py-1.5 pr-3">Country</th><th className="pr-3">Multiplier</th><th className="pr-3 text-right">Before (monthly / annual)</th><th className="pr-3 text-right">After (monthly / annual)</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pg.items.map((r) => (
                  <tr key={r.code} className="border-b border-line/60 align-top">
                    <td className="py-1.5 pr-3">{r.name} <span className="font-mono text-xs text-fg-subtle">{r.code}</span> <span className="text-2xs text-fg-subtle">{r.currency}</span></td>
                    <td className="pr-3">
                      <TextInput aria-label={`Multiplier for ${r.name}`} className="h-7 w-20" inputMode="decimal" placeholder="1" value={s.multipliers[r.code] ?? ""} onChange={(e) => setBulk({ multipliers: { ...s.multipliers, [r.code]: e.target.value } })} />
                    </td>
                    <td className="tabular pr-3 text-right">{r.before ? `${fmt(r.before.priceMonthly, r.currency, r.exponent)} / ${fmt(r.before.priceAnnual, r.currency, r.exponent)}` : "—"}</td>
                    <td className="tabular pr-3 text-right">{r.monthly === null ? "—" : `${fmt(r.monthly, r.currency, r.exponent)} / ${fmt(r.annual, r.currency, r.exponent)}`}</td>
                    <td>
                      <Badge tone={TONE[r.status]}>{r.status}</Badge>
                      {r.errors.map((e) => <p key={e} className="text-xs text-danger">{e}</p>)}
                      {r.warnings.map((w) => <p key={w} className="text-xs text-warning">{w}</p>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex items-center justify-between text-sm text-fg-muted">
              <span>Showing {pg.from}-{pg.to} of {pg.total}</span>
              <span className="inline-flex items-center gap-2">
                <Button size="sm" icon="chevron-left" aria-label="Previous page" disabled={pg.page <= 1} onClick={() => setPage(pg.page - 1)} />
                Page {pg.page} of {pg.pages}
                <Button size="sm" icon="chevron-right" aria-label="Next page" disabled={pg.page >= pg.pages} onClick={() => setPage(pg.page + 1)} />
              </span>
            </div>
          </div>
        ) : <p className="text-sm text-fg-muted">Enter a valid base price and choose countries to see the computed prices.</p>}
        <div className="mt-3 flex items-center gap-3">
          <Button
            variant="primary"
            disabled={!ctx.canEdit || apply === 0}
            onClick={() => {
              const edits = bulkEdits(ctx.planId, preview);
              ctx.setDraft((d) => withRowEdits(d, edits, ctx.baseRows));
              setApplied(Object.keys(edits).length);
            }}
          >
            Add {apply} price{apply === 1 ? "" : "s"} to the draft
          </Button>
          {applied !== null ? <span className="text-sm text-success">{applied} rows added to the draft. Review them in Draft &amp; publish.</span> : null}
        </div>
      </Panel>
    </div>
  );
}
