"use client";

import { useCan } from "@/lib/session";
import { ErrorState, Notice, PageHeader, Skeleton } from "@/ui";
import { TargetForm } from "./TargetForm";
import { useRegistry } from "./useConfig";

export default function ToolsPage() {
  const can = useCan();
  const reg = useRegistry();
  if (reg.error) return <ErrorState message={reg.error.message} onRetry={reg.reload} />;
  return (
    <>
      <PageHeader title="Device Tools" description="Actions the assistant can take on the phone. Disabling one removes it for every user." />
      <div className="mb-4">
        <Notice tone="warning" title="Takes effect at the next app start">
          The app applies this list when it starts. Re-enabling a tool also needs a restart before it comes back.
        </Notice>
      </div>
      {!reg.data ? (
        <Skeleton className="h-60 w-full" />
      ) : (
        <TargetForm registry={reg.data} target="tools" title="Disabled tools" canEdit={can("ai.behaviour.configure")} />
      )}
    </>
  );
}
