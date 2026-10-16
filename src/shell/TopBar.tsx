"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { ENVIRONMENT, PROJECT_ID } from "@/lib/firebase";
import { roleLabel } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { Icon } from "@/ui/Icon";
import { IconButton } from "@/ui/Button";
import type { Crumb } from "./nav";
import { applyPref, DEFAULT_PREF, readPref, THEME_CYCLE, type ThemePref } from "./theme";

export function EnvBadge() {
  const prod = ENVIRONMENT === "production";
  const emu = ENVIRONMENT === "emulator";
  return (
    <span
      title={`Firebase project: ${PROJECT_ID}`}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider",
        prod && "border-danger/40 bg-danger-soft text-danger",
        emu && "border-success/40 bg-success-soft text-success",
        !prod && !emu && "border-warning/40 bg-warning-soft text-warning",
      )}
    >
      <span aria-hidden className={clsx("h-1.5 w-1.5 rounded-full", prod ? "bg-danger" : emu ? "bg-success" : "bg-warning")} />
      {prod ? "Production" : emu ? "Local emulator" : PROJECT_ID}
    </span>
  );
}

function ThemeControl() {
  const [pref, setPref] = useState<ThemePref>(DEFAULT_PREF);
  useEffect(() => setPref(readPref()), []);
  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPref("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);
  const order = THEME_CYCLE;
  const icon = pref === "light" ? "sun" : pref === "dark" ? "moon" : pref === "rose" ? "sparkles" : "monitor";
  const next = order[(order.indexOf(pref) + 1) % order.length];
  const name = (p: ThemePref) => (p === "light" ? "Akaya Light" : p === "rose" ? "Rose" : p[0].toUpperCase() + p.slice(1));
  return (
    <IconButton
      icon={icon}
      label={`Theme: ${name(pref)}. Switch to ${name(next)}`}
      onClick={() => {
        applyPref(next);
        setPref(next);
      }}
    />
  );
}

function AccountMenu() {
  const { session, signOutNow } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  if (!session) return null;
  const initial = (session.email || "?").slice(0, 1).toUpperCase();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-md pl-1 pr-2 hover:bg-raised"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-text">
          {initial}
        </span>
        <span className="hidden max-w-[160px] truncate text-sm text-fg lg:block">{session.email}</span>
        <Icon name="chevron-down" size={14} className="text-fg-subtle" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-11 z-overlay w-72 rounded-lg border border-line bg-panel p-1 shadow-overlay">
          <div className="border-b border-line px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-fg">{session.email}</p>
            <p className="mt-1 flex flex-wrap gap-1">
              {session.roles.map((r) => (
                <span key={r} className="rounded-sm bg-raised px-1.5 py-px text-2xs font-semibold text-fg-muted">
                  {roleLabel(r)}
                </span>
              ))}
              {session.legacy ? (
                <span className="rounded-sm bg-warning-soft px-1.5 py-px text-2xs font-semibold text-warning" title="Admin record has no explicit roles yet">
                  Legacy grant
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOutNow()}
            className="mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-fg hover:bg-raised"
          >
            <Icon name="log-out" size={16} /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TopBar({
  crumbs,
  onMenu,
  onCollapse,
  collapsed,
  onSearch,
}: {
  crumbs: Crumb[];
  onMenu: () => void;
  onCollapse: () => void;
  collapsed: boolean;
  onSearch: () => void;
}) {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return (
    <header className="sticky top-0 z-top flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel/95 px-3 backdrop-blur sm:px-4">
      <IconButton icon="menu" label="Open navigation" onClick={onMenu} className="lg:hidden" />
      <IconButton
        icon={collapsed ? "chevron-right" : "chevron-left"}
        label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={onCollapse}
        className="hidden lg:inline-flex"
      />
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex min-w-0 items-center gap-1.5 text-sm">
          {crumbs.map((c, i) => (
            <li key={i} className="flex min-w-0 items-center gap-1.5">
              {i > 0 ? <Icon name="chevron-right" size={14} className="shrink-0 text-fg-subtle" /> : null}
              <span
                aria-current={i === crumbs.length - 1 ? "page" : undefined}
                className={clsx("truncate", i === crumbs.length - 1 ? "font-semibold text-fg" : "text-fg-muted")}
              >
                {c.label}
              </span>
            </li>
          ))}
        </ol>
      </nav>
      <button
        type="button"
        onClick={onSearch}
        className="hidden h-9 w-64 items-center gap-2 rounded-md border border-line bg-canvas px-3 text-sm text-fg-subtle hover:border-line-strong md:flex"
      >
        <Icon name="search" size={16} />
        <span className="flex-1 text-left">Jump to…</span>
        <kbd className="rounded border border-line px-1.5 text-2xs">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <IconButton icon="search" label="Jump to a page" onClick={onSearch} className="md:hidden" />
      <EnvBadge />
      <ThemeControl />
      <AccountMenu />
    </header>
  );
}
