"use client";

import { useMemo, useState, type MutableRefObject } from "react";
import { callAdmin } from "@/lib/api";
import { useCallable } from "@/lib/useCallable";
import { Badge, Button, ConfirmAction, DataTable, Notice, Panel, relativeTime, useToast, type Column, type Tone } from "@/ui";
import type { PricingCtx } from "./ctx";
import { PUBLISH_PHRASE, describeRowChange, publishConfirmLevel, type DraftDiff, type RowChangeKind } from "./draft";
import { latestVersion, parseHistory, rollbackImpact, rollbackRequest, type HistoryEntry } from "./history";
import { POLICY_KEY_LABEL } from "./registry";
import { buildPublishPlan, runPublish, type PublishReport, type PublishTarget } from "./publish";
import { paginate } from "./table";

const KIND_TONE: Record<RowChangeKind, Tone> = { added: "success", changed: "info", removed: "danger" };
const showVal = (v: unknown): string => (v === null || v === undefined ? "default" : typeof v === "boolean" ? (v ? "on" : "off") : typeof v === "object" ? JSON.stringify(v) : String(v));

export function DraftPanel({
  ctx, diff, versions, lock, canPublish, onDiscard, onAfterPublish,
}: {
  ctx: PricingCtx;
  diff: DraftDiff;
  versions: Record<PublishTarget, number | null>;
  lock: MutableRefObject<{ busy: boolean }>;
  canPublish: boolean;
  onDiscard: () => void;
  /// reload server data after any publish attempt (also after a partial failure)
  onAfterPublish: (report: PublishReport) => void;
}) {
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [confirm, setConfirm] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [report, setReport] = useState<PublishReport | null>(null);
  const steps = useMemo(() => buildPublishPlan(diff), [diff]);
  const level = publishConfirmLevel(diff);
  const pg = paginate(diff.rows, page, 50);
  const c = diff.counts;
  const empty = c.total === 0;
  const blocked = diff.errors.length > 0;
  const priceChunks = steps.filter((s) => s.target === "planPrices").length;

  return (
    <div className="space-y-4">
      {report && report.status !== "done" ? (
        <Notice tone={report.status === "partial" ? "warning" : "danger"} title={report.status === "partial" ? "Partly published" : "Not published"}>
          {report.message}
          <ul className="mt-2 list-disc pl-5 text-sm">
            {report.steps.map((s) => (
              <li key={`${s.target}${s.index}`}>
                {s.target === "planPrices" ? `Price chunk ${s.index}/${s.of} (${s.size} rows)` : `Policy (${s.size} keys)`}: {s.status}{s.version !== undefined ? ` (now version ${s.version})` : ""}{s.message ? ` - ${s.message}` : ""}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {report?.status === "done" ? <Notice tone="success" title="Published">{report.message} The server data was reloaded.</Notice> : null}

      <Panel
        title="Unpublished draft"
        description="Your edits live only in this browser tab (they survive a reload) until you publish. Nothing here has reached the app."
        actions={
          <>
            <Badge tone="success">{c.added} added</Badge>
            <Badge tone="info">{c.changed} changed</Badge>
            {c.removed ? <Badge tone="danger">{c.removed} removed</Badge> : null}
            {c.enabledOn + c.enabledOff ? <Badge tone="accent">{c.enabledOn} enabled / {c.enabledOff} disabled</Badge> : null}
            {c.policyKeys - c.enabledOn - c.enabledOff > 0 ? <Badge tone="accent">{c.policyKeys - c.enabledOn - c.enabledOff} policy settings</Badge> : null}
          </>
        }
      >
        {empty ? <p className="text-sm text-fg-muted">The draft is empty. Edit prices in the table, use Bulk fill or import a CSV.</p> : null}
        {diff.errors.length > 0 ? (
          <Notice tone="danger" title="Fix these before publishing">
            <ul className="max-h-40 list-disc overflow-auto pl-5">{diff.errors.slice(0, 50).map((e) => <li key={e}>{e}</li>)}</ul>
          </Notice>
        ) : null}
        {diff.warnings.length > 0 ? (
          <div className="mt-3">
            <Notice tone="warning" title={`${diff.warnings.length} warning${diff.warnings.length === 1 ? "" : "s"} (do not block)`}>
              <ul className="max-h-40 list-disc overflow-auto pl-5">{diff.warnings.slice(0, 50).map((e) => <li key={e}>{e}</li>)}</ul>
            </Notice>
          </div>
        ) : null}

        {diff.rows.length > 0 ? (
          <div className="mt-3 overflow-auto">
            <table className="w-full text-sm" aria-label="Draft price changes">
              <thead><tr className="border-b border-line text-left text-xs text-fg-muted"><th className="py-1.5 pr-3">Change</th><th>Detail</th></tr></thead>
              <tbody>
                {pg.items.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 align-top">
                    <td className="py-1.5 pr-3"><Badge tone={KIND_TONE[r.kind]}>{r.kind}</Badge></td>
                    <td>{describeRowChange(r)}{r.errors.map((e) => <p key={e} className="text-xs text-danger">{e}</p>)}{r.warnings.map((e) => <p key={e} className="text-xs text-warning">{e}</p>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex items-center justify-between text-sm text-fg-muted">
              <span>Showing {pg.from}-{pg.to} of {pg.total}</span>
              <span className="inline-flex items-center gap-2">
                <Button size="sm" icon="chevron-left" aria-label="Previous page" disabled={pg.page <= 1} onClick={() => setPage(pg.page - 1)} />
                Page {pg.page} of {pg.pages}
                <Button size="sm" icon="chevron-right" aria-label="Next page" disabled={pg.page >= pg.pages} onClick={() => setPage(pg.page + 1)} />
              </span>
            </div>
          </div>
        ) : null}

        {diff.policy.length > 0 ? (
          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Policy changes</p>
            <ul className="space-y-0.5 text-sm">
              {diff.policy.map((p) => <li key={p.key}>{POLICY_KEY_LABEL(p.key)}: <span className="text-fg-muted">{showVal(p.before)}</span> {"->"} <strong>{showVal(p.after)}</strong></li>)}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canPublish ? (
            <Button variant="primary" disabled={empty || blocked} onClick={() => setConfirm(true)}>Publish {c.total} change{c.total === 1 ? "" : "s"}...</Button>
          ) : (
            <span className="text-sm text-fg-muted">Publishing needs the plans.modify permission.</span>
          )}
          {canPublish ? <Button variant="danger-ghost" disabled={empty} onClick={() => setDiscard(true)}>Discard draft</Button> : null}
          <span className="text-xs text-fg-subtle">{priceChunks > 0 ? `${priceChunks} price request${priceChunks === 1 ? "" : "s"} of at most 400 rows` : ""}{steps.some((s) => s.target === "pricingPolicy") ? `${priceChunks > 0 ? " + " : ""}1 policy request` : ""}</span>
        </div>
      </Panel>

      <ConfirmAction
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Publish ${c.total} pricing change${c.total === 1 ? "" : "s"}`}
        level={level}
        phrase={PUBLISH_PHRASE}
        danger
        confirmLabel="Publish to the app"
        impact={
          <>
            <ul className="list-disc pl-5">
              {c.added + c.changed + c.removed > 0 ? <li>{c.added} new, {c.changed} changed and {c.removed} removed price rows (NEW orders only; existing subscriptions are unaffected).</li> : null}
              {c.enabledOn + c.enabledOff > 0 ? <li>{c.enabledOn} countries enabled and {c.enabledOff} disabled for sale.</li> : null}
              {c.policyKeys - c.enabledOn - c.enabledOff > 0 ? <li>{c.policyKeys - c.enabledOn - c.enabledOff} policy settings change what unpriced countries see.</li> : null}
              <li>Each request is versioned, audited with your reason, and can be undone from History.</li>
              <li>Prices are published before the policy; if a request fails, the earlier ones stay applied and the rest stays in your draft.</li>
            </ul>
            {diff.warnings.length > 0 ? <p className="mt-2 text-warning">{diff.warnings.length} warning(s) are in the draft list (for example currencies the payment gateway may refuse).</p> : null}
            {level === "typed" ? <p className="mt-2 text-xs">To confirm, type <code className="font-mono">{PUBLISH_PHRASE}</code> and give a reason (at least 5 characters).</p> : <p className="mt-2 text-xs">Give a reason (at least 5 characters).</p>}
          </>
        }
        onConfirm={async (reason) => {
          const r = await runPublish(steps, reason, {
            versions,
            lock: lock.current,
            call: (target, patch, expectedVersion, why) => callAdmin<{ version?: number }>("adminConfig", { action: "apply", target, patch, expectedVersion, reason: why }),
          });
          setReport(r);
          if (r.status === "done" || r.status === "partial" || r.needsReload) onAfterPublish(r);
          if (r.status !== "done") throw new Error(r.message);
          toast.success("Published", `priceVersion/version now ${r.versions.planPrices ?? "?"}${r.versions.pricingPolicy !== null && steps.some((s) => s.target === "pricingPolicy") ? ` (policy ${r.versions.pricingPolicy})` : ""}`);
        }}
      />
      <ConfirmAction
        open={discard}
        onClose={() => setDiscard(false)}
        title="Discard the draft"
        level="confirm"
        danger
        confirmLabel="Discard"
        impact="All unpublished edits, imports and bulk-fill results are removed from this browser. The published prices are not touched."
        onConfirm={async () => { onDiscard(); }}
      />
    </div>
  );
}

// ── History ─────────────────────────────────────────────────────────────────

export function HistoryPanel({ canRollback, onChanged }: { canRollback: boolean; onChanged: () => void }) {
  const toast = useToast();
  const prices = useCallable<unknown>("adminConfig", { action: "history", target: "planPrices", limit: 30 });
  const policy = useCallable<unknown>("adminConfig", { action: "history", target: "pricingPolicy", limit: 30 });
  const [undo, setUndo] = useState<HistoryEntry | null>(null);
  const priceRows = useMemo(() => parseHistory(prices.data), [prices.data]);
  const policyRows = useMemo(() => parseHistory(policy.data), [policy.data]);

  const cols = (): Column<HistoryEntry>[] => [
    { id: "v", header: "Version", width: "90px", cell: (r) => <span className="inline-flex items-center gap-1.5"><Badge>v{r.version}</Badge>{r.kind === "rollback" ? <Badge tone="info">undo of v{r.rolledBackFrom}</Badge> : null}</span> },
    { id: "when", header: "When", width: "110px", cell: (r) => <span title={r.at ? new Date(r.at).toLocaleString() : ""}>{relativeTime(r.at)}</span> },
    {
      id: "chg", header: "Change",
      cell: (r) => (
        <div className="min-w-0 space-y-0.5 text-xs">
          <p>{r.changeCount} change{r.changeCount === 1 ? "" : "s"}</p>
          {r.lines.slice(0, 2).map((l) => <p key={l} className="truncate font-mono text-fg-muted">{l}</p>)}
        </div>
      ),
    },
    { id: "who", header: "By / reason", hideOnNarrow: true, cell: (r) => <div className="min-w-0"><p className="truncate">{r.actorEmail}</p><p className="truncate text-xs text-fg-muted">{r.reason}</p></div> },
    { id: "act", header: "", align: "right", cell: (r) => (canRollback ? <Button size="sm" onClick={() => setUndo(r)}>Undo</Button> : null) },
  ];

  const section = (title: string, q: typeof prices, rows: HistoryEntry[]) => (
    <Panel title={title} flush>
      <DataTable
        label={title}
        columns={cols()}
        rows={rows}
        rowKey={(r) => r.id}
        loading={q.loading && !q.data}
        error={q.error?.message ?? null}
        onRetry={q.reload}
        empty={{ title: "No changes yet" }}
      />
    </Panel>
  );

  return (
    <div className="space-y-4">
      {!canRollback ? <Notice tone="info">You can view the history. Undoing a change needs the plans.modify permission.</Notice> : null}
      {section("Price rows history", prices, priceRows)}
      {section("Policy history (countries enabled, fallback, defaults)", policy, policyRows)}
      {undo ? (
        <ConfirmAction
          open
          onClose={() => setUndo(null)}
          title={`Undo ${undo.target === "planPrices" ? "price" : "policy"} version ${undo.version}`}
          level="typed"
          phrase="UNDO"
          danger
          confirmLabel="Undo change"
          impact={
            <>
              {rollbackImpact(undo)} It is applied as a NEW version; history is never rewritten.
              {latestVersion(undo.target === "planPrices" ? priceRows : policyRows, undo.target) !== undo.version ? <p className="mt-2 text-warning">Newer versions exist. Only the keys this version changed are restored; anything changed since in other keys stays.</p> : null}
            </>
          }
          onConfirm={async (reason) => {
            const cur = await callAdmin<{ version: number }>("adminConfig", { action: "get", target: undo.target });
            await callAdmin("adminConfig", rollbackRequest(undo, cur.version, reason));
            toast.success("Change undone");
            setUndo(null);
            prices.reload();
            policy.reload();
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}
