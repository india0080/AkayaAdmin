// Country pricing: PUBLISH planning and execution (draft -> adminConfig
// apply). Pure: the network call is injected, so the whole flow (chunking,
// expectedVersion chaining, stale-version and partial-failure handling,
// double-submit guard, reason validation) is unit-tested without Firebase.
import type { DraftDiff, RowChange } from "./draft";
import { MAX_PER_APPLY } from "./registry";

export const MIN_PUBLISH_REASON = 5;

export type PublishTarget = "planPrices" | "pricingPolicy";

export interface PublishStep {
  target: PublishTarget;
  /// 1-based chunk number within the target
  index: number;
  of: number;
  /// number of rows (planPrices) or keys (pricingPolicy)
  size: number;
  patch: Record<string, unknown>;
}

/// Complete price row sent to adminConfig. effectiveFrom / notes are left out on
/// purpose: the server merges the patch over the stored row, so they are kept.
export function rowPatchValue(c: RowChange): Record<string, unknown> | null {
  if (c.kind === "removed" || !c.after) return null;
  return {
    planId: c.planId, country: c.country, currency: c.currency,
    priceMonthly: c.after.priceMonthly, priceAnnual: c.after.priceAnnual, active: c.after.active,
  };
}

/// Prices first (a country is never enabled before its price exists), policy
/// last. Rows are chunked to the server's per-apply limit (<= 400).
export function buildPublishPlan(diff: DraftDiff, chunkSize: number = MAX_PER_APPLY): PublishStep[] {
  const size = Math.min(Math.max(1, Math.floor(chunkSize) || 1), MAX_PER_APPLY);
  const steps: PublishStep[] = [];
  const rows = diff.rows;
  const of = Math.ceil(rows.length / size);
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const patch: Record<string, unknown> = {};
    for (const c of chunk) patch[c.id] = rowPatchValue(c);
    steps.push({ target: "planPrices", index: i / size + 1, of, size: chunk.length, patch });
  }
  if (diff.policy.length) {
    const patch: Record<string, unknown> = {};
    for (const c of diff.policy) patch[c.key] = c.after === undefined ? null : c.after;
    steps.push({ target: "pricingPolicy", index: 1, of: 1, size: diff.policy.length, patch });
  }
  return steps;
}

export type StepStatus = "applied" | "noop" | "failed" | "stale" | "skipped";

export interface StepReport {
  target: PublishTarget;
  index: number;
  of: number;
  size: number;
  status: StepStatus;
  version?: number;
  message?: string;
}

export interface PublishReport {
  status: "done" | "partial" | "failed" | "busy" | "invalid_reason" | "nothing";
  steps: StepReport[];
  /// last known version per target after the run
  versions: Record<PublishTarget, number | null>;
  /// the draft is stale / partly applied: reload before anything else
  needsReload: boolean;
  appliedRows: number;
  message: string;
}

export interface PublishDeps {
  /// One adminConfig apply. Throws on any failure (AdminApiError-like with code/kind/message).
  call: (target: PublishTarget, patch: Record<string, unknown>, expectedVersion: number, reason: string) => Promise<{ version?: number } | null | undefined>;
  versions: Record<PublishTarget, number | null>;
  /// shared guard object: true while a publish runs (double-submit safe)
  lock: { busy: boolean };
}

export type ErrorClass = "stale" | "noop" | "permission" | "failed";

