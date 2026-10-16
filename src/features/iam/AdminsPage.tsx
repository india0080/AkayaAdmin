"use client";

import { useMemo, useRef, useState } from "react";
import { callAdmin } from "@/lib/api";
import { roleLabel } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmAction,
  DataTable,
  Dialog,
  Drawer,
  Field,
  Icon,
  Notice,
  PageHeader,
  Panel,
  Select,
  Stat,
  StatStrip,
  StatusPill,
  Tabs,
  TextInput,
  Textarea,
  relativeTime,
  useToast,
  type Column,
} from "@/ui";
import {
  ROLE_DESCRIPTIONS,
  ROLE_ORDER,
  adminStatus,
  adminSummary,
  filterAdmins,
  groupPermissions,
  roleHas,
  sameRoles,
  sortRoles,
  type AdminFilter,
  type AdminRow,
  type RoleDef,
} from "./logic";

interface ListResponse {
  admins: AdminRow[];
  truncated: boolean;
}
interface RolesResponse {
  roles: RoleDef[];
  permissions: string[];
}

const STATUS_PILL: Record<ReturnType<typeof adminStatus>, JSX.Element> = {
  active: <StatusPill status="ok" label="Active" />,
  suspended: <StatusPill status="off" label="Suspended" />,
  legacy: <StatusPill status="degraded" label="Legacy grant" />,
  orphaned: <StatusPill status="down" label="No account" />,
};

