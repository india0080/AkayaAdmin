// Product Config helpers: flag state, draft diffing, the kill-switch mirror,
// and the intent-rule list parser.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  draftPatch, effectiveOn, flagState, invalidRegexes, isDangerous, linesToList, showValue,
  type FlagDef, type Registry,
} from "../features/config/logic";

const flag = (over: Partial<FlagDef>): FlagDef => ({
  key: "k", label: "K", domain: "d", description: "", defaultWhenAbsent: true, readBy: "app", ...over,
});

const REG: Registry = {
  flags: [
    flag({ key: "planner_enabled" }),
    flag({ key: "voice_enabled", killSwitch: true, defaultWhenAbsent: false }),
    flag({ key: "app_check_enforced", killSwitch: true, defaultWhenAbsent: false, dangerousWhen: true }),
  ],
  fields: [
    { key: "maintenanceMode", target: "app", label: "", type: "bool", description: "", defaultValue: false, dangerousWhen: true },
    { key: "onlineAiEnabled", target: "app", label: "", type: "bool", description: "", defaultValue: true, dangerousWhen: false },
    { key: "minVersion", target: "app", label: "", type: "semver", description: "", defaultValue: "" },
  ],
};

test("an unset flag shows its real default, not 'off'", () => {
  const def = REG.flags[0];
  assert.equal(flagState(def, undefined), "default-on");
  assert.equal(flagState(def, null), "default-on");
  assert.equal(flagState(def, false), "off");
  assert.equal(effectiveOn(def, null), true);
  assert.equal(flagState(REG.flags[1], undefined), "default-off");
});

test("draftPatch sends only changed keys", () => {
  assert.deepEqual(draftPatch({ a: 1, b: "x", c: null }, { a: 1, b: "y", c: null }), { b: "y" });
  assert.deepEqual(draftPatch({ l: ["a"] }, { l: ["a"] }), {});
  assert.deepEqual(draftPatch({}, { a: null }), {});
  assert.deepEqual(draftPatch({ a: 3 }, { a: null }), { a: null });
});

test("kill switch danger mirrors the server", () => {
  // Turning a kill switch OFF (its dangerous side) is dangerous; ON is not.
  assert.equal(isDangerous(REG, "flags", "voice_enabled", true, false), true);
  assert.equal(isDangerous(REG, "flags", "voice_enabled", null, true), false);
  // Unset -> false is no effective change for a default-off switch.
  assert.equal(isDangerous(REG, "flags", "voice_enabled", null, false), false);
  // App Check: enforcing is the dangerous direction.
  assert.equal(isDangerous(REG, "flags", "app_check_enforced", null, true), true);
  assert.equal(isDangerous(REG, "flags", "planner_enabled", true, false), false);
  assert.equal(isDangerous(REG, "app", "maintenanceMode", null, true), true);
  assert.equal(isDangerous(REG, "app", "onlineAiEnabled", true, false), true);
  assert.equal(isDangerous(REG, "app", "onlineAiEnabled", false, true), false);
  assert.equal(isDangerous(REG, "app", "minVersion", "", "2.0.0"), false);
});

test("values render readably", () => {
  assert.equal(showValue(null), "Default");
  assert.equal(showValue(true), "On");
  assert.equal(showValue([]), "None");
  assert.equal(showValue(-1), "Unlimited (-1)");
  assert.equal(showValue(["a", "b"]), "a, b");
});

test("intent lists split on newlines so regex commas survive", () => {
  assert.deepEqual(linesToList("a\r\n  b \n\n\\d{1,3}\n"), ["a", "b", "\\d{1,3}"]);
  assert.deepEqual(linesToList(""), []);
  assert.deepEqual(invalidRegexes(["ok+", "(unclosed", "\\d{1,3}"]), ["(unclosed"]);
});

test("mascot flags (default OFF, kill switch): the Flags page logic treats them like any registered flag", () => {
  const m = flag({ key: "mascot_enabled", killSwitch: true, defaultWhenAbsent: false, domain: "Product" });
  const reg: Registry = { flags: [m], fields: [] };
  assert.equal(flagState(m, undefined), "default-off");
  assert.equal(effectiveOn(m, null), false);
  assert.equal(flagState(m, true), "on");
  assert.equal(flagState(m, false), "off");
  // Unset -> explicit false changes nothing effective; ON -> OFF (or unset) is the remote kill.
  assert.equal(isDangerous(reg, "flags", "mascot_enabled", null, false), false);
  assert.equal(isDangerous(reg, "flags", "mascot_enabled", true, false), true);
  assert.equal(isDangerous(reg, "flags", "mascot_enabled", true, null), true);
  assert.equal(isDangerous(reg, "flags", "mascot_enabled", false, true), false);
});
