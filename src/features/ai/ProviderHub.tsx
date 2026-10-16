"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import { Button, ConfirmAction, DataTable, ErrorState, Notice, PageHeader, Panel, Stat, StatStrip, Tabs, TextInput } from "@/ui";
import ProvidersPage from "./ProvidersPage";
import CatalogPage from "./CatalogPage";
import VoicePage from "../voice/VoicePage";
import { TokenPoliciesPanel } from "../revenue/TokenPoliciesPanel";
import styles from "./ProviderHub.module.css";

interface Overview {
  providers: { configured: number; enabled: number; truncated: boolean } | null;
  generatedAt: number; telemetryOn: boolean; truncated: boolean;
  requests: number; served: number; tokens: number; cost: number; unpriced: number;
  measuredRequests: number; estimatedRequests: number; inputTokens: number; billedCost: number; billedRequests: number;
  successRate: number | null; ttftP50: number | null;
  hours: { at: number; requests: number; tokens: number }[];
  models: { model: string; requests: number; tokens: number; cost: number; unpriced: number }[];
  routes: Record<string, number>; alert: { tokens: number; version: number }; pricingBasis: string;
}
interface WalletRow { uid: string; missingWallet: boolean; remaining: number; bonus: number; amount: number; rolloverCap: number; cycle: string | null; nextRefillAt: number | null; current: boolean; depletion: number | null; exhausted: boolean }
interface WalletPage { generatedAt: number; scanned: number; rows: WalletRow[]; nextCursor: string | null }
const number = (n: number | undefined) => n == null ? "—" : n.toLocaleString();
const usd = (n: number) => `$${n.toFixed(6)}`;

export default function ProviderHub() {
  const can = useCan();
  const [tab, setTab] = useState("chat");
  const [createRequested, setCreateRequested] = useState(false);
  return <div className={styles.page}>
    <PageHeader title="AI Providers" description="Chat providers, voice pipeline, model catalog and observed gateway usage." actions={can("ai.providers.configure") ? <Button variant="primary" icon="plus" onClick={() => { setTab("chat"); setCreateRequested(true); }}>Add provider</Button> : undefined} />
    <Tabs label="AI provider sections" value={`providers-${tab}`} onChange={v => setTab(v.replace("providers-", ""))} tabs={[
      { id: "providers-chat", label: "Chat Models" }, { id: "providers-voice", label: "Voice AI" }, { id: "providers-catalog", label: "Model Catalog" }, { id: "providers-telegram", label: "Telegram Bots" },
    ]} />
    <div className="mt-5 space-y-6" role="tabpanel" id={`tabpanel-providers-${tab}`} aria-labelledby={`tab-providers-${tab}`}>
      {tab === "chat" ? <><ProviderUsage /><ProvidersPage embedded createRequested={createRequested} onCreateHandled={() => setCreateRequested(false)} /><Panel title="Auto-Failover Routing" description="Configured fallback chains and model health guide gateway attempts. Eligible requested models retain priority; paid last resorts remain last.">
        <div className={styles.links}><Link href="/dashboard/routing">Manage routes & fallback chains →</Link><Link href="/dashboard/model-inventory">Model health & circuit state →</Link></div>
        <p className="mt-3 text-sm text-fg-muted">The current health score uses reliability, header latency and circuit state. No automatic 95% success threshold or cost-weighted policy is configured by this page.</p>
      </Panel>{can("billing.read") && can("users.read") ? <FreeTokenTracker /> : <Notice tone="info">Free wallet details require billing.read and users.read.</Notice>}</> : null}
      {tab === "voice" ? can("voice.read") ? <VoicePage /> : <Notice tone="warning">Voice settings require voice.read.</Notice> : null}
      {tab === "catalog" ? can("ai.models.read") ? <><CatalogPage /><Link href="/dashboard/models">Downloadable / offline model catalog →</Link></> : <Notice tone="warning">Model catalog requires ai.models.read.</Notice> : null}
      {tab === "telegram" ? <Panel title="Telegram Bots"><Notice tone="info">Telegram bot integration is unavailable in Akaya. No bot credentials or hot-reload controls are configured here.</Notice></Panel> : null}
    </div>
  </div>;
}

