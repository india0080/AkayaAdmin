"use client";

import clsx from "clsx";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

type ToastTone = "success" | "danger" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  body?: string;
}

interface ToastApi {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((tone: ToastTone, title: string, body?: string) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-3), { id, tone, title, body }]);
    // Errors stay until dismissed; confirmations fade.
    if (tone !== "danger") {
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4500);
    }
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, b) => push("success", t, b),
      error: (t, b) => push("danger", t, b),
      info: (t, b) => push("info", t, b),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-toast flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.tone === "danger" ? "alert" : "status"}
            className="pointer-events-auto flex items-start gap-3 rounded-lg border border-line bg-panel px-4 py-3 shadow-overlay"
          >
            <span
              className={clsx(
                "mt-0.5",
                t.tone === "success" && "text-success",
                t.tone === "danger" && "text-danger",
                t.tone === "info" && "text-info",
              )}
            >
              <Icon name={t.tone === "success" ? "check-circle" : t.tone === "danger" ? "x-circle" : "info"} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-fg">{t.title}</p>
              {t.body ? <p className="mt-0.5 text-sm text-fg-muted">{t.body}</p> : null}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))}
              className="rounded text-fg-subtle hover:text-fg"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useToast must be used inside <ToastProvider>");
  return v;
}
