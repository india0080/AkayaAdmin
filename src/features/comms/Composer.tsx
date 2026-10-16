"use client";

import { useMemo, useRef, useState } from "react";
import { checkImage } from "@/features/future/logic";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import { Button, ConfirmAction, Field, Notice, Panel, Select, TextInput, Textarea, formatNumber, useToast } from "@/ui";
import {
  AUDIENCE_KINDS, BODY_MAX, ENTITLEMENT_GROUPS, EMPTY_DRAFT, GROUP_LABEL, MAX_DEVICES, PLATFORMS, TITLE_MAX, UNSUPPORTED_AUDIENCE_NOTE, USERS_MAX,
  activeTicket, charCount, commsAccess, composePayload, confirmPlan, estimateLabel, friendlyError, isDuplicate, overDeviceCap, parseUserList,
  timezoneNote, validateDraft,
  type AudienceKind, type CampaignDraft, type EntitlementGroup, type Platform, type ValidateResult,
} from "./campaign";
import { composeValidate, lookupTicket, sendCampaign, testSendToSelf, uploadPushImage } from "./campaignApi";
import { TICKET_DESTINATION, findDestination, paramLabel, registryFrom, selectableDestinations } from "./destinations";
import { PushPreview } from "./PushPreview";

export default function Composer({ onSent }: { onSent: () => void }) {
  const can = useCan();
  const toast = useToast();
  const { canSend, canBroadcast } = commsAccess(can);

  // Destinations come from the server registry; the bundled copy is the fallback.
  const regQ = useCallable<unknown>("adminComms", canSend ? { action: "destinations" } : null);
  const registry = useMemo(() => registryFrom(regQ.data), [regQ.data]);

  const [draft, setDraft] = useState<CampaignDraft>(EMPTY_DRAFT);
  const [touched, setTouched] = useState(false);
  const [validated, setValidated] = useState<{ key: string; result: ValidateResult } | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<{ tone: "success" | "warning" | "danger"; text: string } | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [ticketInfo, setTicketInfo] = useState<{ title: string; email: string | null; humanId: string } | null>(null);
  const [confirm, setConfirm] = useState<null | "normal" | "force">(null);
  // Set after the server refused an identical send: only then "send anyway" is offered.
  const [dupKey, setDupKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const testLock = useRef(false);
  const checkLock = useRef(false);

  const key = useMemo(() => JSON.stringify(composePayload(draft, registry)), [draft, registry]);
  const errors = validateDraft(draft, Date.now(), registry);
  const show = (k: string) => (touched ? errors[k] ?? null : null);
  const hasErrors = Object.keys(errors).length > 0;
  const fresh = validated && validated.key === key ? validated.result : null;
  const ticket = activeTicket(draft);
  const isTicketDest = draft.destination.type === TICKET_DESTINATION;
  const dest = findDestination(draft.destination.type, registry);
  const title = charCount(draft.title, TITLE_MAX);
  const body = charCount(draft.body, BODY_MAX);
  const plan = confirmPlan(draft, fresh?.users ?? fresh?.tokens ?? null);
  const list = parseUserList(draft.audience.usersText);
  const tzOffset = new Date().getTimezoneOffset();
  const overCap = overDeviceCap(fresh);
  const isAll = !ticket && draft.audience.kind === "all";
  const mode = draft.schedule.mode;
  let tz: string | null = null;
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { tz = null; }

  const patch = (p: Partial<CampaignDraft>) => setDraft((d) => ({ ...d, ...p }));
  const patchAud = (p: Partial<CampaignDraft["audience"]>) => setDraft((d) => ({ ...d, audience: { ...d.audience, ...p } }));

  if (!canSend) return <Notice tone="info" title="Read only">Your role cannot send campaigns (comms.send).</Notice>;

  const textOnlyErrors = ["title", "body", "image"].some((k) => errors[k]) || Object.keys(errors).some((k) => k.startsWith("dest."));
  const canTest = !textOnlyErrors && !testing && !isTicketDest;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setImgError(null);
    try {
      if (file.size > 1024 * 1024) { setImgError(`The image is ${(file.size / 1048576).toFixed(2)} MB. The limit is 1 MB.`); return; }
      const buf = new Uint8Array(await file.arrayBuffer());
      const chk = checkImage(buf, file.size);
      if (!chk.ok) { setImgError(chk.error); return; }
      setImgBusy(true);
      const res = await uploadPushImage(buf, chk.mime, file.name);
      patch({ image: { url: res.url, name: file.name.slice(0, 80) } });
    } catch (e) {
      setImgError(friendlyError(e as { code?: string; message?: string }, "The upload failed. Try again."));
    } finally {
      setImgBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function doLookup() {
    const id = (draft.destination.params.ticketId ?? "").trim();
    if (errors["dest.ticketId"] && !draft.ticket) { setTicketError("Enter a valid ticket ID."); return; }
    setTicketBusy(true);
    setTicketError(null);
    try {
      const t = await lookupTicket(id);
      if (!t.ownerUid) throw new Error("The ticket has no owner to notify.");
      // Keep the typed id equal to the canonical id so the lock matches.
      setDraft((d) => ({ ...d, ticket: { ticketId: t.ticketId, ownerUid: t.ownerUid }, destination: { ...d.destination, params: { ticketId: t.ticketId } } }));
      setTicketInfo({ title: t.title, email: t.email, humanId: t.humanId });
    } catch (e) {
      patch({ ticket: null });
      setTicketInfo(null);
      setTicketError(friendlyError(e as { code?: string; message?: string }, "Ticket lookup failed."));
    } finally {
      setTicketBusy(false);
    }
  }

  async function doCheck() {
    setTouched(true);
    if (hasErrors || checkLock.current) return;
    checkLock.current = true;
    setChecking(true);
    setCheckError(null);
    const k = key;
    try {
      setValidated({ key: k, result: await composeValidate(draft, registry) });
    } catch (e) {
      setValidated(null);
      setCheckError(friendlyError(e as { code?: string; message?: string }, "Could not validate the campaign."));
    } finally {
      checkLock.current = false;
      setChecking(false);
    }
  }

  async function doTest() {
    setTouched(true);
    if (!canTest || testLock.current) return;
    testLock.current = true;
    setTesting(true);
    setTestNote(null);
    try {
      const r = await testSendToSelf(draft, registry);
      setTestNote({ tone: "success", text: `Test sent to your own device(s): accepted by FCM for ${r.accepted ?? 0}${r.failed ? `, failed for ${r.failed}` : ""}${r.pruned ? `, ${r.pruned} dead token(s) removed` : ""}. It was not recorded as a campaign.` });
    } catch (e) {
      const ex = e as { code?: string; message?: string };
      setTestNote({ tone: ex.code === "failed-precondition" ? "warning" : "danger", text: friendlyError(ex, "The test send failed.") });
    } finally {
      testLock.current = false;
      setTesting(false);
    }
  }

  const sendLabel = mode === "draft" ? "Save draft" : mode === "at" ? "Schedule campaign" : "Send now";
  const forcing = confirm === "force";
  const showForceOffer = dupKey === key && !confirm;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Panel title="Message">
          <div className="grid gap-4">
            <Field label="Title" required hint={<span aria-live="polite">{title.label}</span>} error={title.over ? `Too long (${title.label})` : show("title")}>
              {(p) => <TextInput {...p} value={draft.title} onChange={(e) => patch({ title: e.target.value })} autoComplete="off" />}
            </Field>
            <Field label="Message" required hint={<span aria-live="polite">{body.label}</span>} error={body.over ? `Too long (${body.label})` : show("body")}>
              {(p) => <Textarea {...p} rows={4} value={draft.body} onChange={(e) => patch({ body: e.target.value })} />}
            </Field>
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-muted">Image (optional)</p>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" id="push-image" aria-label="Upload notification image"
                  onChange={(e) => void onFile(e.target.files?.[0])} />
                <Button variant="secondary" size="sm" loading={imgBusy} onClick={() => fileRef.current?.click()}>{draft.image ? "Replace image" : "Upload image"}</Button>
                {draft.image ? <Button size="sm" variant="ghost" onClick={() => patch({ image: null })}>Remove</Button> : null}
                <span className="text-xs text-fg-subtle">{draft.image?.name ?? "PNG, JPEG or WebP, up to 1 MB."}</span>
              </div>
              {imgError ? <p role="alert" className="mt-1 text-xs text-danger">{imgError}</p> : show("image") ? <p className="mt-1 text-xs text-danger">{show("image")}</p> : null}
            </div>
          </div>
        </Panel>

        <Panel title="Destination" description="Where the app opens when the notification is tapped. Only registered destinations are possible.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Opens" error={show("dest.type")}>
              {(p) => (
                <Select {...p} value={draft.destination.type}
                  onChange={(e) => setDraft((d) => ({ ...d, destination: { type: e.target.value, params: {} }, ticket: null }))}>
                  {selectableDestinations(registry).map((x) => <option key={x.type} value={x.type}>{x.label}</option>)}
                  {findDestination(TICKET_DESTINATION, registry) ? <option value={TICKET_DESTINATION}>Support ticket (one ticket&apos;s owner only)</option> : null}
                </Select>
              )}
            </Field>
            {dest && Object.entries(dest.params).map(([name, spec]) => (
              <Field key={name} label={paramLabel(name)} required={spec.required} error={show(`dest.${name}`)}
                hint={isTicketDest ? "The ticket ID from the Support queue." : undefined}>
                {(p) => (
                  <div className="flex gap-2">
                    <TextInput {...p} className="font-mono" value={draft.destination.params[name] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, destination: { ...d.destination, params: { ...d.destination.params, [name]: e.target.value } }, ticket: isTicketDest ? null : d.ticket }))} />
                    {isTicketDest ? <Button variant="secondary" loading={ticketBusy} onClick={() => void doLookup()}>Look up</Button> : null}
                  </div>
                )}
              </Field>
            ))}
          </div>
          {regQ.error && !regQ.data ? <p className="mt-2 text-xs text-fg-subtle">Using the built-in destination list (server list unavailable).</p> : null}
          {isTicketDest ? (
            <div className="mt-3 space-y-2">
              {ticketError ? <Notice tone="danger" title="Ticket lookup">{ticketError}</Notice> : null}
              {ticket ? (
                <Notice tone="info" title="Audience locked to the ticket owner">
                  {ticketInfo ? <>Ticket {ticketInfo.humanId ? `${ticketInfo.humanId} ` : ""}&quot;{ticketInfo.title}&quot;. </> : null}
                  Only the owner{ticketInfo?.email ? ` (${ticketInfo.email})` : ""} receives this. The server enforces this too.
                </Notice>
              ) : show("ticket") ? <p className="text-xs text-danger">{show("ticket")}</p> : null}
            </div>
          ) : null}
        </Panel>

        <Panel title="Audience">
          {ticket ? (
            <p className="text-sm text-fg-muted">Locked: the owner of the ticket above. Choose another destination to pick a different audience.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Who">
                {(p) => (
                  <Select {...p} value={draft.audience.kind} onChange={(e) => patchAud({ kind: e.target.value as AudienceKind })}>
                    {AUDIENCE_KINDS.map((k) => (
                      <option key={k.id} value={k.id} disabled={k.id === "all" && !canBroadcast}>
                        {k.label}{k.id === "all" && !canBroadcast ? " (needs broadcast permission)" : ""}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              {draft.audience.kind === "entitlement" ? (
                <Field label="Group" hint="Resolved from the real entitlement, not the master switch.">
                  {(p) => (
                    <Select {...p} value={draft.audience.group} onChange={(e) => patchAud({ group: e.target.value as EntitlementGroup })}>
                      {ENTITLEMENT_GROUPS.map((g) => <option key={g} value={g}>{GROUP_LABEL[g]}</option>)}
                    </Select>
                  )}
                </Field>
              ) : null}
              {draft.audience.kind === "users" ? (
                <Field label="User IDs (UIDs)" error={show("aud.users")} className="md:col-span-2"
                  hint={`${formatNumber(list.total)} / ${USERS_MAX} (separate with commas, spaces or new lines; emails are not accepted)`}>
                  {(p) => <Textarea {...p} rows={3} className="font-mono" value={draft.audience.usersText} onChange={(e) => patchAud({ usersText: e.target.value })} />}
                </Field>
              ) : null}
              {draft.audience.kind !== "all" ? (
                <>
                  <Field label={draft.audience.kind === "platform" ? "Platform" : "Platform filter (optional)"} error={show("aud.platform")}>
                    {(p) => (
                      <Select {...p} value={draft.audience.platform} onChange={(e) => patchAud({ platform: e.target.value as Platform | "" })}>
                        <option value="">{draft.audience.kind === "platform" ? "Choose..." : "Any platform"}</option>
                        {PLATFORMS.map((x) => <option key={x} value={x}>{x === "ios" ? "iOS" : "Android"}</option>)}
                      </Select>
                    )}
                  </Field>
                  <Field label={draft.audience.kind === "language" ? "Language code" : "Language filter (optional)"} error={show("aud.language")}
                    hint="Exact match on the user's language preference, e.g. en, hi.">
                    {(p) => <TextInput {...p} value={draft.audience.language} onChange={(e) => patchAud({ language: e.target.value })} autoComplete="off" />}
                  </Field>
                </>
              ) : null}
            </div>
          )}
          {isAll ? (
            <div className="mt-3"><Notice tone="warning" title="Everyone">Every user with a registered device. It needs a typed confirmation and a reason, and cannot be recalled.</Notice></div>
          ) : null}
          <p className="mt-3 text-xs text-fg-subtle">{UNSUPPORTED_AUDIENCE_NOTE} Up to {formatNumber(MAX_DEVICES)} devices per campaign.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3" aria-live="polite">
            <Button variant="secondary" size="sm" loading={checking} onClick={() => void doCheck()}>Validate &amp; estimate recipients</Button>
            <span className="text-sm text-fg-muted">{fresh ? estimateLabel(fresh) : validated ? "Changed since the last check. Validate again." : estimateLabel(null)}</span>
          </div>
          {checkError ? <div className="mt-2"><Notice tone="danger" title="Could not validate" action={<Button size="sm" onClick={() => void doCheck()}>Retry</Button>}>{checkError}</Notice></div> : null}
          {fresh && !fresh.valid ? (
            <div className="mt-2">
              <Notice tone="danger" title="The server rejected this campaign">
                <ul className="list-disc pl-4">{fresh.errors.map((e, i) => <li key={i}>{e.field ? `${e.field}: ` : ""}{e.message}</li>)}</ul>
              </Notice>
            </div>
          ) : null}
          {overCap ? <div className="mt-2"><Notice tone="danger" title="Over the device cap">This audience has more than {formatNumber(MAX_DEVICES)} devices and would be refused. Narrow it with a filter.</Notice></div> : null}
          {fresh?.warnings.length ? <div className="mt-2"><Notice tone="warning">{fresh.warnings.join(" ")}</Notice></div> : null}
        </Panel>

        <Panel title="Schedule">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="When">
              {(p) => (
                <Select {...p} value={mode} onChange={(e) => patch({ schedule: { ...draft.schedule, mode: e.target.value as "now" | "at" | "draft" } })}>
                  <option value="now">Send now</option>
                  <option value="at">Schedule for a date and time</option>
                  <option value="draft">Save as draft (not sent)</option>
                </Select>
              )}
            </Field>
            {mode === "at" ? (
              <Field label="Date and time" required error={show("sched.at")}>
                {(p) => <TextInput {...p} type="datetime-local" value={draft.schedule.local} onChange={(e) => patch({ schedule: { ...draft.schedule, local: e.target.value } })} />}
              </Field>
            ) : null}
          </div>
          {mode === "at" ? <p className="mt-2 text-xs text-fg-subtle">{timezoneNote(tz, tzOffset)} Allowed: 1 minute to 60 days ahead.</p> : null}
          {mode === "draft" ? <p className="mt-2 text-xs text-fg-subtle">A draft is stored for later. Open it in Campaigns to send or schedule it.</p> : null}
        </Panel>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Panel title="Preview">
          <PushPreview title={draft.title} body={draft.body} imageUrl={draft.image?.url} />
          {dest ? <p className="mt-3 text-xs text-fg-muted">Tap opens: <strong>{dest.label}</strong></p> : null}
        </Panel>
        <Panel title="Actions">
          <div className="flex flex-col gap-2">
            <Button variant="secondary" loading={testing} disabled={!canTest} onClick={() => void doTest()}>Send test to me</Button>
            {isTicketDest ? <p className="text-xs text-fg-subtle">Test sends are not available for ticket destinations.</p> : null}
            {testNote ? <Notice tone={testNote.tone}>{testNote.text}</Notice> : null}
            <Button variant="primary" disabled={hasErrors || !fresh?.valid || overCap || checking || imgBusy} onClick={() => { setTouched(true); setConfirm("normal"); }}>
              {sendLabel}
            </Button>
            {showForceOffer ? (
              <Notice tone="warning" title="Duplicate refused" action={<Button size="sm" variant="secondary" onClick={() => setConfirm("force")}>Send anyway</Button>}>
                {`The server refused this because an identical campaign was sent in the last 10 minutes. Send anyway only if you really mean to send it twice.`}
              </Notice>
            ) : null}
            {hasErrors && touched ? <p role="alert" className="text-xs text-danger">Fix the highlighted fields first.</p> : null}
            {!fresh && !hasErrors ? <p className="text-xs text-fg-subtle">Validate &amp; estimate the audience before sending.</p> : null}
          </div>
        </Panel>
      </aside>

      <ConfirmAction
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={forcing ? "Send anyway (duplicate)" : mode === "draft" ? "Save draft" : mode === "at" ? "Schedule campaign" : "Send campaign"}
        level={forcing && plan.level === "confirm" ? "reason" : plan.level}
        phrase={plan.level === "typed" ? plan.phrase : undefined}
        danger={plan.level === "typed" || forcing}
        confirmLabel={forcing ? "Send anyway" : sendLabel}
        impact={
          <div className="space-y-2">
            <p><strong>{draft.title}</strong><br />{draft.body}</p>
            <p>{estimateLabel(fresh)} {plan.why}</p>
            {forcing ? <p>This repeats a campaign that was just sent.</p> : null}
          </div>
        }
        onConfirm={async (reason) => {
          let r;
          try {
            r = await sendCampaign(draft, { reason: reason || undefined, confirmAll: plan.level === "typed", force: forcing, registry });
          } catch (e) {
            const ex = e as { code?: string; message?: string };
            if (isDuplicate(ex)) setDupKey(key);
            throw new Error(friendlyError(ex, "Not sent."));
          }
          if (!r.success) toast.error("Campaign failed", r.error ?? "FCM rejected the send. See Campaigns for the counts.");
          else toast.success(mode === "draft" ? "Draft saved" : mode === "at" ? "Campaign scheduled" : "Campaign sent", "Counts appear in Campaigns as FCM reported them.");
          setDraft(EMPTY_DRAFT);
          setValidated(null);
          setDupKey(null);
          setTouched(false);
          setTicketInfo(null);
          setTestNote(null);
          onSent();
        }}
      />
    </div>
  );
}
