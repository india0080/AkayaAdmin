"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/ui/Icon";
import { BrandLockup } from "./Brand";
import { SidebarFooter } from "./SidebarFooter";
import { findRoute, type NavGroup } from "./nav";

const OPEN_KEY = "akaya-console-nav-open";

/// Grouped navigation: domain groups collapse, the active group opens, so the
/// sidebar never becomes a 40-item wall. Which groups are open is a
/// per-operator convenience (localStorage).
export function Sidebar({
  groups,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = findRoute(pathname, groups);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      setOpen(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}"));
    } catch {
      /* ignore */
    }
  }, []);

  function toggle(id: string) {
    setOpen((o) => {
      const next = { ...o, [id]: !(o[id] ?? id === active?.group.id) };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <nav aria-label="Console" className="flex h-full flex-col">
      <div className={clsx("flex h-14 shrink-0 items-center border-b border-line", collapsed ? "justify-center" : "px-4")}>
        <Link href="/dashboard" onClick={onNavigate} aria-label="Akaya Console home" className="rounded-lg">
          <BrandLockup collapsed={collapsed} />
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-0.5">
          {groups.map((g) => {
            const isActiveGroup = active?.group.id === g.id;
            const single = g.routes.length === 1;
            const isOpen = open[g.id] ?? isActiveGroup;

            if (collapsed || single) {
              const target = g.routes[0];
              const isActive = isActiveGroup && (single || active?.route.href === target.href);
              return (
                <li key={g.id}>
                  <Link
                    href={target.href}
                    onClick={onNavigate}
                    title={collapsed ? (single ? target.label : g.label) : undefined}
                    aria-current={isActive ? "page" : undefined}
                    data-active={isActiveGroup}
                    className={clsx(
                      "ui-nav group relative flex h-9 items-center gap-3 rounded-md text-sm font-medium transition-colors",
                      collapsed ? "justify-center" : "px-2.5",
                      isActiveGroup ? "bg-accent-soft text-fg" : "text-fg-muted hover:bg-raised hover:text-fg",
                    )}
                  >
                    {isActiveGroup ? (
                      <span aria-hidden className="ui-nav-bar absolute left-0 top-1.5 h-6 w-[3px] rounded-r bg-accent" />
                    ) : null}
                    <Icon name={g.icon} size={18} className={isActiveGroup ? "text-accent-text" : ""} />
                    {!collapsed ? <span className="truncate">{single ? target.label : g.label}</span> : null}
                  </Link>
                </li>
              );
            }

            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => toggle(g.id)}
                  aria-expanded={isOpen}
                  data-active={isActiveGroup}
                  className={clsx(
                    "ui-nav flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm font-medium transition-colors",
                    isActiveGroup ? "text-fg" : "text-fg-muted hover:bg-raised hover:text-fg",
                  )}
                >
                  <Icon name={g.icon} size={18} className={isActiveGroup ? "text-accent-text" : ""} />
                  <span className="flex-1 truncate text-left">{g.label}</span>
                  <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={14} className="opacity-60" />
                </button>
                {isOpen ? (
                  <ul className="mb-1 ml-[21px] mt-0.5 space-y-0.5 border-l border-line pl-2">
                    {g.routes.map((r) => {
                      const isActive = active?.route.href === r.href;
                      return (
                        <li key={r.href}>
                          <Link
                            href={r.href}
                            onClick={onNavigate}
                            aria-current={isActive ? "page" : undefined}
                            data-active={isActive}
                            className={clsx(
                              "ui-subnav flex h-8 items-center rounded-md px-2.5 text-sm transition-colors",
                              isActive
                                ? "bg-accent-soft font-medium text-fg"
                                : "text-fg-muted hover:bg-raised hover:text-fg",
                            )}
                          >
                            <span className="truncate">{r.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
      <SidebarFooter collapsed={collapsed} />
    </nav>
  );
}
