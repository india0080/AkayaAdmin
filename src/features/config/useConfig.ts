"use client";

import { callAdmin } from "@/lib/api";
import { useCallable } from "@/lib/useCallable";
import type { Registry, Snapshot, Target, TargetState } from "./logic";

export function useRegistry() {
  return useCallable<Registry>("adminConfig", { action: "registry" });
}

export function useTarget(target: Target, skip = false) {
  return useCallable<TargetState>("adminConfig", skip ? null : { action: "get", target });
}

export type TargetQuery = ReturnType<typeof useTarget>;

export interface ApplyResult {
  version: number;
  changes: { field: string; from: string; to: string }[];
  dangerous: string[];
}

export function applyConfig(target: Target, patch: Snapshot, expectedVersion: number, reason: string) {
  return callAdmin<ApplyResult>("adminConfig", { action: "apply", target, patch, expectedVersion, reason });
}
