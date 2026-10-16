"use client";

// The stateful half of D4. See lib/paginate.ts for why cursors and why counts are
// queried rather than derived.

import { useCallback, useEffect, useRef, useState } from "react";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";

import { fetchPage, type Cursor, type PageRequest } from "@/lib/paginate";

export interface PaginatedCollection<T> {
  items: T[];
  /// True only for the first page. A "Load more" must not blank the list that is
  /// already on screen.
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  /// Set when a page failed. The list keeps whatever it already had — a failed
  /// second page must not look like "that's all of them".
  error: string | null;
  loadMore: () => void;
  /// Re-reads from the top, discarding cursors. Use after a filter change.
  reload: () => void;
  /// Applies a local edit to an already-loaded row, so a status change does not
  /// need a round trip through every page again.
  patch: (id: string, change: Partial<T>) => void;
}

/// Pages a collection, reloading from the top whenever [request] changes.
///
/// [request] is compared by value, not identity, so callers may build it inline
/// without memoising — the alternative is every page needing a useMemo it will
/// eventually forget, and forgetting it means an infinite reload loop.
export function usePaginatedCollection<T extends { id: string }>(
  request: PageRequest,
  map: (snap: QueryDocumentSnapshot<DocumentData>) => T,
): PaginatedCollection<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cursor = useRef<Cursor>(null);
  // The mapper is almost always an inline arrow, so it is a new function every
  // render. Holding it in a ref keeps it out of the dependency arrays; using it
  // as a dependency would reload the first page on every render.
  const mapRef = useRef(map);
  mapRef.current = map;

  // Same reasoning for the request: serialise the parts that matter so a fresh
  // object literal with identical contents does not count as a change.
  const key = JSON.stringify([
    request.path,
    request.orderByField,
    request.direction ?? "desc",
    request.filter ?? null,
    request.pageSize ?? null,
  ]);
  const requestRef = useRef(request);
  requestRef.current = request;

  // Guards against a stale page landing after a filter change and appending rows
  // that do not match the current filter.
  const generation = useRef(0);

  const loadFirst = useCallback(async () => {
    const mine = ++generation.current;
    cursor.current = null;
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPage<T>(
        { ...requestRef.current, cursor: null },
        mapRef.current,
      );
      if (mine !== generation.current) return;
      setItems(page.items);
      cursor.current = page.cursor;
      setHasMore(page.hasMore);
    } catch (err) {
      if (mine !== generation.current) return;
      console.error(`[paginate] first page failed for ${requestRef.current.path}`, err);
      setItems([]);
      setHasMore(false);
      setError("Couldn't load this list. Check your connection and retry.");
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFirst();
    // `key` is the value-equality stand-in for `request`; loadFirst is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loadFirst]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor.current) return;
    const mine = generation.current;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchPage<T>(
        { ...requestRef.current, cursor: cursor.current },
        mapRef.current,
      );
      if (mine !== generation.current) return;
      // Append de-duplicated: a document edited between pages can legitimately
      // appear twice when the sort field is the one that changed.
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
      });
      cursor.current = page.cursor;
      setHasMore(page.hasMore);
    } catch (err) {
      if (mine !== generation.current) return;
      console.error(`[paginate] next page failed for ${requestRef.current.path}`, err);
      setError("Couldn't load more. Retry.");
    } finally {
      if (mine === generation.current) setLoadingMore(false);
    }
  }, [hasMore, loadingMore]);

  const patch = useCallback((id: string, change: Partial<T>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...change } : i)));
  }, []);

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    loadMore: () => void loadMore(),
    reload: () => void loadFirst(),
    patch,
  };
}
