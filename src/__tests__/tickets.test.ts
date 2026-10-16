// Support tickets: pure logic (features/support/logic.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_FILTERS, STATUSES, TICKET_CONFLICT_MESSAGE, absoluteTime, allowedTransitions, applyTicketUpdate,
  buildListPayload, canReply, canTransition, describeHistory, isTicketConflict, mergePage, mutationErrorMessage,
  normalizeCounts, normalizeDetail, normalizeList, normalizeTicket, priorityRank, priorityTone, sortQueue,
  statusConfirmLevel,
} from "../features/support/logic";
import { AdminApiError, normaliseError } from "../lib/apiErrors";
import type { Ticket } from "../features/support/types";

const T = (o: Partial<Ticket> & { id: string }): Ticket => ({ ...normalizeTicket({ id: o.id }), ...o });

test("state transitions: closed can only reopen; resolved cannot go to waiting_user", () => {
  assert.deepEqual(allowedTransitions("closed"), ["open"]);
  assert.ok(canTransition("open", "closed"));
  assert.ok(canTransition("in_progress", "resolved"));
  assert.ok(!canTransition("resolved", "waiting_user"));
  for (const s of STATUSES) assert.ok(!canTransition(s, s), `${s} -> itself`);
});

test("closing needs a reason, resolving a confirmation, others none", () => {
  assert.equal(statusConfirmLevel("closed"), "reason");
  assert.equal(statusConfirmLevel("resolved"), "confirm");
  assert.equal(statusConfirmLevel("in_progress"), "none");
});

test("reply is disabled only when closed", () => {
  assert.equal(canReply("closed"), false);
  for (const s of STATUSES.filter((x) => x !== "closed")) assert.equal(canReply(s), true);
});

test("filters -> payload: defaults, omissions, trimming, limit clamp, cursor", () => {
  assert.deepEqual(buildListPayload({ ...EMPTY_FILTERS, status: "all" }), { action: "list", limit: 25 });
  assert.deepEqual(buildListPayload(EMPTY_FILTERS), { action: "list", limit: 25, status: "open" });
  const p = buildListPayload(
    { status: "waiting_user", priority: "urgent", assignee: " me ", category: "login", search: "  AKY-ABC123  " },
    "cur1",
    500,
  );
  assert.deepEqual(p, { action: "list", limit: 50, status: "waiting_user", priority: "urgent", assignedTo: "me", category: "login", search: "AKY-ABC123", cursor: "cur1" });
  assert.equal(buildListPayload({ ...EMPTY_FILTERS, search: "x".repeat(300) }).search?.toString().length, 100);
  assert.equal(buildListPayload(EMPTY_FILTERS, null, 0).limit, 1);
  assert.equal("assignedTo" in buildListPayload({ ...EMPTY_FILTERS, assignee: "   " }), false);
});

test("mergePage never duplicates and keeps order", () => {
  const a = [T({ id: "1" }), T({ id: "2" })];
  const b = [T({ id: "2", title: "dup" }), T({ id: "3" })];
  const m = mergePage(a, b);
  assert.deepEqual(m.map((t) => t.id), ["1", "2", "3"]);
  assert.equal(m[1].title, "");
  assert.deepEqual(mergePage([], [T({ id: "9" }), T({ id: "9" })]).map((t) => t.id), ["9"]);
});

test("sortQueue: unread first, then priority, then recency; stable and non-mutating", () => {
  const rows = [
    T({ id: "a", priority: "low", updatedAt: 5 }),
    T({ id: "b", priority: "urgent", updatedAt: 1 }),
    T({ id: "c", priority: "low", updatedAt: 9, unreadForAdmin: true }),
    T({ id: "d", priority: "urgent", updatedAt: 3 }),
    T({ id: "e", priority: "urgent", updatedAt: 3 }),
  ];
  const copy = rows.map((r) => r.id);
  assert.deepEqual(sortQueue(rows).map((t) => t.id), ["c", "d", "e", "b", "a"]);
  assert.deepEqual(rows.map((r) => r.id), copy);
  assert.ok(priorityRank("urgent") < priorityRank("high") && priorityRank("high") < priorityRank("normal") && priorityRank("normal") < priorityRank("low"));
  assert.equal(priorityRank("weird"), 9);
  assert.equal(priorityTone("urgent"), "danger");
});

