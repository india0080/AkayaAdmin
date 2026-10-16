// Admin Panel > Future: pure logic (types, validators, payload builders,
// reorder math, wire parsing, image checks). No React / Firebase imports so it
// is unit-tested under node --test. The SERVER re-validates everything.
import { placementById, placementIndex, type PlacementDef } from "./placementRegistry";

export const STATUSES = ["live", "beta", "coming_soon", "hidden"] as const;
export type FutureStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<FutureStatus, string> = {
  live: "Live", beta: "Beta", coming_soon: "Coming soon", hidden: "Hidden",
};
export const POPUP_TYPES = ["text", "image", "image_text"] as const;
export type PopupType = (typeof POPUP_TYPES)[number];
export const POPUP_TYPE_LABEL: Record<PopupType, string> = {
  text: "Text", image: "Image", image_text: "Image and text",
};
export const CTA_ACTIONS = ["close", "upgrade"] as const;
export type CtaAction = (typeof CTA_ACTIONS)[number];
export const CTA_LABEL: Record<CtaAction, string> = { close: "Close the popup", upgrade: "Open the upgrade screen" };

/// Fixed icon list = the backend allowlist (pinned against registry.json in tests).
/// `glyph` is the console icon used only to draw the preview.
export const ICONS = [
  { key: "schedule", label: "Schedule", glyph: "clock" },
  { key: "hourglass_empty", label: "Hourglass", glyph: "clock" },
  { key: "rocket_launch", label: "Rocket", glyph: "sparkles" },
  { key: "auto_awesome", label: "Sparkles", glyph: "sparkles" },
  { key: "new_releases", label: "New", glyph: "flag" },
  { key: "campaign", label: "Campaign", glyph: "megaphone" },
  { key: "notifications", label: "Bell", glyph: "bell" },
  { key: "bolt", label: "Bolt", glyph: "activity" },
  { key: "construction", label: "Construction", glyph: "wrench" },
  { key: "lightbulb", label: "Idea", glyph: "sparkles" },
  { key: "star", label: "Star", glyph: "sparkles" },
  { key: "message", label: "Message", glyph: "bubble" },
  { key: "send", label: "Send", glyph: "arrow" },
  { key: "mic", label: "Microphone", glyph: "mic" },
  { key: "chat", label: "Chat", glyph: "bubble" },
  { key: "folder", label: "Folder", glyph: "grid" },
  { key: "description", label: "Document", glyph: "scroll" },
  { key: "library_books", label: "Library", glyph: "layers" },
  { key: "dashboard_customize", label: "Dashboard", glyph: "grid" },
  { key: "apps", label: "Apps", glyph: "grid" },
  { key: "smart_toy", label: "Assistant", glyph: "cpu" },
  { key: "payments", label: "Payments", glyph: "card" },
  { key: "account_balance", label: "Bank", glyph: "card" },
  { key: "home", label: "Home", glyph: "home" },
] as const;
export const ICON_KEYS: readonly string[] = ICONS.map((i) => i.key);
export function iconGlyph(key: string): string {
  return ICONS.find((i) => i.key === key)?.glyph ?? "sparkles";
}

export const LIMITS = {
  title: 60, buttonLabel: 30, popupTitle: 80, popupBody: 600, ctaLabel: 30,
  imageBytes: 1024 * 1024, sortStep: 10, sortMax: 9999,
} as const;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export interface Popup {
  type: PopupType;
  title: string;
  body: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaAction?: CtaAction;
}

/// An item as stored in config_placements/{id}.
export interface FutureItem {
  id: string;
  placement: string;
  title: string;
  buttonLabel: string;
  icon: string;
  status: FutureStatus;
  enabled: boolean;
  sortOrder: number;
  popup: Popup;
  startAt?: number;
  endAt?: number;
  version?: number;
  updatedAt?: number | null;
  updatedBy?: string | null;
}

/// The editable part (what the drawer holds). Window fields are ms or null.
export interface Draft {
  placement: string;
  title: string;
  buttonLabel: string;
  icon: string;
  status: FutureStatus;
  enabled: boolean;
  popup: Popup;
  startAt: number | null;
  endAt: number | null;
}

export function emptyDraft(placement: string): Draft {
  return {
    placement, title: "", buttonLabel: "", icon: "schedule", status: "coming_soon", enabled: true,
    popup: { type: "text", title: "", body: "", ctaAction: "close" },
    startAt: null, endAt: null,
  };
}

