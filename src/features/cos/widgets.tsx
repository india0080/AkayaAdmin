"use client";

import clsx from "clsx";
import { useId, type ReactNode } from "react";
import { Switch } from "@/ui";

/// 0..1 slider with a numeric readout. Always labelled; disabled when read-only.
export function SliderField({
  label,
  help,
  value,
  onChange,
  disabled,
  defaultValue,
  step = 0.05,
}: {
  label: string;
  help?: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /// Compiled default, shown so an operator can tell "changed" from "default".
  defaultValue?: number;
  step?: number;
}) {
  const id = useId();
  const changed = defaultValue !== undefined && Math.abs(defaultValue - value) > 0.0005;
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        <span className="tabular text-sm text-fg-muted" aria-hidden>
          {value.toFixed(2)}
          {changed ? <span className="ml-2 text-2xs text-accent-text">default {defaultValue!.toFixed(2)}</span> : null}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={step}
        value={value}
        disabled={disabled}
        aria-valuetext={`${value.toFixed(2)} out of 1`}
        aria-describedby={help ? `${id}-help` : undefined}
        onChange={(e) => onChange(Math.round(Number(e.target.value) * 1000) / 1000)}
        className="mt-1 h-2 w-full cursor-pointer accent-[rgb(var(--accent-solid))] disabled:cursor-not-allowed disabled:opacity-60"
      />
      {help ? (
        <p id={`${id}-help`} className="mt-0.5 text-xs text-fg-subtle">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function ToggleRow({
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  help?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{label}</p>
        {help ? (
          <p id={id} className="mt-0.5 text-xs text-fg-subtle">
            {help}
          </p>
        ) : null}
      </div>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} describedBy={help ? id : undefined} />
    </div>
  );
}

export function CharCount({ value, max, className }: { value: number; max: number; className?: string }) {
  const over = value > max;
  return (
    <span className={clsx("tabular text-xs", over ? "font-semibold text-danger" : "text-fg-subtle", className)} aria-live="polite">
      {value}/{max}
    </span>
  );
}

/// Read-only pill row used for "what the app will do" summaries.
export function KeyValue({ items }: { items: { k: string; v: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.k} className="min-w-0">
          <dt className="text-xs font-medium text-fg-muted">{i.k}</dt>
          <dd className="mt-0.5 break-words text-sm text-fg">{i.v}</dd>
        </div>
      ))}
    </dl>
  );
}

/// Plain-text diff table (values rendered as text nodes only: never as markup).
export function ChangeList({ changes, empty = "No differences." }: { changes: { field: string; from: string; to: string }[]; empty?: string }) {
  if (changes.length === 0) return <p className="text-sm text-fg-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-line rounded-md border border-line">
      {changes.map((c) => (
        <li key={c.field} className="grid gap-1 px-3 py-2 text-sm md:grid-cols-[180px_1fr_1fr] md:gap-3">
          <span className="font-mono text-xs font-semibold text-fg">{c.field}</span>
          <span className="min-w-0 break-words text-fg-muted">
            <span className="mr-1 text-2xs font-semibold uppercase text-fg-subtle">was</span>
            {c.from}
          </span>
          <span className="min-w-0 break-words text-fg">
            <span className="mr-1 text-2xs font-semibold uppercase text-fg-subtle">now</span>
            {c.to}
          </span>
        </li>
      ))}
    </ul>
  );
}
