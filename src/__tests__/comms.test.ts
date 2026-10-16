// Push delivery labels: honest about topic sends and partial delivery.
import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryLabel } from "../features/comms/logic";

test("delivery labels never overstate", () => {
  assert.equal(deliveryLabel({ state: "delivered", delivered: 3, attempted: 3 }), "Delivered 3/3");
  assert.equal(deliveryLabel({ state: "partial", delivered: 2, attempted: 5 }), "Partial 2/5");
  assert.equal(deliveryLabel({ state: "topic", delivered: null, attempted: null }), "Sent to topic (unverified)");
  assert.equal(deliveryLabel({ state: "no-audience", delivered: 0, attempted: 0 }), "No devices");
  assert.equal(deliveryLabel({ state: "queued", delivered: null, attempted: null }), "Queued");
  assert.equal(deliveryLabel({ state: "failed", delivered: null, attempted: null }), "Failed");
});
