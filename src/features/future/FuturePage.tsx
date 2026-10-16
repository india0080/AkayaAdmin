"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import {
  Badge, Button, ConfirmAction, EmptyState, ErrorState, Icon, IconButton, Notice, PageHeader, Panel,
  PermissionDenied, Skeleton, Switch, useToast,
} from "@/ui";
import { useTarget } from "../config/useConfig";
import { FutureDrawer, type SaveOutcome } from "./FutureDrawer";
import { StatusBadge } from "./FuturePreview";
import {
  autoReason, buildItem, deletePatch, editPatch, futureAccess, groupByPlacement, newItemId, nextSortOrder, parseSnapshot,
  reorderPatch, togglePatch, upsertPatch, windowState, type Draft, type FutureItem, type PlacementsPatch,
} from "./logic";
import { PLACEMENTS, PLACEMENT_KIND_LABEL } from "./placementRegistry";

const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString() : null);

export default function FuturePage() {
  const can = useCan();
  const { canView, canEdit } = futureAccess(can);
  const toast = useToast();
  const q = useTarget("placements", !canView);
  const [drawer, setDrawer] = useState<{ item: FutureItem | null; placement: string } | null>(null);
  const [del, setDel] = useState<FutureItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const lock = useRef(false);
  const version = useRef(0);

  const items = useMemo(() => parseSnapshot(q.data?.snapshot), [q.data]);
  version.current = q.data?.version ?? 0;
  const groups = useMemo(() => groupByPlacement(items), [items]);
  const countIn = (p: string) => items.filter((i) => i.placement === p).length;

  if (!canView) return <PermissionDenied permission="config.read" />;

  /// The ONE write path: adminConfig apply with the version the operator is
  /// looking at. One in-flight write at a time (double-submit safe).
  const apply = async (patch: PlacementsPatch, reason: string): Promise<SaveOutcome> => {
    if (lock.current) return { error: "Another change is still being saved." };
    lock.current = true;
    setBusy(true);
    try {
      await callAdmin("adminConfig", {
        action: "apply", target: "placements", patch, expectedVersion: version.current, reason,
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

  const quick = async (patch: PlacementsPatch | null, reason: string, ok: string) => {
    if (!patch) return;
    const out = await apply(patch, reason);
    if (out.error) toast.error("Not saved", out.error);
    else if (out.conflict) toast.error("Not saved", "This list changed since you loaded it. It was reloaded; try again.");
    else toast.success(ok);
  };

  const save = async (d: Draft, reason: string): Promise<SaveOutcome> => {
    const existing = drawer?.item ?? null;
    const id = existing?.id ?? newItemId();
    const group = items.filter((i) => i.placement === d.placement && i.id !== id);
    const sortOrder = existing && existing.placement === d.placement ? existing.sortOrder : nextSortOrder(group);
    const wire = buildItem(id, d, sortOrder);
    const out = await apply(existing ? editPatch(existing, wire) : upsertPatch(wire), reason);
    if (!out.error && !out.conflict) {
      toast.success(existing ? "Item updated" : "Item created");
      setDrawer(null);
    }
    return out;
  };

  const meta = q.data ? (
    <>
      <Badge tone="neutral">Version {q.data.version}</Badge>
      {q.data.updatedByEmail ? <span className="text-xs text-fg-muted">Last changed {fmt(q.data.updatedAt) ?? ""} by {q.data.updatedByEmail}</span> : null}
    </>
  ) : null;

  const now = Date.now();
  return (
    <>
      <PageHeader
        title="Future"
        description="Coming Soon rows, the Voice Mode orb, chat menu items and the upgrade button, and extra sidebar rows. Each opens a popup you write here. Changes reach the app within about 5 minutes and every one is versioned and audited."
        meta={meta}
        actions={
          <>
            <Link href="/dashboard/capabilities" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
              <Icon name="layers" size={16} /> Capabilities
            </Link>
            <Link href="/dashboard/config-history" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
              <Icon name="history" size={16} /> History
            </Link>
            {canEdit ? (
              <Button variant="primary" icon="plus" disabled={busy || !q.data} onClick={() => setDrawer({ item: null, placement: "sidebar_dynamic" })}>
                New item
              </Button>
            ) : null}
          </>
        }
      />
      {!canEdit ? <div className="mb-4"><Notice tone="info">You can view this page. Changing it needs the config.modify permission.</Notice></div> : null}
      {conflict ? (
        <div className="mb-4">
          <Notice tone="warning" title="Changed since you loaded it" action={<Button size="sm" onClick={() => { setConflict(false); q.reload(); }}>Dismiss</Button>}>
            Someone else changed these items. The latest data has been reloaded. Check the list, then repeat your change.
          </Notice>
        </div>
      ) : null}

      {q.error && !q.data ? (
        <ErrorState message={q.error.message} onRetry={q.reload} />
      ) : q.loading && !q.data ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No items configured" icon="sparkles"
          action={canEdit ? <Button variant="primary" icon="plus" onClick={() => setDrawer({ item: null, placement: "sidebar_dynamic" })}>Create the first item</Button> : undefined}>
          Without items the app shows its built-in Coming Soon rows and popups, exactly as today. Create an item to override one or add a new sidebar row.
        </EmptyState>
      ) : (
        <div className="space-y-5" aria-busy={q.refreshing || busy}>
          {q.error ? <Notice tone="warning">Could not refresh: {q.error.message} <button className="underline" onClick={q.reload}>Retry</button></Notice> : null}
          {groups.map((g) => (
            <Panel key={g.id} title={g.placement?.label ?? g.id}
              description={g.placement ? `${PLACEMENT_KIND_LABEL[g.placement.kind]} · ${g.placement.hasRoute ? "has an app route" : "no app route (Coming soon / Hidden only)"} · max ${g.placement.maxItems}` : "Unknown placement (not in this console's registry)"}
              actions={canEdit && g.placement && g.items.length < g.placement.maxItems ? (
                <Button size="sm" icon="plus" disabled={busy} onClick={() => setDrawer({ item: null, placement: g.id })}>Add</Button>
              ) : undefined}>
              <ul className="divide-y divide-line">
                {g.items.map((it, idx) => {
                  const ws = windowState(it, now);
                  return (
                    <li key={it.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3" data-testid="future-row">
                      <div className="min-w-0 flex-1 basis-56">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="break-words font-medium text-fg">{it.title}</span>
                          <StatusBadge status={it.status} />
                          {!it.enabled ? <Badge tone="neutral">Disabled</Badge> : null}
                          {ws === "scheduled" ? <Badge tone="info">Scheduled</Badge> : null}
                          {ws === "expired" ? <Badge tone="neutral">Expired</Badge> : null}
                        </div>
                        <p className="mt-0.5 break-words text-xs text-fg-muted">
                          Button: {it.buttonLabel} · Popup: {it.popup.type.replace("_", " ")}
                          {it.startAt || it.endAt ? ` · ${fmt(it.startAt) ?? "now"} to ${fmt(it.endAt) ?? "no end"}` : ""}
                        </p>
                        {it.updatedAt || it.updatedBy ? (
                          <p className="mt-0.5 text-2xs text-fg-subtle">
                            Updated {fmt(it.updatedAt) ?? ""}{it.updatedBy ? ` by ${it.updatedBy}` : ""}{it.version ? ` · v${it.version}` : ""}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1">
                        <Switch checked={it.enabled} label={`${it.enabled ? "Disable" : "Enable"} ${it.title}`} disabled={!canEdit || busy}
                          onChange={(v) => void quick(togglePatch(it, v), autoReason(v ? "enable" : "disable", it.title), v ? "Enabled" : "Disabled")} />
                        <IconButton icon="chevron-up" label={`Move ${it.title} up`} size="sm" disabled={!canEdit || busy || idx === 0}
                          onClick={() => void quick(reorderPatch(g.items, it.id, -1), autoReason("move up", it.title), "Moved up")} />
                        <IconButton icon="chevron-down" label={`Move ${it.title} down`} size="sm" disabled={!canEdit || busy || idx === g.items.length - 1}
                          onClick={() => void quick(reorderPatch(g.items, it.id, 1), autoReason("move down", it.title), "Moved down")} />
                        <IconButton icon="edit" label={`Edit ${it.title}`} size="sm" disabled={!canEdit || busy} onClick={() => setDrawer({ item: it, placement: it.placement })} />
                        <IconButton icon="trash" label={`Delete ${it.title}`} size="sm" disabled={!canEdit || busy} onClick={() => setDel(it)} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          ))}
        </div>
      )}
      {q.data && canEdit ? (
        <Panel title="Not configured" description="These placements keep the app's built-in row and popup. Configure one to override it.">
          <ul className="flex flex-wrap gap-2">
            {PLACEMENTS.filter((p) => p.maxItems === 1 && !items.some((i) => i.placement === p.id)).map((p) => (
              <li key={p.id}><Button size="sm" icon="plus" disabled={busy} onClick={() => setDrawer({ item: null, placement: p.id })}>{p.label}</Button></li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <FutureDrawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        item={drawer?.item ?? null}
        defaultPlacement={drawer?.placement ?? "sidebar_dynamic"}
        countInPlacement={countIn}
        existingFor={(p) => items.find((i) => i.placement === p) ?? null}
        onSwitchItem={(it) => setDrawer({ item: it, placement: it.placement })}
        onSave={save}
      />
      <ConfirmAction
        open={del !== null}
        onClose={() => setDel(null)}
        title="Delete this item"
        level="reason"
        danger
        confirmLabel="Delete item"
        impact={<>&ldquo;{del?.title}&rdquo; will be removed. Built-in placements return to the app&apos;s default row and popup. This is recorded in history and can be rolled back from Config History.</>}
        onConfirm={async (reason) => {
          if (!del) return;
          const out = await apply(deletePatch(del.id), reason);
          if (out.conflict) throw new Error("This list changed since you loaded it. It was reloaded; check it and try again.");
          if (out.error) throw new Error(out.error);
          toast.success("Item deleted");
          setDel(null);
        }}
      />
    </>
  );
}
