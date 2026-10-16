import clsx from "clsx";
import type { ReactNode } from "react";
import { Icon } from "./Icon";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const TONE: Record<Tone, string> = {
  neutral: "bg-neutral-soft text-neutral",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  accent: "bg-accent-soft text-accent-text",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-0.5 text-2xs font-semibold",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── StatusPill: colour + icon + word, never colour alone (WCAG 1.4.1) ──────

export type Status = "ok" | "degraded" | "down" | "unknown" | "pending" | "off";

const STATUS: Record<Status, { tone: Tone; icon: string; label: string }> = {
  ok: { tone: "success", icon: "check-circle", label: "Healthy" },
  degraded: { tone: "warning", icon: "alert-triangle", label: "Degraded" },
  down: { tone: "danger", icon: "x-circle", label: "Down" },
  unknown: { tone: "neutral", icon: "info", label: "Unknown" },
  pending: { tone: "warning", icon: "clock", label: "Pending" },
  off: { tone: "neutral", icon: "minus-circle", label: "Off" },
};

export function StatusPill({ status, label }: { status: Status; label?: string }) {
  const s = STATUS[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2 text-xs font-medium",
        TONE[s.tone],
      )}
    >
      <Icon name={s.icon} size={14} />
      {label ?? s.label}
    </span>
  );
}

// ── Plan badge: the app's plan colours ──────────────────────────────────────

const PLAN: Record<string, string> = {
  free: "text-plan-free border-plan-free/40",
  silver: "text-plan-silver border-plan-silver/50",
  gold: "text-plan-gold border-plan-gold/50",
  app_premium: "text-plan-silver border-plan-silver/50",
  floating_premium: "text-plan-gold border-plan-gold/50",
  all_access: "text-plan-gold border-plan-gold/50",
};

const PLAN_LABEL: Record<string, string> = {
  app_premium: "App Premium",
  floating_premium: "Floating System Premium",
  all_access: "All Access",
};

function planLabel(plan: string): string {
  return PLAN_LABEL[plan.toLowerCase()] ?? plan;
}

export function PlanBadge({ plan }: { plan: string }) {
  const key = plan.toLowerCase();
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-sm border px-1.5 py-px text-2xs font-semibold uppercase tracking-wide",
        PLAN[key] ?? "border-line text-fg-muted",
      )}
    >
      {planLabel(plan)}
    </span>
  );
}
