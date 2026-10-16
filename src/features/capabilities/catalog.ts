// The capability catalog the console edits overrides against.
//
// SOURCE OF TRUTH is the app's `akaya_ai/assets/capabilities/catalog.json`.
// The console cannot read the app's assets at runtime, so `catalogData.ts` is
// a GENERATED typed copy (node scripts/gen-capabilities-catalog.js); a parity
// test pins it to the JSON.
import { CATALOG_DATA, CATALOG_VERSION } from "./catalogData";

export const CAPABILITY_STATUSES = ["live", "beta", "coming_soon", "hidden"] as const;
export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];
export const LANGS = ["en", "hi", "hinglish"] as const;
export type Lang = (typeof LANGS)[number];
export type Localized = Partial<Record<Lang, string>>;

export interface CatalogEntry {
  id: string;
  category: string;
  baseStatus: CapabilityStatus;
  labels: Record<Lang, string>;
  descriptions: Record<Lang, string>;
}

export const CATALOG: readonly CatalogEntry[] = CATALOG_DATA;
export { CATALOG_VERSION };

export function catalogEntry(id: string, catalog: readonly CatalogEntry[] = CATALOG): CatalogEntry | undefined {
  return catalog.find((c) => c.id === id);
}
