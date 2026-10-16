"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ConfirmAction, Drawer, Field, Notice, Select, TextInput, Textarea } from "@/ui";
import { StatusBadge } from "../future/FuturePreview";
import {
  LANGS, LANG_LABEL, LIMITS, STATUS_LABEL, CAPABILITY_STATUSES, answerLine, buildOverride, countOf, draftFromOverride,
  hasErrors, needsConfirm, sameOverride, validateDraft, type Draft, type Lang, type Override,
} from "./logic";
import type { CatalogEntry } from "./catalog";

export interface SaveOutcome {
  /// The server says the data changed since it was loaded.
  conflict?: boolean;
  error?: string;
}

/// Preview of the "what can you do" line in every language, from the DRAFT.
export function AnswerPreview({ entry, draft }: { entry: CatalogEntry; draft: Draft }) {
  const ov = buildOverride(draft);
  return (
    <ul className="space-y-2" data-testid="answer-preview">
      {LANGS.map((l) => {
        const line = answerLine(entry, ov, l);
        return (
          <li key={l} className="rounded-md border border-line bg-panel-2 px-3 py-2">
            <p className="text-2xs font-semibold uppercase tracking-wide text-fg-subtle">{LANG_LABEL[l]}</p>
            {line === null ? (
              <p className="mt-0.5 text-sm italic text-fg-muted">Not listed (hidden)</p>
            ) : (
              <p lang={l === "hi" ? "hi" : "en"} className="mt-0.5 whitespace-pre-wrap break-words text-sm text-fg">{`• ${line}`}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function CapabilityDrawer({
  open, onClose, entry, current, canEdit, onSave, onReset,
}: {
  open: boolean;
  onClose: () => void;
  entry: CatalogEntry | null;
  /// The stored override (null = default).
  current: Override | null;
  canEdit: boolean;
  onSave: (draft: Draft, reason: string) => Promise<SaveOutcome>;
  onReset: (reason: string) => Promise<SaveOutcome>;
}) {
  const [d, setD] = useState<Draft>(() => draftFromOverride(current));
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ tone: "warning" | "danger"; text: string } | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const lock = useRef(false);

  useEffect(() => {
    if (!open) return;
    setD(draftFromOverride(current));
    setReason(""); setTouched(false); setBanner(null); setBusy(false); setConfirmSave(false); setConfirmReset(false);
    lock.current = false;
    // Re-seed only when the drawer opens for a capability, not on every reload
    // of the stored data (that would discard what the operator is typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  const errs = useMemo(() => validateDraft(d), [d]);
  const built = useMemo(() => buildOverride(d), [d]);
  const dirty = !sameOverride(built, current);
  const reasonErr = reason.trim().length < 5 ? "Enter a reason of at least 5 characters (recorded in the audit log)." : null;
  const show = (k: string) => (touched ? errs[k] ?? null : null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const setText = (field: "label" | "description", l: Lang, v: string) => setD((x) => ({ ...x, [field]: { ...x[field], [l]: v } }));

  if (!entry) return null;
  const gate = needsConfirm(entry, current, built);

  const run = async (fn: () => Promise<SaveOutcome>): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setBanner(null);
    try {
      const out = await fn();
      if (out.conflict) {
        setBanner({ tone: "warning", text: "This list changed since you loaded it. The latest version has been reloaded. Review your edits and save again." });
        return false;
      }
      if (out.error) { setBanner({ tone: "danger", text: out.error }); return false; }
      return true;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const doSave = () => run(() => onSave(d, reason.trim()));

  const clickSave = () => {
    setTouched(true);
    if (lock.current || hasErrors(errs) || reasonErr || !dirty) return;
    if (gate) { setConfirmSave(true); return; }
    void doSave();
  };

  const noOverride = current === null;
  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title={entry.labels.en}
        subtitle={<span className="inline-flex flex-wrap items-center gap-2"><code className="text-xs">{entry.id}</code><span>Default: </span><StatusBadge status={entry.baseStatus} /></span>}
        width={920}
        footer={
          <>
            {canEdit && !noOverride ? (
              <Button variant="danger-ghost" onClick={() => setConfirmReset(true)} disabled={busy} className="mr-auto">Reset to default</Button>
            ) : null}
            <Button onClick={onClose} disabled={busy}>{canEdit ? "Cancel" : "Close"}</Button>
            {canEdit ? (
              <Button variant="primary" onClick={clickSave} loading={busy} disabled={!dirty && touched}>Save override</Button>
            ) : null}
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); clickSave(); }} noValidate>
            {banner ? <Notice tone={banner.tone}>{banner.text}</Notice> : null}
            {!canEdit ? <Notice tone="info">You can view this override. Changing it needs the config.modify permission.</Notice> : null}
            <Field label="Status" hint="Default uses the status built into the app. Hidden capabilities are not listed in the answer at all.">
              {(p) => (
                <Select {...p} value={d.status} disabled={!canEdit} onChange={(e) => set({ status: e.target.value as Draft["status"] })}>
                  <option value="">Default ({STATUS_LABEL[entry.baseStatus]})</option>
                  {CAPABILITY_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </Select>
              )}
            </Field>

            <fieldset className="space-y-4 rounded-lg border border-line p-4">
              <legend className="px-1 text-xs font-semibold text-fg-muted">Name shown in the answer (blank = built-in name)</legend>
              {LANGS.map((l) => (
                <Field key={l} label={`${LANG_LABEL[l]} name`} error={show(`label.${l}`)}
                  hint={`${countOf(d.label[l])}/${LIMITS.label}. Plain text only.`}>
                  {(p) => <TextInput {...p} lang={l === "hi" ? "hi" : undefined} value={d.label[l]} disabled={!canEdit} placeholder={entry.labels[l] || entry.labels.en}
                    onChange={(e) => setText("label", l, e.target.value)} />}
                </Field>
              ))}
            </fieldset>

            <fieldset className="space-y-4 rounded-lg border border-line p-4">
              <legend className="px-1 text-xs font-semibold text-fg-muted">One-line description (blank = built-in)</legend>
              {LANGS.map((l) => (
                <Field key={l} label={`${LANG_LABEL[l]} description`} error={show(`description.${l}`)}
                  hint={`${countOf(d.description[l])}/${LIMITS.description}. Plain text only: < and > are not allowed.`}>
                  {(p) => <Textarea {...p} lang={l === "hi" ? "hi" : undefined} rows={2} value={d.description[l]} disabled={!canEdit}
                    onChange={(e) => setText("description", l, e.target.value)} />}
                </Field>
              ))}
            </fieldset>

            {canEdit ? (
              <Field label="Reason for this change" required error={touched ? reasonErr : null}>
                {(p) => <TextInput {...p} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Recorded in the audit log" />}
              </Field>
            ) : null}
          </form>

          <aside aria-label="Answer preview" className="space-y-3 lg:sticky lg:top-0 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">Answer line preview</p>
            <AnswerPreview entry={entry} draft={d} />
            <p className="text-2xs text-fg-subtle">The app builds the real answer from these fields. Wording around the line may differ.</p>
          </aside>
        </div>
      </Drawer>

      <ConfirmAction
        open={confirmSave}
        onClose={() => setConfirmSave(false)}
        title={`Change ${entry.labels.en} to ${built?.status ? STATUS_LABEL[built.status] : STATUS_LABEL[entry.baseStatus]}`}
        level="confirm"
        danger={built?.status === "hidden"}
        confirmLabel="Apply change"
        impact={built?.status === "hidden"
          ? <>{entry.labels.en} will no longer be listed when users ask what Akaya can do. It is recorded in history and can be rolled back from Config History.</>
          : <>Users will be told {entry.labels.en} is coming soon instead of being offered it. It is recorded in history and can be rolled back from Config History.</>}
        onConfirm={async () => {
          const ok = await doSave();
          if (!ok) throw new Error("The change was not saved. See the message in the editor.");
          setConfirmSave(false);
        }}
      />
      <ConfirmAction
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={`Reset ${entry.labels.en} to default`}
        level="reason"
        confirmLabel="Reset to default"
        impact={<>The override is removed. {entry.labels.en} goes back to the built-in status ({STATUS_LABEL[entry.baseStatus]}), name and description. Recorded in history.</>}
        onConfirm={async (r) => {
          const ok = await run(() => onReset(r));
          if (!ok) throw new Error("The reset was not saved. See the message in the editor.");
          setConfirmReset(false);
        }}
      />
    </>
  );
}
