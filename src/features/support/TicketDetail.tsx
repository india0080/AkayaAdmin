"use client";

import clsx from "clsx";
import { useCallback, useEffect, useRef, useState } from "react";
import { callAdmin } from "@/lib/api";
import { useCan, useSession } from "@/lib/session";
import {
  Badge, Button, ConfirmAction, ErrorState, Field, Notice, Panel, Select, Skeleton, Textarea, TextInput, useToast,
} from "@/ui";
import {
  MAX_NOTE, MAX_REPLY, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, absoluteTime, allowedTransitions,
  canReply, describeHistory, isTicketConflict, labelOf, mutationErrorMessage, normalizeDetail,
  priorityTone, statusConfirmLevel, statusTone,
} from "./logic";
import { relativeTime } from "@/ui";
import type { Ticket, TicketDetail as Detail, TicketMessage, TicketPriority, TicketStatus } from "./types";

const ROLE_STYLE: Record<TicketMessage["role"], { label: string; box: string; tone: "info" | "neutral" | "accent" | "warning" }> = {
  user: { label: "User", box: "border-line bg-panel mr-8", tone: "info" },
  bot: { label: "Support bot", box: "border-line bg-raised mr-8", tone: "neutral" },
  admin: { label: "Admin", box: "border-accent/40 bg-accent-soft ml-8", tone: "accent" },
  system: { label: "System", box: "border-dashed border-line bg-transparent text-fg-muted", tone: "warning" },
};

/** Plain text only: React escapes it; line breaks preserved by CSS. */
function Text({ children }: { children: string }) {
  return <p className="whitespace-pre-wrap break-words text-sm">{children}</p>;
}

