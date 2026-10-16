"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError, callAdmin } from "@/lib/api";

export interface CallableQuery<T> {
  data: T | null;
  error: AdminApiError | null;
  loading: boolean;
  /// True while a reload runs with data already on screen (stale-while-
  /// revalidate): pages keep showing the old rows instead of a skeleton.
  refreshing: boolean;
  reload: () => void;
  setData: (updater: (prev: T | null) => T | null) => void;
}

/// Reads through an admin callable. A generation counter drops responses
/// from superseded requests, so a slow earlier call can never overwrite a
/// newer one. `key` changes re-fetch; pass null to skip.
export function useCallable<T>(name: string, payload: Record<string, unknown> | null): CallableQuery<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<AdminApiError | null>(null);
  const [loading, setLoading] = useState(payload !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const gen = useRef(0);
  const key = payload === null ? null : JSON.stringify(payload);
  const hasData = useRef(false);

  useEffect(() => {
    if (key === null) return;
    const mine = ++gen.current;
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    callAdmin<T>(name, JSON.parse(key))
      .then((res) => {
        if (mine !== gen.current) return;
        hasData.current = true;
        setDataState(res);
      })
      .catch((e: AdminApiError) => {
        if (mine !== gen.current) return;
        setError(e);
      })
      .finally(() => {
        if (mine !== gen.current) return;
        setLoading(false);
        setRefreshing(false);
      });
  }, [name, key, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((updater: (prev: T | null) => T | null) => setDataState(updater), []);

  return { data, error, loading, refreshing, reload, setData };
}
