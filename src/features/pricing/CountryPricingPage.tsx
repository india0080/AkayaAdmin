"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import { Badge, Button, Field, Icon, Notice, PageHeader, PermissionDenied, Select, Tabs, type TabDef } from "@/ui";
import type { PlanRow } from "../revenue/types";
import { useTarget } from "../config/useConfig";
import { BulkPanel } from "./BulkPanel";
import type { PricingCtx } from "./ctx";
import { buildDiff, browserSessionStorage, emptyDraft, loadDraft, pruneDraft, saveDraft, type PriceDraft } from "./draft";
import { ImportPanel } from "./ImportPanel";
import { PLAN_IDS, PLAN_LABEL, parsePrices, pricingAccess, pricingUi, type PlanId } from "./logic";
import { PolicyPanel } from "./PolicyPanel";
import { PreviewPanel } from "./PreviewPanel";
import { PricingTable } from "./PricingTable";
import type { LegacyPrice } from "./preview";
import { DraftPanel, HistoryPanel } from "./PublishPanel";
import type { PublishTarget } from "./publish";
import { applyPolicyEdits, effectiveGateway, flatOf, parsePolicySnapshot, parseRegistry } from "./registry";
import { EMPTY_FILTER, buildTableRows, filterRows, indexRows, type TableFilter } from "./table";
import { StrategyPanel } from "./StrategyPanel";
import { TokenPoliciesPanel } from "../revenue/TokenPoliciesPanel";
import layout from "./CountryPricingPage.module.css";

type TabId = "prices" | "strategy" | "tokens" | "flows" | "bulk" | "import" | "policy" | "preview" | "draft" | "history";

const LINK = "inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised";