function ProviderUsage() {
  const can = useCan();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [threshold, setThreshold] = useState("");
  const [review, setReview] = useState(false);
  const allowed = can("ai.usage.read");
  useEffect(() => {
    if (!allowed) return;
    let alive = true, busy = false;
    async function load() {
      if (document.hidden || busy) return;
      busy = true;
      try { const result = await callAdmin<Overview>("adminProviderOverview", {}); if (alive) { setData(result); setError(null); } }
      catch (e) { if (alive) setError((e as Error).message); }
      finally { busy = false; }
    }
    function visibility() { setPaused(document.hidden); if (!document.hidden) void load(); }
    visibility();
    const timer = setInterval(() => void load(), 10000);
    document.addEventListener("visibilitychange", visibility);
    return () => { alive = false; clearInterval(timer); document.removeEventListener("visibilitychange", visibility); };
  }, [allowed, nonce]);
  if (!allowed) return <Notice tone="info">Usage overview requires ai.usage.read. Provider management remains below.</Notice>;
  const stale = data && (error || Date.now() - data.generatedAt > 30000);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Gateway usage · rolling 24 hours</h2><span className="text-xs text-fg-muted">{paused ? "Paused while hidden" : stale ? "Stale" : "Refreshes every 10s"} · {data ? new Date(data.generatedAt).toLocaleTimeString() : "Loading"}</span></div>
    {error ? <ErrorState message={error} onRetry={() => setNonce(n => n + 1)} /> : null}
    {data && !data.telemetryOn ? <Notice tone="warning">Telemetry is off. Existing observations may remain; no new request telemetry is being recorded. <Link href="/dashboard/flags">Feature flags</Link></Notice> : null}
    {data?.truncated ? <Notice tone="warning">The newest 5,000 events are shown. Totals and distributions are incomplete lower bounds.</Notice> : null}
    <StatStrip className={styles.cards}>
      <Stat label="Enabled direct providers" value={number(data?.providers?.enabled)} hint={data?.providers ? `${data.providers.configured}${data.providers.truncated ? "+" : ""} configured · not a health check` : "Provider inventory unavailable"} />
      <Stat label="Output tokens" value={number(data?.tokens)} hint={data ? `${data.measuredRequests} measured · ${data.estimatedRequests} estimated requests` : "Usage unavailable"} />
      <Stat label="Recorded billed cost" value={data?.billedRequests ? usd(data.billedCost) : "—"} hint={data ? `${data.billedRequests} requests with upstream charge` : "Usage unavailable"} />
      <Stat label="Request success" value={data?.successRate == null ? "—" : `${data.successRate.toFixed(1)}%`} hint={data?.ttftP50 == null ? "No first-token samples" : `First token p50 ${Math.round(data.ttftP50)} ms`} />
    </StatStrip>
    <Notice tone="info">Coverage: proxyOpenRouter only. {number(data?.inputTokens)} input tokens recorded where upstream usage is available. Missing token counts use characters ÷ 4; historical direct events may lack provider identity. Voice and offline models are excluded. Wallet credits are a separate unit.</Notice>
    <div className={styles.two}>
      <Panel title="Token Burn Rate" description="Measured output counts where available; estimates for older or incomplete events.">
        <p className={styles.large}>{number(data?.tokens)}</p>
        <p className="mt-3 text-sm text-fg-muted">{number(data?.requests)} requests · {data ? (data.requests / 24).toFixed(1) : "—"} requests/hour · {data ? usd(data.cost) : "—"} covered charge + output estimates</p>
        <div className="mt-5 space-y-3"><p>Alert threshold: {data?.alert.tokens ? number(data.alert.tokens) + " output tokens / 24h" : "Not configured"}</p>
          {data?.alert.tokens ? <><progress className={styles.progress} max={data.alert.tokens} value={Math.min(data.tokens, data.alert.tokens)} /><p>{data.tokens >= data.alert.tokens ? "Threshold reached" : "Below threshold"}{data.truncated ? " · incomplete observations" : ""}</p></> : null}
          <p className="text-xs text-fg-muted">Monitoring threshold only; requests are not blocked.</p>
          {can("ai.routing.activate") ? <p className="text-sm">Output-token alert threshold (0 disables)</p> : null}
        </div>
        {can("ai.routing.activate") ? <div className="mt-3 flex flex-wrap gap-2"><TextInput aria-label="Output-token alert threshold" inputMode="numeric" value={threshold} onChange={e => setThreshold(e.target.value)} /><Button disabled={!data || !/^\d+$/.test(threshold) || Number(threshold) > 1000000000} onClick={() => setReview(true)}>Review threshold</Button></div> : null}
      </Panel>
      <Panel title="Output Token Usage (24h)">{data && data.requests === 0 ? <p>No request observations in this window.</p> : <div className={styles.chart}><ResponsiveContainer width="100%" height="100%"><AreaChart data={data?.hours ?? []}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="at" tickFormatter={x => new Date(x).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} /><YAxis /><Tooltip labelFormatter={x => new Date(Number(x)).toLocaleString()} /><Area dataKey="tokens" name="Output tokens" stroke="rgb(var(--chart-1))" fill="rgb(var(--chart-1))" fillOpacity={.15} /></AreaChart></ResponsiveContainer></div>}</Panel>
    </div>
    <div className={styles.two}><Panel title="Covered Cost by Served Model"><DataTable label="Model usage" rows={data?.models ?? []} rowKey={r => r.model} loading={!data && !error} columns={[
      { id: "model", header: "Model", cell: r => <span className="break-all">{r.model}</span> }, { id: "tokens", header: "Output tokens", cell: r => number(r.tokens) }, { id: "cost", header: "Cost", cell: r => r.unpriced ? "Unpriced / partial" : usd(r.cost) },
    ]} empty={{ title: "No model usage recorded" }} /></Panel>
    <Panel title="Request Distribution by Recorded Route">{Object.entries(data?.routes ?? {}).map(([route, n]) => <div key={route} className="mb-4"><div className="mb-2 flex justify-between gap-3"><span>{route}</span><strong>{number(n)}</strong></div><progress className={styles.progress} value={n} max={data?.requests || 1} /></div>)}{!data?.requests ? <p>No route observations.</p> : null}</Panel></div>
    <Panel title="Profit Analytics"><Notice tone="info">Provider-attributed revenue and net profit are unavailable. Subscription receipts cannot be converted into model revenue using a fixed coins/message ratio. Recorded provider charges include the usage billed upstream; fallback estimates cover output only. Voice and other operating costs are excluded.</Notice><Link href="/dashboard/revenue">View actual subscription revenue →</Link></Panel>
    <ConfirmAction open={review} onClose={() => setReview(false)} title="Change usage alert threshold" level="reason" confirmLabel="Save threshold" impact={<>Monitoring only; billing and routing are unaffected.</>} onConfirm={async reason => { if (!data) return; await callAdmin("adminProviderOverview", { action: "saveBudget", tokens: Number(threshold), version: data.alert.version, reason }); setNonce(n => n + 1); setThreshold(""); }} />
  </div>;
}

