// Deep-link destination registry (admin copy). Source of truth for the app and
// functions: akaya_ai/assets/deeplinks/registry.json. A parity test
// (__tests__/campaigns.test.ts) compares this copy with that JSON at test time.
// No React / Firebase imports: unit-tested under node --test.

export interface ParamSpec {
  regex?: string;
  enum?: string[];
  required: boolean;
  label?: string;
}

export interface Destination {
  type: string;
  label: string;
  params: Record<string, ParamSpec>;
  appRoute: string;
  requiresAuth: boolean;
  entityAuth: "ticket_owner" | null;
  /** false: not offered in the generic destination list. */
  adminComposerSelectable: boolean;
}


export const DESTINATIONS: Destination[] = [
  { type: "home", label: "Home", params: {}, appRoute: "/home", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "chat_new", label: "New chat", params: {}, appRoute: "/chat", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "subscription", label: "Upgrade / plans", params: {}, appRoute: "/upgrade", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "support", label: "Help & support", params: {}, appRoute: "/support", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "support_ticket", label: "Support ticket", params: { ticketId: { regex: "^[A-Za-z0-9_-]{1,128}$", required: true } }, appRoute: "/support/ticket/:ticketId", requiresAuth: true, entityAuth: "ticket_owner", adminComposerSelectable: false },
  { type: "history", label: "Chat history", params: {}, appRoute: "/history", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "tools", label: "Tools", params: {}, appRoute: "/tools", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "explore", label: "Explore", params: {}, appRoute: "/explore", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "search", label: "Search", params: {}, appRoute: "/search", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "translate", label: "Translate", params: {}, appRoute: "/translate", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "media", label: "Media", params: {}, appRoute: "/media", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "generate_image", label: "Generate image", params: {}, appRoute: "/generate-image", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "generate_video", label: "Generate video", params: {}, appRoute: "/generate-video", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "profile", label: "Profile", params: {}, appRoute: "/profile", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "settings", label: "Settings", params: {}, appRoute: "/settings", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
  { type: "floating_settings", label: "Floating assistant settings", params: {}, appRoute: "/settings/floating", requiresAuth: true, entityAuth: null, adminComposerSelectable: true },
];

export const TICKET_DESTINATION = "support_ticket";

const PARAM_LABELS: Record<string, string> = { ticketId: "Ticket ID" };
export function paramLabel(name: string): string { return PARAM_LABELS[name] ?? name; }

export function findDestination(type: string, list: readonly Destination[] = DESTINATIONS): Destination | null {
  return list.find((d) => d.type === type) ?? null;
}

/** Destinations an admin may pick in the generic list. */
export function selectableDestinations(list: readonly Destination[] = DESTINATIONS): Destination[] {
  return list.filter((d) => d.adminComposerSelectable);
}

export interface DestinationInput { type: string; params: Record<string, string> }

/** Validates type + params against the registry. Returns field-keyed errors. */
export function validateDestination(
  dest: DestinationInput,
  list: readonly Destination[] = DESTINATIONS,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const d = findDestination(dest.type, list);
  if (!d) {
    errors.type = "Choose a destination from the list.";
    return errors;
  }
  for (const [name, spec] of Object.entries(d.params)) {
    const v = (dest.params[name] ?? "").trim();
    if (!v) {
      if (spec.required) errors[name] = `${paramLabel(name)} is required.`;
      continue;
    }
    if (spec.regex && !new RegExp(spec.regex).test(v)) errors[name] = `${paramLabel(name)} is not in the expected format.`;
    if (spec.enum && !spec.enum.includes(v)) errors[name] = `${paramLabel(name)} must be one of: ${spec.enum.join(", ")}.`;
  }
  for (const name of Object.keys(dest.params)) {
    if (!(name in d.params) && dest.params[name]) errors[name] = `Unknown parameter "${name}".`;
  }
  return errors;
}

/** Wire destination: only registry params, trimmed. */
export function destinationPayload(dest: DestinationInput, list: readonly Destination[] = DESTINATIONS) {
  const d = findDestination(dest.type, list);
  const params: Record<string, string> = {};
  if (d) for (const name of Object.keys(d.params)) { const v = (dest.params[name] ?? "").trim(); if (v) params[name] = v; }
  return { type: dest.type, params };
}

/** Tolerant reader of the registry JSON file (array or {destinations:[...]}). */
export function parseRegistryJson(json: unknown): Destination[] {
  const root = json as { destinations?: unknown } | unknown[];
  const arr = Array.isArray(root) ? root : Array.isArray((root as { destinations?: unknown })?.destinations) ? ((root as { destinations: unknown[] }).destinations) : [];
  return arr.map((raw) => {
    const r = raw as Record<string, unknown>;
    const params: Record<string, ParamSpec> = {};
    for (const [k, v] of Object.entries((r.params ?? {}) as Record<string, Record<string, unknown>>)) {
      params[k] = {
        required: v.required === true,
        ...(typeof v.regex === "string" ? { regex: v.regex } : {}),
        ...(Array.isArray(v.enum) ? { enum: v.enum.map(String) } : {}),
      };
    }
    return {
      type: String(r.type), label: String(r.label ?? r.type), params, appRoute: String(r.appRoute ?? ""),
      requiresAuth: r.requiresAuth !== false,
      entityAuth: r.entityAuth === "ticket_owner" ? "ticket_owner" : null,
      adminComposerSelectable: r.adminComposerSelectable === true,
    } as Destination;
  });
}

/** Runtime registry from adminComms `destinations` ({registry}); bundled copy as fallback. */
export function registryFrom(resp: unknown): Destination[] {
  const reg = (resp as { registry?: unknown } | null)?.registry;
  const list = reg ? parseRegistryJson(reg) : [];
  return list.length > 0 ? list : DESTINATIONS;
}
