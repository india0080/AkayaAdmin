"use client";

import { callAdmin } from "@/lib/api";
import { useCallable } from "@/lib/useCallable";
import type { CosState, Telemetry, VersionRow } from "./logic";

/// Everything the console needs in one read (published, draft, profiles, experiments).
export function useCosState(skip = false) {
  return useCallable<CosState>("adminCos", skip ? null : { action: "get" });
}

export function useCosHistory(target: string, skip = false) {
  return useCallable<{ target: string; rows: VersionRow[] }>("adminCos", skip ? null : { action: "history", target, limit: 50 });
}

export function useCosTelemetry(days: number, skip = false) {
  return useCallable<Telemetry>("adminCos", skip ? null : { action: "telemetry", days });
}

/// The ONE write path. Every call is audited server-side with the operator's reason.
export function cosCall<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}) {
  return callAdmin<T>("adminCos", { action, ...payload });
}

export interface ValidateResult {
  valid: boolean;
  message: string | null;
  changes: { field: string; from: string; to: string }[];
  risky: string[];
}
