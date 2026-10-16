"use client";

import { DEMO_MODE } from "@/lib/demo/flag";
import { usePendingCallable } from "@/lib/pending";
import { useCallable } from "@/lib/useCallable";
import { Badge, Panel, PendingState, Skeleton, relativeTime } from "@/ui";
import PaymentGateways from "../revenue/PaymentGateways";
import type { RevenueData } from "../revenue/revenueTypes";
import type { GatewayMetrics } from "../insights/dashboardTypes";
import { TrendChart } from "../insights/charts";
import { compactMoney, KpiRow, MiniTable } from "../insights/widgets";
import { DesignPage } from "./DesignPage";

interface Gateway { id: string; version: number; enabled: boolean; mode: "test" | "live"; missing: string[]; lastWebhookAt: number | null; check: { at: number; detail: string } | null }
interface Status { gateways: Gateway[]; routing: { india: string; global: string } }
const LABEL: Record<string, string> = { razorpay: "Razorpay", stripe: "Stripe", play: "Google Play Billing" };

/// Payment Gateways: KPIs, gateway cards (real adminPaymentGateways status),
/// success-rate chart (pending gatewayMetrics) and routing rules (real).
export default function GatewaysOverview() {
  const st = useCallable<Status>("adminPaymentGateways", { action: "status" });
  const rev = useCallable<RevenueData>("adminRevenue", { action: "summary", days: 30, currency: "INR", page: 1, status: "all" });
  const m = usePendingCallable<GatewayMetrics>("gatewayMetrics");
  const metric = (id: string) => m.data?.gateways.find((g) => g.id === id);
  const pendingHint = m.pending ? <span className="text-xs text-warning">Awaiting backend</span> : undefined;
  return (
    <DesignPage title="Payment Gateways" description="Razorpay, Stripe and Google Play Billing: health, routing and configuration." sample={DEMO_MODE}
      manage={<PaymentGateways />} manageLabel="Configure keys & webhooks">
      <KpiRow items={[
        { label: "Payment success rate", value: m.data ? `${m.data.successRate.toFixed(1)}%` : "—", delta: m.data?.successDelta, hint: pendingHint },
        { label: "Volume · 30d", value: compactMoney(rev.data?.captured), delta: rev.data?.capturedGrowth ?? null, spark: rev.data?.series.map((s) => s.captured) },
        { label: "Enabled gateways", value: st.data ? `${st.data.gateways.filter((g) => g.enabled).length}/${st.data.gateways.length}` : "—", tone: st.data?.gateways.some((g) => g.enabled && g.missing.length) ? "warning" : "success" },
        { label: "Refunded · 30d", value: compactMoney(rev.data?.refunded), tone: "warning" },
        { label: "Failed payments · 7d", value: m.data ? m.data.failed7d.toLocaleString() : "—", delta: m.data?.failedDelta, invert: true, tone: "danger", hint: pendingHint },
      ]} />
      {!st.data ? <Skeleton className="h-40" /> : (
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3" aria-label="Gateways">
          {st.data.gateways.map((g) => {
            const gm = metric(g.id);
            const tone = !g.enabled ? "neutral" : g.missing.length ? "warning" : "success";
            return (
              <Panel key={g.id} title={LABEL[g.id] ?? g.id} actions={<Badge tone={tone}>{!g.enabled ? "Off" : g.missing.length ? "Incomplete" : g.mode === "live" ? "Live" : "Test"}</Badge>}>
                <dl className="divide-y divide-line text-sm">
                  <div className="flex justify-between py-1.5"><dt className="text-fg-muted">Success rate</dt><dd className={gm ? (gm.successRate >= 95 ? "font-semibold text-success" : "font-semibold text-warning") : "text-fg-subtle"}>{gm ? `${gm.successRate.toFixed(1)}%` : "—"}</dd></div>
                  <div className="flex justify-between py-1.5"><dt className="text-fg-muted">Fee</dt><dd>{gm ? `${gm.feePct}%` : "—"}</dd></div>
                  <div className="flex justify-between py-1.5"><dt className="text-fg-muted">Mode</dt><dd className={g.mode === "live" ? "text-success" : "text-warning"}>{g.mode}</dd></div>
                  <div className="flex justify-between py-1.5"><dt className="text-fg-muted">Last webhook</dt><dd>{g.lastWebhookAt ? relativeTime(g.lastWebhookAt) : "—"}</dd></div>
                  {g.missing.length ? <div className="py-1.5 text-xs text-danger">Missing: {g.missing.join(", ")}</div> : null}
                </dl>
              </Panel>
            );
          })}
        </section>
      )}
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Panel title="Success rate by gateway" description="Daily · last 14 days">
          {m.pending ? <PendingState title="Per-attempt outcomes are not aggregated yet" contract={m.contract} /> : !m.data ? <Skeleton className="h-56" /> : (
            <TrendChart data={m.data.daily} x="day" format={(v) => `${v.toFixed(0)}%`} series={[{ key: "razorpay", name: "Razorpay", kind: "line" }, { key: "stripe", name: "Stripe", kind: "line" }, { key: "play", name: "Play", kind: "line" }]} />
          )}
        </Panel>
        <Panel title="Routing rules" description="Which gateway checkout uses" flush>
          {!st.data ? <Skeleton className="m-4 h-32" /> : <MiniTable minWidth={320} head={["Rule", "Gateway"]} rows={[["Country = India", LABEL[st.data.routing.india] ?? st.data.routing.india], ["Everywhere else", LABEL[st.data.routing.global] ?? st.data.routing.global], ["Android in-app (Play policy)", "Google Play Billing"]]} />}
        </Panel>
      </div>
    </DesignPage>
  );
}
