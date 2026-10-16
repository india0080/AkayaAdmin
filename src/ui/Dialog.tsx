"use client";

import clsx from "clsx";
import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./Button";

// Native <dialog> + showModal(): the browser provides the focus trap, the
// inert background, Escape-to-close and focus restoration. We add the
// console styling and a controlled `open` prop.

function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      e.preventDefault(); // keep React state the single source of truth
      onClose();
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, [onClose]);
  return ref;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const ref = useModal(open, onClose);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dlg-title"
      className={clsx(
        "m-auto w-[calc(100vw-32px)] rounded-xl border border-line bg-panel p-0 text-fg shadow-overlay",
        size === "sm" && "max-w-sm",
        size === "md" && "max-w-lg",
        size === "lg" && "max-w-2xl",
      )}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose(); // backdrop click
      }}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <h2 id="dlg-title" className="text-md font-semibold">
                {title}
              </h2>
              {description ? <div className="mt-1 text-sm text-fg-muted">{description}</div> : null}
            </div>
            <IconButton icon="x" label="Close" size="sm" onClick={onClose} />
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer ? (
            <footer className="flex justify-end gap-2 border-t border-line bg-panel-2 px-5 py-3">{footer}</footer>
          ) : null}
        </div>
      ) : null}
    </dialog>
  );
}

/// Right-hand detail sheet for "peek" views (row detail without leaving the
/// table). Same native-dialog guarantees as Dialog.
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 520,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const ref = useModal(open, onClose);
  return (
    <dialog
      ref={ref}
      aria-labelledby="drawer-title"
      style={{ width: `min(${width}px, 100vw)` }}
      className="m-0 ml-auto h-full max-h-none border-l border-line bg-panel p-0 text-fg shadow-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div className="min-w-0">
              <h2 id="drawer-title" className="truncate text-md font-semibold">
                {title}
              </h2>
              {subtitle ? <div className="mt-0.5 text-sm text-fg-muted">{subtitle}</div> : null}
            </div>
            <IconButton icon="x" label="Close" size="sm" onClick={onClose} />
          </header>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}
