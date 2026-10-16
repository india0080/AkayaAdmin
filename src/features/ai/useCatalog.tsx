"use client";

import { useMemo } from "react";
import { useCallable } from "@/lib/useCallable";
import type { CatalogResponse } from "./logic";

/// The synced cloud catalog (adminModels list) plus the id set model fields
/// validate against. `ids` is null until loaded, which disables inline
/// checks rather than flagging every id as unknown.
export function useCatalog(skip = false) {
  const q = useCallable<CatalogResponse>("adminModels", skip ? null : { action: "list" });
  const ids = useMemo(() => (q.data ? new Set(q.data.models.map((m) => m.modelId)) : null), [q.data]);
  return { ...q, ids };
}

/// Suggestions for every <input list="model-catalog">: enabled models only.
export function ModelDatalist({ data }: { data: CatalogResponse | null }) {
  if (!data) return null;
  return (
    <datalist id="model-catalog">
      {data.models.filter((m) => m.enabled).map((m) => (
        <option key={m.modelId} value={m.modelId}>{m.name}</option>
      ))}
    </datalist>
  );
}
