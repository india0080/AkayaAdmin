"use client";

// The only place that knows callable names and wire details for campaigns.
// Final shapes: docs/eleven/27_change09_backend.md.
import { callAdmin } from "@/lib/api";
import { normalizeDetail } from "@/features/support/logic";
import { imageUploadPayload } from "@/features/future/logic";
import {
  cancelRequest, composeValidateRequest, listMeta, listRequest, normalizeCampaign, normalizeCampaignList, normalizeValidate, promoteRequest, sendRequest,
  testSendRequest, type Campaign, type CampaignDraft, type TicketLock, type ValidateResult, type WireSchedule,
} from "./campaign";
import { registryFrom, type Destination } from "./destinations";

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export async function fetchDestinations(): Promise<Destination[]> {
  return registryFrom(await callAdmin("adminComms", { action: "destinations" }));
}

export const composeValidate = async (d: CampaignDraft, reg?: readonly Destination[]): Promise<ValidateResult> =>
  normalizeValidate(await callAdmin("adminComms", composeValidateRequest(d, reg)));

export async function testSendToSelf(d: CampaignDraft, reg?: readonly Destination[]) {
  const r = rec(await callAdmin("adminComms", testSendRequest(d, reg)));
  const n = (v: unknown) => (typeof v === "number" ? v : null);
  return { tokens: n(r.tokens), accepted: n(r.accepted), failed: n(r.failed), pruned: n(r.pruned) };
}

export interface SendOutcome { id: string | null; status: string | null; success: boolean; error: string | null; campaign: Campaign | null }
function outcome(raw: unknown): SendOutcome {
  const r = rec(raw);
  return {
    id: typeof r.id === "string" ? r.id : null,
    status: typeof r.status === "string" ? r.status : null,
    success: r.success !== false,
    error: typeof r.error === "string" ? r.error : null,
    campaign: r.campaign ? normalizeCampaign(r.campaign) : null,
  };
}

export async function sendCampaign(d: CampaignDraft, opts: { reason?: string; confirmAll?: boolean; force?: boolean; registry?: readonly Destination[] }) {
  return outcome(await callAdmin("adminComms", sendRequest(d, opts)));
}
export async function promoteDraft(id: string, schedule: WireSchedule, opts: { reason?: string; confirmAll?: boolean; force?: boolean }) {
  return outcome(await callAdmin("adminComms", promoteRequest(id, schedule, opts)));
}
export const cancelCampaign = (id: string, version: number | null, reason: string) =>
  callAdmin("adminComms", cancelRequest(id, version, reason));

export async function listCampaigns(opts: { status?: string; before?: number | null }) {
  const raw = await callAdmin("adminComms", listRequest(opts));
  return { rows: normalizeCampaignList(raw), ...listMeta(raw) };
}
export async function getCampaign(id: string) {
  return normalizeCampaign(rec(await callAdmin("adminComms", { action: "getCampaign", campaignId: id })).campaign);
}

/** adminPushImage (push/ prefix, comms.send). */
export async function uploadPushImage(bytes: Uint8Array, mime: string, fileName: string): Promise<{ url: string }> {
  const res = await callAdmin<{ url?: string }>("adminPushImage", imageUploadPayload(bytes, mime, fileName));
  if (!res?.url) throw new Error("The upload did not return an image URL.");
  return { url: res.url };
}

/** Ticket lookup for the support_ticket destination (adminTickets get, support.read). */
export async function lookupTicket(ticketId: string): Promise<TicketLock & { title: string; email: string | null; humanId: string }> {
  const d = normalizeDetail(await callAdmin("adminTickets", { action: "get", ticketId }));
  const t = d.ticket;
  if (!t.id && !d.user) throw new Error("Ticket not found.");
  return { ticketId: t.id || ticketId, ownerUid: t.uid || d.user?.uid || null, title: t.title, email: d.user?.email ?? t.email, humanId: t.humanId };
}
