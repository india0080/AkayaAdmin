"use client";

import clsx from "clsx";
import { useRef } from "react";

export interface TabDef {
  id: string;
  label: string;
  count?: number;
}

/// WAI-ARIA tabs: arrow keys move, Home/End jump; the panel is rendered by
/// the caller with id `tabpanel-{id}`.
export function Tabs({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabDef[];
  value: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function move(to: number) {
    const i = (to + tabs.length) % tabs.length;
    onChange(tabs[i].id);
    refs.current[i]?.focus();
  }
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line">
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={active}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(i + 1);
              else if (e.key === "ArrowLeft") move(i - 1);
              else if (e.key === "Home") move(0);
              else if (e.key === "End") move(tabs.length - 1);
              else return;
              e.preventDefault();
            }}
            className={clsx(
              "-mb-px inline-flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors",
              active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
            {typeof t.count === "number" ? (
              <span className="tabular rounded-sm bg-raised px-1.5 text-2xs text-fg-muted">{t.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
