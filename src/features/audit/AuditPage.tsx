"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callAdmin, type AdminApiError } from "@/lib/api";
import { roleLabel } from "@/lib/permissions";
import { useCan } from "@/lib/session";
import {
  Badge,
  Button,
  DataTable,
  Drawer,
  ExportButton,
  Field,
  Icon,
  IconButton,
  Notice,
  PageHeader,
  Select,
  StatusPill,
  TextInput,
  relativeTime,
  useToast,
  type Column,
} from "@/ui";
import {
  FILTER_FIELDS,
  describeAction,
  filterPayload,
  resultLabel,
  resultTone,
  type AuditEntry,
  type AuditFilter,
  type AuditFilterField,
} from "./logic";

interface Page {
  entries: AuditEntry[];
  nextCursor: string | null;
}

const PAGE_SIZE = 50;

export default function AuditPage() {
  const can = useCan();
  const [applied, setApplied] = useState<AuditFilter | null>(null);
  const [field, setField] = useState<AuditFilterField>("action");
  const [value, setValue] = useState("");
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const gen = useRef(0);

  const load = useCallback(async (filter: AuditFilter | null) => {
    const mine = ++gen.current;
    setLoading(true);
    setError(null);
    try {
      const page = await callAdmin<Page>("adminAuditLog", { limit: PAGE_SIZE, ...filterPayload(filter) });
      if (mine !== gen.current) return;
      setRows(page.entries);
      setCursor(page.nextCursor);
    } catch (e) {
      if (mine !== gen.current) return;
      setError((e as AdminApiError).message);
      setRows([]);
      setCursor(null);
    } finally {
      if (mine === gen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(applied);
  }, [applied, load]);

  async function loadMore() {
    if (!cursor) return;
    const mine = gen.current;
    setLoadingMore(true);
    try {
      const page = await callAdmin<Page>("adminAuditLog", { limit: PAGE_SIZE, cursor, ...filterPayload(applied) });
      if (mine !== gen.current) return;
      setRows((r) => [...r, ...page.entries.filter((e) => !r.some((x) => x.id === e.id))]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError((e as AdminApiError).message);
    } finally {
      setLoadingMore(false);
    }
  }

  function applyFilter(f: AuditFilter | null) {
    setSelected(null);
    if (f) {
      setField(f.field);
      setValue(f.value);
    } else {
      setValue("");
    }
    setApplied(f && f.value.trim() ? { field: f.field, value: f.value.trim() } : null);
  }

  const columns: Column<AuditEntry>[] = [
    {
      id: "at",
      header: "When",
      width: "120px",
      cell: (e) => (
        <span className="whitespace-nowrap text-fg-muted" title={e.at ? new Date(e.at).toLocaleString() : ""}>
          {relativeTime(e.at)}
        </span>
      ),
    },
    {
      id: "actor",
      header: "Admin",
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate">{e.actorEmail || e.actorUid}</p>
          <p className="truncate text-2xs text-fg-subtle">{e.actorRoles.map(roleLabel).join(", ")}</p>
        </div>
      ),
    },
    {
      id: "action",
      header: "Action",
      cell: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{describeAction(e.action)}</p>
          <p className="truncate font-mono text-2xs text-fg-subtle">{e.action}</p>
        </div>
      ),
    },
    {
      id: "target",
      header: "Target",
      hideOnNarrow: true,
      cell: (e) => (
        <span className="inline-flex max-w-[220px] items-center gap-1.5">
          <Badge>{e.targetType}</Badge>
          <span className="truncate font-mono text-xs">{e.targetId}</span>
        </span>
      ),
    },
    { id: "result", header: "Result", cell: (e) => <StatusPill status={resultTone(e.result)} label={resultLabel(e.result)} /> },
    {
      id: "reason",
      header: "Reason",
      hideOnNarrow: true,
      cell: (e) => <span className="line-clamp-1 max-w-[260px] text-fg-muted">{e.reason || "—"}</span>,
    },
  ];

  const fieldDef = FILTER_FIELDS.find((f) => f.id === field)!;

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Every administrative change and every refused attempt, newest first. Entries are written by the server and cannot be edited or deleted from the console."
        actions={
          <>
            {can("audit.export") ? (
              <ExportButton kind="audit" what={applied ? "the filtered audit log" : "the audit log"} filter={filterPayload(applied) as Record<string, string>} />
            ) : null}
            <Button icon="refresh" onClick={() => void load(applied)} loading={loading && rows.length > 0}>
              Refresh
            </Button>
          </>
        }
      />

      <form
        className="mb-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          applyFilter({ field, value });
        }}
      >
        <Field label="Filter by" className="w-44">
          {(p) => (
            <Select {...p} value={field} onChange={(e) => setField(e.target.value as AuditFilterField)}>
              {FILTER_FIELDS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Value" className="w-full sm:w-80">
          {(p) =>
            field === "result" ? (
              <Select {...p} value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">Any</option>
                <option value="ok">Success</option>
                <option value="denied">Denied</option>
                <option value="error">Error</option>
              </Select>
            ) : (
              <TextInput {...p} value={value} placeholder={fieldDef.placeholder} onChange={(e) => setValue(e.target.value)} />
            )
          }
        </Field>
        <Button type="submit" variant="primary" icon="filter">
          Apply
        </Button>
        {applied ? (
          <Button variant="ghost" onClick={() => applyFilter(null)}>
            Clear
          </Button>
        ) : null}
      </form>
      {applied ? (
        <p className="mb-3 text-sm text-fg-muted">
          Showing entries where <strong className="text-fg">{FILTER_FIELDS.find((f) => f.id === applied.field)?.label}</strong> is{" "}
          <code className="rounded bg-raised px-1 font-mono text-xs text-fg">{applied.value}</code>. One filter at a time.
        </p>
      ) : null}

      <DataTable
        label="Audit log"
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        loading={loading && rows.length === 0}
        error={error}
        onRetry={() => void load(applied)}
        onRowClick={setSelected}
        hasMore={!!cursor}
        onLoadMore={() => void loadMore()}
        loadingMore={loadingMore}
        rowTone={(e) => (e.result === "denied" ? "warning" : e.result === "error" ? "danger" : null)}
        empty={
          applied
            ? { title: "No entries match this filter" }
            : { title: "No administrative actions recorded yet", body: "Changes made through the console appear here." }
        }
      />

      <EntryDrawer entry={selected} onClose={() => setSelected(null)} onFilter={applyFilter} />
    </>
  );
}

function EntryDrawer({
  entry,
  onClose,
  onFilter,
}: {
  entry: AuditEntry | null;
  onClose: () => void;
  onFilter: (f: AuditFilter) => void;
}) {
  const toast = useToast();
  if (!entry) return <Drawer open={false} onClose={onClose} title="" />;
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(() => toast.info("Copied"));
  };
  return (
    <Drawer
      open
      onClose={onClose}
      width={600}
      title={describeAction(entry.action)}
      subtitle={<StatusPill status={resultTone(entry.result)} label={resultLabel(entry.result)} />}
    >
      <div className="space-y-5">
        {entry.result !== "ok" ? (
          <Notice tone={entry.result === "denied" ? "warning" : "danger"}>
            {entry.result === "denied"
              ? "This attempt was refused because the admin's role does not include the required permission. Nothing was changed."
              : `The action did not complete${entry.errorCode ? ` (${entry.errorCode})` : ""}.`}
          </Notice>
        ) : null}

        <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-sm">
          <dt className="text-fg-muted">When</dt>
          <dd>{entry.at ? new Date(entry.at).toLocaleString() : "—"}</dd>
          <dt className="text-fg-muted">Admin</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {entry.actorEmail || entry.actorUid}
            <FilterLink onClick={() => onFilter({ field: "actorUid", value: entry.actorUid })} label="All by this admin" />
          </dd>
          <dt className="text-fg-muted">Roles then</dt>
          <dd>{entry.actorRoles.map(roleLabel).join(", ") || "—"}</dd>
          <dt className="text-fg-muted">Action</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-xs">{entry.action}</code>
            <FilterLink onClick={() => onFilter({ field: "action", value: entry.action })} label="All like this" />
          </dd>
          <dt className="text-fg-muted">Target</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <Badge>{entry.targetType}</Badge>
            <code className="break-all font-mono text-xs">{entry.targetId}</code>
            <FilterLink onClick={() => onFilter({ field: "targetId", value: entry.targetId })} label="History" />
          </dd>
          <dt className="text-fg-muted">Reason</dt>
          <dd className="whitespace-pre-wrap">{entry.reason || <span className="text-fg-subtle">None given</span>}</dd>
          <dt className="text-fg-muted">Request ID</dt>
          <dd className="flex items-center gap-1">
            <code className="break-all font-mono text-2xs text-fg-muted">{entry.requestId}</code>
            <IconButton icon="copy" label="Copy request ID" size="sm" onClick={() => copy(entry.requestId)} />
          </dd>
        </dl>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Changes</h3>
          {entry.changes.length === 0 ? (
            <p className="text-sm text-fg-subtle">No field-level changes recorded for this action.</p>
          ) : (
            <div className="overflow-hidden rounded-md border border-line">
              <table className="w-full text-sm" aria-label="Field changes">
                <thead className="bg-panel-2">
                  <tr className="border-b border-line text-left text-xs text-fg-muted">
                    <th scope="col" className="px-3 py-1.5 font-semibold">Field</th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">Before</th>
                    <th scope="col" className="px-3 py-1.5 font-semibold">After</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.changes.map((c, i) => (
                    <tr key={i} className="border-b border-line align-top last:border-0">
                      <td className="px-3 py-1.5 font-mono text-xs">{c.field}</td>
                      <td className="break-all px-3 py-1.5 font-mono text-xs text-danger">{c.from}</td>
                      <td className="break-all px-3 py-1.5 font-mono text-xs text-success">{c.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {entry.meta && Object.keys(entry.meta).length > 0 ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Details</h3>
            <pre className="overflow-x-auto rounded-md border border-line bg-panel-2 p-3 font-mono text-xs">
              {JSON.stringify(entry.meta, null, 2)}
            </pre>
          </section>
        ) : null}
      </div>
    </Drawer>
  );
}

function FilterLink({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-xs text-accent-text hover:underline">
      <Icon name="filter" size={12} />
      {label}
    </button>
  );
}
