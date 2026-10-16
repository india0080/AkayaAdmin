"use client";

import Link from "next/link";
import { useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Badge,
  Button,
  ConfirmAction,
  DataTable,
  Drawer,
  Field,
  Notice,
  PageHeader,
  PlanBadge,
  Switch,
  TextInput,
  relativeTime,
  useToast,
  type Column,
} from "@/ui";
import { formatINR, parseRupeesToPaise, priceChange } from "./logic";
import type { PlanRow } from "./types";
import { planFallback as fb } from "./planFallback";
import { planLabel } from "./subscriptionLogic";
import { RecurringPanel } from "./RecurringPanel";
import { TokenPoliciesPanel } from "./TokenPoliciesPanel";

interface VersionRow {
  version: number;
  before: Record<string, number | boolean | null>;
  after: Record<string, number | boolean | null>;
  reason: string;
  actorEmail: string;
  at: number | null;
}

export default function PlansPage() {
  const can = useCan();
  const q = useCallable<{ plans: PlanRow[] }>("adminBilling", { action: "plans" });
  const [editing, setEditing] = useState<PlanRow | null>(null);

  const cols: Column<PlanRow>[] = [
    { id: "plan", header: "Plan", cell: (p) => <span className="inline-flex items-center gap-2"><PlanBadge plan={p.id} />{p.isActive ? null : <Badge tone="warning">Hidden</Badge>}</span> },
    { id: "m", header: "Monthly", align: "right", cell: (p) => formatINR(p.priceMonthly ?? fb(p).priceMonthly) },
    { id: "a", header: "Annual", align: "right", cell: (p) => formatINR(p.priceAnnual ?? fb(p).priceAnnual) },
    { id: "d", header: "Durations", align: "right", hideOnNarrow: true, cell: (p) => `${p.durationDays ?? fb(p).durationDays} / ${p.annualDurationDays ?? fb(p).annualDurationDays} days` },
    { id: "src", header: "Source", cell: (p) => (p.stored ? <Badge>subscription_plans · v{p.version}</Badge> : <Badge tone="warning">Compiled fallback</Badge>) },
    { id: "u", header: "Last change", align: "right", hideOnNarrow: true, cell: (p) => relativeTime(p.updatedAt) },
  ];

  return (
    <>
      <PageHeader
        title="Plans & Pricing"
        description="What the upgrade screen shows and what checkout charges. Every change needs a typed confirmation and a reason, and is versioned."
        actions={
          can("plans.read") ? (
            <Link href="/dashboard/pricing" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
              Country pricing
            </Link>
          ) : undefined
        }
      />
      <div className="mb-4">
        <Notice tone="info">
          These are the India (INR) prices. Prices for other countries (USD, CAD, ...) are managed under Country pricing. New prices apply to the next checkout. Existing subscribers keep their current period. The app shows prices from this catalog
          and falls back to compiled prices only when it cannot be read.
        </Notice>
        <div className="mt-2">
          <Notice tone="info">
            App Premium, Floating System Premium and All Access start hidden with placeholder prices. Set a price here, then make the product
            available under Subscriptions &gt; Subscription products. Whether a plan is offered is separate from the master Subscription Required switch.
          </Notice>
        </div>
      </div>
      <DataTable
        label="Plans"
        columns={cols}
        rows={q.data?.plans ?? []}
        rowKey={(p) => p.id}
        loading={q.loading}
        error={q.error?.message ?? null}
        onRetry={q.reload}
        onRowClick={setEditing}
      />
      {can("billing.read") ? <div className="mt-6"><RecurringPanel /></div> : null}
      {can("plans.read") ? <TokenPoliciesPanel /> : null}
      <PlanDrawer plan={editing} canEdit={can("plans.modify")} onClose={() => setEditing(null)} onSaved={q.reload} />
    </>
  );
}

