// Admin Panel > Capabilities: validation mirror, payload builders, answer-line
// preview, wire parsing, rows, permissions, nav, catalog parity.
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  CONFIRM_STATUSES, ID_RE, LIMITS, answerLine, autoReason, buildOverride, buildRows, capabilitiesAccess, countOf, draftFromOverride,
  effectiveStatus, emptyDraft, filterRows, hasErrors, needsConfirm, nameFor, overrideCount, parseOverride, parseSnapshot, resetPatch,
  sameOverride, savePatch, validateDraft, type Draft, type Override,
} from "../features/capabilities/logic";
import { CATALOG, CATALOG_VERSION, LANGS, CAPABILITY_STATUSES, catalogEntry, type CatalogEntry } from "../features/capabilities/catalog";
import { findRoute, visibleNav } from "../shell/nav";
import { hasPermission, type Permission } from "../lib/permissions";

const entry: CatalogEntry = {
  id: "doubt_camera", category: "vision", baseStatus: "live",
  labels: { en: "Doubt camera", hi: "डाउट कैमरा", hinglish: "Doubt camera" },
  descriptions: { en: "", hi: "", hinglish: "" },
};
const draft = (over: Partial<Draft> = {}): Draft => ({ ...emptyDraft(), ...over });

test("limits and ids match the server contract", () => {
  assert.deepEqual({ ...LIMITS }, { label: 40, description: 140, overrides: 100 });
  for (const id of ["ab", "web_search", "a1", "0a", "a".repeat(48)]) assert.ok(ID_RE.test(id), id);
  for (const id of ["a", "A1", "-ab", "_ab", "web-search", "web search", "a".repeat(49), ""]) assert.ok(!ID_RE.test(id), id);
  assert.deepEqual([...CAPABILITY_STATUSES], ["live", "beta", "coming_soon", "hidden"]);
  assert.deepEqual([...LANGS], ["en", "hi", "hinglish"]);
});

test("catalog: unique valid ids, English name, valid base status", () => {
  assert.equal(new Set(CATALOG.map((c) => c.id)).size, CATALOG.length);
  for (const c of CATALOG) {
    assert.ok(ID_RE.test(c.id), c.id);
    assert.ok(c.labels.en.trim() && c.labels.hi.trim() && c.labels.hinglish.trim(), c.id);
    assert.ok(c.descriptions.en.trim() && c.descriptions.hi.trim() && c.descriptions.hinglish.trim(), c.id);
    assert.ok(Array.from(c.labels.en).length <= LIMITS.label, c.id);
    assert.ok(Object.values(c.descriptions).every((d) => Array.from(d).length <= LIMITS.description), c.id);
    assert.ok((CAPABILITY_STATUSES as readonly string[]).includes(c.baseStatus), c.id);
  }
  assert.equal(catalogEntry("web_search")?.labels.en, "Web Search");
  assert.equal(catalogEntry("nope"), undefined);
});

test("validation: counts, plain text, length", () => {
  assert.deepEqual(validateDraft(draft()), {});
  assert.equal(countOf("  abc  "), 3);
  assert.equal(countOf("\u{1F600}\u{1F600}"), 2);
  const d = draft({ label: { en: "x".repeat(41), hi: "", hinglish: "" }, description: { en: "", hi: "y".repeat(141), hinglish: "" } });
  const e = validateDraft(d);
  assert.ok(e["label.en"] && e["description.hi"] && Object.keys(e).length === 2);
  assert.equal(validateDraft(draft({ label: { en: "x".repeat(40), hi: "", hinglish: "" } }))["label.en"], undefined);
  for (const bad of ["<b>x</b>", "a > b", "x＜y", "line\nbreak", "tab\tx"]) {
    assert.ok(validateDraft(draft({ label: { en: bad, hi: "", hinglish: "" } }))["label.en"], JSON.stringify(bad));
    assert.ok(validateDraft(draft({ description: { en: "", hi: "", hinglish: bad } }))["description.hinglish"], JSON.stringify(bad));
  }
  assert.ok(hasErrors({ a: "x" }) && !hasErrors({}));
});

