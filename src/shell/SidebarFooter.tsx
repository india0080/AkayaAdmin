"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/ui/Icon";
import { useSession } from "@/lib/session";
import { applyPref, DEFAULT_PREF, readPref, THEME_CYCLE, type ThemePref } from "./theme";

const NAME: Record<ThemePref, string> = { light: "Akaya Light", dark: "Dark", rose: "Rose", system: "System" };
const ICON: Record<ThemePref, string> = { light: "sun", dark: "moon", rose: "sparkles", system: "monitor" };

/// Bottom of the sidebar, shown by the Rose theme only (CSS hides it elsewhere):
/// the theme pill and the signed-in operator, like the reference dashboard.
export function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { session } = useSession();
  const [pref, setPref] = useState<ThemePref>(DEFAULT_PREF);
  useEffect(() => setPref(readPref()), []);
  if (collapsed) return null;
  const next = THEME_CYCLE[(THEME_CYCLE.indexOf(pref) + 1) % THEME_CYCLE.length];
  const email = session?.email ?? "";
  return (
    <div className="ui-sidefoot">
      <button
        type="button"
        onClick={() => {
          applyPref(next);
          setPref(next);
        }}
        aria-label={`Theme: ${NAME[pref]}. Switch to ${NAME[next]}`}
        className="flex h-8 items-center gap-2 rounded-full border border-line bg-panel px-3 text-xs font-medium text-fg-muted hover:text-fg"
      >
        <Icon name={ICON[pref]} size={14} />
        {NAME[pref]}
      </button>
      {session ? (
        <div className="ui-sidefoot-user">
          <span className="ui-sidefoot-avatar">{(email || "?").slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold text-fg">{email.split("@")[0]}</span>
            <span className="block truncate text-xs text-fg-muted">{email}</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}
