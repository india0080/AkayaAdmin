// Design tokens: the three themes expose the same variables, and the opt-in
// "rose" theme keeps text readable (WCAG AA) on its surfaces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { THEME_CYCLE, parsePref, resolveTheme } from "../shell/theme";

const css = readFileSync(join(process.cwd(), "src", "design", "tokens.css"), "utf8").split("\r").join("");

/// Variables declared inside the block that starts with `selector`.
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing block ${selector}`);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start, end);
  const out = new Map<string, string>();
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

const light = block(":root,\n[data-theme=\"light\"]");
const dark = block('[data-theme="dark"]');
const rose = block('[data-theme="rose"]');

function rgb(value: string): [number, number, number] {
  const m = value.match(/(\d+)\s+(\d+)\s+(\d+)/);
  assert.ok(m, `not an rgb triple: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function luminance([r, g, b]: [number, number, number]): number {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: string, b: string): number {
  const la = luminance(rgb(a));
  const lb = luminance(rgb(b));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

test("rose defines exactly the variables light and dark define", () => {
  const names = (m: Map<string, string>) => [...m.keys()].sort();
  assert.deepEqual(names(rose), names(light), "rose vs light");
  assert.deepEqual(names(rose), names(dark), "rose vs dark");
});

test("rose uses the colours sampled from the client reference", () => {
  assert.equal(rose.get("--canvas"), "12 15 24");
  assert.equal(rose.get("--sidebar"), "10 13 21");
  assert.equal(rose.get("--panel"), "15 18 28");
  assert.equal(rose.get("--line"), "27 30 39");
  assert.equal(rose.get("--accent"), "255 46 116");
  assert.equal(rose.get("--fg"), "241 245 249");
});

test("rose text and accents are readable on the card surface", () => {
  const panel = rose.get("--panel")!;
  assert.ok(contrast(rose.get("--fg")!, panel) >= 15, "fg");
  assert.ok(contrast(rose.get("--fg-muted")!, panel) >= 5.5, "fg-muted");
  assert.ok(contrast(rose.get("--fg-subtle")!, panel) >= 4.5, "fg-subtle");
  assert.ok(contrast(rose.get("--accent-text")!, panel) >= 4.5, "accent-text");
  assert.ok(contrast(rose.get("--on-accent")!, rose.get("--accent-solid")!) >= 4.5, "white on filled button");
  for (const k of ["--success", "--warning", "--danger", "--info"]) {
    assert.ok(contrast(rose.get(k)!, panel) >= 4.5, k);
  }
  for (let i = 1; i <= 5; i++) assert.ok(contrast(rose.get(`--chart-${i}`)!, panel) >= 3, `chart-${i}`);
});

test("Akaya Light is the default; system never picks Rose; a saved choice is kept", () => {
  assert.equal(resolveTheme("rose", false), "rose");
  assert.equal(resolveTheme("rose", true), "rose");
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(parsePref("rose"), "rose");
  assert.equal(parsePref("neon"), "light");
  assert.equal(parsePref(null), "light");
  assert.equal(parsePref("dark"), "dark");
  assert.equal(parsePref("light"), "light");
  assert.equal(parsePref("system"), "system");
  assert.deepEqual(THEME_CYCLE, ["light", "dark", "rose", "system"]);
});

test("rose.css cannot leak into light or dark", () => {
  const rose = readFileSync(join(process.cwd(), "src", "design", "rose.css"), "utf8").split("\r").join("");
  // Drop comments, then walk the selectors of every top-level and @media rule.
  const noComments = rose.replace(/\/\*[\s\S]*?\*\//g, "");
  const selectors: string[] = [];
  for (const m of noComments.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@media")) continue;
    selectors.push(...sel.split(",").map((s) => s.trim()).filter(Boolean));
  }
  assert.ok(selectors.length > 20, "expected the stylesheet to have rules");
  const unscoped = selectors.filter((s) => !s.startsWith('html[data-theme="rose"]'));
  // The only unscoped rule hides rose-only elements everywhere else.
  assert.deepEqual(unscoped.sort(), [".ui-sidefoot", ".ui-stat-chip"]);
});
