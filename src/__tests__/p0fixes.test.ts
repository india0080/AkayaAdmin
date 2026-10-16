// Phase 4 P0 fixes: the console must mirror what the app and server really do.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BUILT_IN_LLM, RAM_TIERS, catalogDrift } from "../features/models/catalog";
import { describeLimit, effectiveRateLimits, riskyChanges } from "../features/limits/logic";

// ── On-device catalog parity (audit S8) ─────────────────────────────────────

const DART = path.join(process.cwd(), "..", "akaya_ai", "lib", "runtime", "model_manager", "model_manager.dart");

function dartCatalog(): { id: string; ram: number; size: number }[] {
  const src = fs.readFileSync(DART, "utf8");
  const body = src.slice(src.indexOf("class AiModelCatalog"));
  const out: { id: string; ram: number; size: number }[] = [];
  const re = /AiModelInfo\(\s*id:\s*'([^']+)'[\s\S]*?fileSizeBytes:\s*(\d+)[\s\S]*?ramRequiredMb:\s*(\d+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) out.push({ id: m[1], size: Number(m[2]), ram: Number(m[3]) });
  return out;
}

test("console built-in catalog = the app's AiModelCatalog, id for id", () => {
  const dart = dartCatalog();
  assert.ok(dart.length >= 5, `parsed only ${dart.length} models from ${DART}`);
  assert.deepEqual(
    BUILT_IN_LLM.map((m) => m.id).sort(),
    dart.map((d) => d.id).sort(),
    "a saved allow-list built from a different list hides models from every user",
  );
});

test("RAM and size facts match the app (what the console shows is true)", () => {
  const byId = new Map(dartCatalog().map((d) => [d.id, d]));
  for (const m of BUILT_IN_LLM) {
    const d = byId.get(m.id)!;
    assert.equal(m.ramRequiredMb, d.ram, `${m.id} RAM`);
    assert.equal(m.fileSizeBytes, d.size, `${m.id} size`);
  }
});

test("every default RAM recommendation is a model the app ships", () => {
  const ids = new Set(BUILT_IN_LLM.map((m) => m.id));
  for (const t of RAM_TIERS) assert.ok(ids.has(t.default), `${t.label} → ${t.default}`);
});

test("drift report: names hidden built-ins, stale ids, stale recommendations", () => {
  const d = catalogDrift(["gemma4-e2b", "gemma3-1b", "my-custom"], ["my-custom"], { "0": "gemma3-1b", "4000": "gemma4-e2b" });
  assert.ok(d.hiddenBuiltIns.includes("gemma4-e4b"));
  assert.ok(!d.hiddenBuiltIns.includes("gemma4-e2b"));
  assert.deepEqual(d.staleEnabledIds, ["gemma3-1b"]);
  assert.deepEqual(d.staleRecommendations, ["gemma3-1b"]);
});

test("drift report: no allow-list means nothing is hidden", () => {
  const d = catalogDrift(null, [], null);
  assert.deepEqual(d, { hiddenBuiltIns: [], staleEnabledIds: [], staleRecommendations: [] });
});

// ── Effective limits = server rules (shared.ts getRateLimits) ──────────────

test("rateLimits map wins, used as-is", () => {
  const e = effectiveRateLimits({ rateLimits: { free: 30, silver: 300, gold: -1 }, freeMessageLimit: 999 });
  assert.equal(e.source, "rateLimits");
  assert.deepEqual(e.limits, { free: 30, silver: 300, gold: -1 });
});

test("a plan missing from the map falls back to that map's free", () => {
  const e = effectiveRateLimits({ rateLimits: { free: 40 } });
  assert.deepEqual(e.limits, { free: 40, silver: 40, gold: 40 });
});

test("legacy flat fields merge over the server defaults", () => {
  const e = effectiveRateLimits({ freeMessageLimit: 25 });
  assert.equal(e.source, "legacy-fields");
  assert.deepEqual(e.limits, { free: 25, silver: 500, gold: -1 });
});

test("nothing configured → server defaults (NOT the old console 20/200/1000)", () => {
  for (const cfg of [null, {}, { maintenanceMode: false }]) {
    const e = effectiveRateLimits(cfg);
    assert.equal(e.source, "server-default");
    assert.deepEqual(e.limits, { free: 50, silver: 500, gold: -1 });
  }
});

test("limit labels", () => {
  assert.equal(describeLimit(-1), "Unlimited");
  assert.equal(describeLimit(0), "Blocked (0)");
  assert.equal(describeLimit(1500), "1,500 / day");
});

test("risky App Config saves are detected against what was loaded", () => {
  const base = { maintenanceMode: false, onlineAiEnabled: true, offlineAiEnabled: true };
  assert.deepEqual(riskyChanges(base, base), []);
  assert.equal(riskyChanges(base, { ...base, maintenanceMode: true }).length, 1);
  assert.equal(riskyChanges(base, { ...base, onlineAiEnabled: false, offlineAiEnabled: false }).length, 2);
  // Turning maintenance OFF / AI back ON is recovery, not risk.
  assert.deepEqual(riskyChanges({ maintenanceMode: true, onlineAiEnabled: false, offlineAiEnabled: false }, base), []);
});
