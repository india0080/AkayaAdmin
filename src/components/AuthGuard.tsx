"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SessionProvider, useSession } from "@/lib/session";
import { BrandMark } from "@/shell/Brand";
import { Button } from "@/ui/Button";
import { Spinner } from "@/ui/States";

/// Gate for everything under /dashboard. Resolves the admin session
/// (adminIam `me`: roles + permissions, or the legacy fallback) and only
/// renders the console for an ACTIVE admin. Fail-closed: any state other
/// than "ready" renders no console content.
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Gate>{children}</Gate>
    </SessionProvider>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { state, retry, signOutNow } = useSession();

  useEffect(() => {
    if (state.status === "signed-out") router.replace("/login");
    if (state.status === "denied") {
      void signOutNow().then(() => router.replace("/login?denied=1"));
    }
  }, [state.status, router, signOutNow]);

  if (state.status === "ready") return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-4 text-center">
      <span className="text-accent">
        <BrandMark size={36} />
      </span>
      {state.status === "error" ? (
        <>
          <p className="text-md font-semibold text-fg">Could not verify your admin access</p>
          <p className="max-w-sm text-sm text-fg-muted">{state.message}</p>
          <div className="flex gap-2">
            <Button variant="primary" icon="refresh" onClick={retry}>
              Try again
            </Button>
            <Button variant="secondary" onClick={() => void signOutNow()}>
              Sign out
            </Button>
          </div>
        </>
      ) : (
        <span className="flex items-center gap-2 text-sm text-fg-muted">
          <Spinner size={16} /> Verifying access…
        </span>
      )}
    </div>
  );
}
