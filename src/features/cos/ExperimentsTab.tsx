"use client";

import { useMemo, useRef, useState } from "react";
import { Badge, Button, ConfirmAction, DataTable, Dialog, Field, Notice, Select, Textarea, TextInput, useToast, type Column } from "@/ui";
import { useCosCtx } from "./CosContext";
import {
  CHANNELS, EXPERIMENT_FORBIDDEN_SECTIONS, EXPERIMENT_ID_RE, LIMITS, evenWeights, humanize, isConflict, startBlockers, statusTone, validateExperiment,
  weightsSum, type Experiment, type Variant,
} from "./logic";
import { cosCall, useCosHistory } from "./useCos";

type Kind = "control" | "version" | "patch";
interface VariantDraft { id: string; weight: number; kind: Kind; versionId: string; patchText: string }
interface Draft { id: string; name: string; channels: Experiment["channels"]; variants: VariantDraft[]; isNew: boolean }

const blankDraft = (): Draft => ({
  id: "", name: "", channels: [], isNew: true,
  variants: [
    { id: "control", weight: 50, kind: "control", versionId: "", patchText: "{}" },
    { id: "variant-b", weight: 50, kind: "patch", versionId: "", patchText: '{\n  "traits": { "warmth": 0.9 }\n}' },
  ],
});

function fromExperiment(id: string, e: Experiment): Draft {
  return {
    id, name: e.name, channels: e.channels, isNew: false,
    variants: e.variants.map((v) => ({
      id: v.id, weight: v.weight,
      kind: v.versionId !== undefined ? "version" : Object.keys(v.configPatch ?? {}).length === 0 ? "control" : "patch",
      versionId: v.versionId ?? "", patchText: JSON.stringify(v.configPatch ?? {}, null, 2),
    })),
  };
}

/// Draft -> Experiment (or an error message). Pure so it is unit-testable in logic tests via validateExperiment.
function toExperiment(d: Draft): { ok: true; value: Experiment } | { ok: false; message: string } {
  const variants: Variant[] = [];
  for (const [i, v] of d.variants.entries()) {
    if (v.kind === "version") variants.push({ id: v.id, weight: v.weight, versionId: v.versionId });
    else if (v.kind === "control") variants.push({ id: v.id, weight: v.weight, configPatch: {} });
    else {
      try {
        const parsed: unknown = JSON.parse(v.patchText || "{}");
        variants.push({ id: v.id, weight: v.weight, configPatch: parsed as Variant["configPatch"] });
      } catch {
        return { ok: false, message: `Variant ${i + 1}: the patch is not valid JSON.` };
      }
    }
  }
  return validateExperiment({ name: d.name, status: "draft", variants, channels: d.channels, startAt: null, endAt: null });
}

