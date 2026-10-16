"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCan } from "@/lib/session";
import { ErrorState, Icon, Notice, PageHeader, Skeleton } from "@/ui";
import { TargetForm } from "../config/TargetForm";
import { useRegistry, useTarget } from "../config/useConfig";
import { ModelDatalist, useCatalog } from "./useCatalog";

const CLASS_HELP: Record<string, string> = {
  chatFast: "Quick chat turns and Floating Insert drafts. Latency matters most.",
  chatQuality: "Longer, higher-stakes chat answers.",
  code: "Code generation, explanation and fixes.",
  vision: "Questions about an image.",
  reasoning: "Multi-step reasoning.",
  translation: "Translation requests.",
  longContext: "Very long inputs (documents).",
  creative: "Creative writing.",
  imageGen: "Image generation. Only the primary is read (by the server).",
};

export default function RoutingPage() {
  const can = useCan();
  const reg = useRegistry();
  const routingQ = useTarget("routing");
  const catalog = useCatalog();
  const canApply = can("ai.routing.activate");

  const classes = useMemo(() => {
    const seen: string[] = [];
    for (const f of reg.data?.fields ?? []) if (f.target === "routing" && f.group && !seen.includes(f.group)) seen.push(f.group);
    return seen;
  }, [reg.data]);

  if (reg.error) return <ErrorState message={reg.error.message} onRetry={reg.reload} />;
  return (
    <>
      <PageHeader
        title="Routing & Fallbacks"
        description="Which cloud model answers each kind of request, and what the gateway tries when it fails. Versioned: every apply needs a reason and can be rolled back."
        actions={
          <Link href="/dashboard/config-history" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
            <Icon name="history" size={16} /> History
          </Link>
        }
      />
      <ModelDatalist data={catalog.data} />
      <div className="mb-4 space-y-3">
        {catalog.error ? <Notice tone="warning">Could not load the model catalog, so ids are not checked here. The server still refuses unknown or disabled models.</Notice> : null}
        <Notice tone="info">
          The app refreshes routes every 10 minutes; the gateway&apos;s fallback chains every 5. Models must exist in the{" "}
          <Link className="underline" href="/dashboard/openrouter">synced catalog</Link> and not be disabled.
        </Notice>
      </div>
      {!reg.data ? <Skeleton className="h-96 w-full" /> : (
        <div className="space-y-4">
          <TargetForm
            registry={reg.data}
            target="fallbacks"
            title="Gateway fallback chains"
            description="Tried after the requested model fails. Disabled, dead or unsuitable entries are skipped and the chain is topped up from the catalog."
            canEdit={canApply}
            catalog={catalog.ids}
          />
          <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">Routes by request type</h2>
          {classes.map((cls) => (
            <TargetForm
              key={cls}
              registry={reg.data!}
              target="routing"
              query={routingQ}
              title={reg.data!.fields.find((f) => f.key === `${cls}.primary`)?.readBy?.startsWith("functions") ? `${cls} (server)` : cls}
              description={CLASS_HELP[cls] ?? ""}
              canEdit={canApply}
              catalog={catalog.ids}
              only={[`${cls}.primary`, `${cls}.fallbacks`, `${cls}.offlineCapable`]}
            />
          ))}
        </div>
      )}
    </>
  );
}
