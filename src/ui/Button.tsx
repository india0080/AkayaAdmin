"use client";

import clsx from "clsx";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Spinner } from "./States";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-accent-solid text-accent-on hover:bg-accent-solid-hover border border-transparent",
  secondary:
    "bg-panel text-fg border border-line hover:bg-raised hover:border-line-strong",
  ghost: "bg-transparent text-fg-muted border border-transparent hover:bg-raised hover:text-fg",
  danger: "bg-danger text-white border border-transparent hover:brightness-95",
  "danger-ghost": "bg-transparent text-danger border border-transparent hover:bg-danger-soft",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: string;
  iconRight?: string;
  loading?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconRight, loading, disabled, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={clsx(
        "ui-btn inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors",
        `ui-btn-${variant}`,
        "disabled:cursor-not-allowed disabled:opacity-70 disabled:saturate-50",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={16} /> : null}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  /// Required: an icon-only control must have an accessible name.
  label: string;
  size?: Size;
  variant?: "ghost" | "secondary";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, size = "md", variant = "ghost", className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={label}
      title={label}
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-md transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-70 disabled:saturate-50",
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        variant === "ghost"
          ? "text-fg-muted hover:bg-raised hover:text-fg"
          : "border border-line bg-panel text-fg hover:bg-raised",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={18} />
    </button>
  );
});
