"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCan } from "@/lib/session";
import type { CallableQuery } from "@/lib/useCallable";
import {
  cosAccess, isConflict, sameConfig, sectionChanges, sectionErrors, type Change, type CosAccess, type CosConfig, type CosState,
  type Section,
} from "./logic";
import { cosCall, useCosState, type ValidateResult } from "./useCos";

/// Working-copy store shared by every Conversation OS tab. The working copy is
/// a COMPLETE config the editors mutate; "Save draft" persists it, "Publish"
/// promotes the saved draft (separate, audited, typed-phrase step).
interface Ctx {
  q: CallableQuery<CosState>;
  access: CosAccess;
  /// Editors are read-only without cos.modify.
  readOnly: boolean;
  working: CosConfig;
  baseline: CosConfig;
  published: CosConfig;
  dirty: boolean;
  errors: Partial<Record<Section, string>>;
  hasErrors: boolean;
  /// Changes between the published config and the working copy.
  pending: Change[];
  busy: boolean;
  conflict: boolean;
  stale: boolean;
  validation: ValidateResult | null;
  update: (fn: (c: CosConfig) => CosConfig) => void;
  resetWorking: () => void;
  saveDraft: () => Promise<boolean>;
  validate: () => Promise<void>;
  discardDraft: (reason: string) => Promise<void>;
  publish: (reason: string) => Promise<{ version: number; risky: string[] }>;
  reload: () => void;
}

const CosCtx = createContext<Ctx | null>(null);

export function useCosCtx(): Ctx {
  const c = useContext(CosCtx);
  if (!c) throw new Error("useCosCtx outside CosProvider");
  return c;
}

export function CosProvider({ children }: { children: ReactNode }) {
  const can = useCan();
  const access = cosAccess(can);
  const q = useCosState(!access.canView);
  const [working, setWorking] = useState<CosConfig>({});
  const [conflict, setConflict] = useState(false);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<ValidateResult | null>(null);
  const lock = useRef(false);

  const published = useMemo(() => q.data?.published.config ?? {}, [q.data]);
  const baseline = useMemo(() => q.data?.draft?.config ?? published, [q.data, published]);
  const dirty = !sameConfig(working, baseline);
  const syncKey = q.data ? `${q.data.published.metaVersion}:${q.data.draft?.version ?? 0}` : "none";

  // Re-sync the working copy when the SERVER state changes (our own save,
  // someone else's publish) but never overwrite unsaved edits: flag them.
  const lastKey = useRef("none");
  const dirtyRef = useRef(false);
  const forceSync = useRef(false);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (syncKey === "none") return;
    if (lastKey.current === "none" || !dirtyRef.current || forceSync.current) {
      forceSync.current = false;
      setWorking(baseline);
      setStale(false);
    } else if (lastKey.current !== syncKey) {
      setStale(true);
    }
    lastKey.current = syncKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  const errors = useMemo(() => sectionErrors(working), [working]);
  const pending = useMemo(() => sectionChanges(published, working), [published, working]);

  const update = useCallback((fn: (c: CosConfig) => CosConfig) => {
    setWorking((w) => fn(w));
    setValidation(null);
  }, []);

  const guard = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    if (lock.current) throw new Error("Another change is still being saved.");
    lock.current = true;
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      if (isConflict(e)) {
        setConflict(true);
        q.reload();
      }
      throw e;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, [q]);

  const ctx: Ctx = {
    q, access, readOnly: !access.canEdit, working, baseline, published, dirty, errors, hasErrors: Object.keys(errors).length > 0,
    pending, busy, conflict, stale, validation, update,
    resetWorking: () => { setWorking(baseline); setValidation(null); setStale(false); setConflict(false); },
    reload: () => { setConflict(false); q.reload(); },
    saveDraft: async () => {
      await guard(async () => {
        await cosCall("saveDraft", { config: working, expectedDraftVersion: q.data?.draft?.version ?? 0 });
        setConflict(false);
        q.reload();
      });
      return true;
    },
    validate: async () => {
      const r = await guard(() => cosCall<ValidateResult>("validateDraft", { config: working }));
      setValidation(r);
    },
    discardDraft: async (reason) => {
      await guard(async () => {
        await cosCall("discardDraft", { expectedDraftVersion: q.data?.draft?.version ?? 0, reason });
        forceSync.current = true;
        q.reload();
      });
    },
    publish: async (reason) =>
      guard(async () => {
        const d = q.data;
        if (!d?.draft) throw new Error("Save a draft before publishing.");
        const r = await cosCall<{ version: number; risky: string[] }>("publish", {
          expectedVersion: d.published.metaVersion, expectedDraftVersion: d.draft.version, reason,
        });
        setConflict(false);
        q.reload();
        return r;
      }),
  };

  return <CosCtx.Provider value={ctx}>{children}</CosCtx.Provider>;
}
