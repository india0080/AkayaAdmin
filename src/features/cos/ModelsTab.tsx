"use client";

import { useRef, useState } from "react";
import { Badge, Button, ConfirmAction, DataTable, Drawer, Field, Notice, Select, TextInput, useToast, type Column } from "@/ui";
import { useCosCtx } from "./CosContext";
import { SliderField, ToggleRow } from "./widgets";
import {
  CHANNELS, COST_TIERS, INTENTS, SPEED_TIERS, emptyProfile, humanize, isConflict, profileDocId, validateProfile, type Channel, type Intent,
  type ModelProfile,
} from "./logic";
import { cosCall } from "./useCos";

const SCORES = [
  ["reasoningStrength", "Reasoning strength"],
  ["instructionReliability", "Instruction reliability"],
  ["toneReliability", "Tone reliability"],
  ["translationQuality", "Translation quality"],
] as const;
const FLAGS = [
  ["supportsTools", "Supports tools"],
  ["supportsVision", "Supports vision"],
  ["supportsStructuredOutput", "Structured output"],
  ["supportsLongContext", "Long context"],
  ["offline", "Runs offline (on-device)"],
] as const;

export function ModelsTab() {
  const c = useCosCtx();
  const toast = useToast();
  const d = c.q.data;
  const [editing, setEditing] = useState<{ draft: ModelProfile; isNew: boolean } | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const lock = useRef(false);
  if (!d) return null;
  const items = Object.entries(d.profiles.items).map(([id, p]) => ({ id, ...p }));
  const canEdit = c.access.canEdit;

  const check = editing ? validateProfile(editing.draft) : null;
  const set = <K extends keyof ModelProfile>(k: K, v: ModelProfile[K]) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));
  const toggleList = <T extends string>(k: "allowedChannels" | "allowedIntents", v: T, on: boolean) =>
    setEditing((e) => {
      if (!e) return e;
      const cur = new Set<string>(e.draft[k] as string[]);
      if (on) cur.add(v);
      else cur.delete(v);
      const order: readonly string[] = k === "allowedChannels" ? CHANNELS : INTENTS;
      return { ...e, draft: { ...e.draft, [k]: order.filter((x) => cur.has(x)) } as ModelProfile };
    });

  const run = async (fn: () => Promise<unknown>) => {
    if (lock.current) throw new Error("Another change is still being saved.");
    lock.current = true;
    try {
      await fn();
      setConflict(false);
      c.reload();
    } catch (e) {
      if (isConflict(e)) {
        setConflict(true);
        c.reload();
      }
      throw e;
    } finally {
      lock.current = false;
    }
  };

  const columns: Column<(typeof items)[number]>[] = [
    { id: "model", header: "Model", cell: (r) => <span className="break-all font-medium">{r.modelId}</span> },
    { id: "provider", header: "Provider", cell: (r) => r.provider || "-", hideOnNarrow: true },
    { id: "tier", header: "Speed / cost", cell: (r) => `${r.speedTier} / ${r.costTier}`, hideOnNarrow: true },
    {
      id: "scores",
      header: "Reasoning / instr. / tone / transl.",
      cell: (r) => (
        <span className="tabular">
          {[r.reasoningStrength, r.instructionReliability, r.toneReliability, r.translationQuality].map((n) => n.toFixed(2)).join(" / ")}
        </span>
      ),
      hideOnNarrow: true,
    },
    { id: "prio", header: "Priority", cell: (r) => r.routingPriority, align: "right" },
    { id: "state", header: "State", cell: (r) => (r.enabled ? <Badge tone="success">Enabled</Badge> : <Badge tone="neutral">Disabled</Badge>) },
  ];

  return (
    <div className="space-y-4">
      <Notice tone="info">
        Profiles are routing HINTS over the model candidates the existing router already produced: entitlements, health and the circuit breaker stay in charge.
        Saving a profile is versioned and audited; it takes effect without a publish. No keys or secrets belong here.
      </Notice>
      {conflict ? (
        <Notice tone="warning" title="The profiles changed since you loaded them">
          Your change was NOT applied. The latest data was reloaded; review it and try again.
        </Notice>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">
          {items.length} profile{items.length === 1 ? "" : "s"} (version {d.profiles.version})
        </p>
        {canEdit ? (
          <Button variant="primary" icon="plus" onClick={() => setEditing({ draft: emptyProfile(), isNew: true })}>
            Add profile
          </Button>
        ) : null}
      </div>
      <DataTable
        label="Model profiles"
        columns={columns}
        rows={items}
        rowKey={(r) => r.id}
        onRowClick={(r) => setEditing({ draft: { ...r }, isNew: false })}
        empty={{ title: "No model profiles yet", body: "Add a profile to give the router capability hints (reasoning, tone, translation, tools)." }}
      />

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.isNew ? "Add model profile" : "Edit model profile"}
        subtitle={editing?.draft.modelId || undefined}
        width={560}
        footer={
          <>
            {!editing?.isNew && canEdit ? (
              <Button variant="danger-ghost" className="mr-auto" onClick={() => setDeleteId(profileDocId(editing!.draft.modelId))}>
                Delete
              </Button>
            ) : null}
            <Button onClick={() => setEditing(null)}>Close</Button>
            {canEdit ? (
              <Button variant="primary" disabled={!check?.ok} onClick={() => setSaveOpen(true)}>
                Save...
              </Button>
            ) : null}
          </>
        }
      >
        {editing ? (
          <div className="space-y-3">
            {check && !check.ok ? <Notice tone="danger">{check.message}</Notice> : null}
            <Field label="Model id" required hint="Same id the router uses, e.g. openai/gpt-4o-mini or gemma-3n.">
              {(p) => <TextInput {...p} value={editing.draft.modelId} disabled={!editing.isNew || !canEdit} onChange={(e) => set("modelId", e.target.value.trim())} />}
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Provider">{(p) => <TextInput {...p} value={editing.draft.provider} disabled={!canEdit} onChange={(e) => set("provider", e.target.value)} />}</Field>
              <Field label="Speed tier">
                {(p) => (
                  <Select {...p} value={editing.draft.speedTier} disabled={!canEdit} onChange={(e) => set("speedTier", e.target.value as ModelProfile["speedTier"])}>
                    {SPEED_TIERS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Cost tier">
                {(p) => (
                  <Select {...p} value={editing.draft.costTier} disabled={!canEdit} onChange={(e) => set("costTier", e.target.value as ModelProfile["costTier"])}>
                    {COST_TIERS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <ToggleRow label="Enabled" help="A disabled profile is ignored by the OS router." checked={editing.draft.enabled} disabled={!canEdit} onChange={(v) => set("enabled", v)} />
            {SCORES.map(([k, label]) => (
              <SliderField key={k} label={label} value={editing.draft[k]} disabled={!canEdit} onChange={(v) => set(k, v)} />
            ))}
            <div className="grid gap-x-6 sm:grid-cols-2">
              {FLAGS.map(([k, label]) => (
                <ToggleRow key={k} label={label} checked={editing.draft[k]} disabled={!canEdit} onChange={(v) => set(k, v)} />
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Routing priority" hint="0 to 1000. Lower is tried first.">
                {(p) => (
                  <TextInput
                    {...p}
                    type="number"
                    min={0}
                    max={1000}
                    step={1}
                    disabled={!canEdit}
                    value={editing.draft.routingPriority}
                    onChange={(e) => set("routingPriority", e.target.value === "" ? 0 : Number(e.target.value))}
                  />
                )}
              </Field>
              <Field label="Adapter id" hint="Optional model-adapter rules id.">
                {(p) => <TextInput {...p} disabled={!canEdit} value={editing.draft.adapterId ?? ""} onChange={(e) => set("adapterId", e.target.value.trim() === "" ? null : e.target.value.trim())} />}
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-fg-muted">Allowed channels (none checked = all)</legend>
              <div className="flex flex-wrap gap-3">
                {CHANNELS.map((ch: Channel) => (
                  <label key={ch} className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" disabled={!canEdit} checked={editing.draft.allowedChannels.includes(ch)} onChange={(e) => toggleList("allowedChannels", ch, e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent-solid))]" />
                    {humanize(ch)}
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-fg-muted">Allowed intents (none checked = all)</legend>
              <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-y-auto">
                {INTENTS.map((it: Intent) => (
                  <label key={it} className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" disabled={!canEdit} checked={editing.draft.allowedIntents.includes(it)} onChange={(e) => toggleList("allowedIntents", it, e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent-solid))]" />
                    {humanize(it)}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}
      </Drawer>

      <ConfirmAction
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={editing?.isNew ? "Add model profile" : "Save model profile"}
        level="reason"
        confirmLabel="Save profile"
        impact="Routing hints for this model change for all users on their next config refresh. The change is versioned and can be rolled back."
        onConfirm={async (reason) => {
          if (!check?.ok) throw new Error("The profile is not valid.");
          await run(() => cosCall("saveProfile", { profile: check.value, expectedVersion: d.profiles.version, reason }));
          toast.success("Profile saved");
          setEditing(null);
        }}
      />
      <ConfirmAction
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete model profile"
        level="typed"
        phrase={deleteId ?? ""}
        confirmLabel="Delete"
        danger
        impact="The router falls back to its own defaults for this model. The deletion is recorded in version history and can be rolled back."
        onConfirm={async (reason) => {
          await run(() => cosCall("deleteProfile", { id: deleteId, expectedVersion: d.profiles.version, reason }));
          toast.success("Profile deleted");
          setEditing(null);
        }}
      />
    </div>
  );
}