export function draftFromItem(it: FutureItem): Draft {
  return {
    placement: it.placement, title: it.title, buttonLabel: it.buttonLabel, icon: it.icon, status: it.status,
    enabled: it.enabled, popup: { ...it.popup }, startAt: it.startAt ?? null, endAt: it.endAt ?? null,
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

export type Errors = Record<string, string>;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const BRACKETS = /[<>＜＞]/;
const NEWLINE = /[\n\r]/;

function text(errs: Errors, key: string, label: string, v: string, max: number, required: boolean, multiline = false) {
  const t = v.trim();
  if (BRACKETS.test(v)) { errs[key] = `${label} cannot contain < or > (plain text only).`; return; }
  if (!multiline && NEWLINE.test(v)) { errs[key] = `${label} must be a single line.`; return; }
  if (required && t === "") errs[key] = `${label} is required.`;
  else if (t.length > max) errs[key] = `${label} must be ${max} characters or fewer (now ${t.length}).`;
  else if (CONTROL.test(v)) errs[key] = `${label} contains control characters.`;
}

export function isHttpsUrl(u: string): boolean {
  return u.startsWith("https://") && !/\s/.test(u) && u.length <= 2048;
}

/// Mirrors the server rules (contract) so errors show before the call.
export function validateDraft(d: Draft, opts: { existingInPlacement?: number; editing?: boolean } = {}): Errors {
  const e: Errors = {};
  const pl: PlacementDef | undefined = placementById(d.placement);
  if (!pl) e.placement = "Choose a placement.";
  else {
    if ((d.status === "live" || d.status === "beta") && !pl.hasRoute) {
      e.status = `"${STATUS_LABEL[d.status]}" is only possible for placements with an app route. This one has none.`;
    }
    if (!opts.editing && (opts.existingInPlacement ?? 0) >= pl.maxItems) {
      e.placement = `This placement already has its maximum of ${pl.maxItems} item${pl.maxItems === 1 ? "" : "s"}.`;
    }
  }
  if (!STATUSES.includes(d.status)) e.status = "Choose a status.";
  if (!ICON_KEYS.includes(d.icon)) e.icon = "Choose an icon from the list.";
  text(e, "title", "Title", d.title, LIMITS.title, true);
  text(e, "buttonLabel", "Button label", d.buttonLabel, LIMITS.buttonLabel, true);
  const p = d.popup;
  if (!POPUP_TYPES.includes(p.type)) e["popup.type"] = "Choose a popup type.";
  const needsText = p.type === "text" || p.type === "image_text";
  const needsImage = p.type === "image" || p.type === "image_text";
  text(e, "popup.title", "Popup title", p.title, LIMITS.popupTitle, needsText);
  text(e, "popup.body", "Popup body", p.body, LIMITS.popupBody, needsText, true);
  if (needsImage && !p.imageUrl) e["popup.imageUrl"] = "Upload an image for this popup type.";
  else if (p.imageUrl && !isHttpsUrl(p.imageUrl)) e["popup.imageUrl"] = "The image URL must be https.";
  text(e, "popup.ctaLabel", "Popup button label", p.ctaLabel ?? "", LIMITS.ctaLabel, false);
  if (p.ctaAction && !CTA_ACTIONS.includes(p.ctaAction)) e["popup.ctaAction"] = "Choose close or upgrade.";
  if (d.startAt !== null && !Number.isFinite(d.startAt)) e.startAt = "Start is not a valid date.";
  if (d.endAt !== null && !Number.isFinite(d.endAt)) e.endAt = "End is not a valid date.";
  if (!e.startAt && !e.endAt && d.startAt !== null && d.endAt !== null && d.endAt <= d.startAt) {
    e.endAt = "End must be after the start.";
  }
  return e;
}

export const hasErrors = (e: Errors) => Object.keys(e).length > 0;

// ── Payload builders (what adminConfig apply receives) ─────────────────────

/// Wire form of one item. No version/updatedAt/updatedBy: the server owns them.
export type ItemWire = Omit<FutureItem, "version" | "updatedAt" | "updatedBy">;
/// adminConfig patch for target "placements": { [itemId]: item | null } (null deletes).
/// Values: complete items, partial items (existing ids only; null clears an optional field) or null (delete).
export type PlacementsPatch = Record<string, Record<string, unknown> | null>;

export const ITEM_ID_RE = /^[a-z0-9][a-z0-9_]{2,47}$/;

export function newItemId(rand: () => number = Math.random, now: number = Date.now()): string {
  return `fi_${now.toString(36)}${Math.floor(rand() * 36 ** 4).toString(36).padStart(4, "0")}`;
}

function cleanPopup(p: Popup): Popup {
  const out: Popup = { type: p.type, title: p.title.trim(), body: p.body.trim() };
  if (p.type !== "text" && p.imageUrl) out.imageUrl = p.imageUrl;
  const cta = (p.ctaLabel ?? "").trim();
  if (cta) out.ctaLabel = cta;
  // The server rejects a ctaAction without a ctaLabel, and the default draft
  // carries ctaAction "close": only send the action together with a label.
  if (cta) out.ctaAction = p.ctaAction ?? "close";
  return out;
}

export function buildItem(id: string, d: Draft, sortOrder: number): ItemWire {
  const w: ItemWire = {
    id, placement: d.placement, title: d.title.trim(), buttonLabel: d.buttonLabel.trim(), icon: d.icon,
    status: d.status, enabled: d.enabled, sortOrder, popup: cleanPopup(d.popup),
  };
  if (d.startAt !== null) w.startAt = d.startAt;
  if (d.endAt !== null) w.endAt = d.endAt;
  return w;
}

export function toWire(it: FutureItem): ItemWire {
  const rest: Record<string, unknown> = { ...it };
  delete rest.version;
  delete rest.updatedAt;
  delete rest.updatedBy;
  const w = rest as unknown as ItemWire;
  return { ...w, popup: cleanPopup(w.popup) };
}

export const upsertPatch = (item: ItemWire): PlacementsPatch => ({ [item.id]: { ...item } });

/// Edit patch: the complete new item, with explicit nulls for optional fields
/// the operator cleared (the server merges over the stored item).
export function editPatch(prev: FutureItem, item: ItemWire): PlacementsPatch {
  const v: Record<string, unknown> = { ...item };
  if (prev.startAt !== undefined && item.startAt === undefined) v.startAt = null;
  if (prev.endAt !== undefined && item.endAt === undefined) v.endAt = null;
  const popup: Record<string, unknown> = { ...item.popup };
  for (const k of ["imageUrl", "ctaLabel", "ctaAction"] as const) {
    if (prev.popup[k] !== undefined && item.popup[k] === undefined) popup[k] = null;
  }
  v.popup = popup;
  return { [item.id]: v };
}
export const deletePatch = (id: string): PlacementsPatch => ({ [id]: null });
export function togglePatch(it: FutureItem, enabled: boolean): PlacementsPatch {
  return { [it.id]: { enabled } };
}

// ── Ordering ────────────────────────────────────────────────────────────────

export function sortItems(items: FutureItem[]): FutureItem[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
}

export interface Group {
  id: string;
  placement: PlacementDef | null;
  items: FutureItem[];
}

/// Registry order first, then any unknown placement ids (so nothing is hidden).
export function groupByPlacement(items: FutureItem[]): Group[] {
  const map = new Map<string, FutureItem[]>();
  for (const it of items) map.set(it.placement, [...(map.get(it.placement) ?? []), it]);
  const ids = [...map.keys()];
  const known = ids.filter((id) => placementById(id)).sort((a, b) => placementIndex(a) - placementIndex(b));
  const unknown = ids.filter((id) => !placementById(id)).sort();
  return [...known, ...unknown].map((id) => ({ id, placement: placementById(id) ?? null, items: sortItems(map.get(id) ?? []) }));
}

/// Next sortOrder for a new item: after the current last of its placement.
export function nextSortOrder(group: FutureItem[]): number {
  return group.length === 0 ? LIMITS.sortStep : Math.min(LIMITS.sortMax, Math.max(...group.map((g) => g.sortOrder)) + LIMITS.sortStep);
}

/// Move one item up (-1) or down (+1) inside its placement group. Returns the
/// patch with ONLY the items whose sortOrder changed, renumbering the group in
/// steps of 10 (so ties/gaps from older data heal), or null when it cannot move.
export function reorderPatch(group: FutureItem[], id: string, dir: -1 | 1): PlacementsPatch | null {
  const list = sortItems(group);
  const i = list.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return null;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  const patch: PlacementsPatch = {};
  next.forEach((it, idx) => {
    const so = (idx + 1) * LIMITS.sortStep;
    if (it.sortOrder !== so) patch[it.id] = { sortOrder: so };
  });
  return Object.keys(patch).length ? patch : null;
}

// ── Wire parsing (tolerant: malformed rows are dropped, never thrown) ──────

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object") {
    const o = v as { seconds?: number; _seconds?: number };
    const s = o.seconds ?? o._seconds;
    if (typeof s === "number") return s * 1000;
  }
  return null;
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export function parseItem(id: string, raw: unknown): FutureItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pr = (r.popup && typeof r.popup === "object" ? r.popup : {}) as Record<string, unknown>;
  const status = STATUSES.find((s) => s === r.status);
  const ptype = POPUP_TYPES.find((s) => s === pr.type) ?? "text";
  if (!status || typeof r.placement !== "string") return null;
  const popup: Popup = { type: ptype, title: str(pr.title), body: str(pr.body) };
  if (typeof pr.imageUrl === "string" && pr.imageUrl) popup.imageUrl = pr.imageUrl;
  if (typeof pr.ctaLabel === "string" && pr.ctaLabel) popup.ctaLabel = pr.ctaLabel;
  const ca = CTA_ACTIONS.find((s) => s === pr.ctaAction);
  if (ca) popup.ctaAction = ca;
  const item: FutureItem = {
    id: str(r.id) || id, placement: r.placement, title: str(r.title), buttonLabel: str(r.buttonLabel),
    icon: str(r.icon), status, enabled: r.enabled !== false,
    sortOrder: typeof r.sortOrder === "number" && Number.isFinite(r.sortOrder) ? r.sortOrder : 0, popup,
  };
  const sa = num(r.startAt), ea = num(r.endAt);
  if (sa !== null) item.startAt = sa;
  if (ea !== null) item.endAt = ea;
  if (typeof r.version === "number") item.version = r.version;
  item.updatedAt = num(r.updatedAt);
  item.updatedBy = typeof r.updatedBy === "string" ? r.updatedBy : null;
  return item;
}

