// AI Platform helpers: catalog status/filters, prices, health verdicts,
// model-chain parsing and the provider form rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_FILTER, catalogStatus, contextLabel, filterCatalog, healthVerdict, priceLabel, successRate, type CatalogModel,
} from "../features/ai/logic";
import { EMPTY_PROVIDER_FORM, providerFormError, upsertPayload } from "../features/ai/providerPresets";
import { parseModelLines, unknownModels } from "../features/config/logic";

const model = (over: Partial<CatalogModel>): CatalogModel => ({
  modelId: "a/b", name: "A B", enabled: true, appListed: true, tierRequired: null, available: true, availabilityReason: null,
  contextLength: 128000, usdPerMIn: 0.15, usdPerMOut: 0.6, free: false, vision: false, tools: false, reasoning: false,
  audioIn: false, textOut: true, health: null, ...over,
});

test("catalog status: admin switch first, then upstream, then app listing, then health", () => {
  assert.equal(catalogStatus(model({ enabled: false, available: false })), "disabled");
  assert.equal(catalogStatus(model({ available: false, appListed: false })), "unavailable");
  assert.equal(catalogStatus(model({ appListed: false })), "not-listed");
  assert.equal(catalogStatus(model({ health: { circuit: "open", consecutiveFailures: 5 } })), "circuit-open");
  assert.equal(catalogStatus(model({})), "live");
});

test("catalog filters combine", () => {
  const rows = [
    model({ modelId: "openai/gpt-4o-mini", vision: true }),
    model({ modelId: "x/free", free: true, tierRequired: "gold" }),
    model({ modelId: "y/off", enabled: false }),
  ];
  assert.deepEqual(filterCatalog(rows, { ...EMPTY_FILTER, q: "GPT" }).map((m) => m.modelId), ["openai/gpt-4o-mini"]);
  assert.deepEqual(filterCatalog(rows, { ...EMPTY_FILTER, capability: "vision" }).length, 1);
  assert.deepEqual(filterCatalog(rows, { ...EMPTY_FILTER, tier: "gold" }).map((m) => m.modelId), ["x/free"]);
  assert.deepEqual(filterCatalog(rows, { ...EMPTY_FILTER, tier: "none" }).length, 2);
  assert.deepEqual(filterCatalog(rows, { ...EMPTY_FILTER, status: "disabled" }).map((m) => m.modelId), ["y/off"]);
});

test("prices and context render honestly", () => {
  assert.equal(priceLabel(model({})), "$0.15 / $0.60");
  assert.equal(priceLabel(model({ free: true })), "Free");
  assert.equal(priceLabel(model({ usdPerMIn: null })), "—");
  assert.equal(contextLabel(128000), "128K");
  assert.equal(contextLabel(1_000_000), "1M");
  assert.equal(contextLabel(null), "—");
});

test("health verdicts and success rate", () => {
  assert.equal(healthVerdict({ circuit: "open", consecutiveFailures: 0 }), "down");
  assert.equal(healthVerdict({ circuit: "closed", consecutiveFailures: 2 }), "degraded");
  assert.equal(healthVerdict({ circuit: "closed", consecutiveFailures: 0 }), "ok");
  assert.equal(successRate(0, 0), null);
  assert.equal(successRate(3, 1), 0.75);
});

test("model chains: one id per line, order kept, duplicates dropped; unknown ids flagged", () => {
  assert.deepEqual(parseModelLines(" a/b \n\nc/d\r\na/b\n"), ["a/b", "c/d"]);
  const cat = new Set(["a/b"]);
  assert.deepEqual(unknownModels(["a/b", "c/d", "nope"], cat), ["c/d", "nope"]);
  assert.deepEqual(unknownModels("", cat), [], "blank primary = user's model");
  assert.deepEqual(unknownModels(["c/d"], null), [], "no catalog loaded: no inline verdict");
  assert.deepEqual(unknownModels(null, cat), []);
});

test("provider form: key required on create only; no silent id collision", () => {
  const f = { ...EMPTY_PROVIDER_FORM, name: "Groq", apiKey: "" };
  assert.match(providerFormError(f, null, new Set()) ?? "", /API key/);
  assert.equal(providerFormError(f, "groq-1", new Set()), null, "edit keeps the stored key");
  const stt = { ...EMPTY_PROVIDER_FORM, name: "Groq STT", category: "stt" as const, providerId: "groq", apiKey: "gsk_x" };
  assert.match(providerFormError(stt, null, new Set(["groq"])) ?? "", /already exists/);
  assert.match(providerFormError({ ...stt, providerId: " " }, null, new Set()) ?? "", /provider id/);
  const ws = { ...EMPTY_PROVIDER_FORM, name: "Search", category: "websearch" as const, baseUrl: "", model: "", apiKey: "k" };
  assert.equal(providerFormError(ws, null, new Set()), null, "web search needs no URL or model");
});

test("provider payload sends order only for STT and omits URL/model for search", () => {
  const chat = upsertPayload({ ...EMPTY_PROVIDER_FORM, name: " Groq ", order: 3 }, undefined);
  assert.equal(chat.order, undefined);
  assert.equal(chat.name, "Groq");
  const stt = upsertPayload({ ...EMPTY_PROVIDER_FORM, name: "S", category: "stt", order: 2 }, "groq");
  assert.equal(stt.order, 2);
  const ws = upsertPayload({ ...EMPTY_PROVIDER_FORM, name: "W", category: "websearch" }, "websearch", "rotate");
  assert.equal(ws.baseUrl, undefined);
  assert.equal(ws.model, undefined);
  assert.equal(ws.reason, "rotate");
});