export default function CountryPricingPage() {
  const can = useCan();
  const access = pricingAccess(can);
  const ui = pricingUi(access);
  const skip = !access.canView;

  const reg = useCallable<unknown>("adminConfig", skip ? null : { action: "registry" });
  const prices = useTarget("planPrices", skip);
  const pol = useTarget("pricingPolicy", skip);
  const plans = useCallable<{ plans: PlanRow[] }>("adminBilling", skip ? null : { action: "plans" });

  const [planId, setPlanId] = useState<PlanId>("gold");
  const [tab, setTab] = useState<TabId>("prices");
  const [filter, setFilter] = useState<TableFilter>(EMPTY_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [draft, setDraftState] = useState<PriceDraft>(emptyDraft);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [storageOk, setStorageOk] = useState(true);
  const lock = useRef({ busy: false });

  // The draft survives a reload through sessionStorage (every access is guarded).
  useEffect(() => {
    setDraftState(loadDraft(browserSessionStorage()));
    setDraftLoaded(true);
  }, []);
  useEffect(() => {
    if (!draftLoaded) return;
    const t = window.setTimeout(() => setStorageOk(saveDraft(browserSessionStorage(), draft)), 250);
    return () => window.clearTimeout(t);
  }, [draft, draftLoaded]);
  const setDraft = useCallback((fn: (d: PriceDraft) => PriceDraft) => setDraftState(fn), []);

  const registry = useMemo(() => parseRegistry(reg.data), [reg.data]);
  const baseRows = useMemo(() => indexRows(parsePrices(prices.data?.snapshot, prices.data?.itemMeta)), [prices.data]);
  const basePolicyFlat = useMemo(() => flatOf(pol.data?.snapshot), [pol.data]);
  const basePolicy = useMemo(() => parsePolicySnapshot(basePolicyFlat), [basePolicyFlat]);
  const policy = useMemo(() => parsePolicySnapshot(applyPolicyEdits(basePolicyFlat, draft.policy)), [basePolicyFlat, draft.policy]);
  const policyReady = !!pol.data;

  // Once fresh server data arrives, drop draft edits the server already has
  // (e.g. after a publish, partial or complete).
  useEffect(() => {
    if (!prices.data || !pol.data) return;
    setDraftState((d) => pruneDraft(d, baseRows, basePolicyFlat));
  }, [prices.data, pol.data, baseRows, basePolicyFlat]);

  const legacy = useMemo(() => {
    if (!plans.data || !Array.isArray(plans.data.plans)) return undefined;
    const out: Record<string, LegacyPrice | null | undefined> = {};
    for (const p of plans.data.plans) {
      if (!(PLAN_IDS as readonly string[]).includes(p.id)) continue;
      const m = p.priceMonthly ?? p.fallback?.priceMonthly;
      const a = p.priceAnnual ?? p.fallback?.priceAnnual;
      out[p.id] = p.isActive === false || typeof m !== "number" || typeof a !== "number" ? null : { monthly: m, annual: a };
    }
    return out;
  }, [plans.data]);

  const tableRows = useMemo(
    () => buildTableRows(planId, registry.countries, baseRows, draft.rows, policy, basePolicy, registry.defaultEnabled),
    [planId, registry, baseRows, draft.rows, policy, basePolicy],
  );
  const filtered = useMemo(() => filterRows(tableRows, filter), [tableRows, filter]);
  const gateway = useMemo(() => effectiveGateway(policy, registry), [policy, registry]);
  const diff = useMemo(() => buildDiff({ baseRows, basePolicy: basePolicyFlat, draft, registry }), [baseRows, basePolicyFlat, draft, registry]);

  const ctx: PricingCtx = {
    registry, planId, baseRows, draft, setDraft, basePolicyFlat, basePolicy, policy, tableRows,
    canEdit: ui.showEditControls, policyReady, gateway, legacy,
  };
  const versions: Record<PublishTarget, number | null> = { planPrices: prices.data?.version ?? null, pricingPolicy: pol.data?.version ?? null };
  const reloadAll = () => { prices.reload(); pol.reload(); reg.reload(); plans.reload(); };

  if (!access.canView) return <PermissionDenied permission="plans.read" />;

  const tabs: TabDef[] = [
    { id: "prices", label: "Prices" },
    { id: "strategy", label: "Country Strategies" },
    { id: "tokens", label: "Token Allowances" },
    { id: "flows", label: "Pricing Flows" },
    ...(ui.showBulk ? [{ id: "bulk", label: "Bulk fill" }, { id: "import", label: "Import / export" }] : []),
    { id: "policy", label: "Policy" },
    { id: "preview", label: "Preview as user" },
    { id: "draft", label: "Draft & publish", count: diff.counts.total },
    { id: "history", label: "History" },
  ];

  const loading = (prices.loading && !prices.data) || (pol.loading && !pol.data && !pol.error);

  return (
    <div className={layout.page}>
      <PageHeader
        title="Country pricing"
        description="Per-country prices for every subscription product in every country, charged in the country's own currency. Edits go into a local draft; publishing is audited, versioned and can be undone from History."
        meta={
          <span className="inline-flex gap-1.5">
            {prices.data ? <Badge tone="neutral">Prices v{prices.data.version}</Badge> : null}
            {pol.data ? <Badge tone="neutral">Policy v{pol.data.version}</Badge> : null}
          </span>
        }
        actions={
          <>
            <Button icon="refresh" onClick={reloadAll} loading={prices.refreshing || pol.refreshing}>Reload server data</Button>
            <Link href="/dashboard/plans" className={LINK}><Icon name="sliders" size={16} /> Plans</Link>
            {access.canOpenHistory ? <Link href="/dashboard/config-history" className={LINK}><Icon name="history" size={16} /> Config History</Link> : null}
          </>
        }
      />

      <div className="mb-4 space-y-2">
        <Notice tone="info">
          Applies to NEW orders only; existing subscriptions are unaffected. Prices are whole minor units of each country&apos;s currency and are never converted between currencies. Old app versions are always charged the India (INR) legacy price.
        </Notice>
        {!ui.showEditControls ? <Notice tone="info">You can browse, preview and export prices. Changing them needs the plans.modify permission.</Notice> : null}
        {reg.error && !reg.data ? <Notice tone="warning">The server registry could not be read ({reg.error.message}); the built-in country table is used.</Notice> : null}
        {pol.error && !pol.data ? <Notice tone="warning">The pricing policy could not be read ({pol.error.message}). Country enabling and the policy are unavailable until the backend answers.</Notice> : null}
        {!storageOk ? <Notice tone="warning">This browser blocks session storage: your draft will not survive a page reload. Publish or export before leaving.</Notice> : null}
        {prices.error && !prices.data ? (
          <Notice tone="danger" title="Prices could not be loaded" action={<Button size="sm" onClick={prices.reload}>Retry</Button>}>{prices.error.message}</Notice>
        ) : null}
        {ui.showPublish && diff.counts.total > 0 ? (
          <Notice
            tone="warning"
            title={`${diff.counts.total} unpublished change${diff.counts.total === 1 ? "" : "s"}`}
            action={<Button size="sm" variant="primary" onClick={() => setTab("draft")}>Review and publish</Button>}
          >
            Your draft is kept in this browser tab. Nothing has reached the app yet.
          </Notice>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label="Product" className="w-64">
          {(p) => (
            <Select {...p} value={planId} onChange={(e) => { setPlanId(e.target.value as PlanId); setSelected(new Set()); }}>
              {registry.planIds.map((id) => <option key={id} value={id}>{PLAN_LABEL[id]}</option>)}
            </Select>
          )}
        </Field>
        {tab === "prices" || tab === "bulk" || tab === "import" ? <p className="pb-2 text-sm text-fg-muted">Showing {PLAN_LABEL[planId]}. Country enabled flags are shared by all products.</p> : null}
      </div>

      <Tabs tabs={tabs} value={tab} onChange={(id) => setTab(id as TabId)} label="Country pricing sections" />
      <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`} className="pt-4" aria-busy={loading || undefined}>
        {loading ? <p className="text-sm text-fg-muted">Loading prices...</p> : null}
        {!loading && tab === "prices" ? <PricingTable key={planId} ctx={ctx} filter={filter} setFilter={setFilter} selected={selected} setSelected={setSelected} filtered={filtered} /> : null}
        {!loading && tab === "strategy" ? <StrategyPanel key={planId} ctx={ctx}/> : null}
        {tab === "tokens" ? <TokenPoliciesPanel/> : null}
        {!loading && tab === "flows" ? <><Notice tone="info">Country lock / user choice → enabled country → available product and price → supported currency → configured fallback or unavailable. Razorpay checkout support is enforced by the backend. These are deterministic existing rules; strategy labels never override them.</Notice><PolicyPanel ctx={ctx}/><PreviewPanel ctx={ctx}/></> : null}
        {!loading && tab === "bulk" && ui.showBulk ? <BulkPanel ctx={ctx} selected={selected} filtered={filtered} /> : null}
        {!loading && tab === "import" && ui.showImport ? <ImportPanel ctx={ctx} /> : null}
        {!loading && tab === "policy" ? <PolicyPanel ctx={ctx} /> : null}
        {!loading && tab === "preview" ? <PreviewPanel ctx={ctx} /> : null}
        {!loading && tab === "draft" ? (
          <DraftPanel
            ctx={ctx}
            diff={diff}
            versions={versions}
            lock={lock}
            canPublish={ui.showPublish}
            onDiscard={() => setDraftState(emptyDraft())}
            onAfterPublish={reloadAll}
          />
        ) : null}
        {tab === "history" ? <HistoryPanel canRollback={ui.showRollback} onChanged={reloadAll} /> : null}
      </div>
      <p className="mt-4 text-xs text-fg-subtle">Times are shown in your browser time zone. Prices are stored as whole minor units (cents, paise) with each currency&apos;s exponent (JPY 0, USD 2, KWD 3).</p>
    </div>
  );
}