/// adminConfig `get` shape for "placements": snapshot is { [itemId]: item } (absent items are missing). Also accepts snapshot.items (array or map) so a
/// small backend variation does not break the page.
export function parseSnapshot(snapshot: unknown): FutureItem[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  let src: unknown = snapshot;
  const inner = (snapshot as { items?: unknown }).items;
  if (inner && typeof inner === "object") src = inner;
  const out: FutureItem[] = [];
  if (Array.isArray(src)) {
    for (const r of src) {
      const it = parseItem(str((r as { id?: unknown } | null)?.id), r);
      if (it) out.push(it);
    }
  } else {
    for (const [id, r] of Object.entries(src as Record<string, unknown>)) {
      const it = parseItem(id, r);
      if (it) out.push(it);
    }
  }
  return out;
}

// ── Visibility window ───────────────────────────────────────────────────────

export type WindowState = "always" | "scheduled" | "active" | "expired";
export function windowState(it: { startAt?: number | null; endAt?: number | null }, now: number): WindowState {
  const s = it.startAt ?? null, e = it.endAt ?? null;
  if (s === null && e === null) return "always";
  if (s !== null && now < s) return "scheduled";
  if (e !== null && now >= e) return "expired";
  return "active";
}

const pad = (n: number) => String(n).padStart(2, "0");
/// ms to the value of <input type="datetime-local"> in the browser's zone.
export function msToLocalInput(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function localInputToMs(v: string): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

// ── Image checks (client side; the server sniffs content again) ────────────

export type ImageCheck = { ok: true; mime: string } | { ok: false; error: string };

/// Sniffs the first bytes (png / jpeg / webp) and checks size.
export function checkImage(bytes: Uint8Array, size: number): ImageCheck {
  if (size <= 0) return { ok: false, error: "The file is empty." };
  if (size > LIMITS.imageBytes) {
    return { ok: false, error: `The image is ${(size / 1048576).toFixed(2)} MB. The limit is 1 MB.` };
  }
  let mime: string | null = null;
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) mime = "image/png";
  else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = "image/jpeg";
  else if (
    bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) mime = "image/webp";
  if (!mime) return { ok: false, error: "Only PNG, JPEG or WebP images are allowed. This file is not one of them." };
  return { ok: true, mime };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + 0x8000)));
  return btoa(bin);
}

