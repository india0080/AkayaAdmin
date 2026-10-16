"use client";

import { useState } from "react";
import { Badge, Icon } from "@/ui";
import { CTA_LABEL, STATUS_LABEL, iconGlyph, isHttpsUrl, type Draft } from "./logic";

/// Renders the row and the popup the way the app will. Admin text is ALWAYS
/// rendered as React text children (never HTML) with whitespace preserved, the
/// same plain-text rule the app follows.
export function RowPreview({ d }: { d: Pick<Draft, "buttonLabel" | "title" | "icon" | "status" | "enabled"> }) {
  const label = d.buttonLabel.trim() || d.title.trim() || "Button label";
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2.5 text-sm"
      data-testid="row-preview"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text">
        <Icon name={iconGlyph(d.icon)} size={16} />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-fg">{label}</span>
      {d.status === "beta" ? <Badge tone="info">Beta</Badge> : null}
      {d.status === "coming_soon" ? <Badge tone="warning">Soon</Badge> : null}
      {d.status === "hidden" || !d.enabled ? <Badge tone="neutral">Not shown</Badge> : null}
    </div>
  );
}

export function PopupPreview({ d }: { d: Pick<Draft, "popup" | "title" | "icon"> }) {
  const p = d.popup;
  const [broken, setBroken] = useState<string | null>(null);
  const showImage = p.type !== "text" && !!p.imageUrl && isHttpsUrl(p.imageUrl) && broken !== p.imageUrl;
  const imageFailed = p.type !== "text" && !!p.imageUrl && broken === p.imageUrl;
  const showText = p.type !== "image" || imageFailed;
  const title = p.title.trim() || (p.type === "image" ? d.title.trim() : "") || "Popup title";
  const cta = p.ctaLabel?.trim() || (p.ctaAction === "upgrade" ? "Upgrade" : "Got it");
  return (
    <div
      role="group"
      aria-label="Popup preview"
      data-testid="popup-preview"
      className="mx-auto w-full max-w-[320px] overflow-hidden rounded-2xl border border-line bg-panel shadow-overlay"
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(p.imageUrl ?? null)}
          className="block max-h-56 w-full bg-panel-2 object-cover"
        />
      ) : null}
      <div className="px-5 py-4 text-center">
        {showText ? (
          <>
            {!showImage ? (
              <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                <Icon name={iconGlyph(d.icon)} size={20} />
              </span>
            ) : null}
            <p className="break-words text-md font-semibold text-fg">{title}</p>
            {p.body.trim() ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-fg-muted">{p.body}</p> : null}
          </>
        ) : null}
        {imageFailed ? <p className="mt-2 text-2xs text-warning">Image could not load; the app falls back to text.</p> : null}
        <span
          className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-accent-solid px-5 text-sm font-medium text-accent-on"
          title={CTA_LABEL[p.ctaAction ?? "close"]}
        >
          {cta}
        </span>
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: Draft["status"] }) {
  const tone = status === "live" ? "success" : status === "beta" ? "info" : status === "coming_soon" ? "warning" : "neutral";
  return <Badge tone={tone}>{STATUS_LABEL[status]}</Badge>;
}
