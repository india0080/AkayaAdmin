"use client";

import { useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import { Badge, Button, ConfirmAction, ErrorState, Field, Notice, Panel, Skeleton, Switch, TextInput, relativeTime, useToast } from "@/ui";
import { applyConfig, useTarget } from "../config/useConfig";
import type { Snapshot } from "../config/logic";
import { formatINR, parseRupeesToPaise } from "./logic";
import { isVersionConflict, versionConflictError } from "./subscriptionLogic";
import {
  RECURRING_PRODUCTS,
  annualFromMonthlyPaise,
  buildAllowListPatch,
  buildRecurringMasterPatch,
  buildRecurringProductPatch,
  parseUidList,
  readRecurringConfig,
  recurringMasterConfirm,
} from "./recurringLogic";

interface RecurringPlansResponse {
  razorpayPlans: { key: string; productId: string | null; currency: string; amount: number | null; priceVersion: number | null; rzpPlanId: string | null; createdAt: number | null }[];
  products: { id: string; priceMonthly: number | null; priceAnnual: number | null; isActive: boolean }[];
}

type Pending = { kind: "master"; next: boolean } | { kind: "allow" } | { kind: "product"; key: (typeof RECURRING_PRODUCTS)[number]["key"]; next: boolean } | null;

/// "AUTO-RENEWING SUBSCRIPTIONS": master switch, per-product enable + first-month
/// price, rollout list, grace days (adminConfig target "subscription"), the
/// read-only Razorpay plan ids, and the real-price seed helper.
export function RecurringPanel() {
  const can = useCan();
  const toast = useToast();
  const q = useTarget("subscription");
  const plans = useCallable<RecurringPlansResponse>("adminBilling", { action: "recurringPlans" });
  const [pending, setPending] = useState<Pending>(null);
  const [intro, setIntro] = useState<Record<string, string>>({});
  const [allow, setAllow] = useState<string | null>(null);
  const [seedOpen, setSeedOpen] = useState(false);
  const [seed, setSeed] = useState<Record<string, string>>(() => Object.fromEntries(RECURRING_PRODUCTS.map((p) => [p.planId, String(p.suggestedMonthlyRupees)])));
  const canManage = can("subscription.manage");
  const canPrice = can("plans.modify");

  if (q.error) return <ErrorState title="Auto-renew settings could not be loaded" message={q.error.message} onRetry={q.reload} />;
  if (!q.data) return <Skeleton className="mb-4 h-40" />;

  const version = q.data.version;
  const view = readRecurringConfig(q.data.snapshot);

  async function apply(patch: Snapshot, reason: string, done: string) {
    try {
      await applyConfig("subscription", patch, version, reason);
    } catch (e) {
      if (isVersionConflict(e)) {
        q.reload();
        throw versionConflictError();
      }
      throw e;
    }
    toast.success(done);
    q.reload();
  }

  const seedPaise = Object.fromEntries(RECURRING_PRODUCTS.map((p) => [p.planId, parseRupeesToPaise(seed[p.planId] ?? "")]));
  const seedValid = Object.values(seedPaise).every((v) => v !== null && v >= 100);
  const master = pending?.kind === "master" ? recurringMasterConfirm(pending.next) : null;
  const allowParsed = allow === null ? null : parseUidList(allow);

  return (
    <div className="mb-4 space-y-4">
      <Panel
        title="AUTO-RENEWING SUBSCRIPTIONS"
        description="Monthly subscriptions through Razorpay: first month at the intro price, then the real price every month until cancelled. Annual stays a one-time purchase."
      >
        <div className="space-y-3">
          <p className="text-xs text-fg-muted">Version {version}{q.data.updatedAt ? ` · changed ${relativeTime(q.data.updatedAt)} by ${q.data.updatedByEmail ?? "unknown"}` : ""}</p>
          <div className="flex items-start justify-between gap-4 rounded-md border border-line p-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                Auto-renew master switch <Badge tone={view.enabled ? "success" : "neutral"}>{view.enabled ? "ON" : "OFF"}</Badge>
              </p>
              <p className="mt-1 text-sm text-fg-muted">
                {view.enabled
                  ? view.allowUids.length > 0 ? `ON for ${view.allowUids.length} test user${view.allowUids.length === 1 ? "" : "s"} only.` : "ON for everyone, for the products enabled below."
                  : "OFF: every user sees the one-time purchase only (this is the safe default)."}
              </p>
            </div>
            <Switch label="Auto-renewing subscriptions master switch" checked={view.enabled} disabled={!canManage} onChange={(next) => setPending({ kind: "master", next })} />
          </div>

          <ul className="space-y-2">
            {RECURRING_PRODUCTS.map((p) => {
              const c = view.products[p.key];
              const typed = intro[p.key];
              const introPaise = typed === undefined ? c.introPaise : parseRupeesToPaise(typed);
              const plan = plans.data?.products.find((x) => x.id === p.planId);
              return (
                <li key={p.key} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {p.label} <Badge tone={c.enabled ? "success" : "neutral"}>{c.enabled ? "Auto-renew on" : "Auto-renew off"}</Badge>
                    </p>
                    <p className="text-xs text-fg-muted">
                      {plan?.priceMonthly ? `First month ${formatINR(c.introPaise)}, then ${formatINR(plan.priceMonthly)} / month` : "Set the real price first (button below)."}
                    </p>
                  </div>
                  <div className="flex items-end gap-3">
                    <Field label="First month (₹)" className="w-28" error={typed !== undefined && (introPaise === null || introPaise < 100) ? "At least ₹1" : null}>
                      {(f) => <TextInput {...f} inputMode="decimal" disabled={!canManage} value={typed ?? String(c.introPaise / 100)} onChange={(e) => setIntro((s) => ({ ...s, [p.key]: e.target.value }))} />}
                    </Field>
                    <Button
                      disabled={!canManage || typed === undefined || introPaise === null || introPaise < 100}
                      onClick={() => setPending({ kind: "product", key: p.key, next: c.enabled })}
                    >
                      Save price
                    </Button>
                    <Switch label={`${p.label} auto-renew`} checked={c.enabled} disabled={!canManage} onChange={(next) => setPending({ kind: "product", key: p.key, next })} />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Rollout: only these Firebase user ids (blank = everyone)">
              {(f) => (
                <TextInput {...f} disabled={!canManage} value={allow ?? view.allowUids.join(", ")} onChange={(e) => setAllow(e.target.value)} placeholder="owner test account uid" />
              )}
            </Field>
            <div className="flex items-end gap-3">
              <Button disabled={!canManage || !allowParsed || !allowParsed.ok} onClick={() => setPending({ kind: "allow" })}>
                Save rollout list
              </Button>
              {allowParsed && !allowParsed.ok ? <span className="text-xs text-danger">{allowParsed.message}</span> : null}
            </div>
          </div>
          <p className="text-xs text-fg-muted">
            After a failed monthly debit access continues for {view.graceDays} day{view.graceDays === 1 ? "" : "s"} while Razorpay retries. Change it in Config &gt; Subscription (recurring.graceDays).
          </p>
          {!canManage ? <Notice tone="info">Your role can view these settings but not change them (subscription.manage).</Notice> : null}
        </div>
      </Panel>

      <Panel title="RAZORPAY PLANS (read-only)" description="Created by the server the first time a product is sold at a price. One per product, currency, amount and price version.">
        {plans.data?.razorpayPlans.length ? (
          <ul className="space-y-1.5 text-sm">
            {plans.data.razorpayPlans.map((p) => (
              <li key={p.key} className="flex flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2">
                <span className="font-mono text-xs">{p.rzpPlanId}</span>
                <span>{p.productId}</span>
                <Badge>{formatINR(p.amount)} / month</Badge>
                <span className="text-xs text-fg-muted">price v{p.priceVersion ?? 0} · {relativeTime(p.createdAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-subtle">{plans.loading ? "Loading…" : "No Razorpay plan has been created yet. The first sale creates it."}</p>
        )}
        {canPrice ? (
          <div className="mt-3">
            <Button onClick={() => setSeedOpen(true)}>Set the real monthly prices…</Button>
          </div>
        ) : null}
      </Panel>

      {master && pending?.kind === "master" ? (
        <ConfirmAction
          open
          onClose={() => setPending(null)}
          title={master.title}
          level="reason"
          confirmLabel={master.confirmLabel}
          impact={<p>{master.body}</p>}
          onConfirm={(reason) => apply(buildRecurringMasterPatch(pending.next), reason, pending.next ? "Auto-renew turned on" : "Auto-renew turned off")}
        />
      ) : null}
      {pending?.kind === "allow" && allowParsed?.ok ? (
        <ConfirmAction
          open
          onClose={() => setPending(null)}
          title="Save the rollout list?"
          level="reason"
          confirmLabel="Save list"
          impact={<p>Only these users will be offered the auto-renewing subscription. Blank = everyone (when the master switch is ON).</p>}
          onConfirm={(reason) => apply(buildAllowListPatch(allowParsed.uids), reason, "Rollout list saved").then(() => setAllow(null))}
        />
      ) : null}
      {pending?.kind === "product" ? (
        <ConfirmAction
          open
          onClose={() => setPending(null)}
          title={`${RECURRING_PRODUCTS.find((p) => p.key === pending.key)?.label}: auto-renew settings`}
          level="reason"
          confirmLabel="Apply"
          impact={<p>Applies to NEW subscriptions only. Existing subscribers keep their current first-month and renewal amounts.</p>}
          onConfirm={(reason) => {
            const typed = intro[pending.key];
            const paise = typed === undefined ? undefined : parseRupeesToPaise(typed) ?? undefined;
            return apply(buildRecurringProductPatch(pending.key, pending.next, paise), reason, "Auto-renew settings saved").then(() =>
              setIntro((s) => {
                const { [pending.key]: _gone, ...rest } = s;
                return rest;
              }),
            );
          }}
        />
      ) : null}
      <ConfirmAction
        open={seedOpen}
        onClose={() => setSeedOpen(false)}
        title="Set the real monthly prices"
        level="typed"
        phrase="SET PRICES"
        danger
        confirmLabel="Set prices"
        impact={
          <div className="space-y-2">
            <p>Writes the INR price of each product in the plan catalog (annual = 12 x monthly x 0.80, rounded to whole rupees). Visibility is NOT changed: hidden products stay hidden. Applies to the next checkout.</p>
            {RECURRING_PRODUCTS.map((p) => (
              <Field key={p.planId} label={`${p.label} monthly (₹)`} error={seedPaise[p.planId] === null ? "Enter an amount like 99" : null}>
                {(f) => <TextInput {...f} inputMode="decimal" value={seed[p.planId]} onChange={(e) => setSeed((s) => ({ ...s, [p.planId]: e.target.value }))} />}
              </Field>
            ))}
            <ul className="list-disc pl-5 text-xs text-fg-muted">
              {RECURRING_PRODUCTS.map((p) => (
                <li key={p.planId}>{p.label}: {formatINR(seedPaise[p.planId] ?? null)} / month, annual {seedPaise[p.planId] ? formatINR(annualFromMonthlyPaise(seedPaise[p.planId] as number)) : "—"}</li>
              ))}
            </ul>
          </div>
        }
        onConfirm={async (reason) => {
          if (!seedValid) throw new Error("Enter a valid price for every product.");
          await callAdmin("adminBilling", { action: "seedRecurringPrices", monthly: seedPaise, reason });
          toast.success("Prices set");
          plans.reload();
        }}
      />
    </div>
  );
}
