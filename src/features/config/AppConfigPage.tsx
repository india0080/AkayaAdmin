"use client";

import Link from "next/link";
import { useCan } from "@/lib/session";
import { ErrorState, Icon, Notice, PageHeader, Skeleton } from "@/ui";
import { TargetForm } from "./TargetForm";
import { useRegistry, useTarget } from "./useConfig";

export default function AppConfigPage() {
  const can = useCan();
  const reg = useRegistry();
  const appQ = useTarget("app");
  if (reg.error) return <ErrorState message={reg.error.message} onRetry={reg.reload} />;
  return (
    <>
      <PageHeader
        title="App Config"
        description="Release, maintenance, announcements, global AI switches and usage limits. Every change is versioned with a reason and can be rolled back."
        actions={
          <Link href="/dashboard/config-history" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
            <Icon name="history" size={16} /> History
          </Link>
        }
      />
      {!reg.data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-4">
          <TargetForm
            registry={reg.data}
            target="app"
            query={appQ}
            title="Release & maintenance"
            description="Maintenance, forced updates and the home banner."
            canEdit={can("config.modify")}
            only={["maintenanceMode", "maintenanceMessage", "minVersion", "announcementVisible", "announcementBanner"]}
          />
          <TargetForm
            registry={reg.data}
            target="app"
            query={appQ}
            title="Global switches"
            description="Whole-product switches. Turning AI off is a kill switch."
            canEdit={can("config.modify")}
            only={["onlineAiEnabled", "offlineAiEnabled", "connected_apps_enabled"]}
          />
          <TargetForm
            registry={reg.data}
            target="limits"
            title="Limits & quotas"
            description="What the chat, search and fetch gateways enforce per day. -1 = unlimited."
            canEdit={can("config.limits")}
          />
          <Notice tone="info">The HuggingFace token for model downloads is managed on <Link className="underline" href="/dashboard/providers">Providers &amp; Keys</Link>.</Notice>
        </div>
      )}
    </>
  );
}