export default function AdminsPage() {
  const { session } = useSession();
  const list = useCallable<ListResponse>("adminIam", { action: "list" });
  const roles = useCallable<RolesResponse>("adminIam", { action: "roles" });
  const [tab, setTab] = useState("admins");
  const [filter, setFilter] = useState<AdminFilter>({ query: "", role: "", status: "" });
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const rows = useMemo(() => list.data?.admins ?? [], [list.data]);
  const shown = useMemo(() => filterAdmins(rows, filter), [rows, filter]);
  const summary = useMemo(() => adminSummary(rows), [rows]);
  const selected = rows.find((a) => a.uid === selectedUid) ?? null;
  const roleDefs = useMemo(
    () => sortRoles((roles.data?.roles ?? []).map((r) => r.id)).map((id) => roles.data!.roles.find((r) => r.id === id)!),
    [roles.data],
  );

  const columns: Column<AdminRow>[] = [
    {
      id: "email",
      header: "Admin",
      cell: (a) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-medium">
            {a.email || <span className="text-fg-subtle">No email</span>}
            {a.uid === session?.uid ? <Badge tone="accent">You</Badge> : null}
          </p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{a.uid}</p>
        </div>
      ),
    },
    {
      id: "roles",
      header: "Roles",
      cell: (a) => (
        <div className="flex flex-wrap gap-1">
          {a.roles.length === 0 ? <span className="text-fg-subtle">None</span> : null}
          {sortRoles(a.roles).map((r) => (
            <Badge key={r} tone={r === "super_admin" ? "warning" : "neutral"}>
              {roleLabel(r)}
            </Badge>
          ))}
        </div>
      ),
    },
    { id: "status", header: "Status", cell: (a) => STATUS_PILL[adminStatus(a)] },
    {
      id: "mfa",
      header: "MFA",
      hideOnNarrow: true,
      cell: (a) =>
        a.mfaEnrolled ? (
          <span className="inline-flex items-center gap-1 text-success">
            <Icon name="check" size={14} /> Enrolled
          </span>
        ) : (
          <span className="text-fg-subtle">Not enrolled</span>
        ),
    },
    {
      id: "last",
      header: "Last sign-in",
      hideOnNarrow: true,
      cell: (a) => <span title={a.lastSignInAt ? new Date(a.lastSignInAt).toLocaleString() : ""}>{relativeTime(a.lastSignInAt)}</span>,
    },
    { id: "added", header: "Added", hideOnNarrow: true, cell: (a) => relativeTime(a.addedAt) },
  ];

  return (
    <>
      <PageHeader
        title="Admins & Roles"
        description="Who can operate the Akaya console and what each person may do. Every change here needs a reason and is written to the audit log."
        actions={
          <>
            <Button icon="refresh" onClick={list.reload} loading={list.refreshing}>
              Refresh
            </Button>
            <Button variant="primary" icon="plus" onClick={() => setAddOpen(true)}>
              Add admin
            </Button>
          </>
        }
      />

      {list.data ? (
        <StatStrip className="mb-4">
          <Stat label="Admins" value={summary.total} />
          <Stat label="Active" value={summary.active} />
          <Stat label="Super admins" value={summary.supers} hint="Includes legacy grants" />
          <Stat label="Legacy grants" value={summary.legacy} tone={summary.legacy > 0 ? "warning" : "default"} hint="Full access, no explicit role" />
          <Stat label="Without MFA" value={summary.noMfa} tone={summary.noMfa > 0 ? "warning" : "default"} />
        </StatStrip>
      ) : null}

      {summary.legacy > 0 ? (
        <div className="mb-4">
          <Notice tone="warning" title={`${summary.legacy} admin${summary.legacy === 1 ? " has" : "s have"} a legacy grant`}>
            These accounts predate roles and have full access. Open each one and assign only the roles that person needs.
          </Notice>
        </div>
      ) : null}
      {list.data?.truncated ? (
        <div className="mb-4">
          <Notice tone="info">Showing the first 200 admins.</Notice>
        </div>
      ) : null}

      <Tabs
        label="Admins and roles"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "admins", label: "Admins", count: list.data ? rows.length : undefined },
          { id: "roles", label: "Roles & permissions" },
        ]}
      />

      <div id={`tabpanel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-4">
        {tab === "admins" ? (
          <>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <Field label="Search" className="w-full sm:w-72">
                {(p) => (
                  <TextInput
                    {...p}
                    type="search"
                    placeholder="Email or UID"
                    value={filter.query}
                    onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
                  />
                )}
              </Field>
              <Field label="Role" className="w-44">
                {(p) => (
                  <Select {...p} value={filter.role} onChange={(e) => setFilter((f) => ({ ...f, role: e.target.value }))}>
                    <option value="">Any role</option>
                    {ROLE_ORDER.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(r)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Status" className="w-44">
                {(p) => (
                  <Select
                    {...p}
                    value={filter.status}
                    onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as AdminFilter["status"] }))}
                  >
                    <option value="">Any status</option>
                    <option value="active">Active</option>
                    <option value="legacy">Legacy grant</option>
                    <option value="suspended">Suspended</option>
                    <option value="orphaned">No account</option>
                  </Select>
                )}
              </Field>
              {filter.query || filter.role || filter.status ? (
                <Button variant="ghost" onClick={() => setFilter({ query: "", role: "", status: "" })}>
                  Clear filters
                </Button>
              ) : null}
            </div>
            <DataTable
              label="Admins"
              columns={columns}
              rows={shown}
              rowKey={(a) => a.uid}
              loading={list.loading}
              error={list.error?.message ?? null}
              onRetry={list.reload}
              onRowClick={(a) => setSelectedUid(a.uid)}
              total={rows.length}
              rowTone={(a) => (a.legacy ? "warning" : null)}
              empty={
                rows.length > 0
                  ? { title: "No admin matches these filters" }
                  : { title: "No admins yet", body: "Add the first admin to get started." }
              }
            />
          </>
        ) : (
          <RoleMatrix roles={roleDefs} permissions={roles.data?.permissions ?? []} loading={roles.loading} error={roles.error?.message} onRetry={roles.reload} />
        )}
      </div>

      <AdminDrawer
        admin={selected}
        roleDefs={roleDefs}
        isSelf={selected?.uid === session?.uid}
        onClose={() => setSelectedUid(null)}
        onChanged={list.reload}
      />
      <AddAdminDialog open={addOpen} onClose={() => setAddOpen(false)} roleDefs={roleDefs} onAdded={list.reload} />
    </>
  );
}

// ── Detail drawer ───────────────────────────────────────────────────────────

function AdminDrawer({
  admin,
  roleDefs,
  isSelf,
  onClose,
  onChanged,
}: {
  admin: AdminRow | null;
  roleDefs: RoleDef[];
  isSelf: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState<null | "roles" | "suspend" | "reactivate" | "remove">(null);
  const [openFor, setOpenFor] = useState<string | null>(null);

  // Reset the editor when a different admin opens.
  if (admin && openFor !== admin.uid) {
    setOpenFor(admin.uid);
    setDraft(admin.legacy ? ["super_admin"] : admin.roles);
  }
  if (!admin && openFor !== null) setOpenFor(null);

  const roles = draft ?? [];
  const current = admin ? (admin.legacy ? [] : admin.roles) : [];
  const changed = !!admin && (admin.legacy || !sameRoles(current, roles));

  async function run(body: Record<string, unknown>, done: string) {
    await callAdmin("adminIam", body);
    toast.success(done);
    onChanged();
  }

  return (
    <>
      <Drawer
        open={!!admin}
        onClose={onClose}
        title={admin?.email || admin?.uid || ""}
        subtitle={admin ? STATUS_PILL[adminStatus(admin)] : null}
        footer={
          admin && !isSelf ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                {admin.disabled ? (
                  <Button onClick={() => setConfirm("reactivate")} icon="check-circle">
                    Reactivate
                  </Button>
                ) : (
                  <Button variant="danger-ghost" onClick={() => setConfirm("suspend")} icon="minus-circle">
                    Suspend
                  </Button>
                )}
                <Button variant="danger-ghost" onClick={() => setConfirm("remove")} icon="x-circle">
                  Remove
                </Button>
              </div>
              <Button variant="primary" disabled={!changed || roles.length === 0} onClick={() => setConfirm("roles")}>
                Save roles
              </Button>
            </div>
          ) : undefined
        }
      >
        {admin ? (
          <div className="space-y-5">
            {isSelf ? (
              <Notice tone="info" title="This is your account">
                You can&apos;t change your own access. Ask another admin with the Super Admin role.
              </Notice>
            ) : null}
            {admin.legacy ? (
              <Notice tone="warning" title="Legacy grant: full access">
                This record has no roles yet, so it is treated as Super Admin. Choose the roles this person actually needs and save.
              </Notice>
            ) : null}

            <section>
              <h3 className="mb-2 text-sm font-semibold">Roles</h3>
              <ul className="space-y-1.5">
                {roleDefs.map((r) => {
                  const on = roles.includes(r.id);
                  return (
                    <li key={r.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-2.5 hover:bg-raised has-[:disabled]:cursor-default has-[:disabled]:opacity-70">
                        <span className="pt-0.5">
                          <Checkbox
                            label={r.label}
                            checked={on}
                            disabled={isSelf}
                            onChange={(v) =>
                              setDraft((d) => {
                                const cur = d ?? [];
                                return v ? sortRoles([...cur, r.id]) : cur.filter((x) => x !== r.id);
                              })
                            }
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            {r.label}
                            <span className="text-2xs font-normal text-fg-subtle">
                              {r.permissions.includes("*") ? "all permissions" : `${r.permissions.length} permissions`}
                            </span>
                          </span>
                          <span className="block text-xs text-fg-muted">{ROLE_DESCRIPTIONS[r.id]}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {roles.length === 0 && !isSelf ? <p className="mt-2 text-xs text-danger">Choose at least one role.</p> : null}
            </section>

            {admin.extraPermissions.length > 0 ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold">Extra permissions</h3>
                <div className="flex flex-wrap gap-1">
                  {admin.extraPermissions.map((p) => (
                    <code key={p} className="rounded bg-raised px-1.5 py-0.5 font-mono text-2xs">
                      {p}
                    </code>
                  ))}
                </div>
                <p className="mt-1 text-xs text-fg-subtle">Kept when roles are saved.</p>
              </section>
            ) : null}

            <section>
              <h3 className="mb-2 text-sm font-semibold">Account</h3>
              <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
                <dt className="text-fg-muted">UID</dt>
                <dd className="break-all font-mono text-xs">{admin.uid}</dd>
                <dt className="text-fg-muted">Added</dt>
                <dd>{admin.addedAt ? new Date(admin.addedAt).toLocaleString() : "—"}</dd>
                <dt className="text-fg-muted">Last sign-in</dt>
                <dd>{admin.lastSignInAt ? new Date(admin.lastSignInAt).toLocaleString() : "Never"}</dd>
                <dt className="text-fg-muted">MFA</dt>
                <dd>{admin.mfaEnrolled ? "Enrolled" : "Not enrolled"}</dd>
                <dt className="text-fg-muted">Sign-in account</dt>
                <dd>{!admin.authExists ? "Missing" : admin.authDisabled ? "Disabled in Firebase Auth" : "Active"}</dd>
              </dl>
            </section>
          </div>
        ) : null}
      </Drawer>

      {admin ? (
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
                {admin.legacy ? "Legacy grant (full access)" : current.map(roleLabel).join(", ") || "no roles"} →{" "}
                <strong>{roles.map(roleLabel).join(", ")}</strong>. Takes effect on their next action.
              </>
            }
            onConfirm={(reason) =>
              run({ action: "setRoles", uid: admin.uid, roles, extraPermissions: admin.extraPermissions, reason }, "Roles updated")
            }
          />
          <ConfirmAction
            open={confirm === "suspend"}
            onClose={() => setConfirm(null)}
            title="Suspend admin"
            level="reason"
            danger
            confirmLabel="Suspend"
            impact={
              <>
                <strong>{admin.email}</strong> loses all console access immediately. Their record and history are kept, and they
                can be reactivated.
              </>
            }
            onConfirm={(reason) => run({ action: "setDisabled", uid: admin.uid, disabled: true, reason }, "Admin suspended")}
          />
          <ConfirmAction
            open={confirm === "reactivate"}
            onClose={() => setConfirm(null)}
            title="Reactivate admin"
            level="reason"
            confirmLabel="Reactivate"
            impact={
              <>
                <strong>{admin.email}</strong> regains access with their roles: {admin.roles.map(roleLabel).join(", ") || "none"}.
              </>
            }
            onConfirm={(reason) => run({ action: "setDisabled", uid: admin.uid, disabled: false, reason }, "Admin reactivated")}
          />
          <ConfirmAction
            open={confirm === "remove"}
            onClose={() => setConfirm(null)}
            title="Remove admin"
            level="typed"
            danger
            phrase={admin.email || admin.uid}
            confirmLabel="Remove admin"
            impact={
              <>
                <strong>{admin.email}</strong> stops being an admin. Their Akaya account is not deleted, and past actions stay in the
                audit log. Prefer <em>Suspend</em> if this may be temporary.
              </>
            }
            onConfirm={async (reason) => {
              await run({ action: "revoke", uid: admin.uid, reason }, "Admin removed");
              onClose();
            }}
          />
        </>
      ) : null}
    </>
  );
}

// ── Add admin ───────────────────────────────────────────────────────────────

function AddAdminDialog({
  open,
  onClose,
  roleDefs,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  roleDefs: RoleDef[];
  onAdded: () => void;
}) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setEmail("");
    setRoles([]);
    setReason("");
    setError(null);
  }
  if (!open && wasOpen) setWasOpen(false);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const ready = emailOk && roles.length > 0 && reason.trim().length >= 5;

  // Ref flips synchronously; state alone lets two same-tick submits through.
  const inFlight = useRef(false);
  async function submit() {
    if (!ready || busy || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await callAdmin("adminIam", { action: "grant", email: email.trim(), roles, reason: reason.trim() });
      toast.success("Admin added", `${email.trim()} can now sign in to the console.`);
      onAdded();
      onClose();
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
      title="Add admin"
      description="The person must already have signed in to Akaya once with this email."
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={!ready} loading={busy}>
            Add admin
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="Email" required error={email && !emailOk ? "Enter a valid email address." : null}>
          {(p) => <TextInput {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
        </Field>
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-fg-muted">
            Roles <span className="text-danger">*</span>
          </legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {roleDefs.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line p-2.5 hover:bg-raised">
                <span className="pt-0.5">
                  <Checkbox
                    label={r.label}
                    checked={roles.includes(r.id)}
                    onChange={(v) => setRoles((cur) => (v ? sortRoles([...cur, r.id]) : cur.filter((x) => x !== r.id)))}
                  />
                </span>
                <span>
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className="block text-xs text-fg-muted">{ROLE_DESCRIPTIONS[r.id]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Reason" required hint="Recorded in the audit log with your name.">
          {(p) => <Textarea {...p} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
        </Field>
        {error ? (
          <Notice tone="danger" title="Not added">
            {error}
          </Notice>
        ) : null}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

// ── Role × permission matrix (access review) ────────────────────────────────

function RoleMatrix({
  roles,
  permissions,
  loading,
  error,
  onRetry,
}: {
  roles: RoleDef[];
  permissions: string[];
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  const groups = useMemo(() => groupPermissions(permissions), [permissions]);
  if (loading || error) {
    return (
      <DataTable label="Role permissions" columns={[]} rows={[]} rowKey={() => ""} loading={loading} error={error ?? null} onRetry={onRetry} />
    );
  }
  return (
    <Panel
      flush
      title="Permission matrix"
      description="What each role can do, as enforced by the server. Use it for access reviews."
    >
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-sm" aria-label="Role permission matrix">
          <thead className="sticky top-0 z-[1] bg-panel-2">
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 bg-panel-2 px-3 py-2 text-left text-xs font-semibold text-fg-muted">
                Permission
              </th>
              {roles.map((r) => (
                <th key={r.id} scope="col" className="whitespace-nowrap px-2 py-2 text-center text-xs font-semibold text-fg-muted">
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <FragmentRows key={g.domain} domain={g.domain} perms={g.permissions} roles={roles} />
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function FragmentRows({ domain, perms, roles }: { domain: string; perms: string[]; roles: RoleDef[] }) {
  return (
    <>
      <tr className="border-b border-line bg-panel-2/60">
        <th colSpan={roles.length + 1} scope="rowgroup" className="px-3 py-1.5 text-left text-2xs font-semibold uppercase tracking-wider text-fg-subtle">
          {domain}
        </th>
      </tr>
      {perms.map((p) => (
        <tr key={p} className="border-b border-line last:border-0 hover:bg-raised/50">
          <th scope="row" className="sticky left-0 bg-panel px-3 py-1.5 text-left font-mono text-xs font-normal">
            {p}
          </th>
          {roles.map((r) => {
            const has = roleHas(r, p);
            return (
              <td key={r.id} className="px-2 py-1.5 text-center">
                {has ? (
                  <span className="inline-flex text-success" aria-label="Granted" title="Granted">
                    <Icon name="check" size={16} />
                  </span>
                ) : (
                  <span className="text-line-strong" aria-label="Not granted" title="Not granted">
                    ·
                  </span>
                )}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
