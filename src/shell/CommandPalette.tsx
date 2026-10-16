"use client";

import clsx from "clsx";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/ui/Icon";
import { searchNav, type NavGroup, type NavRoute } from "./nav";

const RECENT_KEY = "akaya-console-recent";

export function rememberRecent(href: string) {
  try {
    const prev: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    const next = [href, ...prev.filter((h) => h !== href)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/// Ctrl/⌘+K: jump anywhere the admin is allowed to go. Navigation only —
/// no destructive command is reachable from here (entity search arrives
/// with the Customers domain).
export function CommandPalette({
  open,
  onClose,
  nav,
}: {
  open: boolean;
  onClose: () => void;
  nav: NavGroup[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      setQ("");
      setCursor(0);
      el.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    if (!open && el.open) el.close();
  }, [open]);

  const results = useMemo(() => {
    const hits = searchNav(q, nav);
    if (q.trim()) return hits.map((h) => ({ route: h.route, group: h.group.label, recent: false }));
    const recent = readRecent();
    const byHref = new Map(hits.map((h) => [h.route.href, h] as const));
    const recentHits = recent.map((h) => byHref.get(h)).filter(Boolean) as typeof hits;
    const rest = hits.filter((h) => !recent.includes(h.route.href));
    return [
      ...recentHits.map((h) => ({ route: h.route, group: h.group.label, recent: true })),
      ...rest.map((h) => ({ route: h.route, group: h.group.label, recent: false })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, nav, open]);

  function go(route: NavRoute) {
    rememberRecent(route.href);
    onClose();
    router.push(route.href);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Command palette"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="mx-auto mt-[12vh] w-[calc(100vw-32px)] max-w-xl rounded-xl border border-line bg-panel p-0 text-fg shadow-overlay"
    >
      {open ? (
        <div>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Icon name="search" size={18} className="text-fg-subtle" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setCursor(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setCursor((c) => Math.min(c + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setCursor((c) => Math.max(c - 1, 0));
                } else if (e.key === "Enter" && results[cursor]) {
                  e.preventDefault();
                  go(results[cursor].route);
                }
              }}
              role="combobox"
              aria-expanded
              aria-controls="palette-list"
              aria-activedescendant={results[cursor] ? `pal-${cursor}` : undefined}
              placeholder="Jump to a page…"
              className="h-12 flex-1 bg-transparent text-base text-fg placeholder:text-fg-subtle focus:outline-none"
            />
            <kbd className="rounded border border-line px-1.5 text-2xs text-fg-subtle">Esc</kbd>
          </div>
          <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
            {results.length === 0 ? (
              <li className="px-3 py-8 text-center text-sm text-fg-muted">No page matches “{q}”.</li>
            ) : (
              results.map((r, i) => (
                <li
                  key={r.route.href}
                  id={`pal-${i}`}
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r.route)}
                  className={clsx(
                    "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm",
                    i === cursor ? "bg-raised text-fg" : "text-fg-muted",
                  )}
                >
                  <Icon name={r.recent ? "history" : r.route.icon} size={16} />
                  <span className="flex-1 truncate text-fg">{r.route.label}</span>
                  <span className="truncate text-xs text-fg-subtle">{r.group}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </dialog>
  );
}