/// adminFutureImage request { contentBase64, mimeType?, fileName? }.
export interface ImageUploadResult { url: string; path: string; contentType: string; bytes: number; width: number; height: number }
export function imageUploadPayload(bytes: Uint8Array, mime: string, fileName?: string) {
  return { contentBase64: bytesToBase64(bytes), mimeType: mime, ...(fileName ? { fileName: fileName.slice(0, 80) } : {}) };
}

// ── Permissions ─────────────────────────────────────────────────────────────

/// Server mirror: adminConfig get needs config.read; apply and
/// adminFutureImage need config.modify; rollback needs config.activate (no rollback control on this page).
export const FUTURE_READ_PERMISSION = "config.read" as const;
export const FUTURE_WRITE_PERMISSION = "config.modify" as const;
export function futureAccess(can: (p: typeof FUTURE_READ_PERMISSION | typeof FUTURE_WRITE_PERMISSION) => boolean) {
  return { canView: can(FUTURE_READ_PERMISSION), canEdit: can(FUTURE_WRITE_PERMISSION) };
}

/// adminConfig requires a reason of at least 5 characters.
export function autoReason(verb: string, title: string): string {
  const r = `Future: ${verb} "${title.slice(0, 60)}"`;
  return r.length >= 5 ? r : `Future: ${verb}`;
}
