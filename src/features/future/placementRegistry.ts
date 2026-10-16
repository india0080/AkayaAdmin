// Bundled copy of the placement registry (contract: docs/eleven/22_change08_contract.md).
// Mirrors the app + functions registry. Ids are stable keys. `hasRoute` is
// true only for the chat-menu features that now ship (Projects, Uploaded Files,
// Add to Home: default LIVE in the app); every other placement is still a Coming
// Soon placeholder, so the server rejects live/beta there; the console mirrors that rule.
//
// Parity with akaya_ai/assets/placements/registry.json is pinned in src/__tests__/future.test.ts.

export type PlacementKind = "sidebar_row" | "home_orb" | "chat_menu_item" | "upgrade_cta" | "sidebar_dynamic";

export interface PlacementDef {
  id: string;
  label: string;
  kind: PlacementKind;
  hasRoute: boolean;
  route?: string;
  popupCapable: true;
  maxItems: number;
}

export const PLACEMENT_KIND_LABEL: Record<PlacementKind, string> = {
  sidebar_row: "Sidebar row",
  home_orb: "Home orb",
  chat_menu_item: "Chat menu item",
  upgrade_cta: "Upgrade button",
  sidebar_dynamic: "Extra sidebar row",
};

// Authoritative copy of akaya_ai/assets/placements/registry.json; future.test.ts fails on drift.
export const PLACEMENTS: readonly PlacementDef[] = [
  { id: "sidebar_future_message", label: "Sidebar: Future Message", kind: "sidebar_row", hasRoute: false, popupCapable: true, maxItems: 1 },
  { id: "sidebar_instant_loan", label: "Sidebar: Instant Loan", kind: "sidebar_row", hasRoute: false, popupCapable: true, maxItems: 1 },
  { id: "sidebar_agents", label: "Sidebar: Agents", kind: "sidebar_row", hasRoute: false, popupCapable: true, maxItems: 1 },
  { id: "sidebar_library", label: "Sidebar: Library", kind: "sidebar_row", hasRoute: false, popupCapable: true, maxItems: 1 },
  { id: "sidebar_templates", label: "Sidebar: Templates", kind: "sidebar_row", hasRoute: false, popupCapable: true, maxItems: 1 },
  { id: "home_orb_voice", label: "Home orb: Voice Mode", kind: "home_orb", hasRoute: false, popupCapable: true, maxItems: 1 },
  { id: "chat_menu_projects", label: "Chat menu: Projects", kind: "chat_menu_item", hasRoute: true, route: "/projects", popupCapable: true, maxItems: 1 },
  { id: "chat_menu_uploaded_files", label: "Chat menu: Uploaded Files", kind: "chat_menu_item", hasRoute: true, route: "/files", popupCapable: true, maxItems: 1 },
  { id: "chat_menu_add_to_home", label: "Chat menu: Add to Home", kind: "chat_menu_item", hasRoute: true, route: "action:add_to_home", popupCapable: true, maxItems: 1 },
  { id: "upgrade_cta", label: "Upgrade screen: Coming soon button", kind: "upgrade_cta", hasRoute: false, popupCapable: true, maxItems: 1 },
  { id: "sidebar_dynamic", label: "Sidebar: extra rows (admin-added)", kind: "sidebar_dynamic", hasRoute: false, popupCapable: true, maxItems: 10 },
];

export function placementById(id: string): PlacementDef | undefined {
  return PLACEMENTS.find((p) => p.id === id);
}

export function placementIndex(id: string): number {
  return PLACEMENTS.findIndex((p) => p.id === id);
}
