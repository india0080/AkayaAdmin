"use client";

import { useMemo, useState } from "react";
import { Badge, Field, Notice, Panel, Select } from "@/ui";
import type { PricingCtx } from "./ctx";
import { previewAsUser, previewRowLookup } from "./preview";

/// What the app shows a user in a chosen country, computed from the DRAFT.
export function PreviewPanel({ ctx }: { ctx: PricingCtx }) {
  const [code, setCode] = useState("IN");
  const rowOf = useMemo(() => {
    const base = new Map<string, { currency: string; priceMonthly: number; priceAnnual: number; active: boolean; effectiveFrom: number | null }>();
    for (const [id, r] of ctx.baseRows) base.set(id, r);
    return previewRowLookup(base, ctx.draft.rows, ctx.registry);
  }, [ctx.baseRows, ctx.draft.rows, ctx.registry]);
  const p = useMemo(
    () => previewAsUser({ country: code, now: Date.now(), policy: ctx.policy, registry: ctx.registry, rowOf, legacy: ctx.legacy }),
    [code, ctx.policy, ctx.registry, rowOf, ctx.legacy],
  );
  const draftNote = Object.keys(ctx.draft.rows).length + Object.keys(ctx.draft.policy).length > 0;

  return (
    <div className="space-y-4">
      <Notice tone="info">
        Computed with the same rules as the server (country must be enabled, the row available and effective, the currency accepted by the payment gateway, then the unpriced policy).
        {draftNote ? " It includes your unpublished draft." : " It shows the live prices (no draft)."} Amounts use English formatting here; the app formats with the user&apos;s device locale.
      </Notice>
      <div className="max-w-sm">
        <Field label="Preview as a user in">
          {(f) => (
            <Select {...f} value={code} onChange={(e) => setCode(e.target.value)}>
              {ctx.registry.countries.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code}) {c.currency}</option>)}
            </Select>
          )}
        </Field>
      </div>
      <Panel
        title={p.countryName}
        description={p.region}
        actions={<Badge tone={p.enabled ? "success" : "neutral"}>{p.enabled ? "Enabled" : "Not enabled"}</Badge>}
      >
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label={`Plans shown in ${p.countryName}`}>
          {p.plans.map((pl) => (
            <li key={pl.planId} className="rounded-lg border border-line bg-panel-2 p-4 text-sm" data-testid={`preview-${pl.planId}`}>
              <p className="font-semibold">{pl.label}</p>
              <p className={pl.available ? "mt-2" : "mt-2 text-fg-muted"}>{pl.monthly}</p>
              <p className={pl.available ? "" : "text-fg-muted"}>{pl.annual === pl.monthly && !pl.available ? "" : pl.annual}</p>
              {pl.fallbackLine ? <p className="mt-2 text-xs font-medium text-info">{pl.fallbackLine}</p> : null}
              <p className="mt-2 text-xs text-fg-subtle">{pl.note}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-md border border-line p-3 text-sm">{p.allowChangeLine}</p>
      </Panel>
    </div>
  );
}
