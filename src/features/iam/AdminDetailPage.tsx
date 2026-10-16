"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { callAdmin } from "@/lib/api";
import { roleLabel } from "@/lib/permissions";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Button, Checkbox, ConfirmAction, DataTable, EmptyState, ErrorState,
  Icon, Notice, PageHeader, Panel, Skeleton, StatusPill, relativeTime, useToast,
  type Column,
} from "@/ui";
import { describeAction, resultLabel, resultTone, type AuditEntry } from "@/features/audit/logic";
import {
  ROLE_DESCRIPTIONS, adminStatus, sortRoles, type AdminRow, type RoleDef,
} from "./logic";

interface ListResponse { admins: AdminRow[]; truncated: boolean }
interface RolesResponse { roles: RoleDef[]; permissions: string[] }
interface AuditResponse { entries: AuditEntry[]; nextCursor: string | null }

const STATUS_TONE: Record<ReturnType<typeof adminStatus>, "ok" | "off" | "degraded" | "down"> = {
  active: "ok", suspended: "off", legacy: "degraded", orphaned: "down",
};
const STATUS_LBL: Record<ReturnType<typeof adminStatus>, string> = {
  active: "Active", suspended: "Suspended", legacy: "Legacy grant", orphaned: "No account",
};

export default function AdminDetailPage() {
  const params = useSearchParams();
  const uid = params.get("uid") ?? "";
  const can = useCan();
  const toast = useToast();
  const list = useCallable<ListResponse>("adminIam", uid ? { action: "list" } : null);
  const rolesDef = useCallable<RolesResponse>("adminIam", uid ? { action: "roles" } : null);
  const audit = useCallable<AuditResponse>("adminAuditLog", uid ? { adminUid: uid, limit: 20 } : null);

  const admin = useMemo(() => list.data?.admins.find((a) => a.uid === uid) ?? null, [list.data, uid]);
  const roleDefs = useMemo(
    () => sortRoles((rolesDef.data?.roles ?? []).map((r) => r.id)).map((id) => rolesDef.data!.roles.find((r) => r.id === id)!).filter(Boolean),
    [rolesDef.data],
  );
  const [draft, setDraft] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState<null | "roles" | "suspend">(null);

  // Reset draft when admin data loads or changes.
  const roles = draft ?? (admin ? (admin.legacy ? ["super_admin"] : admin.roles) : []);

  if (!uid) {
    return <EmptyState title="No admin selected" action={<Link href="/dashboard/admins" className="text-accent-text underline">Back to Admins</Link>} />;
  }
  if (list.error && !list.data) {
    return (<><BackLink /><ErrorState message={list.error.message} onRetry={list.reload} /></>);
  }
  if (list.data && !admin) {
    return (<><BackLink /><ErrorState title="Admin not found" message={`No admin with uid "${uid}".`} /></>);
  }

  const s = admin ? adminStatus(admin) : null;
  const canManage = can("admins.manage");
  const changed = !!admin && (draft !== null) && (admin.legacy || JSON.stringify(sortRoles(admin.roles)) !== JSON.stringify(sortRoles(roles)));
  const auditCols: Column<AuditEntry>[] = [
    { id: "when", header: "When", cell: (e) => <span title={e.at ? new Date(e.at).toLocaleString() : ""}>{relativeTime(e.at)}</span> },
    { id: "action", header: "Action", cell: (e) => describeAction(e.action) },
    { id: "result", header: "Result", cell: (e) => <StatusPill status={resultTone(e.result)} label={resultLabel(e.result)} /> },
    { id: "reason", header: "Reason", hideOnNarrow: true, cell: (e) => <span className="text-fg-muted">{e.reason || "—"}</span> },
  ];
  return (
    <>
      <BackLink />
      <PageHeader
        title={admin?.email || admin?.uid || "Loading…"}
        description={admin ? <code className="font-mono text-xs">{admin.uid}</code> : undefined}
        meta={admin && s ? <StatusPill status={STATUS_TONE[s]} label={STATUS_LBL[s]} /> : null}
        actions={<Button icon="refresh" onClick={() => { list.reload(); audit.reload(); }} loading={list.refreshing}>Refresh</Button>}
      />

      {!admin ? (
        <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-40 w-full" /></div>
      ) : (
        <div className="space-y-4">
          {admin.legacy && (
            <Notice tone="warning" title="Legacy grant: full access">
              This admin predates roles. Assign the roles they actually need and save.
            </Notice>
          )}

          <Panel title="Roles & Permissions" description={canManage ? "Check the roles this admin should have." : "View-only for your role."}>
            <ul className="space-y-1.5">
              {roleDefs.map((r) => {
                const on = roles.includes(r.id);
                return (
                  <li key={r.id}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-2.5 hover:bg-raised has-[:disabled]:cursor-default has-[:disabled]:opacity-70">
                      <span className="pt-0.5">
                        <Checkbox label={r.label} checked={on} disabled={!canManage} onChange={(v) =>
                          setDraft((d) => { const cur = d ?? (admin.legacy ? ["super_admin"] : admin.roles); return v ? sortRoles([...cur, r.id]) : cur.filter((x) => x !== r.id); })
                        } />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {r.label}
                          <span className="text-2xs font-normal text-fg-subtle">{r.permissions.includes("*") ? "all permissions" : `${r.permissions.length} permissions`}</span>
                        </span>
                        <span className="block text-xs text-fg-muted">{ROLE_DESCRIPTIONS[r.id]}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {canManage && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="primary" disabled={!changed || roles.length === 0} onClick={() => setConfirm("roles")}>
                  Update Roles
                </Button>
                <Button variant="danger-ghost" onClick={() => setConfirm("suspend")} disabled={admin.disabled}>
                  Suspend
                </Button>
              </div>
            )}
            {roles.length === 0 && canManage && <p className="mt-2 text-xs text-danger">Choose at least one role.</p>}
          </Panel>
          <Panel title="Recent Activity" description="Last 20 audit log entries for this admin.">
            <DataTable
              label="Admin audit log"
              columns={auditCols}
              rows={audit.data?.entries ?? []}
              rowKey={(e) => e.id}
              loading={audit.loading}
              error={audit.error?.message ?? null}
              onRetry={audit.reload}
              empty={{ title: "No activity recorded yet" }}
            />
          </Panel>
        </div>
      )}
      {admin && (
        <>
          <ConfirmAction
            open={confirm === "roles"}
            onClose={() => setConfirm(null)}
            title="Change roles"
            level="reason"
            confirmLabel="Save roles"
            impact={
              <>
                <strong>{admin.email}</strong>:{" "}
                {admin.legacy ? "Legacy grant (full access)" : admin.roles.map(roleLabel).join(", ") || "no roles"}{" "}
                &rarr; <strong>{roles.map(roleLabel).join(", ")}</strong>. Takes effect on their next action.
              </>
            }
            onConfirm={async (reason) => {
              await callAdmin("adminIam", { action: "grant", uid: admin.uid, roles, reason });
              toast.success("Roles updated");
              setDraft(null);
              list.reload();
            }}
          />
          <ConfirmAction
            open={confirm === "suspend"}
            onClose={() => setConfirm(null)}
            title="Suspend admin"
            level="reason"
            danger
            confirmLabel="Suspend"
            impact={<><strong>{admin.email}</strong> loses all console access immediately. Their record and history are kept.</>}
            onConfirm={async (reason) => {
              await callAdmin("adminIam", { action: "setDisabled", uid: admin.uid, disabled: true, reason });
              toast.success("Admin suspended");
              list.reload();
            }}
          />
        </>
      )}
    </>
  );
}
function BackLink() {
  return (
    <Link href="/dashboard/admins" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
      <Icon name="chevron-left" size={16} /> Admins & Roles
    </Link>
  );
}
