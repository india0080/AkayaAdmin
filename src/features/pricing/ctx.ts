// Shared view-model handed from CountryPricingPage to its panels (types only).
import type { PriceDraft } from "./draft";
import type { LegacyPrice } from "./preview";
import type { FlatPolicy, PolicyState, PricingRegistry } from "./registry";
import type { PlanId, PriceRow } from "./logic";
import type { TableRow } from "./table";

export interface PricingCtx {
  registry: PricingRegistry;
  planId: PlanId;
  baseRows: ReadonlyMap<string, PriceRow>;
  draft: PriceDraft;
  setDraft: (fn: (d: PriceDraft) => PriceDraft) => void;
  basePolicyFlat: FlatPolicy;
  basePolicy: PolicyState;
  /// policy with the draft edits applied
  policy: PolicyState;
  /// all 249 rows of the selected product (draft applied)
  tableRows: TableRow[];
  canEdit: boolean;
  /// false when the pricingPolicy target could not be read: country / policy editing is off
  policyReady: boolean;
  gateway: ReadonlySet<string>;
  legacy: Record<string, LegacyPrice | null | undefined> | undefined;
}
