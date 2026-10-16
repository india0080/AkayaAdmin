"use client";

import clsx from "clsx";
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

const CONTROL =
  "block w-full rounded-md border border-line bg-panel px-3 text-sm text-fg placeholder:text-fg-subtle " +
  "transition-colors hover:border-line-strong focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 " +
  "disabled:cursor-not-allowed disabled:bg-panel-2 disabled:text-fg-subtle " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger/25";

/// Label + control + hint/error, wired for screen readers. The control is
/// passed as a render function so it receives the right id/aria props.
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-fg-muted">
        {label}
        {required ? <span className="ml-0.5 text-danger" aria-hidden>*</span> : null}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {error ? (
        <p id={errId} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1 text-xs text-fg-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx(CONTROL, "h-9", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={clsx(CONTROL, "h-9 pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={clsx(CONTROL, "min-h-[84px] py-2", className)} {...rest} />;
});

/// Accessible on/off switch (role="switch", aria-checked).
export function Switch({
  checked,
  onChange,
  label,
  disabled,
  describedBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-accent-solid" : "bg-line-strong",
      )}
    >
      <span
        aria-hidden
        className={clsx(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  indeterminate,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  indeterminate?: boolean;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(el) => {
        if (el) el.indeterminate = !!indeterminate;
      }}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer rounded border-line-strong accent-[rgb(var(--accent-solid))]"
    />
  );
}
