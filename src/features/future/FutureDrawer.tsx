"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { callAdmin } from "@/lib/api";
import { Button, Drawer, Field, Notice, Select, Spinner, Switch, TextInput, Textarea } from "@/ui";
import {
  CTA_ACTIONS, CTA_LABEL, ICONS, LIMITS, POPUP_TYPES, POPUP_TYPE_LABEL, STATUSES, STATUS_LABEL,
  checkImage, draftFromItem, emptyDraft, hasErrors, imageUploadPayload, localInputToMs, msToLocalInput, validateDraft,
  type Draft, type FutureItem, type Popup,
} from "./logic";
import { PLACEMENTS, PLACEMENT_KIND_LABEL, placementById } from "./placementRegistry";
import { PopupPreview, RowPreview } from "./FuturePreview";

export interface SaveOutcome {
  /// Set when the server says the data changed since it was loaded.
  conflict?: boolean;
  error?: string;
}

export function FutureDrawer({
  open, onClose, item, defaultPlacement, countInPlacement, existingFor, onSwitchItem, onSave,
}: {
  open: boolean;
  onClose: () => void;
  /// null = create.
  item: FutureItem | null;
  defaultPlacement: string;
  /// How many items a placement already has (for maxItems).
  countInPlacement: (placement: string) => number;
  /// The single override item of a non-dynamic placement, if configured.
  existingFor: (placement: string) => FutureItem | null;
  /// Creating for an already-configured non-dynamic placement edits that item.
  onSwitchItem: (item: FutureItem) => void;
  onSave: (draft: Draft, reason: string) => Promise<SaveOutcome>;
}) {
  const [d, setD] = useState<Draft>(() => emptyDraft(defaultPlacement));
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "warning" | "danger"; text: string } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const lock = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tz = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "your local time zone"; }
  }, []);

  useEffect(() => {
    if (!open) return;
    setD(item ? draftFromItem(item) : emptyDraft(defaultPlacement));
    setReason(""); setTouched(false); setBanner(null); setImgError(null); setBusy(false); lock.current = false;
  }, [open, item, defaultPlacement]);

  const editing = item !== null;
  const pl = placementById(d.placement);
  const errs = validateDraft(d, { editing, existingInPlacement: countInPlacement(d.placement) });
  const reasonErr = reason.trim().length < 5 ? "Enter a reason of at least 5 characters (recorded in the audit log)." : null;
  const show = (k: string) => (touched ? errs[k] ?? null : null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setPopup = (patch: Partial<Popup>) => setD((x) => ({ ...x, popup: { ...x.popup, ...patch } }));
  const noRoute = pl ? !pl.hasRoute : true;

  const onPlacement = (id: string) => {
    const next = placementById(id);
    const ex = !editing && next && next.maxItems === 1 ? existingFor(id) : null;
    if (ex) { onSwitchItem(ex); return; }
    set({ placement: id, status: next && !next.hasRoute && (d.status === "live" || d.status === "beta") ? "coming_soon" : d.status });
  };

  const save = async () => {
    setTouched(true);
    if (lock.current || hasErrors(errs) || reasonErr) return;
    lock.current = true;
    setBusy(true);
    setBanner(null);
    try {
      const out = await onSave(d, reason.trim());
      if (out.conflict) {
        setBanner({
          tone: "warning",
          text: "This list changed since you loaded it. The latest version has been reloaded. Review your edits and save again.",
        });
      } else if (out.error) setBanner({ tone: "danger", text: out.error });
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setImgError(null);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const chk = checkImage(buf, file.size);
      if (!chk.ok) { setImgError(chk.error); return; }
      setImgBusy(true);
      const res = await callAdmin<{ url: string }>("adminFutureImage", imageUploadPayload(buf, chk.mime, file.name));
      if (!res?.url) throw new Error("The upload did not return an image URL.");
      setPopup({ imageUrl: res.url });
    } catch (e) {
      setImgError(e instanceof Error ? e.message : "The upload failed. Try again.");
    } finally {
      setImgBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const needsImage = d.popup.type !== "text";
  const needsText = d.popup.type !== "image";

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? "Edit item" : "New item"}
      subtitle={editing ? `Version ${item?.version ?? "?"}` : "Appears in the app within about 5 minutes"}
      width={920}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={imgBusy}>{editing ? "Save changes" : "Create item"}</Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
          {banner ? <Notice tone={banner.tone}>{banner.text}</Notice> : null}
          <Field label="Placement" required error={show("placement")}
            hint={pl ? `${PLACEMENT_KIND_LABEL[pl.kind]}. ${pl.hasRoute ? `Has an app route (${pl.route ?? "yes"}): live and beta are possible.` : "No app route yet: it can only be Coming soon or Hidden."}` : undefined}>
            {(p) => (
              <Select {...p} value={d.placement} disabled={editing} onChange={(e) => onPlacement(e.target.value)}>
                {PLACEMENTS.map((x) => (
                  <option key={x.id} value={x.id}>{x.label} {x.hasRoute ? "(route)" : "(no route)"}{x.maxItems === 1 && existingFor(x.id) ? " - configured, opens it" : ""}</option>
                ))}
              </Select>
            )}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" required error={show("title")} hint={`${d.title.trim().length}/${LIMITS.title}`}>
              {(p) => <TextInput {...p} value={d.title} maxLength={LIMITS.title + 20} onChange={(e) => set({ title: e.target.value })} />}
            </Field>
            <Field label="Button label" required error={show("buttonLabel")} hint={`${d.buttonLabel.trim().length}/${LIMITS.buttonLabel}`}>
              {(p) => <TextInput {...p} value={d.buttonLabel} maxLength={LIMITS.buttonLabel + 20} onChange={(e) => set({ buttonLabel: e.target.value })} />}
            </Field>
            <Field label="Icon" error={show("icon")}>
              {(p) => (
                <Select {...p} value={d.icon} onChange={(e) => set({ icon: e.target.value })}>
                  {ICONS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Status" error={show("status")}
              hint={noRoute ? "Live and Beta are disabled: this placement has no app route." : undefined}>
              {(p) => (
                <Select {...p} value={d.status} onChange={(e) => set({ status: e.target.value as Draft["status"] })}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s} disabled={(s === "live" || s === "beta") && noRoute}>{STATUS_LABEL[s]}</option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={d.enabled} onChange={(v) => set({ enabled: v })} label="Enabled" />
            <span className="text-sm text-fg-muted">{d.enabled ? "Enabled" : "Disabled (not shown in the app)"}</span>
          </div>

          <fieldset className="space-y-4 rounded-lg border border-line p-4">
            <legend className="px-1 text-xs font-semibold text-fg-muted">Popup (opens when the row is tapped)</legend>
            <Field label="Popup type" error={show("popup.type")}>
              {(p) => (
                <Select {...p} value={d.popup.type} onChange={(e) => { const t = e.target.value as Popup["type"]; setPopup(t === "text" ? { type: t, imageUrl: undefined } : { type: t }); }}>
                  {POPUP_TYPES.map((t) => <option key={t} value={t}>{POPUP_TYPE_LABEL[t]}</option>)}
                </Select>
              )}
            </Field>
            {needsText ? (
              <>
                <Field label="Popup title" required error={show("popup.title")} hint={`${d.popup.title.trim().length}/${LIMITS.popupTitle}`}>
                  {(p) => <TextInput {...p} value={d.popup.title} onChange={(e) => setPopup({ title: e.target.value })} />}
                </Field>
                <Field label="Popup body (plain text)" required error={show("popup.body")} hint={`${d.popup.body.trim().length}/${LIMITS.popupBody}. Plain text only: < and > are not allowed. Line breaks are kept.`}>
                  {(p) => <Textarea {...p} rows={5} value={d.popup.body} onChange={(e) => setPopup({ body: e.target.value })} />}
                </Field>
              </>
            ) : null}
            {needsImage ? (
              <div>
                <p className="mb-1.5 text-xs font-medium text-fg-muted">Image (PNG, JPEG or WebP, up to 1 MB)</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={fileRef} id="future-image" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                    onChange={(e) => void onFile(e.target.files?.[0])} />
                  <Button size="sm" icon="download" loading={imgBusy} onClick={() => fileRef.current?.click()}>
                    {d.popup.imageUrl ? "Replace image" : "Upload image"}
                  </Button>
                  {d.popup.imageUrl ? (
                    <Button size="sm" variant="danger-ghost" onClick={() => setPopup({ imageUrl: undefined })} disabled={imgBusy}>Remove</Button>
                  ) : null}
                  {imgBusy ? <span className="inline-flex items-center gap-1 text-xs text-fg-muted"><Spinner size={12} /> Uploading</span> : null}
                </div>
                {imgError ? <p role="alert" className="mt-1 text-xs text-danger">{imgError}</p> : null}
                {show("popup.imageUrl") ? <p className="mt-1 text-xs text-danger">{show("popup.imageUrl")}</p> : null}
              </div>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Popup button label (optional)" error={show("popup.ctaLabel")} hint={`${(d.popup.ctaLabel ?? "").trim().length}/${LIMITS.ctaLabel}`}>
                {(p) => <TextInput {...p} value={d.popup.ctaLabel ?? ""} onChange={(e) => setPopup({ ctaLabel: e.target.value })} />}
              </Field>
              <Field label="Popup button action" error={show("popup.ctaAction")}>
                {(p) => (
                  <Select {...p} value={d.popup.ctaAction ?? "close"} onChange={(e) => setPopup({ ctaAction: e.target.value as Popup["ctaAction"] })}>
                    {CTA_ACTIONS.map((a) => <option key={a} value={a}>{CTA_LABEL[a]}</option>)}
                  </Select>
                )}
              </Field>
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border border-line p-4">
            <legend className="px-1 text-xs font-semibold text-fg-muted">Visibility window (optional)</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Show from" error={show("startAt")}>
                {(p) => <TextInput {...p} type="datetime-local" value={msToLocalInput(d.startAt)} onChange={(e) => set({ startAt: localInputToMs(e.target.value) })} />}
              </Field>
              <Field label="Show until" error={show("endAt")}>
                {(p) => <TextInput {...p} type="datetime-local" value={msToLocalInput(d.endAt)} onChange={(e) => set({ endAt: localInputToMs(e.target.value) })} />}
              </Field>
            </div>
            <p className="text-xs text-fg-subtle">Times are in your browser time zone ({tz}) and stored as exact moments. The app compares against the phone&apos;s clock.</p>
          </fieldset>

          <Field label="Reason for this change" required error={touched ? reasonErr : null}>
            {(p) => <TextInput {...p} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Recorded in the audit log" />}
          </Field>
        </form>

        <aside aria-label="Live preview" className="space-y-4 lg:sticky lg:top-0 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Live preview</p>
          <div>
            <p className="mb-1.5 text-xs text-fg-muted">Row</p>
            <RowPreview d={d} />
          </div>
          <div>
            <p className="mb-1.5 text-xs text-fg-muted">Popup</p>
            <PopupPreview d={d} />
          </div>
        </aside>
      </div>
    </Drawer>
  );
}
