import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FieldDef } from "../features/config/logic";
import { VoiceRegistryDiagnostics } from "../features/voice/VoiceRegistryDiagnostics";
import { VOICE_ENGINE_FIELD_KEYS, voiceFieldMetadata, unavailableVoiceFields } from "../features/voice/voiceFieldMetadata";

type Definition = Pick<FieldDef, "key" | "target" | "type">;
const complete = (): Definition[] => VOICE_ENGINE_FIELD_KEYS.map((key) => ({ key, target: "voice", type: "bool" }));
const render = (fields: readonly Definition[]) => renderToStaticMarkup(createElement(VoiceRegistryDiagnostics, { fields }));

test("complete registry projects exactly ten keys and only definition metadata", () => {
  const fields = complete();
  const rows = voiceFieldMetadata(fields);
  assert.equal(rows.length, 10);
  assert.deepEqual(rows.map((row) => row.key), [...VOICE_ENGINE_FIELD_KEYS]);
  assert.ok(rows.every((row) => row.present && row.target === "voice"));
  assert.deepEqual(unavailableVoiceFields(rows), []);
  assert.ok(rows.every((row) => Object.keys(row).join(",") === "key,present,target,type"));
  assert.match(render(fields), /10\/10 available/);
  assert.doesNotMatch(render(fields), /Some voice controls cannot be displayed/);
});

test("missing definitions are visible without treating their activation state as disabled", () => {
  const fields = complete().filter((f) => f.key === "bargeInEnabled");
  const rows = voiceFieldMetadata(fields);
  assert.deepEqual(rows[0], { key: "pipecatEnabled", present: false, target: null, type: null });
  assert.equal(unavailableVoiceFields(rows).length, 9);
  const html = render(fields);
  assert.match(html, /Some voice controls cannot be displayed/);
  assert.match(html, /1\/10 available/);
  assert.match(html, /<details open="">/);
  assert.match(html, /cannot be determined/);
});

test("wrong-target entries report actual target and remain unavailable", () => {
  const fields = complete();
  fields[0] = { key: "pipecatEnabled", target: "app", type: "string" };
  assert.deepEqual(voiceFieldMetadata(fields)[0], { key: "pipecatEnabled", present: true, target: "app", type: "string" });
  assert.deepEqual(unavailableVoiceFields(voiceFieldMetadata(fields)), ["pipecatEnabled"]);
  assert.match(render(fields), /<td class="p-2">app<\/td>/);
  assert.match(render(fields), /9\/10 available/);
});

test("duplicate wrong-target definition does not hide an available voice definition", () => {
  const fields = [{ key: "pipecatEnabled", target: "app", type: "string" } as Definition, ...complete()];
  assert.deepEqual(voiceFieldMetadata(fields)[0], { key: "pipecatEnabled", present: true, target: "voice", type: "bool" });
  assert.deepEqual(unavailableVoiceFields(voiceFieldMetadata(fields)), []);
});

test("metadata remains readable inside disabled editing with no setting controls or event handlers", () => {
  const html = renderToStaticMarkup(createElement("fieldset", { disabled: true }, createElement(VoiceRegistryDiagnostics, { fields: complete() })));
  assert.match(html, /^<fieldset disabled="">/);
  assert.match(html, /Voice field definitions/);
  assert.match(html, /pipecatEnabled/);
  assert.doesNotMatch(html, /<(input|select|textarea|button|form)\b|on(click|change|submit)=|href=|src=/i);
});

test("projection and rendering never read defaults, config values, credentials or unrelated definitions", () => {
  const fields = complete();
  for (const field of fields) {
    Object.defineProperty(field, "defaultValue", { get() { throw new Error("default accessed"); } });
    Object.defineProperty(field, "snapshot", { get() { throw new Error("snapshot accessed"); } });
    Object.defineProperty(field, "apiKey", { get() { throw new Error("credential accessed"); } });
    Object.freeze(field);
  }
  const unrelated = { key: "unrelated_private_field", get target() { throw new Error("unrelated target accessed"); }, get type() { throw new Error("unrelated type accessed"); } };
  const registry = Object.freeze([...fields, unrelated as unknown as Definition]);
  assert.equal(voiceFieldMetadata(registry).length, 10);
  assert.doesNotMatch(render(registry), /unrelated_private_field/);
});

test("rendering is pure and does not mutate registry metadata or existing setting state", () => {
  const fields = Object.freeze(complete().map((field) => Object.freeze(field)));
  const settings = Object.freeze({ pipecatEnabled: false, bargeInEnabled: true });
  const before = JSON.stringify({ fields, settings });
  const first = render(fields);
  assert.equal(render(fields), first);
  assert.equal(JSON.stringify({ fields, settings }), before);
});
