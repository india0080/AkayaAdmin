// Voice & Floating helpers: voice chain text formats, list parsing, and the
// voice package checks (https, sha256, seeding that never overwrites).
import { test } from "node:test";
import assert from "node:assert/strict";
import { chainMapToText, chainToText, parseChain, parseChainMap, parseList, showValue } from "../features/config/logic";
import { SEED_PACKAGES, missingSeeds, packageError, parseFiles, unverifiedFiles } from "../features/voice/logic";

test("voice chain: provider | model | voice per line, round-trips", () => {
  const r = parseChain(" groq | qwen/qwen3.8-27b \nopenrouter|google/gemini-2.5-flash-lite| \n");
  assert.equal(r.error, null);
  assert.deepEqual(r.value, [{ provider: "groq", model: "qwen/qwen3.8-27b" }, { provider: "openrouter", model: "google/gemini-2.5-flash-lite" }]);
  assert.equal(chainToText(r.value), "groq | qwen/qwen3.8-27b\nopenrouter | google/gemini-2.5-flash-lite");
  assert.deepEqual(parseChain(""), { value: null, error: null }, "blank = default");
  assert.ok(parseChain("just-a-provider").error);
  assert.ok(parseChain("bad id! | model").error);
});

test("TTS map: lang: rung per line; a default chain is required", () => {
  const text = "default: sarvam | bulbul:v3 | priya\nhi: openrouter | hexgrad/kokoro-82m | hf_alpha\nhi: sarvam | bulbul:v3 | priya";
  const r = parseChainMap(text);
  assert.equal(r.error, null);
  assert.equal(r.value!.hi.length, 2, "rungs for one language keep their order");
  assert.equal(chainMapToText(r.value), text, "default first, stable text");
  assert.ok(parseChainMap("hi: sarvam | bulbul:v3").error, "no default line");
  assert.ok(parseChainMap("hindi sarvam").error);
});

test("confirmation dialogs render chains, not [object Object]", () => {
  assert.equal(showValue([{ provider: "groq", model: "m" }]), "groq | m");
  assert.equal(showValue({ default: [{ provider: "sarvam", model: "b", voice: "priya" }] }), "default: sarvam | b | priya");
});

test("line lists check allowed values or a pattern", () => {
  assert.deepEqual(parseList("os.native\nsherpa.whisper\nos.native", { allowed: ["sherpa.whisper", "os.native"] }).value, ["os.native", "sherpa.whisper"]);
  assert.ok(parseList("sherpa.vits", { allowed: ["sherpa.whisper", "os.native"] }).error);
  const pkg = "^[A-Za-z][A-Za-z0-9_]*(\\.[A-Za-z0-9_]+)+$";
  assert.deepEqual(parseList("com.bank.app", { pattern: pkg }).value, ["com.bank.app"]);
  assert.ok(parseList("not a package", { pattern: pkg }).error);
});

test("voice package files: https only, positive sizes, sha256 as 64 hex", () => {
  const ok = parseFiles(JSON.stringify([{ filename: "m.onnx", url: "https://x/m.onnx", sizeBytes: 10, sha256: "A".repeat(64) }]));
  assert.equal(ok.error, null);
  assert.equal(ok.files![0].sha256, "a".repeat(64));
  assert.ok(parseFiles("[]").error);
  assert.ok(parseFiles("not json").error);
  assert.ok(parseFiles(JSON.stringify([{ filename: "m", url: "http://x", sizeBytes: 1 }])).error);
  assert.ok(parseFiles(JSON.stringify([{ filename: "m", url: "https://x", sizeBytes: 0 }])).error);
  assert.ok(parseFiles(JSON.stringify([{ filename: "m", url: "https://x", sizeBytes: 1, sha256: "abc" }])).error);
});

test("seeding only adds packages that are missing (never overwrites hashes)", () => {
  assert.equal(missingSeeds(new Set()).length, SEED_PACKAGES.length);
  assert.deepEqual(missingSeeds(new Set(SEED_PACKAGES.map((p) => p.id))), []);
  assert.deepEqual(missingSeeds(new Set(["silero-vad"])).map((p) => p.id).includes("silero-vad"), false);
  assert.equal(unverifiedFiles(SEED_PACKAGES[1]), 3);
  assert.equal(packageError({ id: "Bad Id", name: "x", type: "stt", version: 1 }), "Id: lowercase letters, digits and hyphens.");
  assert.equal(packageError({ id: "ok-id", name: "x", type: "stt", version: 0 }), "Version must be a whole number from 1.");
  assert.equal(packageError({ id: "ok-id", name: "x", type: "tts", version: 2 }), null);
});
