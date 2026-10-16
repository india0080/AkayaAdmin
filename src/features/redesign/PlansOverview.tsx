"use client";

import clsx from "clsx";
import { DEMO_MODE } from "@/lib/demo/flag";
import { usePendingCallable } from "@/lib/pending";
import { useCallable } from "@/lib/useCallable";
import { Badge, Panel, PendingState, Skeleton, formatNumber } from "@/ui";
import { formatMinor } from "../pricing/logic";
import PlansPage from "../revenue/PlansPage";
import type { BillingSummary, PlanRow } from "../revenue/types";
import type { PlanEntitlements } from "../insights/dashboardTypes";
import { Bars } from "../insights/charts";
import { MiniTable } from "../insights/widgets";
import { DesignPage } from "./DesignPage";

/// Subscription Plans: plan cards (live/off state), entitlements matrix and
/// paid subscribers per plan. Editing stays in "Manage plans" (typed confirm).
export default function PlansOverview() {
  const q = useCallable<{ plans: PlanRow[] }>("adminBilling", { action: "plans" });
  const billing = useCallable<BillingSummary>("adminBilling", { action: "summary" });
  const ent = usePendingCallable<PlanEntitlements>("planEntitlements");
  const paid = billing.data?.estimated.paidCounts ?? {};
  const subs = (id: string) => (paid[id] ? paid[id].monthly + paid[id].annual : null);
  const best = q.data?.plans.reduce<PlanRow | null>((b, p) => ((subs(p.id) ?? 0) > (b ? subs(b.id) ?? 0 : -1) ? p : b), null);
  return (
    <DesignPage title="Subscription Plans" description="What the upgrade screen shows. Changes need a typed confirmation and a reason." sample={DEMO_MODE}
      manage={<PlansPage />} manageLabel="Manage plans, auto-renew & tokens">
      {!q.data ? <Skeleton className="h-48" /> : (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Plans">
          {q.data.plans.map((p) => {
            const featured = p.id === best?.id;
            return (
              <article key={p.id} className={clsx("ui-panel flex flex-col gap-2 rounded-xl border p-4", featured ? "border-transparent bg-gradient-to-br from-[#7c5cff] to-[#c06cff] text-white" : "border-line bg-panel")}>
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold">{p.name}</p>
                  <span role="switch" aria-checked={p.isActive} aria-label={`${p.name} ${p.isActive ? "live" : "off"}`}
                    className={clsx("inline-flex h-5 w-9 items-center rounded-full p-0.5", p.isActive ? "bg-success" : "bg-line-strong")}>
                    <span className={clsx("h-4 w-4 rounded-full bg-white transition-transform", p.isActive && "translate-x-4")} />
                  </span>
                </div>
                {featured ? <Badge tone="success" className="w-fit">Most popular</Badge> : null}
                <p className="text-2xl font-bold tabular-nums">{p.priceMonthly != null ? formatMinor(p.priceMonthly, "INR") : formatMinor(p.priceAnnual, "INR")}<span className={clsx("text-xs font-normal", featured ? "text-white/80" : "text-fg-muted")}> {p.priceMonthly != null ? "/ month" : `/ ${p.annualDurationDays ?? 365} days`}</span></p>
                <p className={clsx("text-xs", featured ? "text-white/85" : "text-fg-muted")}>Yearly {formatMinor(p.priceAnnual, "INR")} · v{p.version}</p>
                <p className={clsx("mt-auto text-sm font-semibold", featured ? "text-white" : p.isActive ? "text-success" : "text-fg-subtle")}>{subs(p.id) == null ? "—" : `${formatNumber(subs(p.id))} subs`}</p>
              </article>
            );
          })}
        </section>
      )}
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel title="Plan entitlements" description="What each plan unlocks in the app" flush>
          {ent.pending ? <PendingState title="Entitlements are compiled into the app today" contract={ent.contract} /> : !ent.data ? <Skeleton className="m-4 h-40" /> : (
            <MiniTable head={["Feature", ...ent.data.plans]} rows={ent.data.features.map((f) => [f.feature, ...f.values.map((v, i) => <span key={i} className={v === "—" ? "text-fg-subtle" : v === "✓" || v === "Unlimited" ? "font-semibold text-success" : ""}>{v}</span>)])} />
          )}
        </Panel>
        <Panel title="Plan performance" description="Paid subscribers per plan (monthly + yearly)">
          {!billing.data ? <Skeleton className="h-52" /> : <Bars data={Object.entries(paid).map(([id, c]) => ({ label: id, value: c.monthly + c.annual }))} />}
        </Panel>
      </div>
    </DesignPage>
  );
}
