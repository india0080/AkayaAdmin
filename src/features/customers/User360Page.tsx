"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Badge,
  Button,
  ConfirmAction,
  DataTable,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  Icon,
  IconButton,
  Notice,
  PageHeader,
  Panel,
  PlanBadge,
  Select,
  Skeleton,
  Stat,
  StatStrip,
  StatusPill,
  Tabs,
  TextInput,
  Textarea,
  formatNumber,
  relativeTime,
  useToast,
  type Column,
} from "@/ui";
import { describeAction } from "@/features/audit/logic";
import { TokenWalletPanel } from "./TokenWalletPanel";
import { GRANT_PLAN_OPTIONS, entitlementSummary, planLabel } from "@/features/revenue/subscriptionLogic";
import {
  PLAN_DURATIONS,
  MAX_TOKEN_GRANT,
  accountStatus,
  daysLeft,
  providerLabel,
  usageTotals,
  validTokenGrant,
  type UsageDay,
  type User360,
} from "./logic";

const fmtDate = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function User360Page() {
  const params = useSearchParams();
  const uid = params.get("uid") ?? params.get("id") ?? "";
  const can = useCan();
  const toast = useToast();
  const q = useCallable<User360>("adminUser", uid ? { action: "get360", uid } : null);
  const [tab, setTab] = useState("overview");
  const [dialog, setDialog] = useState<null | "plan" | "tokens" | "revoke" | "disable" | "enable">(null);

  if (!uid) {
    return <EmptyState title="No user selected" action={<Link href="/dashboard/users" className="text-accent-text underline">Open the directory</Link>} />;
  }
  if (q.error && !q.data) {
    return (
      <>
        <BackLink />
        <ErrorState title={q.error.kind === "not-found" ? "User not found" : "Could not load this user"} message={q.error.message} onRetry={q.reload} />
      </>
    );
  }
  const v = q.data;
  const status = v ? accountStatus(v) : null;

  const done = (msg: string) => {
    toast.success(msg);
    q.reload();
  };

  return (
    <>
      <BackLink />
      <PageHeader
        title={v ? v.profile.displayName || v.profile.email || (v.profile.isGuest ? "Guest user" : "Unnamed user") : "Loading…"}
        description={
          <span className="inline-flex items-center gap-1.5 font-mono text-xs">
            {uid}
            <IconButton icon="copy" label="Copy UID" size="sm" onClick={() => void navigator.clipboard?.writeText(uid).then(() => toast.info("UID copied"))} />
          </span>
        }
        meta={
          v ? (
            <>
              <StatusPill status={status!.tone} label={status!.label} />
              <PlanBadge plan={v.plan.planId} />
              {v.profile.isGuest ? <Badge>Guest</Badge> : null}
              {v.profile.isAdmin ? <Badge tone="warning">Console admin</Badge> : null}
              {!v.piiVisible ? <Badge tone="info">Personal data masked for your role</Badge> : null}
            </>
          ) : null
        }
        actions={
          v ? (
            <>
              <Button icon="refresh" onClick={q.reload} loading={q.refreshing}>
                Refresh
              </Button>
              {can("billing.grant") ? (
                <>
                  <Button onClick={() => setDialog("plan")}>Change plan</Button>
                  <Button onClick={() => setDialog("tokens")}>Grant tokens</Button>
                </>
              ) : null}
              {can("users.modify") && v.auth.exists ? (
                <Button variant="secondary" onClick={() => setDialog("revoke")}>
                  Sign out everywhere
                </Button>
              ) : null}
              {can("users.disable") && v.auth.exists && !v.profile.isAdmin ? (
                v.auth.disabled ? (
                  <Button onClick={() => setDialog("enable")}>Re-enable account</Button>
                ) : (
                  <Button variant="danger-ghost" onClick={() => setDialog("disable")}>
                    Disable account
                  </Button>
                )
              ) : null}
            </>
          ) : null
        }
      />

      {!v ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          {v.profile.voiceUnlimited ? (
            <div className="mb-4">
              <Notice tone="warning" title="Voice limits are bypassed for this account">
                The user document carries <code className="font-mono">voiceUnlimited: true</code>. Today the app itself can set this
                field (open production finding S1), so treat it as unverified.
              </Notice>
            </div>
          ) : null}
          {v.erasure && !v.erasure.resolved ? (
            <div className="mb-4">
              <Notice tone="danger" title="Account erasure is incomplete">
                Failed steps: {v.erasure.failedSteps.join(", ")}.{" "}
                {can("users.erasure") ? <Link className="underline" href="/dashboard/erasure">Open Account Erasure</Link> : null}
              </Notice>
            </div>
          ) : null}

          <StatStrip className="mb-4">
            <Stat label="Plan" value={<span>{planLabel(v.plan.planId)}</span>} hint={planHint(v)} />
            <Stat label="Token balance" value={formatNumber(v.profile.tokenBalance)} hint="Stored balance · allowance rules below" />
            <Stat label="Messages (30 days)" value={formatNumber(usageTotals(v.usage).messages)} hint={`${usageTotals(v.usage).activeDays} active days`} />
            <Stat label="Last sign-in" value={v.auth.exists ? relativeTime(v.auth.lastSignInAt) : "—"} hint={v.auth.exists ? v.auth.providers.map(providerLabel).join(", ") || "Anonymous" : "No sign-in record"} />
            <Stat label="Joined" value={relativeTime(v.profile.createdAt)} hint={fmtDate(v.profile.createdAt)} />
          </StatStrip>

          {can("billing.read") ? <TokenWalletPanel key={`${v.uid}-${v.profile.tokenBalance}`} uid={v.uid} /> : null}
          <Tabs
            label="User details"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "usage", label: "Usage", count: v.usage.length },
              { id: "devices", label: "Devices", count: v.devices.length },
              { id: "support", label: "Support", count: v.support.reports.length },
              { id: "history", label: "Admin history", count: v.adminHistory.length },
            ]}
          />
          <div id={`tabpanel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-4">
            {tab === "overview" ? <Overview v={v} /> : null}
            {tab === "usage" ? <UsageTab v={v} /> : null}
            {tab === "devices" ? <DevicesTab v={v} /> : null}
            {tab === "support" ? <SupportTab v={v} /> : null}
            {tab === "history" ? <HistoryTab v={v} /> : null}
          </div>

          <PlanDialog open={dialog === "plan"} onClose={() => setDialog(null)} v={v} onDone={() => done("Plan updated")} />
          <TokensDialog open={dialog === "tokens"} onClose={() => setDialog(null)} v={v} onDone={() => done("Tokens granted")} />
          <ConfirmAction
            open={dialog === "revoke"}
            onClose={() => setDialog(null)}
            title="Sign this user out everywhere"
            level="reason"
            confirmLabel="Sign out everywhere"
            impact={<>Every device must sign in again within about an hour (when its current session token expires). Their data is not touched.</>}
            onConfirm={async (reason) => {
              await callAdmin("adminUser", { action: "revokeSessions", uid, reason });
              done("Sessions revoked");
            }}
          />
          <ConfirmAction
            open={dialog === "disable"}
            onClose={() => setDialog(null)}
            title="Disable this account"
            level="reason"
            danger
            confirmLabel="Disable account"
            impact={<>The user can no longer sign in and existing sessions are revoked. Their data, plan and history are kept, and the account can be re-enabled.</>}
            onConfirm={async (reason) => {
              await callAdmin("adminUser", { action: "setDisabled", uid, disabled: true, reason });
              done("Account disabled");
            }}
          />
          <ConfirmAction
            open={dialog === "enable"}
            onClose={() => setDialog(null)}
            title="Re-enable this account"
            level="reason"
            confirmLabel="Re-enable"
            impact={<>The user can sign in again with their existing methods.</>}
            onConfirm={async (reason) => {
              await callAdmin("adminUser", { action: "setDisabled", uid, disabled: false, reason });
              done("Account re-enabled");
            }}
          />
        </>
      )}
    </>
  );
}

function BackLink() {
  return (
    <Link href="/dashboard/users" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
      <Icon name="chevron-left" size={16} /> User Directory
    </Link>
  );
}

function planHint(v: User360): string {
  if (!v.plan.active) {
    return v.rawSubscription?.expiredAt ? `Paid plan lapsed ${relativeTime(v.rawSubscription.expiredAt)}` : "No paid plan";
  }
  const d = daysLeft(v.plan.expiresAt);
  const src = v.plan.source === "admin" ? "granted by an admin" : v.plan.source === "razorpay" ? "paid via Razorpay" : "";
  return `${d !== null ? `${d} day${d === 1 ? "" : "s"} left` : ""}${src ? ` · ${src}` : ""}`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

function Overview({ v }: { v: User360 }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Profile">
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
          <Row label="Email">{v.profile.email ?? "—"}</Row>
          <Row label="Phone">{v.profile.phone ?? "—"}</Row>
          <Row label="Name">{v.profile.displayName ?? "—"}</Row>
          <Row label="Language">{v.profile.languagePreference ?? "—"}</Row>
          <Row label="Joined">{fmtDate(v.profile.createdAt)}</Row>
          <Row label="Generated media">{v.media.count === null ? "—" : formatNumber(v.media.count)}</Row>
        </dl>
      </Panel>
      <Panel title="Sign-in">
        {v.auth.exists ? (
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <Row label="Status">{v.auth.disabled ? "Disabled" : "Active"}</Row>
            <Row label="Methods">{v.auth.providers.length ? v.auth.providers.map(providerLabel).join(", ") : "Anonymous guest"}</Row>
            <Row label="Last sign-in">{fmtDate(v.auth.lastSignInAt)}</Row>
            <Row label="Last activity">{fmtDate(v.auth.lastRefreshAt)}</Row>
            <Row label="Sessions valid after">{fmtDate(v.auth.tokensValidAfter)}</Row>
          </dl>
        ) : (
          <p className="text-sm text-fg-muted">There is no Firebase Auth record for this uid (deleted, or data-only record).</p>
        )}
      </Panel>
      <Panel title="Subscription" className="lg:col-span-2">
        {v.rawSubscription ? (
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm sm:grid-cols-[140px_1fr_140px_1fr]">
            <Row label="Effective plan"><PlanBadge plan={v.plan.planId} /></Row>
            <Row label="Stored plan">{v.rawSubscription.planId ?? "—"} {v.rawSubscription.isActive ? "(active)" : "(inactive)"}</Row>
            <Row label="Started">{fmtDate(v.rawSubscription.startedAt)}</Row>
            <Row label="Expires">{fmtDate(v.rawSubscription.expiresAt)}</Row>
            <Row label="Billing">{v.rawSubscription.billing ?? "—"}</Row>
            <Row label="Source">{v.rawSubscription.source ?? "—"}</Row>
            <Row label="Payment ID"><span className="font-mono text-xs">{v.rawSubscription.paymentId ?? "—"}</span></Row>
            <Row label="Lapsed">{fmtDate(v.rawSubscription.expiredAt)}</Row>
          </dl>
        ) : (
          <p className="text-sm text-fg-muted">Never subscribed. On the Free plan.</p>
        )}
        <p className="mt-3 text-xs text-fg-subtle">
          This profile does not summarize payment amounts. Captured receipts are available in <Link href="/dashboard/revenue" className="text-accent hover:underline">Revenue analytics</Link>.
        </p>
      </Panel>
    </div>
  );
}

function UsageTab({ v }: { v: User360 }) {
  const t = usageTotals(v.usage);
  const cols: Column<UsageDay>[] = [
    { id: "date", header: "Day (UTC)", cell: (d) => d.date },
    { id: "m", header: "Messages", align: "right", cell: (d) => formatNumber(d.messages) },
    { id: "v", header: "Voice turns", align: "right", cell: (d) => formatNumber(d.voice) },
    { id: "t", header: "TTS", align: "right", hideOnNarrow: true, cell: (d) => formatNumber(d.tts) },
    { id: "i", header: "Images", align: "right", cell: (d) => formatNumber(d.images) },
    { id: "vi", header: "Videos", align: "right", hideOnNarrow: true, cell: (d) => formatNumber(d.videos) },
    { id: "s", header: "Web search", align: "right", hideOnNarrow: true, cell: (d) => formatNumber(d.webSearch) },
  ];
  return (
    <>
      <p className="mb-3 text-sm text-fg-muted">
        Last 30 days: {formatNumber(t.messages)} messages, {formatNumber(t.voice)} voice turns, {formatNumber(t.images)} images across{" "}
        {t.activeDays} active day{t.activeDays === 1 ? "" : "s"}. Daily counters only — per-request AI detail arrives with telemetry.
      </p>
      <DataTable label="Daily usage" columns={cols} rows={v.usage} rowKey={(d) => d.date} empty={{ title: "No usage in the last 30 days" }} />
      {v.realtimeSessions.length > 0 ? (
        <p className="mt-3 text-sm text-fg-muted">
          Realtime voice sessions (7 days): {v.realtimeSessions.map((r) => `${r.date}: ${r.sessions}`).join(" · ")}
        </p>
      ) : null}
    </>
  );
}

function DevicesTab({ v }: { v: User360 }) {
  return (
    <DataTable
      label="Registered devices"
      columns={[
        { id: "p", header: "Platform", cell: (d) => <span className="capitalize">{d.platform}</span> },
        { id: "t", header: "Push token", cell: (d) => <span className="font-mono text-xs text-fg-muted">{d.tokenHint}</span> },
        { id: "u", header: "Last updated", align: "right", cell: (d) => relativeTime(d.updatedAt) },
      ]}
      rows={v.devices}
      rowKey={(d) => d.tokenHint + d.platform}
      empty={{ title: "No devices registered for push", body: "The app registers a device when notifications are allowed." }}
    />
  );
}

function SupportTab({ v }: { v: User360 }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Message feedback given: {v.support.feedbackCount === null ? "—" : formatNumber(v.support.feedbackCount)}. Conversation content is not
        shown in the console.
      </p>
      <DataTable
        label="Moderation reports filed by this user"
        columns={[
          { id: "r", header: "Reason", cell: (x) => x.reason ?? "—" },
          { id: "s", header: "Status", cell: (x) => <Badge tone={x.status === "pending" ? "warning" : "neutral"}>{x.status}</Badge> },
          { id: "c", header: "Filed", align: "right", cell: (x) => relativeTime(x.createdAt) },
        ]}
        rows={v.support.reports}
        rowKey={(x) => x.id}
        empty={{ title: "No reports filed by this user" }}
      />
    </div>
  );
}

function HistoryTab({ v }: { v: User360 }) {
  if (v.adminHistory.length === 0) return <EmptyState title="No admin has changed this account" compact />;
  return (
    <ol className="space-y-3">
      {v.adminHistory.map((h) => (
        <li key={h.id} className="rounded-lg border border-line bg-panel p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {describeAction(h.action)} <span className="font-normal text-fg-muted">by {h.actorEmail || "unknown"}</span>
            </p>
            <span className="text-xs text-fg-subtle" title={fmtDate(h.at)}>
              {relativeTime(h.at)}
            </span>
          </div>
          {h.changes.length ? (
            <p className="mt-1 font-mono text-xs text-fg-muted">
              {h.changes.map((c) => `${c.field}: ${c.from} → ${c.to}`).join(" · ")}
            </p>
          ) : null}
          {h.reason ? <p className="mt-1 text-sm text-fg-muted">“{h.reason}”</p> : null}
        </li>
      ))}
    </ol>
  );
}

// ── Actions ─────────────────────────────────────────────────────────────────

function PlanDialog({ open, onClose, v, onDone }: { open: boolean; onClose: () => void; v: User360; onDone: () => void }) {
  const [plan, setPlan] = useState("silver");
  const [days, setDays] = useState<number>(30);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = reason.trim().length >= 5;
  // Ref flips synchronously; state alone lets two same-tick submits through.
  const inFlight = useRef(false);
  async function submit() {
    if (!ready || busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await callAdmin("adminSetUserPlan", { targetUid: v.uid, planId: plan, durationDays: days, reason: reason.trim() });
      onDone();
      onClose();
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Change plan"
      description={`Currently ${planLabel(v.plan.planId)}${v.plan.active && v.plan.expiresAt ? `, until ${fmtDate(v.plan.expiresAt)}` : ""}. No payment is taken; this is recorded as an admin grant.`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!ready} loading={busy}>
            {plan === "free" ? "Revoke to Free" : `Grant ${planLabel(plan)}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan" hint={`Grants: ${entitlementSummary(plan)}. Works even while the Subscription Required switch is OFF.`}>
          {(p) => (
            <Select {...p} value={plan} onChange={(e) => setPlan(e.target.value)}>
              {GRANT_PLAN_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          )}
        </Field>
        {plan !== "free" ? (
          <Field label="Duration">
            {(p) => (
              <Select {...p} value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {PLAN_DURATIONS.map((d) => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        <Field label="Reason" required hint="Recorded in the audit log with your name." className="sm:col-span-2">
          {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
        </Field>
      </div>
      {error ? <div className="mt-3"><Notice tone="danger" title="Not changed">{error}</Notice></div> : null}
    </Dialog>
  );
}

function TokensDialog({ open, onClose, v, onDone }: { open: boolean; onClose: () => void; v: User360; onDone: () => void }) {
  const grantKey = useRef<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = validTokenGrant(amount);
  const ready = n !== null && reason.trim().length >= 5;
  // Ref flips synchronously; state alone lets two same-tick submits through.
  const inFlight = useRef(false);
  async function submit() {
    if (!ready || busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      grantKey.current ??= crypto.randomUUID();
      await callAdmin("adminGrantTokens", { targetUid: v.uid, tokens: n, reason: reason.trim(), requestId: grantKey.current });
      grantKey.current = null;
      onDone();
      onClose();
      setAmount("");
      setReason("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Grant tokens"
      description={`Current balance: ${formatNumber(v.profile.tokenBalance)}. Grants add bonus tokens; enabled plan allowances are enforced for Free and paid users.`}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!ready} loading={busy}>
            Grant {n ? formatNumber(n) : ""} tokens
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tokens to add" required error={amount && n === null ? `Whole number from 1 to ${formatNumber(MAX_TOKEN_GRANT)}.` : null}>
          {(p) => <TextInput {...p} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5000" />}
        </Field>
        <Field label="Reason" required hint="Recorded in the audit log with your name.">
          {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
        </Field>
        {error ? <Notice tone="danger" title="Not granted">{error}</Notice> : null}
      </div>
    </Dialog>
  );
}