/// aborted = the server version moved on (stale); failed-precondition "already
/// the current configuration" = a no-op chunk; everything else is a failure.
export function classifyPublishError(e: unknown): { cls: ErrorClass; message: string } {
  const err = (e ?? {}) as { code?: unknown; kind?: unknown; message?: unknown };
  const code = String(err.code ?? "").replace(/^functions\//, "");
  const message = typeof err.message === "string" && err.message ? err.message : "The change could not be saved.";
  if (code === "aborted") return { cls: "stale", message: "This configuration changed since you loaded it. Reload and review before publishing again." };
  if (code === "failed-precondition" && /already the current configuration/i.test(message)) return { cls: "noop", message };
  if (code === "permission-denied" || err.kind === "permission") return { cls: "permission", message };
  return { cls: "failed", message };
}

export function validatePublishReason(reason: string): string | null {
  return reason.trim().length >= MIN_PUBLISH_REASON ? null : `Give a reason of at least ${MIN_PUBLISH_REASON} characters (it is recorded in the audit log).`;
}

export async function runPublish(steps: readonly PublishStep[], reason: string, deps: PublishDeps): Promise<PublishReport> {
  const versions = { ...deps.versions };
  const empty = (status: PublishReport["status"], message: string): PublishReport => ({ status, steps: [], versions, needsReload: false, appliedRows: 0, message });
  const bad = validatePublishReason(reason);
  if (bad) return empty("invalid_reason", bad);
  if (steps.length === 0) return empty("nothing", "There is nothing to publish.");
  if (deps.lock.busy) return empty("busy", "A publish is already in progress.");
  deps.lock.busy = true;
  const reports: StepReport[] = [];
  let appliedRows = 0;
  let stopped = false;
  let needsReload = false;
  try {
    for (const s of steps) {
      const base: StepReport = { target: s.target, index: s.index, of: s.of, size: s.size, status: "skipped" };
      if (stopped) { reports.push(base); continue; }
      const expected = versions[s.target];
      if (expected === null || expected === undefined) {
        reports.push({ ...base, status: "failed", message: "The current version is unknown. Reload the page." });
        stopped = true; needsReload = true;
        continue;
      }
      try {
        const res = await deps.call(s.target, s.patch, expected, reason.trim());
        const v = typeof res?.version === "number" ? res.version : null;
        versions[s.target] = v;
        reports.push({ ...base, status: "applied", ...(v !== null ? { version: v } : {}) });
        if (s.target === "planPrices") appliedRows += s.size;
        if (v === null) needsReload = true; // cannot chain the next expectedVersion
      } catch (e) {
        const c = classifyPublishError(e);
        if (c.cls === "noop") {
          reports.push({ ...base, status: "noop", message: c.message });
          continue;
        }
        reports.push({ ...base, status: c.cls === "stale" ? "stale" : "failed", message: c.message });
        stopped = true; needsReload = true;
      }
    }
  } finally {
    deps.lock.busy = false;
  }
  const applied = reports.filter((r) => r.status === "applied").length;
  const noop = reports.filter((r) => r.status === "noop").length;
  const failed = reports.filter((r) => r.status === "failed" || r.status === "stale" || r.status === "skipped").length;
  const status: PublishReport["status"] = failed === 0 ? "done" : applied + noop > 0 ? "partial" : "failed";
  return { status, steps: reports, versions, needsReload: needsReload || status !== "done", appliedRows, message: describePublish(reports, status) };
}

export function describePublish(reports: readonly StepReport[], status: PublishReport["status"]): string {
  const label = (r: StepReport) => (r.target === "planPrices" ? `price chunk ${r.index}/${r.of} (${r.size} rows)` : `policy (${r.size} keys)`);
  const ok = reports.filter((r) => r.status === "applied" || r.status === "noop").map(label);
  const bad = reports.filter((r) => r.status === "failed" || r.status === "stale").map((r) => `${label(r)}: ${r.message ?? r.status}`);
  const skipped = reports.filter((r) => r.status === "skipped").map(label);
  if (status === "done") return `Published: ${ok.join("; ")}.`;
  const parts: string[] = [];
  parts.push(ok.length ? `Applied: ${ok.join("; ")}.` : "Nothing was applied.");
  if (bad.length) parts.push(`Failed: ${bad.join("; ")}.`);
  if (skipped.length) parts.push(`Not applied: ${skipped.join("; ")}.`);
  parts.push("Your draft still holds the changes that were not applied. Reload, review, then publish again.");
  return parts.join(" ");
}