function PlanDrawer({ plan, canEdit, onClose, onSaved }: { plan: PlanRow | null; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const versions = useCallable<{ rows: VersionRow[] }>("adminBilling", plan ? { action: "planVersions", planId: plan.id } : null);
  const [form, setForm] = useState({ monthly: "", annual: "", days: "", annualDays: "", active: true });
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  if (plan && openFor !== `${plan.id}:${plan.version}`) {
    setOpenFor(`${plan.id}:${plan.version}`);
    setForm({
      monthly: String((plan.priceMonthly ?? fb(plan).priceMonthly) / 100),
      annual: String((plan.priceAnnual ?? fb(plan).priceAnnual) / 100),
      days: String(plan.durationDays ?? fb(plan).durationDays),
      annualDays: String(plan.annualDurationDays ?? fb(plan).annualDurationDays),
      active: plan.isActive,
    });
  }

  const monthly = parseRupeesToPaise(form.monthly);
  const annual = parseRupeesToPaise(form.annual);
  const days = /^\d+$/.test(form.days) ? Number(form.days) : null;
  const annualDays = /^\d+$/.test(form.annualDays) ? Number(form.annualDays) : null;
  const curM = plan ? plan.priceMonthly ?? fb(plan).priceMonthly : 0;
  const curA = plan ? plan.priceAnnual ?? fb(plan).priceAnnual : 0;
  const patch: Record<string, number | boolean> = {};
  if (plan) {
    if (monthly !== null && monthly !== curM) patch.priceMonthly = monthly;
    if (annual !== null && annual !== curA) patch.priceAnnual = annual;
    if (days !== null && days !== (plan.durationDays ?? fb(plan).durationDays)) patch.durationDays = days;
    if (annualDays !== null && annualDays !== (plan.annualDurationDays ?? fb(plan).annualDurationDays)) patch.annualDurationDays = annualDays;
    if (form.active !== plan.isActive) patch.isActive = form.active;
  }
  const valid = monthly !== null && annual !== null && days !== null && annualDays !== null;
  const changed = Object.keys(patch).length > 0;

  return (
    <>
      <Drawer
        open={!!plan}
        onClose={onClose}
        title={plan ? `${planLabel(plan.id)} plan` : ""}
        subtitle={plan ? (plan.stored ? `Version ${plan.version}` : "Not in the catalog yet — using compiled prices") : null}
        footer={canEdit ? <Button variant="primary" disabled={!valid || !changed} onClick={() => setConfirm(true)}>Review change</Button> : undefined}
      >
        {plan ? (
          <div className="space-y-5">
            {!canEdit ? <Notice tone="info">Your role can view prices but not change them (plans.modify).</Notice> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Monthly price (₹)" error={form.monthly && monthly === null ? "Enter an amount like 99 or 99.50" : null}>
                {(p) => <TextInput {...p} inputMode="decimal" value={form.monthly} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, monthly: e.target.value }))} />}
              </Field>
              <Field label="Annual price (₹)" error={form.annual && annual === null ? "Enter an amount like 948" : null}>
                {(p) => <TextInput {...p} inputMode="decimal" value={form.annual} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, annual: e.target.value }))} />}
              </Field>
              <Field label="Monthly period (days)">
                {(p) => <TextInput {...p} inputMode="numeric" value={form.days} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))} />}
              </Field>
              <Field label="Annual period (days)">
                {(p) => <TextInput {...p} inputMode="numeric" value={form.annualDays} disabled={!canEdit} onChange={(e) => setForm((f) => ({ ...f, annualDays: e.target.value }))} />}
              </Field>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-md border border-line p-3">
              <span>
                <span className="block text-sm font-medium">Offered in the app</span>
                <span className="block text-xs text-fg-muted">Off hides the plan from the upgrade screen. Existing subscribers are unaffected.</span>
              </span>
              <Switch label="Offered in the app" checked={form.active} disabled={!canEdit} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            </label>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Price history</h3>
              {versions.data?.rows.length ? (
                <ol className="space-y-2">
                  {versions.data.rows.map((v) => (
                    <li key={v.version} className="rounded-md border border-line p-2.5 text-sm">
                      <p className="font-medium">v{v.version} · {v.actorEmail} · <span className="text-fg-muted">{relativeTime(v.at)}</span></p>
                      <p className="font-mono text-xs text-fg-muted">
                        {Object.keys(v.after).filter((k) => v.after[k] !== v.before[k]).map((k) => `${k}: ${v.before[k] ?? "—"} → ${v.after[k]}`).join(" · ")}
                      </p>
                      {v.reason ? <p className="text-fg-muted">“{v.reason}”</p> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-fg-subtle">{versions.loading ? "Loading…" : "No changes made through the console yet."}</p>
              )}
            </section>
          </div>
        ) : null}
      </Drawer>
      {plan ? (
        <ConfirmAction
          open={confirm}
          onClose={() => setConfirm(false)}
          title={`Change the ${planLabel(plan.id)} plan`}
          level="typed"
          phrase={plan.id.toUpperCase()}
          danger
          confirmLabel="Apply change"
          impact={
            <ul className="list-disc pl-5">
              {patch.priceMonthly !== undefined ? <li>Monthly: {priceChange(curM, patch.priceMonthly as number)}</li> : null}
              {patch.priceAnnual !== undefined ? <li>Annual: {priceChange(curA, patch.priceAnnual as number)}</li> : null}
              {patch.durationDays !== undefined ? <li>Monthly period → {String(patch.durationDays)} days</li> : null}
              {patch.annualDurationDays !== undefined ? <li>Annual period → {String(patch.annualDurationDays)} days</li> : null}
              {patch.isActive !== undefined ? <li>{patch.isActive ? "Offered again in the app" : "Hidden from the upgrade screen"}</li> : null}
              <li>Applies to the next checkout for every user.</li>
            </ul>
          }
          onConfirm={async (reason) => {
            await callAdmin("adminBilling", { action: "updatePlan", planId: plan.id, patch, reason });
            toast.success("Plan updated");
            onSaved();
            versions.reload();
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
