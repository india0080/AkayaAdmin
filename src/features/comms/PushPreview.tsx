// Device-style notification preview. Plain text only: values are rendered as
// React children (escaped), never as HTML. The image only loads over https.
import { useState } from "react";
import { BODY_MAX, TITLE_MAX } from "./campaign";

export function PushPreview({ title, body, imageUrl, appName = "Akaya AI" }: { title: string; body: string; imageUrl?: string | null; appName?: string }) {
  const [broken, setBroken] = useState<string | null>(null);
  const showImg = !!imageUrl && /^https:\/\//.test(imageUrl) && broken !== imageUrl;
  return (
    <div role="group" aria-label="Notification preview" className="mx-auto w-full max-w-sm rounded-2xl bg-neutral-soft p-3">
      <div className="rounded-xl border border-line bg-panel p-3 shadow-sm">
        <div className="mb-1 flex items-center gap-2 text-2xs text-fg-subtle">
          <span aria-hidden className="inline-block h-4 w-4 rounded-sm bg-accent-solid" />
          <span>{appName}</span><span aria-hidden>·</span><span>now</span>
        </div>
        <p className="break-words text-sm font-semibold text-fg">{title.trim() ? title.slice(0, TITLE_MAX + 20) : <span className="text-fg-subtle">Title</span>}</p>
        <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap break-words text-sm text-fg-muted">{body.trim() ? body.slice(0, BODY_MAX + 40) : <span className="text-fg-subtle">Message text</span>}</p>
        {showImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl!} alt="" className="mt-2 max-h-40 w-full rounded-md object-cover" onError={() => setBroken(imageUrl!)} />
        ) : null}
      </div>
      <p className="mt-2 text-center text-2xs text-fg-subtle">Approximate. Android and iOS render fonts, truncation and images slightly differently.</p>
    </div>
  );
}