function Row({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{l}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

export default function TicketDetail({
  ticketId,
  onTicketChanged,
}: {
  ticketId: string;
  /** Called with the freshly loaded ticket after every load/mutation. */
  onTicketChanged: (t: Ticket) => void;
}) {
  const can = useCan();
  const { session } = useSession();
  const toast = useToast();
  const canModify = can("support.modify");

  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [assignUid, setAssignUid] = useState("");
  const [closing, setClosing] = useState<TicketStatus | null>(null);

  const gen = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(
    async (quiet = false) => {
      const mine = ++gen.current;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const d = normalizeDetail(await callAdmin("adminTickets", { action: "get", ticketId }));
        if (mine !== gen.current) return null;
        setDetail(d);
        onTicketChanged({ ...d.ticket, id: d.ticket.id || ticketId });
        return d;
      } catch (e) {
        if (mine === gen.current) setError((e as Error).message);
        return null;
      } finally {
        if (mine === gen.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ticketId],
  );

  useEffect(() => {
    setDetail(null);
    setNotice(null);
    setReply("");
    setNote("");
    void load();
  }, [load]);

  /** Single-flight mutation: ref guard closes the same-tick double submit window. */
  async function act(label: string, payload: Record<string, unknown>, onOk?: () => void) {
    if (inFlight.current || !canModify) return false;
    inFlight.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await callAdmin("adminTickets", { ticketId, ...payload });
      onOk?.();
      toast.success(label);
      await load(true);
      return true;
    } catch (e) {
      if (isTicketConflict(e)) {
        setNotice(mutationErrorMessage(e));
        await load(true);
      } else {
        toast.error("Not completed", mutationErrorMessage(e));
      }
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  if (loading && !detail) return <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-32 w-full" /></div>;
  if (error && !detail) return <ErrorState title="Could not load ticket" message={error} onRetry={() => void load()} />;
  if (!detail) return null;

  const t = detail.ticket;
  const version = t.version;
  const disabled = busy || !canModify;
  const transitions = allowedTransitions(t.status);
  const mine = session?.uid ?? "";

  function startStatus(to: TicketStatus) {
    const level = statusConfirmLevel(to);
    if (level === "none") void act(`Marked ${STATUS_LABEL[to]}`, { action: "setStatus", status: to, expectedVersion: version });
    else setClosing(to);
  }

  async function sendReply() {
    const text = reply.trim();
    if (!text || text.length > MAX_REPLY || !canReply(t.status)) return;
    await act("Reply sent", { action: "reply", text, expectedVersion: version }, () => setReply(""));
  }
  async function addNote() {
    const text = note.trim();
    if (!text || text.length > MAX_NOTE) return;
    await act("Note added", { action: "addNote", text }, () => setNote(""));
  }

  return (
    <div className="space-y-4">
      {!canModify ? (
        <Notice tone="info" title="Read-only">Your role has support.read but not support.modify. You can view tickets but not change them.</Notice>
      ) : null}
      {notice ? <Notice tone="warning" title="Ticket changed">{notice}</Notice> : null}
      {error ? <Notice tone="danger" title="Refresh failed" action={<Button size="sm" onClick={() => void load(true)}>Retry</Button>}>{error}</Notice> : null}

      {/* Header */}
      <section aria-label="Ticket header">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold">{t.humanId || t.id}</span>
          <Badge tone={statusTone(t.status)}>{STATUS_LABEL[t.status]}</Badge>
          <Badge tone={priorityTone(t.priority)}>{PRIORITY_LABEL[t.priority]}</Badge>
          <Badge>{labelOf(t.category)}</Badge>
          {t.unreadForAdmin ? <Badge tone="info">Unread</Badge> : null}
        </div>
        <h3 className="mt-2 break-words text-md font-semibold">{t.title}</h3>
        <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
          <Row l="Assignee">{t.assignedToEmail ?? t.assignedToUid ?? "Unassigned"}</Row>
          <Row l="Created"><span title={absoluteTime(t.createdAt)}>{absoluteTime(t.createdAt)} ({relativeTime(t.createdAt)})</span></Row>
          <Row l="Updated"><span title={absoluteTime(t.updatedAt)}>{absoluteTime(t.updatedAt)} ({relativeTime(t.updatedAt)})</span></Row>
          <Row l="Version"><span className="tabular">v{version}</span></Row>
          {t.appVersion || t.platform ? <Row l="App">{[t.platform, t.appVersion].filter(Boolean).join(" / ")}</Row> : null}
          {t.deviceMeta ? <Row l="Device">{Object.entries(t.deviceMeta).map(([k, v]) => `${k}: ${v}`).join(" - ")}</Row> : null}
        </dl>
      </section>

      {/* Controls */}
      <Panel title="Manage" description={canModify ? undefined : "Controls are disabled for read-only roles."}>
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Status</p>
            <div className="flex flex-wrap gap-2">
              {transitions.map((to) => (
                <Button key={to} size="sm" variant={to === "closed" ? "danger-ghost" : "secondary"} disabled={disabled} onClick={() => startStatus(to)}>
                  {to === "closed" ? "Close" : to === "resolved" ? "Resolve" : to === "open" && (t.status === "closed" || t.status === "resolved") ? "Reopen" : `Mark ${STATUS_LABEL[to].toLowerCase()}`}
                </Button>
              ))}
            </div>
          </div>
          <Field label="Priority">
            {(p) => (
              <Select {...p} value={t.priority} disabled={disabled} onChange={(e) => void act("Priority updated", { action: "setPriority", priority: e.target.value as TicketPriority, expectedVersion: version })}>
                {PRIORITIES.map((x) => <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>)}
              </Select>
            )}
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Assignee</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" disabled={disabled || !mine || t.assignedToUid === mine} onClick={() => void act("Assigned to you", { action: "assign", assigneeUid: mine })}>Assign to me</Button>
              <Button size="sm" disabled={disabled || !t.assignedToUid} onClick={() => void act("Unassigned", { action: "assign", assigneeUid: null })}>Unassign</Button>
            </div>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const uid = assignUid.trim();
                if (uid) void act("Assigned", { action: "assign", assigneeUid: uid }, () => setAssignUid(""));
              }}
            >
              <TextInput aria-label="Assign to admin uid" placeholder="Admin uid" value={assignUid} disabled={disabled} onChange={(e) => setAssignUid(e.target.value)} autoComplete="off" />
              <Button size="sm" type="submit" disabled={disabled || !assignUid.trim()}>Assign</Button>
            </form>
          </div>
        </div>
      </Panel>

      {/* User context */}
      <Panel title="User">
        {detail.user ? (
          <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-sm">
            <Row l="Name">{detail.user.displayName ?? "-"}</Row>
            <Row l="Email">{detail.user.email ?? t.email ?? "Not available"}</Row>
            <Row l="uid"><span className="font-mono text-xs">{detail.user.uid || t.uid}</span></Row>
            <Row l="Plan">{detail.user.plan ?? "-"}</Row>
            <Row l="Entitlement">{detail.user.entitlement ?? "-"}</Row>
            <Row l="Joined">{absoluteTime(detail.user.createdAt)}</Row>
          </dl>
        ) : (
          <p className="text-sm text-fg-muted">No user context returned for <span className="font-mono text-xs">{t.uid}</span>.</p>
        )}
      </Panel>

      {/* Summary + thread */}
      {t.summary ? (
        <Panel title="Conversation summary"><Text>{t.summary}</Text></Panel>
      ) : null}
      <Panel title={`Conversation (${detail.messages.length})`}>
        {detail.messages.length === 0 ? (
          <p className="text-sm text-fg-muted">No messages.</p>
        ) : (
          <ol className="space-y-2" aria-label="Conversation thread">
            {detail.messages.map((m) => {
              const s = ROLE_STYLE[m.role];
              return (
                <li key={m.id} className={clsx("rounded-lg border px-3 py-2", s.box)}>
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                    <Badge tone={s.tone}>{m.role === "admin" && m.authorName ? `Admin: ${m.authorName}` : s.label}</Badge>
                    <time title={absoluteTime(m.createdAt)}>{absoluteTime(m.createdAt)}</time>
                  </div>
                  <Text>{m.text}</Text>
                  {m.attachments.length ? (
                    <p className="mt-1 text-xs text-fg-muted">Attachments: {m.attachments.map((a) => a.name).join(", ")}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </Panel>

      {/* Reply */}
      <Panel title="Reply to user" description="Visible to the user and sent to them as a notification.">
        {canReply(t.status) ? (
          <form onSubmit={(e) => { e.preventDefault(); void sendReply(); }} className="space-y-2">
            <Field label="Message" hint={`${reply.trim().length}/${MAX_REPLY} - Ctrl/Cmd+Enter to send`}>
              {(p) => (
                <Textarea
                  {...p}
                  value={reply}
                  maxLength={MAX_REPLY}
                  disabled={disabled}
                  placeholder={canModify ? "Write a reply..." : "Read-only"}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void sendReply(); }
                  }}
                />
              )}
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={busy} disabled={disabled || !reply.trim()}>Send reply</Button>
            </div>
          </form>
        ) : (
          <Notice tone="info">This ticket is closed. Reopen it to reply.</Notice>
        )}
      </Panel>

      {/* Internal notes */}
      <section aria-label="Internal notes" className="rounded-lg border-2 border-dashed border-warning/50 bg-warning-soft/40">
        <header className="flex items-center gap-2 border-b border-warning/30 px-4 py-3">
          <h2 className="text-base font-semibold">Internal notes</h2>
          <Badge tone="warning">Internal - not visible to the user</Badge>
        </header>
        <div className="space-y-3 p-4">
          <form onSubmit={(e) => { e.preventDefault(); void addNote(); }} className="space-y-2">
            <Field label="Add internal note" hint={`${note.trim().length}/${MAX_NOTE}`}>
              {(p) => <Textarea {...p} value={note} maxLength={MAX_NOTE} disabled={disabled} onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void addNote(); } }} />}
            </Field>
            <div className="flex justify-end"><Button type="submit" disabled={disabled || !note.trim()}>Add note</Button></div>
          </form>
          {detail.notes.length === 0 ? <p className="text-sm text-fg-muted">No internal notes.</p> : (
            <ul className="space-y-2">
              {detail.notes.map((n) => (
                <li key={n.id} className="rounded-md border border-warning/30 bg-panel px-3 py-2">
                  <p className="mb-1 text-xs text-fg-muted">{n.authorEmail ?? "Admin"} - {absoluteTime(n.createdAt)}</p>
                  <Text>{n.text}</Text>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* History */}
      <Panel title="History">
        {detail.history.length === 0 ? <p className="text-sm text-fg-muted">No recorded changes.</p> : (
          <ol className="space-y-2 border-l border-line pl-4" aria-label="Ticket history">
            {detail.history.map((h) => (
              <li key={h.id} className="text-sm">
                <p>{describeHistory(h)}</p>
                <p className="text-xs text-fg-muted">{h.actorEmail ?? "system"} - {absoluteTime(h.at)}</p>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <ConfirmAction
        open={closing !== null}
        onClose={() => setClosing(null)}
        title={closing === "closed" ? `Close ${t.humanId}` : `Resolve ${t.humanId}`}
        level={closing === "closed" ? "reason" : "confirm"}
        danger={closing === "closed"}
        confirmLabel={closing === "closed" ? "Close ticket" : "Resolve ticket"}
        impact={closing === "closed"
          ? <>The user is notified and can no longer reply on this ticket. You can reopen it later. The reason is recorded in the audit log.</>
          : <>The user is notified that the ticket is resolved. They can reply to reopen it.</>}
        onConfirm={async (reason) => {
          if (!closing) return;
          const to = closing;
          if (inFlight.current) throw new Error("Another change is in progress.");
          inFlight.current = true;
          setBusy(true);
          try {
            await callAdmin("adminTickets", { action: "setStatus", ticketId, status: to, expectedVersion: version, ...(reason ? { reason } : {}) });
            toast.success(`Ticket ${STATUS_LABEL[to].toLowerCase()}`);
            await load(true);
          } catch (e) {
            if (isTicketConflict(e)) {
              setNotice(mutationErrorMessage(e));
              await load(true);
            }
            throw new Error(mutationErrorMessage(e));
          } finally {
            inFlight.current = false;
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
