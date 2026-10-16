"use client";

import clsx from "clsx";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/session";
import { Notice, PermissionDenied } from "@/ui/States";
import { ToastProvider } from "@/ui/Toast";
import { CommandPalette, rememberRecent } from "./CommandPalette";
import { breadcrumbs, findRoute, visibleNav } from "./nav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

const COLLAPSE_KEY = "akaya-console-sidebar-collapsed";

/// Desktop-first console frame: persistent grouped sidebar (collapsible to
/// an icon rail), sticky top bar, content region. Below 1024px the sidebar
/// becomes an overlay drawer.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session, can } = useSession();
  const nav = useMemo(() => visibleNav(can), [can]);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Route guard + recents. The guard is UX only: the server refuses the
  // underlying reads/writes regardless.
  const hit = findRoute(pathname);
  const allowed = !hit || can(hit.route.permission);
  const hitHref = hit?.route.href;
  useEffect(() => {
    if (hitHref && allowed) rememberRecent(hitHref);
  }, [hitHref, allowed]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

  const content = !allowed ? (
    <div className="p-6">
      <PermissionDenied permission={hit?.route.permission} />
    </div>
  ) : (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
  );

  return (
    <ToastProvider>
      <div className="flex min-h-screen bg-canvas">
        {/* Desktop sidebar */}
        <aside
          className={clsx(
            "sticky top-0 hidden h-screen shrink-0 border-r border-line bg-sidebar transition-[width] lg:block",
            collapsed ? "w-16" : "w-60",
          )}
        >
          <Sidebar groups={nav} collapsed={collapsed} />
        </aside>

        {/* Tablet/mobile drawer */}
        {mobileOpen ? (
          <div className="fixed inset-0 z-overlay lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-scrim/45"
              onClick={() => setMobileOpen(false)}
            />
            <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-line bg-sidebar shadow-overlay">
              <Sidebar groups={nav} collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </aside>
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar
            crumbs={breadcrumbs(pathname)}
            onMenu={() => setMobileOpen(true)}
            onCollapse={toggleCollapsed}
            collapsed={collapsed}
            onSearch={() => setPaletteOpen(true)}
          />
          {session?.degraded ? (
            <div className="px-4 pt-4 sm:px-6 lg:px-8">
              <Notice tone="warning" title="Running without role checks in the console">
                The role service (adminIam) is not deployed on this backend yet, so the console shows every page.
                The server still enforces its own checks.
              </Notice>
            </div>
          ) : null}
          <main id="main" className="min-w-0 flex-1">
            {content}
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} nav={nav} />
    </ToastProvider>
  );
}