test("buildOverride: trims, drops empties, null when nothing is set", () => {
  assert.equal(buildOverride(draft()), null);
  assert.equal(buildOverride(draft({ label: { en: "   ", hi: "", hinglish: "" } })), null);
  assert.deepEqual(buildOverride(draft({ status: "beta" })), { status: "beta" });
  assert.deepEqual(
    buildOverride(draft({ status: "coming_soon", label: { en: " Cam ", hi: "", hinglish: "Cam" }, description: { en: "", hi: "फोटो", hinglish: "" } })),
    { status: "coming_soon", label: { en: "Cam", hinglish: "Cam" }, description: { hi: "फोटो" } },
  );
  // composed form is stored
  assert.equal(buildOverride(draft({ label: { en: "Café", hi: "", hinglish: "" } }))?.label?.en, "Café");
});

test("patches: save sends the whole override, empty draft and reset send null", () => {
  assert.deepEqual(savePatch("doubt_camera", draft({ status: "hidden" })), { doubt_camera: { status: "hidden" } });
  assert.deepEqual(savePatch("doubt_camera", draft()), { doubt_camera: null });
  assert.deepEqual(resetPatch("doubt_camera"), { doubt_camera: null });
  assert.ok(autoReason("reset", "x").length >= 5);
  assert.ok(autoReason("reset", "y".repeat(500)).length < 100);
});

test("draft round trip and sameOverride ignore key order", () => {
  const ov: Override = { status: "beta", label: { hinglish: "H", en: "E" }, description: { hi: "D" } };
  assert.deepEqual(buildOverride(draftFromOverride(ov)), { status: "beta", label: { hinglish: "H", en: "E" }, description: { hi: "D" } });
  assert.ok(sameOverride(buildOverride(draftFromOverride(ov)), ov));
  assert.ok(sameOverride(null, undefined));
  assert.ok(!sameOverride({ status: "live" }, null));
  assert.ok(!sameOverride({ status: "live" }, { status: "beta" }));
  assert.deepEqual(draftFromOverride(null), emptyDraft());
});

test("effective status and the confirmation gate", () => {
  assert.equal(effectiveStatus(entry, null), "live");
  assert.equal(effectiveStatus(entry, { status: "beta" }), "beta");
  assert.deepEqual([...CONFIRM_STATUSES].sort(), ["coming_soon", "hidden"]);
  assert.equal(needsConfirm(entry, null, { status: "hidden" }), true);
  assert.equal(needsConfirm(entry, null, { status: "coming_soon" }), true);
  assert.equal(needsConfirm(entry, null, { status: "beta" }), false);
  assert.equal(needsConfirm(entry, null, { status: "live" }), false);
  assert.equal(needsConfirm(entry, null, { label: { en: "x" } }), false, "text-only change");
  assert.equal(needsConfirm(entry, { status: "hidden" }, { status: "hidden", label: { en: "x" } }), false, "already hidden");
  assert.equal(needsConfirm(entry, { status: "hidden" }, null), false, "reset to live");
  assert.equal(needsConfirm({ baseStatus: "coming_soon" }, null, null), false);
  assert.equal(needsConfirm({ baseStatus: "coming_soon" }, { status: "live" }, null), true, "reset back to coming soon");
});

test("answer line per language: override, fallback to catalog name, suffix, hidden", () => {
  assert.equal(answerLine(entry, null, "en"), "Doubt camera");
  assert.equal(answerLine(entry, null, "hi"), "डाउट कैमरा");
  assert.equal(answerLine(entry, { status: "beta" }, "en"), "Doubt camera (beta)");
  assert.equal(answerLine(entry, { status: "coming_soon" }, "en"), "Doubt camera (coming soon)");
  assert.equal(answerLine(entry, { status: "coming_soon" }, "hi"), "डाउट कैमरा (जल्द आ रहा है)");
  assert.equal(answerLine(entry, { status: "coming_soon" }, "hinglish"), "Doubt camera (jald aa raha hai)");
  assert.equal(answerLine(entry, { status: "hidden" }, "en"), null);
  assert.equal(
    answerLine(entry, { label: { hi: "फोटो डाउट" }, description: { hi: "फोटो खींचो" } }, "hi"),
    "फोटो डाउट: फोटो खींचो",
  );
  // a language with no override keeps the built-in name
  assert.equal(answerLine(entry, { label: { hi: "फोटो डाउट" } }, "en"), "Doubt camera");
  // markup-looking text is never interpreted: it is returned as a plain string
  assert.equal(typeof answerLine(entry, { description: { en: "a & b" } }, "en"), "string");
  assert.equal(nameFor({ ...entry, id: "zz_x", labels: { en: "Zed", hi: "", hinglish: "" } }, null, "hi"), "Zed");
});

