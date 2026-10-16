"use client";

import { ConfirmAction } from "@/ui";
import { ENVIRONMENT } from "@/lib/firebase";
import { isDangerous, showValue, type Registry, type Snapshot, type Target } from "./logic";

/// The one confirmation for every config change: lists each field before →
/// after, escalates to a typed confirmation when any change pulls a kill
/// switch, and applies with the version the operator was looking at.
export function ChangeConfirm({
  open,
  onClose,
  registry,
  target,
  current,
  patch,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  registry: Registry;
  target: Target;
  current: Snapshot;
  patch: Snapshot;
  onApply: (reason: string) => Promise<void>;
}) {
  const label = (k: string) =>
    registry.flags.find((f) => f.key === k)?.label ?? registry.fields.find((f) => f.key === k)?.label ?? k;
  const keys = Object.keys(patch);
  const danger = keys.filter((k) => isDangerous(registry, target, k, current[k] ?? null, patch[k]));
  return (
    <ConfirmAction
      open={open}
      onClose={onClose}
      title={danger.length ? "Apply a kill-switch change" : "Apply configuration change"}
      level={danger.length ? "typed" : "reason"}
      phrase={danger.length ? "APPLY" : undefined}
      danger={danger.length > 0}
      confirmLabel={ENVIRONMENT === "emulator" ? "Apply to local emulator" : "Apply to production"}
      impact={
        <>
          <ul className="space-y-0.5">
            {keys.map((k) => (
              <li key={k}>
                <strong>{label(k)}</strong>: {showValue(current[k])} → {showValue(patch[k])}
                {danger.includes(k) ? <span className="ml-1 font-semibold text-danger">(affects every user now)</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-1">The app picks this up on its next config read. The change is versioned and can be rolled back.</p>
        </>
      }
      onConfirm={onApply}
    />
  );
}
