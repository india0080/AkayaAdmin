"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", className)}
      style={{ width: size, height: size }}
    />
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={clsx("block animate-pulse rounded bg-raised", className)} />;
}

function StateFrame({
  icon,
  tone,
  title,
  children,
  action,
  compact,
}: {
  icon: string;
  tone: "neutral" | "danger" | "warning";
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={clsx("flex flex-col items-center justify-center text-center", compact ? "px-4 py-8" : "px-6 py-16")}>
      <span
        className={clsx(
          "mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full",
          tone === "danger" && "bg-danger-soft text-danger",
          tone === "warning" && "bg-warning-soft text-warning",
          tone === "neutral" && "bg-raised text-fg-muted",
        )}
      >
        <Icon name={icon} size={20} />
      </span>
      <p className="text-md font-semibold text-fg">{title}</p>
      {children ? <div className="mt-1 max-w-md text-sm text-fg-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function EmptyState(props: { title: string; children?: ReactNode; action?: ReactNode; icon?: string; compact?: boolean }) {
  return <StateFrame icon={props.icon ?? "inbox"} tone="neutral" {...props} />;
}

export function ErrorState({
  title = "This could not be loaded",
  message,
  onRetry,
  compact,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div role="alert">
      <StateFrame
        icon="alert-triangle"
        tone="danger"
        title={title}
        compact={compact}
        action={
          onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-panel px-3 text-sm font-medium text-fg hover:bg-raised"
            >
              <Icon name="refresh" size={16} /> Try again
            </button>
          ) : undefined
        }
      >
        {message}
      </StateFrame>
    </div>
  );
}

export function PermissionDenied({ permission }: { permission?: string }) {
  return (
    <StateFrame icon="lock" tone="warning" title="You don't have access to this page">
      Your role does not include{" "}
      {permission ? <code className="rounded bg-raised px-1 font-mono text-xs">{permission}</code> : "this area"}. Ask a
      Super Admin if you need it.
    </StateFrame>
  );
}

/// Inline banner for page-level context (stale data, degraded mode, estimates).
export function Notice({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const icon = tone === "danger" ? "x-circle" : tone === "warning" ? "alert-triangle" : tone === "success" ? "check-circle" : "info";
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={clsx(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        tone === "info" && "border-info/25 bg-info-soft text-fg",
        tone === "warning" && "border-warning/30 bg-warning-soft text-fg",
        tone === "danger" && "border-danger/30 bg-danger-soft text-fg",
        tone === "success" && "border-success/30 bg-success-soft text-fg",
      )}
    >
      <span
        className={clsx(
          "mt-0.5 shrink-0",
          tone === "info" && "text-info",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
        )}
      >
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="text-fg-muted">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/// One banner per page, however many reads failed: lists what is missing and
/// retries all of them. Pages pass every query's error; nulls are ignored.
export function ErrorSummary({ errors, onRetry }: { errors: { label: string; error: { message: string } | null }[]; onRetry?: () => void }) {
  const failed = errors.filter((e) => e.error);
  if (!failed.length) return null;
  return (
    <Notice
      tone="warning"
      title={failed.length === 1 ? `${failed[0].label} could not be loaded` : `${failed.length} sections could not be loaded`}
      action={onRetry ? <button type="button" onClick={onRetry} className="font-medium underline">Retry all</button> : undefined}
    >
      {failed.length === 1 ? failed[0].error!.message : failed.map((f) => f.label).join(" · ")}
    </Notice>
  );
}

/// The backend for this section is not deployed yet: say so plainly, name
/// the contract, never show invented numbers.
export function PendingState({ title, contract, compact = true }: { title: string; contract: { callable: string; action: string; collections: string[] }; compact?: boolean }) {
  return (
    <StateFrame icon="clock" tone="neutral" title={title} compact={compact}>
      Awaiting backend: <code className="rounded bg-raised px-1 font-mono text-xs">{contract.callable}({`{ action: "${contract.action}" }`})</code> over{" "}
      {contract.collections.map((c) => <code key={c} className="mr-1 rounded bg-raised px-1 font-mono text-xs">{c}</code>)}
    </StateFrame>
  );
}
