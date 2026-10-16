"use client";

import { useMemo } from "react";
import { Badge, Notice, Panel, Select, Switch, Field } from "@/ui";
import type { PricingCtx } from "./ctx";
import { PLAN_IDS, PLAN_LABEL, type PlanId } from "./logic";
import { policyWarnings, previewRowLookup } from "./preview";
import { checkPolicyConsistency, isCountryEnabled, planPolicy, setPolicyKeyEdit, type UnpricedPolicy } from "./registry";

export const UNPRICED_HELP: Record<UnpricedPolicy, string> = {
  unavailable: "A country with no price (or a disabled country) sees \"Not available in your region\" and cannot buy.",
  fallback: "A country with no price (or a disabled country) is shown and charged the fallback country's price and currency. Nothing is converted. A row you switch off or give a future launch date never falls back.",
};

export function PolicyPanel({ ctx }: { ctx: PricingCtx }) {
  const { policy, registry, canEdit, policyReady } = ctx;
  const edit = canEdit && policyReady;
  const enabledCountries = useMemo(
    () => registry.countries.filter((c) => isCountryEnabled(policy, c.code, registry.defaultEnabled)),
    [registry, policy],
  );
  const setKey = (key: string, value: unknown) => ctx.setDraft((d) => ({ ...d, policy: setPolicyKeyEdit(ctx.basePolicyFlat, d.policy, key, value) }));
  const errors = checkPolicyConsistency(policy, registry.defaultEnabled);
  const rowOf = useMemo(() => {
    const base = new Map<string, { currency: string; priceMonthly: number; priceAnnual: number; active: boolean; effectiveFrom: number | null }>();
    for (const [id, r] of ctx.baseRows) base.set(id, r);
    return previewRowLookup(base, ctx.draft.rows, registry);
  }, [ctx.baseRows, ctx.draft.rows, registry]);
  const warnings = useMemo(() => policyWarnings(policy, registry, rowOf, ctx.legacy), [policy, registry, rowOf, ctx.legacy]);

  const countryOptions = (current: string) => {
    const list = enabledCountries.some((c) => c.code === current) ? enabledCountries : [...enabledCountries, ...registry.countries.filter((c) => c.code === current)];
    return list.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code}) {c.currency}</option>);
  };

  const prodEdit = (planId: PlanId, patch: { unpricedPolicy?: UnpricedPolicy | null; fallbackCountry?: string | null }) => {
    const cur = { ...(policy.products[planId] ?? {}) } as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined) delete cur[k];
      else cur[k] = v;
    }
    setKey(`product.${planId}`, Object.keys(cur).length ? cur : null);
  };

  return (
    <div className="space-y-4">
      {!policyReady ? <Notice tone="warning">The pricing policy could not be read from the server (the backend may not be updated yet). Policy editing is switched off.</Notice> : null}
      {!canEdit ? <Notice tone="info">You can view the policy. Changing it needs the plans.modify permission.</Notice> : null}
      {errors.map((e) => <Notice key={e} tone="danger" title="Inconsistent policy (cannot be published)">{e}</Notice>)}
      {warnings.map((w) => <Notice key={w.message} tone="warning">{w.message}</Notice>)}

      <Panel title="Global policy" description="Applies to every product unless a product override below says otherwise. Changes are part of your draft until you publish.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Default country" hint="Used when the user's country is unknown. Must be enabled.">
            {(p) => (
              <Select {...p} value={policy.defaultCountry} disabled={!edit} onChange={(e) => setKey("defaultCountry", e.target.value)}>
                {countryOptions(policy.defaultCountry)}
              </Select>
            )}
          </Field>
          <Field label="Fallback country" hint="Whose price list is used when the policy below is Fallback. Must be enabled.">
            {(p) => (
              <Select {...p} value={policy.fallbackCountry} disabled={!edit} onChange={(e) => setKey("fallbackCountry", e.target.value)}>
                {countryOptions(policy.fallbackCountry)}
              </Select>
            )}
          </Field>
          <Field label="Countries without a price" hint={UNPRICED_HELP[policy.unpricedPolicy]}>
            {(p) => (
              <Select {...p} value={policy.unpricedPolicy} disabled={!edit} onChange={(e) => setKey("unpricedPolicy", e.target.value)}>
                <option value="unavailable">Unavailable (not available in your region)</option>
                <option value="fallback">Fallback (charge the fallback country&apos;s price)</option>
              </Select>
            )}
          </Field>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-fg-muted">Allow users to change country</span>
            <label className="flex items-center gap-3 rounded-md border border-line p-3">
              <Switch label="Allow users to change country" checked={policy.allowUserChangeCountry} disabled={!edit} onChange={(v) => setKey("allowUserChangeCountry", v)} />
              <span className="text-sm text-fg-muted">
                {policy.allowUserChangeCountry
                  ? "On: users can pick any enabled country in the app; the detected country is only the starting point."
                  : "Off: a user's stored country is locked; they cannot change it in the app."}
              </span>
            </label>
          </div>
        </div>
        <p className="mt-3 text-xs text-fg-subtle">
          Gateway currencies in effect: {policy.gatewayCurrencies ? `${policy.gatewayCurrencies.length} (set by the policy)` : `${registry.gatewayCurrencies.length || "compiled"} (compiled list)`}. A price in another currency shows a warning and checkout refuses it.
        </p>
      </Panel>

      <Panel title="Per-product overrides" description="Leave on Global to follow the global policy.">
        <div className="overflow-auto">
          <table className="w-full text-sm" aria-label="Per-product policy overrides">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th className="py-1.5 pr-3">Product</th><th className="pr-3">Countries without a price</th><th className="pr-3">Fallback country</th><th>Effective</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_IDS.map((pid) => {
                const o = policy.products[pid];
                const eff = planPolicy(policy, pid);
                return (
                  <tr key={pid} className="border-b border-line/60">
                    <td className="py-2 pr-3 font-medium">{PLAN_LABEL[pid]}</td>
                    <td className="pr-3">
                      <Select aria-label={`${PLAN_LABEL[pid]} unpriced policy`} value={o?.unpricedPolicy ?? ""} disabled={!edit} onChange={(e) => prodEdit(pid, { unpricedPolicy: (e.target.value || null) as UnpricedPolicy | null })}>
                        <option value="">Global ({policy.unpricedPolicy})</option>
                        <option value="unavailable">Unavailable</option>
                        <option value="fallback">Fallback</option>
                      </Select>
                    </td>
                    <td className="pr-3">
                      <Select aria-label={`${PLAN_LABEL[pid]} fallback country`} value={o?.fallbackCountry ?? ""} disabled={!edit} onChange={(e) => prodEdit(pid, { fallbackCountry: e.target.value || null })}>
                        <option value="">Global ({policy.fallbackCountry})</option>
                        {o?.fallbackCountry ? countryOptions(o.fallbackCountry) : enabledCountries.map((c) => <option key={c.code} value={c.code}>{c.name} ({c.code}) {c.currency}</option>)}
                      </Select>
                    </td>
                    <td><Badge tone={eff.unpricedPolicy === "fallback" ? "info" : "neutral"}>{eff.unpricedPolicy}{eff.unpricedPolicy === "fallback" ? ` via ${eff.fallbackCountry}` : ""}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
