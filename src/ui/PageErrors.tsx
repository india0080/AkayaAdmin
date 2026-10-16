"use client";

// One combined error banner per page. Every <ErrorState> inside a
// <PageErrorsProvider> (the console shell wraps each page in one) reports
// itself here and renders only a small inline marker; the provider shows a
// single banner at the top listing what failed, with one "Retry all".

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Notice } from "./States";

interface Entry { title: string; message: string; onRetry?: () => void }
interface Ctx { set: (id: string, e: Entry | null) => void }
const PageErrorsContext = createContext<Ctx | null>(null);

export function PageErrorsProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const set = useCallback((id: string, e: Entry | null) => setEntries((cur) => {
    if (!e) { if (!(id in cur)) return cur; const next = { ...cur }; delete next[id]; return next; }
    const old = cur[id];
    return old && old.title === e.title && old.message === e.message && old.onRetry === e.onRetry ? cur : { ...cur, [id]: e };
  }), []);
  const ctx = useMemo(() => ({ set }), [set]);
  const list = Object.values(entries);
  const messages = [...new Set(list.map((e) => e.message))];
  return (
    <PageErrorsContext.Provider value={ctx}>
      {list.length ? (
        <div className="mb-4">
          <Notice tone="warning" title={list.length === 1 ? list[0].title : `${list.length} sections could not be loaded`}
            action={list.some((e) => e.onRetry) ? <button type="button" className="font-medium underline" onClick={() => list.forEach((e) => e.onRetry?.())}>Retry all</button> : undefined}>
            {messages.slice(0, 3).join(" · ")}{messages.length > 3 ? ` · +${messages.length - 3} more` : ""}
          </Notice>
        </div>
      ) : null}
      {children}
    </PageErrorsContext.Provider>
  );
}

/// Registers an error with the page banner. Returns false outside a provider
/// (the caller then renders its own full error state).
export function useReportPageError(entry: Entry): boolean {
  const ctx = useContext(PageErrorsContext);
  const id = useId();
  const retry = useRef(entry.onRetry);
  retry.current = entry.onRetry;
  const hasRetry = !!entry.onRetry;
  useEffect(() => {
    if (!ctx) return;
    ctx.set(id, { title: entry.title, message: entry.message, onRetry: hasRetry ? () => retry.current?.() : undefined });
    return () => ctx.set(id, null);
  }, [ctx, id, entry.title, entry.message, hasRetry]);
  return !!ctx;
}
