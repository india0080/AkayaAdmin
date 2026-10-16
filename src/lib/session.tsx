"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { AdminApiError, callAdmin } from "@/lib/api";
import { hasPermission, type Permission } from "@/lib/permissions";
import { resolveVerifiedAdmin } from "@/lib/sessionResolution";
import { DEMO_MODE } from "@/lib/demo/flag";

export interface AdminSession {
  uid: string;
  email: string;
  roles: string[];
  permissions: string[];
  /// Admin doc predates roles — resolved to super_admin by the server.
  legacy: boolean;
  /// Reserved for a server-provided restricted session mode.
  degraded: boolean;
}

type State =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "denied"; email: string }
  | { status: "error"; message: string }
  | { status: "ready"; session: AdminSession };

interface SessionContextValue {
  state: State;
  session: AdminSession | null;
  can: (p: Permission) => boolean;
  retry: () => void;
  signOutNow: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

interface MeResponse {
  uid: string;
  email: string;
  roles: string[];
  permissions: string[];
  legacy: boolean;
}

/// Resolves the signed-in user's admin session. Returns null when the user
/// is not an (active) admin. Throws AdminApiError for transient failures.
export async function resolveSession(user: User): Promise<AdminSession | null> {
  return resolveVerifiedAdmin(() => callAdmin<MeResponse>("adminIam", { action: "me" }), user.email);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [nonce, setNonce] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    if (DEMO_MODE) {
      // Dev-only sample session (never in a production build; see demo/flag.ts).
      setState({ status: "ready", session: { uid: "demo", email: "demo@akaya.one", roles: ["super_admin"], permissions: ["*"], legacy: false, degraded: false } });
      return;
    }
    let deadline: ReturnType<typeof setTimeout>;
    const watch = (mine: number) => {
      clearTimeout(deadline);
      deadline = setTimeout(() => {
        if (mine !== generation.current) return;
        generation.current++;
        setState({ status: "error", message: "Access verification timed out. Check your connection and try again." });
      }, 30_000);
    };
    setState({ status: "loading" });
    watch(++generation.current);
    // Every auth event bumps the generation; a slow resolve for a previous
    // user can neither admit nor eject the current one.
    const unsub = onAuthStateChanged(auth, (user) => {
      const mine = ++generation.current;
      clearTimeout(deadline);
      if (!user) {
        setState({ status: "signed-out" });
        return;
      }
      setState({ status: "loading" });
      watch(mine);
      resolveSession(user)
        .then((session) => {
          if (mine !== generation.current) return;
          clearTimeout(deadline);
          setState(session ? { status: "ready", session } : { status: "denied", email: user.email ?? "" });
        })
        .catch((e: AdminApiError) => {
          if (mine !== generation.current) return;
          clearTimeout(deadline);
          setState({ status: "error", message: e.message });
        });
    });
    return () => {
      clearTimeout(deadline);
      generation.current++;
      unsub();
    };
  }, [nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  const signOutNow = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo<SessionContextValue>(() => {
    const session = state.status === "ready" ? state.session : null;
    return {
      state,
      session,
      can: (p) => !!session && hasPermission(session.permissions, p),
      retry,
      signOutNow,
    };
  }, [state, retry, signOutNow]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession must be used inside <SessionProvider>");
  return v;
}

/// Convenience: `const can = useCan(); can("users.modify")`.
export function useCan(): (p: Permission) => boolean {
  return useSession().can;
}
