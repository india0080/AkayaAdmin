// Theme preference — per operator, stored in localStorage (a convenience).
// Nothing stored (a new browser, or storage blocked) = Akaya's warm Light theme;
// an operator who picked Light, Dark or System keeps that choice. Pure resolve()
// is unit-tested.
//
// "rose" is navy-black + hot pink. "system" only ever picks light or dark.
export type ThemePref = "light" | "dark" | "rose" | "system";
export type ResolvedTheme = "light" | "dark" | "rose";

export const THEME_KEY = "akaya-console-theme";

/// What an operator with nothing saved sees.
export const DEFAULT_PREF: ThemePref = "light";

/// Order the top-bar button cycles through.
export const THEME_CYCLE: ThemePref[] = ["light", "dark", "rose", "system"];

export function resolveTheme(pref: ThemePref, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  if (pref === "rose") return "rose";
  return systemPrefersDark ? "dark" : "light";
}

export function parsePref(raw: string | null | undefined): ThemePref {
  return raw === "light" || raw === "dark" || raw === "rose" || raw === "system" ? raw : DEFAULT_PREF;
}

export function readPref(): ThemePref {
  try {
    return parsePref(localStorage.getItem(THEME_KEY));
  } catch {
    return DEFAULT_PREF;
  }
}

export function applyPref(pref: ThemePref): ResolvedTheme {
  let dark = false;
  try {
    dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    /* no matchMedia (tests) */
  }
  const resolved = resolveTheme(pref, dark);
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem(THEME_KEY, pref);
  } catch {
    /* storage blocked — preference just won't persist */
  }
  return resolved;
}