test("applyTicketUpdate replaces in place or drops rows that left the active tab", () => {
  const rows = [T({ id: "1", status: "open", title: "old", email: "a***@x.com" }), T({ id: "2", status: "open" })];
  const upd = T({ id: "1", status: "open", title: "new", email: null });
  const same = applyTicketUpdate(rows, upd, { status: "open" });
  assert.equal(same[0].title, "new");
  assert.equal(same[0].email, "a***@x.com");
  const closed = applyTicketUpdate(rows, T({ id: "1", status: "closed" }), { status: "open" });
  assert.deepEqual(closed.map((t) => t.id), ["2"]);
  const all = applyTicketUpdate(rows, T({ id: "1", status: "closed" }), { status: "all" });
  assert.equal(all.length, 2);
});

test("conflict mapping: aborted code and 'changed since you loaded it' text", () => {
  assert.ok(isTicketConflict({ code: "functions/aborted", message: "x" }));
  assert.ok(isTicketConflict(new Error("Ticket changed since you loaded it")));
  assert.ok(isTicketConflict(normaliseError({ code: "functions/aborted", message: "" })));
  assert.ok(!isTicketConflict({ code: "permission-denied", message: "no" }));
  assert.equal(mutationErrorMessage({ code: "aborted" }), TICKET_CONFLICT_MESSAGE);
  assert.match(TICKET_CONFLICT_MESSAGE, /changed since you loaded it/);
  assert.equal(mutationErrorMessage(new AdminApiError("permission", "permission-denied", "Your role does not allow this.")), "Your role does not allow this.");
  assert.equal(mutationErrorMessage(null), "Something went wrong. Try again.");
});

test("normalizeTicket is defensive about bad data", () => {
  const t = normalizeTicket({ ticketId: "t1", status: "bogus", priority: 7, unreadForAdmin: "yes", createdAt: { _seconds: 10 }, deviceMeta: { model: "P", n: 3, bad: {} } });
  assert.equal(t.id, "t1");
  assert.equal(t.status, "open");
  assert.equal(t.priority, "normal");
  assert.equal(t.unreadForAdmin, false);
  assert.equal(t.createdAt, 10000);
  assert.deepEqual(t.deviceMeta, { model: "P", n: "3" });
  assert.equal(normalizeTicket(null).id, "");
});

test("normalizeList / normalizeCounts tolerate shape variants", () => {
  const l = normalizeList({ tickets: [{ id: "1" }, { title: "no id" }], nextCursor: "c" });
  assert.equal(l.tickets.length, 1);
  assert.equal(l.nextCursor, "c");
  assert.equal(normalizeList({ rows: [{ id: "x" }] }).nextCursor, null);
  assert.deepEqual(normalizeCounts({ counts: { open: 3, in_progress: 2, closed: 1 } }), { open: 3, in_progress: 2, waiting_user: 0, resolved: 0, closed: 1, all: 6 });
  assert.equal(normalizeCounts({ open: 1, total: 40 }).all, 40);
  assert.equal(normalizeCounts(undefined).all, 0);
});

test("normalizeDetail orders thread asc, notes/history desc, and keeps text as data", () => {
  const d = normalizeDetail({
    ticket: { id: "t", humanId: "AKY-AAAAAA", version: 4 },
    messages: [
      { id: "2", role: "admin", text: "<img src=x onerror=alert(1)>\nline2", createdAt: 20, authorName: "Sam" },
      { id: "1", role: "weird", text: "hi", createdAt: 10 },
    ],
    internal_notes: [{ id: "n1", text: "a", createdAt: 1 }, { id: "n2", text: "b", createdAt: 2 }],
    history: [{ id: "h1", at: 1, action: "setStatus", from: "open", to: "closed" }],
    user: { uid: "u", email: "a***@x.com", plan: { planId: "gold", active: false } },
  });
  assert.deepEqual(d.messages.map((m) => m.id), ["1", "2"]);
  assert.equal(d.messages[0].role, "system");
  assert.equal(d.messages[1].text, "<img src=x onerror=alert(1)>\nline2");
  assert.deepEqual(d.notes.map((n) => n.id), ["n2", "n1"]);
  assert.equal(d.ticket.version, 4);
  assert.equal(d.user?.plan, "gold (inactive)");
  assert.equal(describeHistory(d.history[0]), "SetStatus: open -> closed");
  assert.equal(normalizeDetail({}).user, null);
});

test("absoluteTime handles empty", () => {
  assert.equal(absoluteTime(null), "-");
  assert.match(absoluteTime(Date.UTC(2026, 0, 5, 12)), /2026/);
});
