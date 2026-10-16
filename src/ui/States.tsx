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
