"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import {
  Badge, Button, ConfirmAction, EmptyState, ErrorState, Icon, Notice, PageHeader, Panel, PermissionDenied, Skeleton,
  TextInput, useToast,
} from "@/ui";
import { useTarget } from "../config/useConfig";
import { StatusBadge } from "../future/FuturePreview";
import { CATALOG } from "./catalog";
import { CapabilityDrawer, type SaveOutcome } from "./CapabilityDrawer";
import {
  LANGS, STATUS_LABEL, autoReason, buildRows, capabilitiesAccess, filterRows, overrideCount, parseSnapshot, resetPatch, savePatch,
  nameFor, type CapabilitiesPatch, type Draft, type Row,
} from "./logic";

const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString() : null);

export default function CapabilitiesPage() {
  const can = useCan();
  const { canView, canEdit } = capabilitiesAccess(can);
  const toast = useToast();
  const q = useTarget("capabilities", !canView);
  const [selected, setSelected] = useState<Row | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [resetRow, setResetRow] = useState<Row | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const lock = useRef(false);
  const version = useRef(0);

  const overrides = useMemo(() => parseSnapshot(q.data?.snapshot), [q.data]);
  version.current = q.data?.version ?? 0;
  const { rows, unknown } = useMemo(() => buildRows(CATALOG, overrides), [overrides]);
  const shown = useMemo(() => filterRows(rows, query), [rows, query]);
  // Always edit the freshest stored override for the open capability.
  const current = selected ? overrides[selected.id] ?? null : null;

  if (!canView) return <PermissionDenied permission="config.read" />;

  /// The ONE write path: adminConfig apply with the version the operator is
  /// looking at. One in-flight write at a time (double-submit safe).
  const apply = async (patch: CapabilitiesPatch, reason: string): Promise<SaveOutcome> => {
    if (lock.current) return { error: "Another change is still being saved." };
    lock.current = true;
    setBusy(true);
    try {
      await callAdmin("adminConfig", {
        action: "apply", target: "capabilities", patch, expectedVersion: version.current, reason,
      });
      setConflict(false);
      q.reload();
      return {};
    } catch (e) {
      const err = e as { kind?: string; message?: string };
      if (err.kind === "conflict") {
        setConflict(true);
        q.reload();
        return { conflict: true };
      }
      return { error: err.message ?? "The change could not be saved." };
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const open = (r: Row) => { setSelected(r); setDrawerOpen(true); };

  const onSave = async (id: string, label: string, d: Draft, reason: string): Promise<SaveOutcome> => {
    const out = await apply(savePatch(id, d), reason);
    if (!out.error && !out.conflict) {
      toast.success(`${label} updated`);
      setDrawerOpen(false);
    }
    return out;
  };

  const onReset = async (id: string, label: string, reason: string): Promise<SaveOutcome> => {
    const out = await apply(resetPatch(id), reason);
    if (!out.error && !out.conflict) {
      toast.success(`${label} reset to default`);
      setDrawerOpen(false);
    }
    return out;
  };

  const meta = q.data ? (
    <>
      <Badge tone="neutral">Version {q.data.version}</Badge>
      <Badge tone="neutral">{overrideCount(overrides)} override{overrideCount(overrides) === 1 ? "" : "s"}</Badge>
      {q.data.updatedByEmail ? <span className="text-xs text-fg-muted">Last changed {fmt(q.data.updatedAt) ?? ""} by {q.data.updatedByEmail}</span> : null}
    </>
  ) : null;

  return (
    <>
      <PageHeader
        title="Capabilities"
        description="What Akaya says it can do. Override a capability's status or wording per language without an app release. Changes reach the app within about 5 minutes and every one is versioned and audited."
        meta={meta}
        actions={
          <>
            <Link href="/dashboard/future" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
              <Icon name="sparkles" size={16} /> Future
            </Link>
            <Link href="/dashboard/config-history" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
              <Icon name="history" size={16} /> History
            </Link>
          </>
        }
      />
      {!canEdit ? <div className="mb-4"><Notice tone="info">You can view this page. Changing it needs the config.modify permission.</Notice></div> : null}
      {conflict ? (
        <div className="mb-4">
          <Notice tone="warning" title="Changed since you loaded it" action={<Button size="sm" onClick={() => { setConflict(false); q.reload(); }}>Dismiss</Button>}>
            Someone else changed these overrides. The latest data has been reloaded. Check the list, then repeat your change.
          </Notice>
        </div>
      ) : null}

      {q.error && !q.data ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : q.loading && !q.data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="No capabilities in the catalog" icon="sparkles">The capability catalog is empty, so there is nothing to override.</EmptyState>
      ) : (
        <div className="space-y-5" aria-busy={q.refreshing || busy}>
          {q.error ? <Notice tone="warning">Could not refresh: {q.error.message} <button className="underline" onClick={q.reload}>Retry</button></Notice> : null}
          <Panel title="Capabilities" description={`${rows.length} in the catalog. A customised row has an override; everything else uses the app's built-in status and wording.`}
            actions={
              <div className="w-56 max-w-full">
                <TextInput aria-label="Search capabilities" type="search" placeholder="Search id or name" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
            }>
            {shown.length === 0 ? (
              <p className="py-6 text-center text-sm text-fg-muted">No capability matches &ldquo;{query}&rdquo;.</p>
            ) : (
              <div className="relative -mx-1 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm" data-testid="capabilities-table">
                  <caption className="sr-only">Capabilities and their overrides</caption>
                  <thead>
                    <tr className="border-b border-line text-xs text-fg-muted">
                      <th scope="col" className="px-2 py-2 font-medium">Capability</th>
                      <th scope="col" className="px-2 py-2 font-medium">Default</th>
                      <th scope="col" className="px-2 py-2 font-medium">Now</th>
                      <th scope="col" className="px-2 py-2 font-medium">Override</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {shown.map((r) => (
                      <tr key={r.id} data-testid="capability-row">
                        <th scope="row" className="px-2 py-2.5 font-normal">
                          <span className="block break-words font-medium text-fg">{r.entry ? nameFor(r.entry, r.override, "en") : r.id}</span>
                          <code className="text-2xs text-fg-subtle">{r.id}</code>
                        </th>
                        <td className="px-2 py-2.5">{r.entry ? <StatusBadge status={r.entry.baseStatus} /> : null}</td>
                        <td className="px-2 py-2.5">{r.status ? <StatusBadge status={r.status} /> : null}</td>
                        <td className="px-2 py-2.5 text-xs text-fg-muted">
                          {r.override ? (
                            <span className="inline-flex flex-wrap items-center gap-1">
                              <Badge tone="info">Customised</Badge>
                              {r.override.status ? <span>status</span> : null}
                              {LANGS.filter((l) => r.override?.label?.[l] || r.override?.description?.[l]).length ? <span>text ({LANGS.filter((l) => r.override?.label?.[l] || r.override?.description?.[l]).join(", ")})</span> : null}
                            </span>
                          ) : "Default"}
                        </td>
                        <td className="px-2 py-2.5 text-right">
                          <Button size="sm" disabled={busy} onClick={() => open(r)} aria-label={`${canEdit ? "Edit" : "View"} ${r.entry?.labels.en ?? r.id}`}>
                            {canEdit ? "Edit" : "View"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {unknown.length > 0 ? (
            <Panel title="Overrides for unknown capabilities" description="These ids are not in this console's catalog. The app ignores ids it does not know. Reset them to clean up.">
              <ul className="divide-y divide-line">
                {unknown.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5" data-testid="unknown-override">
                    <code className="text-sm">{r.id}</code>
                    {r.status ? <Badge tone="neutral">{STATUS_LABEL[r.status]}</Badge> : null}
                    {canEdit ? <Button size="sm" variant="danger-ghost" className="ml-auto" disabled={busy} onClick={() => setResetRow(r)}>Reset</Button> : null}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      )}

      <CapabilityDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        entry={selected?.entry ?? null}
        current={current}
        canEdit={canEdit}
        onSave={(d, reason) => onSave(selected!.id, selected!.entry?.labels.en ?? selected!.id, d, reason)}
        onReset={(reason) => onReset(selected!.id, selected!.entry?.labels.en ?? selected!.id, reason)}
      />
      <ConfirmAction
        open={resetRow !== null}
        onClose={() => setResetRow(null)}
        title={`Remove the override for ${resetRow?.id ?? ""}`}
        level="reason"
        danger
        confirmLabel="Remove override"
        impact={<>The override for <code>{resetRow?.id}</code> is removed. Recorded in history.</>}
        onConfirm={async (reason) => {
          if (!resetRow) return;
          const out = await apply(resetPatch(resetRow.id), reason || autoReason("reset", resetRow.id));
          if (out.conflict) throw new Error("This list changed since you loaded it. It was reloaded; check it and try again.");
          if (out.error) throw new Error(out.error);
          toast.success("Override removed");
          setResetRow(null);
        }}
      />
    </>
  );
}
