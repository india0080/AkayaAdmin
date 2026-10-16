"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Notice, Panel, Select, type Tone } from "@/ui";
import type { PricingCtx } from "./ctx";
import { CSV_COLUMNS, MAX_IMPORT_CHARS, MAX_IMPORT_ROWS, importErrorLines, parseImport, type ImportContext, type ImportStatus } from "./csv";
import { withRowEdits } from "./draft";
import { PLAN_LABEL, countryByCode, formatMinor, type PlanId } from "./logic";
import { setEnabledEdit } from "./registry";
import { paginate } from "./table";

const TONE: Record<ImportStatus, Tone> = { added: "success", changed: "info", unchanged: "neutral", invalid: "danger" };

/// CSV import: choose a file or paste, see the DRY RUN, confirm to add to the draft.
export function ImportPanel({ ctx }: { ctx: PricingCtx }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | ImportStatus>("all");
  const [page, setPage] = useState(1);
  const [done, setDone] = useState<string | null>(null);

  const ictx: ImportContext = useMemo(() => {
    const byId = new Map(ctx.tableRows.map((r) => [r.code, r]));
    return {
      registry: ctx.registry,
      gateway: ctx.gateway,
      countryByCode: (c) => countryByCode(c),
      // rows of OTHER products come from the server / draft overlay of the page
      existing: (planId: PlanId, code: string) => {
        const id = `${planId}_${code}`;
        if (Object.prototype.hasOwnProperty.call(ctx.draft.rows, id)) return ctx.draft.rows[id];
        if (planId === ctx.planId) {
          const r = byId.get(code);
          return r && r.priceMonthly !== null && r.priceAnnual !== null ? { priceMonthly: r.priceMonthly, priceAnnual: r.priceAnnual, active: r.available !== false } : null;
        }
        const b = ctx.baseRows.get(id);
        return b ? { priceMonthly: b.priceMonthly, priceAnnual: b.priceAnnual, active: b.active } : null;
      },
      enabledOf: (code) => byId.get(code)?.enabled ?? false,
    };
  }, [ctx.tableRows, ctx.registry, ctx.gateway, ctx.draft.rows, ctx.baseRows, ctx.planId]);

  const result = useMemo(() => (text.trim() === "" ? null : parseImport(text, ictx)), [text, ictx]);
  const lines = result ? result.lines.filter((l) => filter === "all" || l.status === filter) : [];
  const pg = paginate(lines, page, 25);
  const errors = result ? importErrorLines(result) : [];

  async function onFile(f: File | undefined) {
    setDone(null);
    setFileError(null);
    if (!f) return;
    if (f.size > MAX_IMPORT_CHARS) { setFileError(`The file is too large (max about ${Math.round(MAX_IMPORT_CHARS / 1_000_000)} MB).`); return; }
    try {
      setText(await f.text());
      setFileName(f.name);
      setPage(1);
    } catch {
      setFileError("The file could not be read.");
    }
  }

  function confirm() {
    if (!result?.canConfirm) return;
    ctx.setDraft((d) => {
      let next = withRowEdits(d, result.rowEdits, ctx.baseRows);
      let policy = next.policy;
      for (const [code, on] of Object.entries(result.enabledEdits)) policy = setEnabledEdit(ctx.basePolicyFlat, policy, code, on, ctx.registry.defaultEnabled);
      next = { ...next, policy };
      return next;
    });
    setDone(`${result.counts.added + result.counts.changed} rows added to the draft. Review them in Draft & publish.`);
    setText("");
    setFileName("");
  }

  const fmt = (v: number | undefined, cc: string) => {
    const c = countryByCode(cc);
    return v === undefined || !c ? "—" : formatMinor(v, c.currency, { exponent: c.minorUnitExponent, locale: "en-US", exact: true });
  };

  return (
    <div className="space-y-4">
      <Notice tone="info" title="CSV format">
        Header (exactly, any order): <code className="font-mono">{CSV_COLUMNS.join(",")}</code>. Money is in major units with a dot (<code className="font-mono">4.99</code>, JPY <code className="font-mono">500</code>, KWD <code className="font-mono">1.500</code>), no thousands separators. The currency must match the country&apos;s table currency. At most {MAX_IMPORT_ROWS} rows. A blank price line never deletes a price. The import is checked first (dry run); it only enters the draft when you confirm, and any invalid line blocks the whole file.
      </Notice>
      <Panel title="Import prices" description="Nothing is saved or published by this step.">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Choose a CSV file"
            className="text-sm"
            disabled={!ctx.canEdit}
            onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }}
          />
          {fileName ? <Badge>{fileName}</Badge> : null}
          {text ? <Button size="sm" variant="ghost" onClick={() => { setText(""); setFileName(""); setDone(null); }}>Clear</Button> : null}
        </div>
        {fileError ? <p className="mt-2 text-sm text-danger" role="alert">{fileError}</p> : null}
        <label className="mt-3 block text-xs font-medium text-fg-muted" htmlFor="csv-paste">Or paste CSV text</label>
        <textarea
          id="csv-paste"
          className="mt-1 block h-28 w-full rounded-md border border-line bg-panel p-2 font-mono text-xs"
          disabled={!ctx.canEdit}
          value={text}
          onChange={(e) => { setText(e.target.value); setDone(null); setPage(1); }}
          placeholder={`${CSV_COLUMNS.join(",")}\n${ctx.planId},US,USD,4.99,49.99,true,true`}
        />
        {done ? <p className="mt-2 text-sm text-success" role="status">{done}</p> : null}
      </Panel>

      {result ? (
        <Panel
          title={`Dry run: ${PLAN_LABEL[ctx.planId]} and any other products in the file`}
          actions={
            <>
              <Badge tone="success">{result.counts.added} added</Badge>
              <Badge tone="info">{result.counts.changed} changed</Badge>
              <Badge>{result.counts.unchanged} unchanged</Badge>
              <Badge tone={result.counts.invalid ? "danger" : "neutral"}>{result.counts.invalid} invalid</Badge>
            </>
          }
        >
          {result.fatal.length > 0 ? (
            <Notice tone="danger" title="The file cannot be imported">
              <ul className="list-disc pl-5">{result.fatal.map((m) => <li key={m}>{m}</li>)}</ul>
            </Notice>
          ) : (
            <>
              {errors.length > 0 ? (
                <Notice tone="danger" title={`${errors.length} problem${errors.length === 1 ? "" : "s"}: fix the file and import again`}>
                  <ul className="max-h-40 list-disc overflow-auto pl-5">
                    {errors.slice(0, 100).map((m, i) => <li key={i}>{m}</li>)}
                  </ul>
                  {errors.length > 100 ? <p className="mt-1 text-xs">Showing the first 100.</p> : null}
                </Notice>
              ) : null}
              <div className="my-2 flex items-center gap-2">
                <Select aria-label="Show lines" value={filter} onChange={(e) => { setFilter(e.target.value as "all" | ImportStatus); setPage(1); }} className="!w-44">
                  <option value="all">All lines ({result.counts.total})</option>
                  <option value="added">Added</option>
                  <option value="changed">Changed</option>
                  <option value="unchanged">Unchanged</option>
                  <option value="invalid">Invalid</option>
                </Select>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm" aria-label="Import dry run">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-fg-muted">
                      <th className="py-1.5 pr-3">Line</th><th className="pr-3">Row</th><th className="pr-3 text-right">Before</th><th className="pr-3 text-right">After</th><th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pg.items.map((l) => (
                      <tr key={`${l.line}`} className="border-b border-line/60 align-top">
                        <td className="py-1.5 pr-3 tabular">{l.line}</td>
                        <td className="pr-3 font-mono text-xs">{l.product}_{l.country}</td>
                        <td className="tabular pr-3 text-right">{l.before ? `${fmt(l.before.priceMonthly, l.country)} / ${fmt(l.before.priceAnnual, l.country)}` : "—"}</td>
                        <td className="tabular pr-3 text-right">{l.after ? `${fmt(l.after.priceMonthly, l.country)} / ${fmt(l.after.priceAnnual, l.country)}` : "—"}</td>
                        <td>
                          <Badge tone={TONE[l.status]}>{l.status}</Badge>{l.enabledChanged ? <Badge tone="accent" className="ml-1">{l.enabled ? "enable" : "disable"} country</Badge> : null}
                          {l.errors.map((e) => <p key={e} className="text-xs text-danger">{e}</p>)}
                          {l.warnings.map((w) => <p key={w} className="text-xs text-warning">{w}</p>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-fg-muted">
                <span>{pg.total === 0 ? "No lines" : `Showing ${pg.from}-${pg.to} of ${pg.total}`}</span>
                <span className="inline-flex items-center gap-2">
                  <Button size="sm" icon="chevron-left" aria-label="Previous page" disabled={pg.page <= 1} onClick={() => setPage(pg.page - 1)} />
                  Page {pg.page} of {pg.pages}
                  <Button size="sm" icon="chevron-right" aria-label="Next page" disabled={pg.page >= pg.pages} onClick={() => setPage(pg.page + 1)} />
                </span>
              </div>
              <div className="mt-3">
                <Button variant="primary" disabled={!ctx.canEdit || !result.canConfirm} onClick={confirm}>
                  Add {result.counts.added + result.counts.changed} change{result.counts.added + result.counts.changed === 1 ? "" : "s"} to the draft
                </Button>
                {!result.canConfirm && result.counts.invalid === 0 ? <span className="ml-3 text-sm text-fg-muted">Nothing to add: every line already matches.</span> : null}
              </div>
            </>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
