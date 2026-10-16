// Support tickets (Change 5). Shapes of the `adminTickets` callable as the
// console consumes them. Timestamps are epoch millis (number | null).

export type TicketStatus = "open" | "in_progress" | "waiting_user" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type TicketCategory =
  | "login" | "subscription" | "floating" | "attachments" | "models" | "voice"
  | "notifications" | "account" | "permissions" | "errors" | "howto" | "other";
export type MessageRole = "user" | "bot" | "admin" | "system";

export interface Ticket {
  id: string;
  humanId: string;
  uid: string;
  /// Present only when the backend includes it (masked unless users.pii).
  email: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory | string;
  title: string;
  summary: string;
  createdAt: number | null;
  updatedAt: number | null;
  lastMessageAt: number | null;
  lastMessageBy: "user" | "admin" | "system" | null;
  assignedToUid: string | null;
  assignedToEmail: string | null;
  appVersion: string | null;
  platform: string | null;
  deviceMeta: Record<string, string> | null;
  unreadForAdmin: boolean;
  messageCount: number;
  attachmentCount: number;
  version: number;
}

export interface TicketMessage {
  id: string;
  role: MessageRole;
  text: string;
  createdAt: number | null;
  authorName: string | null;
  attachments: { name: string; type: string; size: number }[];
}

export interface InternalNote {
  id: string;
  text: string;
  createdAt: number | null;
  authorEmail: string | null;
}

export interface HistoryEntry {
  id: string;
  at: number | null;
  actorEmail: string | null;
  action: string;
  from: string | null;
  to: string | null;
}

export interface TicketUserContext {
  uid: string;
  email: string | null;
  displayName: string | null;
  plan: string | null;
  entitlement: string | null;
  createdAt: number | null;
}

export interface TicketDetail {
  ticket: Ticket;
  messages: TicketMessage[];
  notes: InternalNote[];
  history: HistoryEntry[];
  user: TicketUserContext | null;
}

export interface TicketList {
  tickets: Ticket[];
  nextCursor: string | null;
}

export type TicketCounts = Record<TicketStatus | "all", number>;

export interface QueueFilters {
  status: TicketStatus | "all";
  priority: TicketPriority | "";
  /// "" = anyone, "me", "unassigned", or a specific admin uid.
  assignee: string;
  category: string;
  search: string;
}
