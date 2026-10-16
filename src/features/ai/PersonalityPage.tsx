"use client";

import Link from "next/link";
import { useCan } from "@/lib/session";
import { ErrorState, Icon, Notice, PageHeader, Skeleton } from "@/ui";
import { TargetForm } from "../config/TargetForm";
import { useRegistry } from "../config/useConfig";

export default function PersonalityPage() {
  const can = useCan();
  const reg = useRegistry();
  if (reg.error) return <ErrorState message={reg.error.message} onRetry={reg.reload} />;
  return (
    <>
      <PageHeader
        title="Personality"
        description="The assistant's name and global system prompt. Versioned: every change needs a reason and can be rolled back."
        actions={
          <Link href="/dashboard/config-history" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
            <Icon name="history" size={16} /> History
          </Link>
        }
      />
      <div className="mb-4">
        <Notice tone="info">
          Only the fields the app reads are shown. The old page also saved age, tagline, language, voice style, typing speed and a greeting;
          the app ignores those, so they are left untouched in the document.
        </Notice>
      </div>
      {!reg.data ? <Skeleton className="h-80 w-full" /> : (
        <TargetForm registry={reg.data} target="personality" title="Global personality" canEdit={can("ai.behaviour.configure")} />
      )}
    </>
  );
}