export function ExperimentsTab() {
  const c = useCosCtx();
  const toast = useToast();
  const d = c.q.data;
  const hist = useCosHistory("conversationOs", !d);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [act, setAct] = useState<{ id: string; kind: "start" | "stop" | "delete" } | null>(null);
  const [conflict, setConflict] = useState(false);
  const lock = useRef(false);
  const versions = useMemo(
    () => new Set((hist.data?.rows ?? []).filter((r) => r.kind === "publish" || r.kind === "rollback").map((r) => r.version)),
    [hist.data],
  );
  if (!d) return null;
  const all = d.experiments.items;
  const rows = Object.entries(all).map(([id, e]) => ({ id, ...e }));
  const canEdit = c.access.canEdit;
  const canRun = c.access.canPublish;

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

  const check = editing ? toExperiment(editing) : null;
  const idErr = editing?.isNew && editing.id && !EXPERIMENT_ID_RE.test(editing.id) ? "2 to 40 characters: lowercase letters, digits, - or _." : null;
  const sum = editing ? weightsSum(editing.variants) : 0;
  const setV = (i: number, patch: Partial<VariantDraft>) =>
    setEditing((e) => (e ? { ...e, variants: e.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) } : e));

  const columns: Column<(typeof rows)[number]>[] = [
    { id: "name", header: "Experiment", cell: (r) => (<div><p className="font-medium">{r.name}</p><p className="font-mono text-xs text-fg-subtle">{r.id}</p></div>) },
    { id: "status", header: "Status", cell: (r) => <Badge tone={statusTone(r.status)}>{humanize(r.status)}</Badge> },
    { id: "variants", header: "Variants", cell: (r) => r.variants.map((v) => `${v.id} ${v.weight}%`).join(", "), hideOnNarrow: true },
    { id: "channels", header: "Channels", cell: (r) => (r.channels.length ? r.channels.map(humanize).join(", ") : "All"), hideOnNarrow: true },
    {
      id: "actions", header: "", align: "right",
      cell: (r) => (
        <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
          {r.status === "draft" && canRun ? <Button size="sm" onClick={() => setAct({ id: r.id, kind: "start" })}>Start</Button> : null}
          {r.status === "running" && canRun ? <Button size="sm" variant="danger" onClick={() => setAct({ id: r.id, kind: "stop" })}>Stop</Button> : null}
          {r.status !== "running" && canEdit ? <Button size="sm" variant="danger-ghost" onClick={() => setAct({ id: r.id, kind: "delete" })}>Delete</Button> : null}
        </span>
      ),
    },
  ];

  const actExp = act ? all[act.id] : undefined;
  const blockers = act?.kind === "start" && actExp ? startBlockers(act.id, actExp, all, versions, Date.now()) : [];

  return (
    <div className="space-y-4">
      <Notice tone="info">
        Experiments only choose among already-validated configurations: a published version or a validated patch (never the master switch, rollout or flags).
        Users are bucketed deterministically and stay in their variant. Weights must add up to 100; at most {LIMITS.maxRunningExperiments} run at once and running
        experiments cannot share a channel.
      </Notice>
      {conflict ? (
        <Notice tone="warning" title="The experiments changed since you loaded them">
          Your change was NOT applied. The latest data was reloaded; review it and try again.
        </Notice>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">{rows.length} experiment{rows.length === 1 ? "" : "s"} (version {d.experiments.version})</p>
        {canEdit ? <Button variant="primary" icon="plus" onClick={() => setEditing(blankDraft())}>New experiment</Button> : null}
      </div>
      <DataTable
        label="Experiments"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => (r.status === "draft" && canEdit ? setEditing(fromExperiment(r.id, r)) : undefined)}
        empty={{ title: "No experiments", body: "Create one to compare two personality or quality configurations on a share of users." }}
      />

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing?.isNew ? "New experiment" : "Edit draft experiment"}
        footer={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" disabled={!check?.ok || !editing?.id || !!idErr || sum !== 100} onClick={() => setSaveOpen(true)}>
              Save draft...
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            {check && !check.ok ? <Notice tone="danger">{check.message}</Notice> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Experiment id" required error={idErr} hint="Permanent. Lowercase, e.g. warm-chat-tone.">
                {(p) => <TextInput {...p} value={editing.id} disabled={!editing.isNew} onChange={(e) => setEditing({ ...editing, id: e.target.value })} />}
              </Field>
              <Field label="Name" required>
                {(p) => <TextInput {...p} value={editing.name} maxLength={LIMITS.experimentNameMax + 20} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-fg-muted">Channels (none checked = all)</legend>
              <div className="flex flex-wrap gap-3">
                {CHANNELS.map((ch) => (
                  <label key={ch} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editing.channels.includes(ch)}
                      onChange={(e) => {
                        const cur = new Set(editing.channels);
                        if (e.target.checked) cur.add(ch);
                        else cur.delete(ch);
                        setEditing({ ...editing, channels: CHANNELS.filter((x) => cur.has(x)) });
                      }}
                      className="h-4 w-4 accent-[rgb(var(--accent-solid))]"
                    />
                    {humanize(ch)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Variants</h3>
                <div className="flex items-center gap-2">
                  <Badge tone={sum === 100 ? "success" : "danger"}>Weights {sum}/100</Badge>
                  <Button size="sm" onClick={() => setEditing({ ...editing, variants: editing.variants.map((v, i) => ({ ...v, weight: evenWeights(editing.variants.length)[i] })) })}>
                    Even split
                  </Button>
                  <Button size="sm" disabled={editing.variants.length >= LIMITS.experimentVariantsMax} onClick={() => setEditing({ ...editing, variants: [...editing.variants, { id: `variant-${editing.variants.length + 1}`, weight: 0, kind: "patch", versionId: "", patchText: "{}" }] })}>
                    Add variant
                  </Button>
                </div>
              </div>
              <ul className="space-y-3">
                {editing.variants.map((v, i) => (
                  <li key={i} className="rounded-md border border-line p-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_100px_1fr_auto]">
                      <Field label="Variant id">{(p) => <TextInput {...p} value={v.id} onChange={(e) => setV(i, { id: e.target.value })} />}</Field>
                      <Field label="Weight %">
                        {(p) => <TextInput {...p} type="number" min={0} max={100} step={1} value={v.weight} onChange={(e) => setV(i, { weight: e.target.value === "" ? 0 : Number(e.target.value) })} />}
                      </Field>
                      <Field label="Config">
                        {(p) => (
                          <Select {...p} value={v.kind} onChange={(e) => setV(i, { kind: e.target.value as Kind })}>
                            <option value="control">Control (no change)</option>
                            <option value="version">A published version</option>
                            <option value="patch">A config patch</option>
                          </Select>
                        )}
                      </Field>
                      <Button size="sm" variant="danger-ghost" className="mt-6" disabled={editing.variants.length <= LIMITS.experimentVariantsMin} onClick={() => setEditing({ ...editing, variants: editing.variants.filter((_, j) => j !== i) })}>
                        Remove
                      </Button>
                    </div>
                    {v.kind === "version" ? (
                      <Field label="Published version" className="mt-3 max-w-xs" hint={versions.size === 0 ? "No published versions yet." : undefined}>
                        {(p) => (
                          <Select {...p} value={v.versionId} onChange={(e) => setV(i, { versionId: e.target.value })}>
                            <option value="">Choose...</option>
                            {[...versions].sort((a, b) => b - a).map((n) => (
                              <option key={n} value={String(n)}>
                                Version {n}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                    ) : null}
                    {v.kind === "patch" ? (
                      <Field label="Patch (JSON)" className="mt-3" hint={`Sections that may be patched: everything except ${EXPERIMENT_FORBIDDEN_SECTIONS.join(", ")}. Plain text only.`}>
                        {(p) => <Textarea {...p} rows={5} spellCheck={false} className="font-mono text-xs" value={v.patchText} onChange={(e) => setV(i, { patchText: e.target.value })} />}
                      </Field>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Dialog>

      <ConfirmAction
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title={editing?.isNew ? "Create experiment" : "Save experiment draft"}
        level="reason"
        confirmLabel="Save draft experiment"
        impact="Saves the experiment as a DRAFT. Nothing changes for users until it is started."
        onConfirm={async (reason) => {
          if (!editing || !check?.ok) throw new Error("The experiment is not valid.");
          await run(() => cosCall("saveExperiment", { id: editing.id, experiment: check.value, expectedVersion: d.experiments.version, reason }));
          toast.success("Experiment saved");
          setEditing(null);
        }}
      />
      <ConfirmAction
        open={act !== null}
        onClose={() => setAct(null)}
        title={act?.kind === "start" ? "Start experiment" : act?.kind === "stop" ? "Stop experiment" : "Delete experiment"}
        level={act?.kind === "delete" ? "reason" : "typed"}
        phrase={act?.id ?? ""}
        confirmLabel={act?.kind === "start" ? "Start" : act?.kind === "stop" ? "Stop" : "Delete"}
        danger={act?.kind !== "start"}
        impact={
          <div className="space-y-2">
            <p>
              {act?.kind === "start"
                ? "Users in the matching channels are split across the variants right away. A stopped experiment cannot be restarted."
                : act?.kind === "stop"
                  ? "Everyone returns to the published configuration. This is final: a stopped experiment cannot be restarted."
                  : "The experiment is deleted. This is recorded in version history."}
            </p>
            {blockers.length ? (
              <ul className="list-disc pl-4 text-danger">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
          </div>
        }
        onConfirm={async (reason) => {
          if (!act) return;
          const action = act.kind === "start" ? "startExperiment" : act.kind === "stop" ? "stopExperiment" : "deleteExperiment";
          await run(() => cosCall(action, { id: act.id, expectedVersion: d.experiments.version, reason }));
          toast.success(act.kind === "start" ? "Experiment started" : act.kind === "stop" ? "Experiment stopped" : "Experiment deleted");
        }}
      />
    </div>
  );
}
