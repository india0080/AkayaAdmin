"use client";

import { useState } from "react";
import { canChangeEnforcement } from "@/lib/permissions";
import { useCan, useSession } from "@/lib/session";
import { Badge, ConfirmAction, ErrorState, Notice, Panel, Skeleton, Switch, relativeTime, useToast } from "@/ui";
import { applyConfig, useTarget } from "../config/useConfig";
import type { Snapshot } from "../config/logic";
import {
  ENFORCEMENT_COPY,
  PRODUCTS,
  PRODUCT_NOTE,
  KILLSWITCH_NOTICE,
  versionConflictError,
  buildEnforcementPatch,
  buildProductPatch,
  enforcementConfirm,
  isVersionConflict,
  productConfirm,
  readSubscriptionConfig,
  type ProductKey,
} from "./subscriptionLogic";

type Pending = { kind: "enforcement"; next: boolean } | { kind: "product"; key: ProductKey; next: boolean } | null;

/// "Subscription enforcement" + "Subscription products" panels. Both read and
/// write adminConfig target "subscription" (versioned, audited, rollbackable).
export function SubscriptionPanels() {
  const can = useCan();
  const { session } = useSession();
  const toast = useToast();
  const q = useTarget("subscription");
  const [pending, setPending] = useState<Pending>(null);
  const canManage = can("subscription.manage");

  if (q.error) {
    return (
      <div className="mb-4">
        <ErrorState compact title="Subscription settings could not be loaded" message={q.error.message} onRetry={q.reload} />
      </div>
    );
  }
  if (!q.data) {
    return (
      <div className="mb-4 grid gap-4 lg:grid-cols-2" aria-busy="true" aria-label="Loading subscription settings">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  const version = q.data.version;
  const view = readSubscriptionConfig(q.data.snapshot);
  const required = view.subscriptionRequired;
  const canSwitch = canChangeEnforcement(session?.permissions ?? [], required);
  const needsKill = canManage && !canSwitch;
  const meta = q.data.updatedAt ? `Version ${version} · changed ${relativeTime(q.data.updatedAt)} by ${q.data.updatedByEmail ?? "unknown"}` : `Version ${version} · never changed from the console`;

  async function apply(patch: Snapshot, reason: string, done: string) {
    try {
      await applyConfig("subscription", patch, version, reason);
    } catch (e) {
      if (isVersionConflict(e)) {
        q.reload();
        throw versionConflictError();
      }
      throw e;
    }
    toast.success(done);
    q.reload();
  }

  const enforcement = pending?.kind === "enforcement" ? enforcementConfirm(pending.next) : null;
  const product = pending?.kind === "product" ? productConfirm(pending.key, pending.next) : null;

  return (
    <div className="mb-4 grid gap-4 xl:grid-cols-2">
      <Panel
        title="SUBSCRIPTION ENFORCEMENT"
        description="Master switch for whether premium access depends on a verified subscription."
      >
        <div className="space-y-3">
          <p className="break-words text-xs text-fg-muted">{meta}</p>
          <div className="flex items-start justify-between gap-4 rounded-md border border-line p-3">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium" id="sub-required-label">
                Subscription Required
                <Badge tone={required ? "success" : "warning"}>{required ? "ON" : "OFF"}</Badge>
                {view.requiredIsDefault ? <Badge>Default</Badge> : null}
              </p>
              <p className="mt-1 text-sm text-fg-muted" id="sub-required-desc" role="status">
                {required ? ENFORCEMENT_COPY.on : ENFORCEMENT_COPY.off}
              </p>
            </div>
            <Switch
              label="Subscription Required"
              describedBy="sub-required-desc"
              checked={required}
              disabled={!canSwitch}
              onChange={(next) => setPending({ kind: "enforcement", next })}
            />
          </div>
          {!canManage ? <Notice tone="info">Your role can view this setting but not change it (subscription.manage).</Notice> : null}
          {needsKill ? <Notice tone="info">{KILLSWITCH_NOTICE}</Notice> : null}
          {!required ? (
            <Notice tone="warning">Premium access is currently open to eligible users. Billing records are untouched; switch back ON to return to verified subscriptions.</Notice>
          ) : null}
        </div>
      </Panel>

      <Panel title="SUBSCRIPTION PRODUCTS" description="Purchasable only when Active here and its plan in Plans is also Active.">
        <ul className="space-y-2">
          {PRODUCTS.map((p) => {
            const active = view.products[p.key];
            return (
              <li key={p.key} className="flex items-center justify-between gap-4 rounded-md border border-line p-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {p.label}
                    <Badge tone={active ? "success" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>
                  </p>
                  <p className="text-xs text-fg-muted">{p.blurb}</p>
                </div>
                <Switch
                  label={`${p.label} active (purchasable only if its plan in Plans is also Active)`}
                  checked={active}
                  disabled={!canManage}
                  onChange={(next) => setPending({ kind: "product", key: p.key, next })}
                />
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-fg-muted">{PRODUCT_NOTE}</p>
      </Panel>

      {enforcement && pending?.kind === "enforcement" ? (
        <ConfirmAction
          open
          onClose={() => setPending(null)}
          title={enforcement.title}
          level="typed"
          phrase={enforcement.phrase}
          danger={enforcement.danger}
          confirmLabel={enforcement.confirmLabel}
          impact={<p>{enforcement.body}</p>}
          onConfirm={(reason) => apply(buildEnforcementPatch(pending.next), reason, pending.next ? "Subscription requirement enabled" : "Subscription requirement disabled")}
        />
      ) : null}
      {product && pending?.kind === "product" ? (
        <ConfirmAction
          open
          onClose={() => setPending(null)}
          title={product.title}
          level="reason"
          confirmLabel={product.confirmLabel}
          impact={<p>{product.body}</p>}
          onConfirm={(reason) => apply(buildProductPatch(pending.key, pending.next), reason, "Product availability updated")}
        />
      ) : null}
    </div>
  );
}
