"use client";

import { useRef, useState } from "react";
import { Badge, Button, ConfirmAction, EmptyState, ErrorState, Field, Notice, Panel, Select, Skeleton, useToast } from "@/ui";
import { useCosCtx } from "./CosContext";
import { ChangeList } from "./widgets";
import {
  ROLLBACK_PHRASE, isConflict, kindLabel, leafChanges, rollbackImpact, type RollbackSide, type VersionRow,
} from "./logic";
import { cosCall, useCosHistory } from "./useCos";

const TARGETS = [
  { id: "conversationOs", label: "Configuration" },
  { id: "cosModelProfiles", label: "Model profiles" },
  { id: "cosExperiments", label: "Experiments" },
] as const;
type TargetId = (typeof TARGETS)[number]["id"];

const fmt = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : "");

export function VersionsTab() {
  const c = useCosCtx();
  const toast = useToast();
  const d = c.q.data;
  const [target, setTarget] = useState<TargetId>("conversationOs");
  const h = useCosHistory(target, !d);
  const [open, setOpen] = useState<string | null>(null);
  const [rb, setRb] = useState<{ row: VersionRow; side: RollbackSide } | null>(null);
  const [conflict, setConflict] = useState(false);
  const lock = useRef(false);
  if (!d) return null;
  const current = target === "conversationOs" ? d.published.metaVersion : target === "cosModelProfiles" ? d.profiles.version : d.experiments.version;
  const rows = h.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <Notice tone="info">
        History is append-only. A rollback never rewrites it: it publishes the older state as a NEW version, in one action, with a reason in the audit log.
        {c.access.canPublish ? "" : " Rolling back needs cos.publish."}
      </Notice>
      {conflict ? (
        <Notice tone="warning" title="This changed while you were looking">
          The rollback was NOT applied. The history was reloaded; review it and try again.
        </Notice>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="History of" className="w-56">
          {(p) => (
            <Select {...p} value={target} onChange={(e) => { setTarget(e.target.value as TargetId); setOpen(null); }}>
              {TARGETS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="text-sm text-fg-muted">Current version: v{current}</p>
      </div>

      {h.loading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : h.error ? (
        <ErrorState message={h.error.message} onRetry={h.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="No versions yet" icon="scroll">Versions appear here after the first publish or change.</EmptyState>
      ) : (
        <ol className="space-y-2" aria-label="Version history">
          {rows.map((r) => {
            const isOpen = open === r.id;
            const diff = r.changes.length ? r.changes : leafChanges(r.before, r.after);
            const latest = r.version === current;
            return (
              <li key={r.id}>
                <Panel
                  title={
                    <span className="inline-flex flex-wrap items-center gap-2">
                      v{r.version} <Badge tone={r.kind === "rollback" ? "warning" : "info"}>{kindLabel(r.kind)}</Badge>
                      {r.rolledBackFrom ? <Badge tone="neutral">of v{r.rolledBackFrom}</Badge> : null}
                      {latest ? <Badge tone="success">current</Badge> : null}
                    </span>
                  }
                  description={`${fmt(r.at)} ${r.actorEmail ? `by ${r.actorEmail}` : ""}`}
                  actions={
                    <>
                      <Button size="sm" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.id)}>
                        {isOpen ? "Hide changes" : `Changes (${diff.length})`}
                      </Button>
                      {c.access.canPublish ? (
                        <>
                          {!latest ? (
                            <Button size="sm" variant="danger-ghost" onClick={() => setRb({ row: r, side: "after" })}>
                              Restore this version
                            </Button>
                          ) : null}
                          <Button size="sm" variant="danger-ghost" onClick={() => setRb({ row: r, side: "before" })}>
                            Undo this change
                          </Button>
                        </>
                      ) : null}
                    </>
                  }
                >
                  <p className="text-sm text-fg">
                    <span className="text-fg-muted">Reason: </span>
                    {r.reason || "(none)"}
                  </p>
                  {isOpen ? (
                    <div className="mt-3">
                      <ChangeList changes={diff} />
                    </div>
                  ) : null}
                </Panel>
              </li>
            );
          })}
        </ol>
      )}

      <ConfirmAction
        open={rb !== null}
        onClose={() => setRb(null)}
        title={rb?.side === "after" ? `Restore version ${rb.row.version}` : `Undo version ${rb?.row.version ?? ""}`}
        level="typed"
        phrase={ROLLBACK_PHRASE}
        confirmLabel="Roll back"
        danger
        impact={
          <div className="space-y-2">
            <p>{rb ? rollbackImpact(rb.row, rb.side, current) : ""}</p>
            {rb ? <ChangeList changes={leafChanges(rb.side === "after" ? rb.row.before : rb.row.after, rb.side === "after" ? rb.row.after : rb.row.before)} empty="No visible differences." /> : null}
          </div>
        }
        onConfirm={async (reason) => {
          if (!rb || lock.current) throw new Error("Another change is still being saved.");
          lock.current = true;
          try {
            const r = await cosCall<{ version: number }>("rollback", { target, version: rb.row.version, side: rb.side, expectedVersion: current, reason });
            toast.success(`Rolled back: now version ${r.version}`);
            setConflict(false);
            c.reload();
            h.reload();
          } catch (e) {
            if (isConflict(e)) {
              setConflict(true);
              c.reload();
              h.reload();
            }
            throw e;
          } finally {
            lock.current = false;
          }
        }}
      />
    </div>
  );
}
