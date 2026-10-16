"use client";

import Link from "next/link";
import { useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import {
  Badge, Button, ConfirmAction, DataTable, ErrorState, Field, Notice, Panel, Select, StatusPill, TextInput, Textarea,
  formatNumber, relativeTime, useToast, type Column,
} from "@/ui";
import { BODY_MAX, TITLE_MAX, deliveryLabel, type Audience, type HistoryRow, type PushTarget } from "./logic";

export default function LegacySend() {
  const can = useCan();
  const toast = useToast();
  const history = useCallable<{ rows: HistoryRow[] }>("adminComms", { action: "history" });
  const [target, setTarget] = useState<PushTarget>("gold");
  const [uid, setUid] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [aud, setAud] = useState<Audience | null>(null);
  const [checking, setChecking] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const canBroadcast = can("comms.broadcast");
  const textOk = title.trim().length > 0 && title.length <= TITLE_MAX && body.trim().length > 0 && body.length <= BODY_MAX;
  const targetOk = target !== "user" || /^[A-Za-z0-9_-]{6,128}$/.test(uid.trim());

  async function check() {
    setChecking(true);
    try {
      setAud(await callAdmin<Audience>("adminComms", { action: "audience", target, uid: target === "user" ? uid.trim() : undefined }));
    } catch (e) {
      toast.error("Could not size the audience", (e as Error).message);
    } finally {
      setChecking(false);
    }
  }

  const resetAud = () => setAud(null);

  const cols: Column<HistoryRow>[] = [
    { id: "t", header: "Notification", cell: (r) => <div className="max-w-md"><p className="text-sm font-medium">{r.title}</p><p className="line-clamp-1 text-xs text-fg-muted">{r.body}</p></div> },
    { id: "a", header: "Audience", cell: (r) => (r.target === "user" ? <span className="font-mono text-xs">{r.targetUid}</span> : <Badge>{r.target}</Badge>) },
    {
      id: "d", header: "Delivery",
      cell: (r) => (
        <span title={r.error ?? undefined}>
          <StatusPill
            status={r.state === "delivered" ? "ok" : r.state === "partial" || r.state === "topic" ? "degraded" : r.state === "queued" ? "pending" : r.state === "no-audience" ? "off" : "down"}
            label={deliveryLabel(r)}
          />
        </span>
      ),
    },
    { id: "by", header: "Sent by", hideOnNarrow: true, cell: (r) => r.sentByEmail ?? "(legacy console)" },
    { id: "at", header: "When", align: "right", cell: (r) => relativeTime(r.at) },
  ];

  return (
    <>
      <div className="space-y-4">
        {can("comms.send") ? (
          <Panel title="Compose">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Audience">
                {(p) => (
                  <Select {...p} value={target} onChange={(e) => { setTarget(e.target.value as PushTarget); resetAud(); }}>
                    <option value="gold">Gold subscribers</option>
                    <option value="silver">Silver subscribers</option>
                    <option value="app_premium">App Premium subscribers</option>
                    <option value="floating_premium">Floating Premium subscribers</option>
                    <option value="all_access">All Access subscribers</option>
                    <option value="user">One user</option>
                    <option value="all" disabled={!canBroadcast}>Everyone{canBroadcast ? "" : " (needs broadcast permission)"}</option>
                  </Select>
                )}
              </Field>
              {target === "user" ? (
                <Field label="User id" hint={<>Find it in the <Link className="underline" href="/dashboard/users">User Directory</Link>.</>}>
                  {(p) => <TextInput {...p} className="font-mono" value={uid} onChange={(e) => { setUid(e.target.value); resetAud(); }} />}
                </Field>
              ) : <div />}
              <Field label="Title" hint={`${title.length}/${TITLE_MAX}`} error={title.length > TITLE_MAX ? "Too long" : null}>
                {(p) => <TextInput {...p} value={title} onChange={(e) => setTitle(e.target.value)} />}
              </Field>
              <Field label="Message" hint={`${body.length}/${BODY_MAX}`} error={body.length > BODY_MAX ? "Too long" : null} className="md:col-span-2">
                {(p) => <Textarea {...p} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />}
              </Field>
            </div>
            {target === "all" ? (
              <div className="mt-4">
                <Notice tone="warning" title="Everyone means every registered device">
                  The push goes to every device token stored for every user, guests included. It cannot be recalled.
                </Notice>
              </div>
            ) : null}
            {aud ? (
              <div className="mt-4">
                <Notice tone={aud.devices === 0 ? "warning" : "info"} title="Audience">
                  {aud.users === null
                    ? <>{formatNumber(aud.devices)} registered device(s) across all users.{aud.devices === 0 ? " Nobody would receive this." : ""}</>
                    : <>{formatNumber(aud.users)} user(s){aud.capped ? " (first 5,000 only)" : ""} with {formatNumber(aud.devices)} registered device(s).{aud.devices === 0 ? " Nobody would receive this." : ""}</>}
                </Notice>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" loading={checking} disabled={!targetOk} onClick={() => void check()}>Check audience</Button>
              <Button variant="primary" disabled={!aud || !textOk || !targetOk} onClick={() => setConfirm(true)}>Review &amp; send</Button>
            </div>
          </Panel>
        ) : null}
        <Panel title="History" description="Outcome as reported back by the sender function." flush>
          {history.error && !history.data ? <ErrorState compact message={history.error.message} onRetry={history.reload} /> : (
            <DataTable label="Sent notifications" columns={cols} rows={history.data?.rows ?? []} rowKey={(r) => r.id} loading={!history.data}
              empty={{ title: "Nothing sent yet" }} />
          )}
        </Panel>
      </div>
      <ConfirmAction
        open={confirm}
        onClose={() => setConfirm(false)}
        title={target === "all" ? "Send to everyone" : target === "user" ? "Send to one user" : `Send to ${target} subscribers`}
        level={target === "all" ? "typed" : target === "user" ? "confirm" : "reason"}
        phrase="SEND TO ALL"
        danger={target === "all"}
        confirmLabel="Send now"
        impact={
          <div className="space-y-2">
            <p><strong>{title}</strong><br />{body}</p>
            <p>{formatNumber(aud?.devices ?? 0)} device(s). A push cannot be recalled.</p>
          </div>
        }
        onConfirm={async (reason) => {
          await callAdmin("adminComms", { action: "send", target, uid: target === "user" ? uid.trim() : undefined, title: title.trim(), body: body.trim(), reason: reason || undefined });
          toast.success("Queued for delivery", "The outcome appears in History within a minute.");
          setTitle("");
          setBody("");
          setAud(null);
          history.reload();
        }}
      />
    </>
  );
}
