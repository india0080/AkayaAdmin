import clsx from "clsx";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

/// The console's one container. Flat, 1px bordered — the app's card style.
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /// No body padding (tables that run edge to edge).
  flush?: boolean;
}) {
  return (
    <section className={clsx("ui-panel rounded-lg border border-line bg-panel", className)}>
      {title || actions ? (
        <header className="ui-panel-head flex items-start justify-between gap-4 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="ui-panel-title text-base font-semibold text-fg">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-sm text-fg-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={clsx(!flush && "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

/// Compact KPI: label, value, optional context line. Not a giant card —
/// several sit in one StatStrip row.
export function Stat({
  label,
  value,
  hint,
  tone,
  estimated,
  icon,
  chip,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "danger" | "warning" | "success";
  /// Marks a derived/estimated figure so it is never read as billing truth.
  estimated?: boolean;
  /// Icon chip, shown only by the Rose theme (hidden by CSS elsewhere).
  icon?: string;
  chip?: "pink" | "cyan" | "purple" | "green" | "amber" | "blue";
}) {
  return (
    <div className="ui-stat min-w-0 px-4 py-3">
      {icon ? (
        <span aria-hidden className="ui-stat-chip" data-chip={chip ?? "pink"}>
          <Icon name={icon} size={20} />
        </span>
      ) : null}
      <p className="ui-stat-label flex items-center gap-1.5 truncate text-xs font-medium text-fg-muted">
        {label}
        {estimated ? (
          <span className="rounded-sm bg-warning-soft px-1 text-2xs font-semibold text-warning" title="Estimated, not billing data">
            EST
          </span>
        ) : null}
      </p>
      <p
        className={clsx(
          "ui-stat-value tabular mt-0.5 truncate text-xl font-semibold",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
          tone === "success" && "text-success",
          (!tone || tone === "default") && "text-fg",
        )}
      >
        {value}
      </p>
      {hint ? <p className="ui-stat-hint mt-0.5 truncate text-xs text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "ui-statstrip grid divide-y divide-line rounded-lg border border-line bg-panel sm:grid-cols-2 sm:divide-y-0 lg:auto-cols-fr lg:grid-flow-col lg:divide-x",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  meta,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="ui-pagehead mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="ui-page-title text-xl font-semibold text-fg">{title}</h1>
        {description ? <p className="ui-page-sub mt-1 max-w-3xl text-sm text-fg-muted">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {actions ? <div className="flex min-w-0 max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