function FreeTokenTracker() {
  const can = useCan();
  const [cursor, setCursor] = useState<string | null>(null);
  const [data, setData] = useState<WalletPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [policy, setPolicy] = useState(false);
  useEffect(() => { let alive = true; setData(null); setError(null); callAdmin<WalletPage>("adminProviderOverview", { action: "freeUsers", cursor }).then(d => { if (alive) setData(d); }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [cursor, nonce]);
  const rows = data?.rows ?? [], current = rows.filter(r => r.current);
  return <Panel title="Free Token Tracker" description="Read-only wallet snapshots for this account page; totals are not global or daily activity counts.">
    <div className="mb-4 flex flex-wrap gap-3"><Button onClick={() => setNonce(n => n + 1)}>Refresh wallets</Button>{can("plans.read") ? <Button onClick={() => setPolicy(v => !v)}>{policy ? "Hide" : "Configure"} token allowances</Button> : null}<span className="text-sm text-fg-muted">{data ? `${data.scanned} accounts scanned` : "Loading"}</span></div>
    {error ? <ErrorState message={error} onRetry={() => setNonce(n => n + 1)} /> : null}
    <StatStrip className={styles.cards}><Stat label="Free accounts · page" value={number(data ? rows.length : undefined)} /><Stat label="Allowance remaining · page" value={number(data ? current.reduce((n, r) => n + r.remaining, 0) : undefined)} /><Stat label="Exhausted · page" value={number(data ? current.filter(r => r.exhausted).length : undefined)} /><Stat label="Near limit · page" value={number(data ? current.filter(r => r.depletion != null && r.depletion >= 80).length : undefined)} /></StatStrip>
    <p className="my-4 text-sm text-fg-muted">Each plan keeps its daily/weekly/monthly/yearly cycle. Missing, disabled, unlimited or refill-due wallets are not treated as exhausted. Near-limit percentages are unavailable for rollover policies. No demo records are written.</p>
    <DataTable label="Free wallet snapshots" rows={rows} rowKey={r => r.uid} loading={!data && !error} columns={[
      { id: "uid", header: "User", cell: r => <Link className="break-all" href={`/dashboard/users/view?uid=${encodeURIComponent(r.uid)}`}>{r.uid}</Link> },
      { id: "cycle", header: "Cycle", cell: r => r.cycle ?? "—" }, { id: "remaining", header: "Allowance / bonus", cell: r => r.missingWallet ? "Not initialized" : `${number(r.remaining)} / ${number(r.bonus)}` },
      { id: "refill", header: "Next refill", cell: r => r.nextRefillAt ? new Date(r.nextRefillAt).toLocaleString() : "—" },
      { id: "state", header: "Status", cell: r => r.missingWallet ? "Legacy / awaiting wallet" : !r.current ? "Disabled, unlimited or refill due" : r.exhausted ? "Exhausted" : r.depletion == null ? "Rollover: remaining shown" : `${r.depletion.toFixed(1)}% allowance depleted` },
    ]} empty={{ title: "No free accounts on this page", body: "Scan the next account page if available." }} />
    <div className="mt-4 flex flex-wrap gap-2"><Button disabled={!cursor} onClick={() => setCursor(null)}>First page</Button><Button disabled={!data?.nextCursor} onClick={() => setCursor(data?.nextCursor ?? null)}>Next account page</Button></div>
    {policy ? <TokenPoliciesPanel /> : null}
  </Panel>;
}
