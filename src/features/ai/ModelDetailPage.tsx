"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Badge, Button, ConfirmAction, EmptyState, ErrorState, Icon, Notice, PageHeader, Panel,
  Select, Skeleton, Stat, StatStrip, StatusPill, Switch, useToast,
} from "@/ui";
import {
  STATUS_LABEL, catalogStatus, contextLabel, priceLabel, type CatalogModel, type CatalogResponse,
} from "./logic";

const STATUS_TONE: Record<ReturnType<typeof catalogStatus>, "ok" | "degraded" | "down" | "off" | "unknown"> = {
  live: "ok", "not-listed": "unknown", "circuit-open": "down", unavailable: "degraded", disabled: "off",
};

export default function ModelDetailPage() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const can = useCan();
  const toast = useToast();
  const q = useCallable<CatalogResponse>("adminModels", id ? { action: "list" } : null);
  const [confirm, setConfirm] = useState<null | "enable" | "disable" | "tier">(null);
  const [tierDraft, setTierDraft] = useState<"none" | "silver" | "gold">("none");
  const model = useMemo(() => q.data?.models.find((m) => m.modelId === id) ?? null, [q.data, id]);

  if (!id) {
    return <EmptyState title="No model selected" action={<Link href="/dashboard/openrouter" className="text-accent-text underline">Back to catalog</Link>} />;
  }
  if (q.error && !q.data) {
    return (
      <>
        <BackLink />
        <ErrorState message={q.error.message} onRetry={q.reload} />
      </>
    );
  }
  if (q.data && !model) {
    return (
      <>
        <BackLink />
        <ErrorState title="Model not found" message={`No model with id "${id}" in the synced catalog.`} />
      </>
    );
  }

  const s = model ? catalogStatus(model) : null;
  const canEdit = can("ai.models.configure");
  return (
    <>
      <BackLink />
      <PageHeader
        title={model?.name ?? "Loading…"}
        description={model ? <code className="font-mono text-xs">{model.modelId}</code> : undefined}
        meta={model && s ? <StatusPill status={STATUS_TONE[s]} label={STATUS_LABEL[s]} /> : null}
        actions={<Button icon="refresh" onClick={q.reload} loading={q.refreshing}>Refresh</Button>}
      />

      {!model ? (
        <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-40 w-full" /></div>
      ) : (
        <>
          <StatStrip className="mb-4">
            <Stat label="Context window" value={contextLabel(model.contextLength)} />
            <Stat label="Tier required" value={model.tierRequired ?? "Any paid"} />
            <Stat label="Price / M tokens" value={priceLabel(model)} />
          </StatStrip>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Model Info" description="Upstream metadata from the last catalog sync.">
              <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
                <dt className="text-fg-muted">Model ID</dt>
                <dd className="break-all font-mono text-xs">{model.modelId}</dd>
                <dt className="text-fg-muted">Display name</dt>
                <dd>{model.name}</dd>
                <dt className="text-fg-muted">Upstream</dt>
                <dd>{model.available ? "Available" : `Unavailable${model.availabilityReason ? ` — ${model.availabilityReason}` : ""}`}</dd>
                <dt className="text-fg-muted">Circuit</dt>
                <dd>{model.health ? `${model.health.circuit} · ${model.health.consecutiveFailures} failures` : "No traffic"}</dd>
                <dt className="text-fg-muted">Capabilities</dt>
                <dd className="flex flex-wrap gap-1">
                  {model.vision && <Badge>vision</Badge>}
                  {model.tools && <Badge>tools</Badge>}
                  {model.reasoning && <Badge>reasoning</Badge>}
                  {model.audioIn && <Badge>audio</Badge>}
                  {!model.textOut && <Badge tone="warning">no text out</Badge>}
                  {model.free && <Badge tone="accent">free</Badge>}
                </dd>
              </dl>
            </Panel>
            <Panel title="Configuration" description={canEdit ? "Toggle availability and tier gating." : "View-only for your role."}>
              <div className="space-y-4">
                <Switch
                  label={model.enabled ? "Model enabled — gateway serves it" : "Model disabled — gateway blocks it"}
                  checked={model.enabled}
                  disabled={!canEdit}
                  onChange={(next) => setConfirm(next ? "enable" : "disable")}
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-fg-muted">Plan access</p>
                  <Select
                    aria-label="Tier required"
                    value={model.tierRequired ?? "none"}
                    disabled={!canEdit}
                    onChange={(e) => {
                      setTierDraft(e.target.value as "none" | "silver" | "gold");
                      setConfirm("tier");
                    }}
                  >
                    <option value="none">Any paid plan</option>
                    <option value="silver">Silver and Gold</option>
                    <option value="gold">Gold only</option>
                  </Select>
                </div>
                {s === "not-listed" && (
                  <Notice tone="info">This model has no <code>enabled</code> field. Enable it to list it in the app picker.</Notice>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}
      {model && (
        <>
          <ConfirmAction
            open={confirm === "disable"}
            onClose={() => setConfirm(null)}
            title={`Disable ${model.modelId}`}
            level="reason"
            danger
            confirmLabel="Disable"
            impact={<>The gateway stops serving this model for every user, including direct requests. Routes using it fall through to their fallbacks.</>}
            onConfirm={async (reason) => {
              await callAdmin("adminModels", { action: "setModel", modelId: model.modelId, enabled: false, reason });
              toast.success("Disabled", "Takes effect within a minute.");
              q.reload();
            }}
          />
          <ConfirmAction
            open={confirm === "enable"}
            onClose={() => setConfirm(null)}
            title={`Enable ${model.modelId}`}
            level="confirm"
            confirmLabel="Enable"
            impact={<>The model becomes servable and appears in the app picker (if available upstream).</>}
            onConfirm={async () => {
              await callAdmin("adminModels", { action: "setModel", modelId: model.modelId, enabled: true });
              toast.success("Enabled", "Visible in the picker within 10 minutes.");
              q.reload();
            }}
          />
          <ConfirmAction
            open={confirm === "tier"}
            onClose={() => setConfirm(null)}
            title={`Change plan access for ${model.modelId}`}
            level="reason"
            confirmLabel="Apply"
            impact={
              tierDraft === "none"
                ? <>Every paid plan may use this model.</>
                : <>Users below {tierDraft} are routed to another model instead.</>
            }
            onConfirm={async (reason) => {
              const tierRequired = tierDraft === "none" ? null : tierDraft;
              await callAdmin("adminModels", { action: "setModel", modelId: model.modelId, tierRequired, reason });
              toast.success("Saved", "Gateway picks this up within a minute.");
              q.reload();
            }}
          />
        </>
      )}
    </>
  );
}
function BackLink() {
  return (
    <Link href="/dashboard/openrouter" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
      <Icon name="chevron-left" size={16} /> Cloud Model Catalog
    </Link>
  );
}