test("parseOverride/parseSnapshot: tolerant of junk, keeps only known fields", () => {
  assert.equal(parseOverride(null), null);
  assert.equal(parseOverride([]), null);
  assert.equal(parseOverride({ status: "soon" }), null);
  assert.deepEqual(parseOverride({ status: "beta", extra: 1, label: { en: "x", fr: "y", hi: "  " } }), { status: "beta", label: { en: "x" } });
  assert.deepEqual(parseSnapshot({ a_b: { status: "hidden" }, c_d: null, e_f: 5 }), { a_b: { status: "hidden" } });
  assert.deepEqual(parseSnapshot(undefined), {});
  assert.equal(overrideCount({ a: {}, b: {} }), 2);
});

test("rows: catalog order, override state, unknown ids listed separately, search", () => {
  const { rows, unknown } = buildRows(CATALOG, { doubt_camera: { status: "coming_soon" }, zzz_old: { status: "hidden" } });
  assert.equal(rows.length, CATALOG.length);
  assert.deepEqual(rows.map((r) => r.id), CATALOG.map((c) => c.id));
  assert.equal(rows.find((r) => r.id === "doubt_camera")?.status, "coming_soon");
  assert.equal(rows.find((r) => r.id === "web_search")?.override, null);
  assert.deepEqual(unknown.map((r) => [r.id, r.entry, r.status]), [["zzz_old", null, "hidden"]]);
  assert.deepEqual(filterRows(rows, "DOUBT").map((r) => r.id), ["doubt_camera"]);
  assert.deepEqual(filterRows(rows, "डाउट").map((r) => r.id), ["doubt_camera"]);
  assert.equal(filterRows(rows, "  ").length, rows.length);
  assert.equal(filterRows(rows, "no-such-thing").length, 0);
});

test("permissions: view = config.read, edit = config.modify (viewer cannot edit)", () => {
  const viewer = (p: string) => p === "config.read";
  assert.deepEqual(capabilitiesAccess(viewer), { canView: true, canEdit: false });
  assert.deepEqual(capabilitiesAccess(() => true), { canView: true, canEdit: true });
  assert.deepEqual(capabilitiesAccess(() => false), { canView: false, canEdit: false });
  // roles
  assert.ok(hasPermission(["config.read"] as Permission[], "config.read"));
});

test("nav: route exists, needs config.read, is in Product Config", () => {
  const r = findRoute("/dashboard/capabilities");
  assert.ok(r);
  assert.equal(r?.route.permission, "config.read");
  assert.ok(visibleNav(() => true).some((g) => g.routes.some((x) => x.href === "/dashboard/capabilities")));
  assert.ok(!visibleNav(() => false).some((g) => g.routes.some((x) => x.href === "/dashboard/capabilities")));
});

test("config target is known to the console (history filter label)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../src/features/config/logic.ts"), "utf8");
  assert.match(src, /"capabilities"/);
  assert.match(src, /capabilities: "Capability overrides"/);
});

test("answer line falls back to the built-in description, and an override wins per language", () => {
  const e: CatalogEntry = { ...entry, descriptions: { en: "Solve doubts.", hi: "डाउट हल करें।", hinglish: "Doubt hal karo." } };
  assert.equal(answerLine(e, null, "en"), "Doubt camera: Solve doubts.");
  assert.equal(answerLine(e, { description: { en: "Photo to answer." } }, "en"), "Doubt camera: Photo to answer.");
  assert.equal(answerLine(e, { description: { en: "Photo to answer." } }, "hi"), "डाउट कैमरा: डाउट हल करें।");
  assert.equal(answerLine(e, { status: "beta" }, "hinglish"), "Doubt camera: Doubt hal karo. (beta)");
});

test("catalog parity: the bundled copy equals the app's catalog.json (id, category, baseStatus, labels, descriptions, order)", () => {
  const file = path.resolve(__dirname, "../../../akaya_ai/assets/capabilities/catalog.json");
  assert.ok(fs.existsSync(file), "akaya_ai/assets/capabilities/catalog.json must exist");
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as { version: number; entries: Record<string, unknown>[] };
  assert.equal(CATALOG_VERSION, json.version, "regenerate: node scripts/gen-capabilities-catalog.js");
  const pick = (e: Record<string, unknown>) => ({ id: e.id, category: e.category, baseStatus: e.baseStatus, labels: e.labels, descriptions: e.descriptions });
  assert.deepEqual(CATALOG.map((c) => ({ ...c })), json.entries.map(pick), "regenerate: node scripts/gen-capabilities-catalog.js");
});
