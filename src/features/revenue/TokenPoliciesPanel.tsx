"use client";
import { useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCallable } from "@/lib/useCallable";
import { useCan } from "@/lib/session";
import { Button, ConfirmAction, Field, Notice, Select, Switch, TextInput, useToast } from "@/ui";

type Policy = { enabled: boolean; unlimited: boolean; amount: number; cycle: string; rollover: number };
type Policies = { version: number; plans: Record<string, Policy> };
const labels: Record<string, string> = { free: "Free", silver: "Silver", gold: "Gold", app_premium: "App Premium", floating_premium: "Floating Premium", all_access: "All Access" };
export function TokenPoliciesPanel() {
  const q = useCallable<Policies>("adminTokenPolicies", { action: "read" });
  const can = useCan(), toast = useToast();
  const [editing, setEditing] = useState<{ plan: string; policy: Policy; version: number } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const valid = editing && [editing.policy.amount, editing.policy.rollover].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 100000000);
  return <section className="mt-6 rounded-lg border border-line bg-panel p-5" aria-label="Token allowances">
    <h2 className="text-lg font-semibold">Token allowances</h2>
    <p className="mb-4 text-sm text-fg-muted">Refill cycles are independent of payment cycles. Yearly subscribers can receive monthly or daily tokens. Disabled preserves legacy Free/paid behavior. Enabling a policy affects existing users on their next wallet refresh.</p>
    {q.error ? <Notice tone="danger">{q.error.message}<Button onClick={q.reload}>Retry</Button></Notice> : null}
    {q.loading ? <p>Loading token policies…</p> : null}
    <div className="space-y-2">{Object.entries(q.data?.plans ?? {}).map(([plan, p]) => <div key={plan} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
      <div><p className="font-medium">{labels[plan] ?? plan}</p><p className="text-sm text-fg-muted">{!p.enabled ? "Legacy behavior" : p.unlimited ? "Unlimited tokens" : `${p.amount.toLocaleString()} tokens · ${p.cycle} · carry up to ${p.rollover.toLocaleString()}`}</p></div>
      {can("plans.modify") ? <Button onClick={() => setEditing({ plan, policy: { ...p }, version: q.data!.version })}>Configure {labels[plan] ?? plan}</Button> : null}
    </div>)}</div>
    {editing ? <div className="mt-4 space-y-4 rounded-md border border-line p-4">
      <h3 className="font-semibold">{labels[editing.plan]} allowance</h3>
      <Switch label="Enable token policy" checked={editing.policy.enabled} onChange={v => setEditing({ ...editing, policy: { ...editing.policy, enabled: v } })} />
      <Switch label="Unlimited tokens" checked={editing.policy.unlimited} onChange={v => setEditing({ ...editing, policy: { ...editing.policy, unlimited: v } })} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tokens each cycle">{p => <TextInput {...p} type="number" min={0} max={100000000} disabled={editing.policy.unlimited} value={Number.isNaN(editing.policy.amount) ? "" : editing.policy.amount} onChange={e => setEditing({ ...editing, policy: { ...editing.policy, amount: e.target.value === "" ? NaN : Number(e.target.value) } })} />}</Field>
        <Field label="Refill cycle">{p => <Select {...p} value={editing.policy.cycle} onChange={e => setEditing({ ...editing, policy: { ...editing.policy, cycle: e.target.value } })}>{["daily", "weekly", "monthly", "yearly"].map(c => <option key={c} value={c}>{c}</option>)}</Select>}</Field>
        <Field label="Maximum carried tokens" hint="0 resets unused allowance. Bonus tokens are kept separately.">{p => <TextInput {...p} type="number" min={0} max={100000000} value={Number.isNaN(editing.policy.rollover) ? "" : editing.policy.rollover} onChange={e => setEditing({ ...editing, policy: { ...editing.policy, rollover: e.target.value === "" ? NaN : Number(e.target.value) } })} />}</Field>
      </div>
      <Notice tone="info">Amount/cycle changes apply at the current token period end. Plan changes replace the allowance immediately; bonus tokens survive. Missed cycles do not accumulate. Enabling/disabling/unlimited changes take effect on refresh.</Notice>
      <div className="flex gap-2"><Button disabled={!valid} onClick={() => setConfirm(true)}>Review policy</Button><Button onClick={() => setEditing(null)}>Cancel</Button></div>
    </div> : null}
    <ConfirmAction open={confirm && !!editing} onClose={() => setConfirm(false)} title="Change token allowance" level="typed" phrase="TOKENS" danger confirmLabel="Save policy"
      impact={<p>{editing ? `${labels[editing.plan]}: ${!editing.policy.enabled ? "legacy behavior" : editing.policy.unlimited ? "unlimited" : `${editing.policy.amount} tokens ${editing.policy.cycle}, rollover cap ${editing.policy.rollover}`}. Existing accounts are affected. Existing numeric balances are preserved as bonus during first migration.` : ""}</p>}
      onConfirm={async reason => { if (!editing) return; await callAdmin("adminTokenPolicies", { action: "save", ...editing, reason }); toast.success("Token policy saved"); setConfirm(false); setEditing(null); q.reload(); }} />
  </section>;
}
