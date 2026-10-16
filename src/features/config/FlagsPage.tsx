"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCan } from "@/lib/session";
import { Badge, Button, ErrorState, Icon, Notice, PageHeader, Panel, Select, Skeleton, StatusPill, relativeTime, useToast } from "@/ui";
import { ChangeConfirm } from "./ChangeConfirm";
import { effectiveOn, flagState, type FlagDef, type Snapshot } from "./logic";
import { applyConfig, useRegistry, useTarget } from "./useConfig";
import { bulkFlagPatch } from "./matrixLogic";

const STATE_LABEL = {
  on: "On",
  off: "Off",
  "default-on": "On (default)",
  "default-off": "Off (default)",
} as const;

export default function FlagsPage({ bulk = false }: { bulk?: boolean } = {}) {
  const can = useCan();
  const toast = useToast();
  const reg = useRegistry();
  const q = useTarget("flags");
  const [pending, setPending] = useState<{ key: string; value: boolean | null } | null>(null);
  const [batch, setBatch] = useState<Snapshot | null>(null);

  const groups = useMemo(() => {
    const out = new Map<string, FlagDef[]>();
    for (const f of reg.data?.flags ?? []) out.set(f.domain, [...(out.get(f.domain) ?? []), f]);
    return [...out.entries()];
  }, [reg.data]);

  if (reg.error || q.error) return <ErrorState message={(reg.error ?? q.error)!.message} onRetry={() => { reg.reload(); q.reload(); }} />;
  const snap = q.data?.snapshot ?? {};
  const canEdit = can("flags.modify");
  const canKill = can("flags.killswitch");

  return (
    <>
      <PageHeader
        title="Feature Flags & Kill Switches"
        description="Every runtime switch the app and backend read from config/features, with what it does and what happens when it is not set. Changes are versioned, need a reason, and can be rolled back."
        actions={
          <Link href="/dashboard/config-history" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
            <Icon name="history" size={16} /> History
          </Link>
        }
        meta={q.data ? <span className="text-xs text-fg-muted">Version {q.data.version}{q.data.updatedAt ? ` · changed ${relativeTime(q.data.updatedAt)} by ${q.data.updatedByEmail}` : " · never changed from the console"}</span> : null}
      />
      <div className="mb-4">
        <Notice tone="info">
          <strong>Default</strong> means the key is not set, so the app uses its compiled default. Choose <em>Default</em> to hand a flag back to
          the app. Other kill switches: <Link className="underline" href="/dashboard/openrouter">OpenRouter gateway</Link>,{" "}
          <Link className="underline" href="/dashboard/floating-system">Floating emergency switch</Link>,{" "}
          <Link className="underline" href="/dashboard/config">maintenance mode &amp; online/offline AI</Link>.
        </Notice>
      </div>

      {!reg.data || !q.data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-4">
          {bulk ? <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" disabled={!canEdit || !canKill || pending !== null} onClick={() => setBatch(bulkFlagPatch(reg.data!.flags, snap, true))}>Enable All</Button>
            <Button variant="danger" disabled={!canEdit || !canKill || pending !== null} onClick={() => setBatch(bulkFlagPatch(reg.data!.flags, snap, false))}>Disable All</Button>
            <span className="text-xs text-fg-muted">Reviews effective state changes; requires flags.modify and flags.killswitch.</span>
          </div> : null}
          {groups.map(([domain, flags]) => (
            <Panel key={domain} title={domain} flush>
              <ul className="divide-y divide-line">
                {flags.map((f) => {
                  const stored = (snap[f.key] as boolean | null | undefined) ?? null;
                  const state = flagState(f, stored);
                  const on = effectiveOn(f, stored);
                  const editable = canEdit && (!f.killSwitch || canKill);
                  return (
                    <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {f.label}
                          {f.killSwitch ? <Badge tone="danger">Kill switch</Badge> : null}
                          <code className="font-mono text-2xs text-fg-subtle">{f.key}</code>
                        </p>
                        <p className="mt-0.5 text-xs text-fg-muted">{f.description}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill status={on ? "ok" : "off"} label={STATE_LABEL[state]} />
                        <Select
                          aria-label={`Set ${f.label}`}
                          className="w-32"
                          value={stored === null ? "default" : stored ? "on" : "off"}
                          disabled={!editable}
                          title={!editable ? (f.killSwitch ? "Needs flags.killswitch" : "Needs flags.modify") : undefined}
                          onChange={(e) => {
                            const v = e.target.value === "default" ? null : e.target.value === "on";
                            setPending({ key: f.key, value: v });
                          }}
                        >
                          <option value="on">On</option>
                          <option value="off">Off</option>
                          <option value="default">Default ({f.defaultWhenAbsent ? "on" : "off"})</option>
                        </Select>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ))}
        </div>
      )}

      {pending && reg.data && q.data ? (
        <ChangeConfirm
          open
          onClose={() => setPending(null)}
          registry={reg.data}
          target="flags"
          current={snap as Snapshot}
          patch={{ [pending.key]: pending.value }}
          onApply={async (reason) => {
            await applyConfig("flags", { [pending.key]: pending.value }, q.data!.version, reason);
            toast.success("Flag updated", `${pending.key} → ${pending.value === null ? "default" : pending.value ? "on" : "off"}`);
            setPending(null);
            q.reload();
          }}
        />
      ) : null}
      {batch && reg.data && q.data ? Object.keys(batch).length ? <ChangeConfirm open onClose={() => setBatch(null)} registry={reg.data} target="flags" current={snap} patch={batch} onApply={async reason => {
        await applyConfig('flags', batch, q.data!.version, reason);
        toast.success('Flags updated'); setBatch(null); q.reload();
      }} /> : <Notice tone="info">All registered flags already have the requested effective state. No changes needed.</Notice> : null}
      {!canEdit ? <p className="mt-4 text-xs text-fg-subtle">Your role can view flags but not change them.</p> : null}
    </>
  );
}
