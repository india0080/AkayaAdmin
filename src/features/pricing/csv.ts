// Country pricing: CSV export / import with STRICT validation and a DRY-RUN
// diff. Pure. Nothing is applied here: the result carries the draft edits that
// the admin may confirm (all-or-nothing: any invalid line blocks the import).
import { PLAN_IDS, docId, minorToMajorInput, type CountryDef, type PlanId } from "./logic";
import type { PricingRegistry } from "./registry";
import { hasRuleErrors, strictMajorToMinor, validateRowValues, type RowValues } from "./rules";
import type { RowEdits, TableRow } from "./table";

export const CSV_COLUMNS = ["product", "country", "currency", "monthly", "annual", "available", "enabled"] as const;
export type CsvColumn = (typeof CSV_COLUMNS)[number];
/// 5 products x 249 countries is the largest meaningful file.
export const MAX_IMPORT_ROWS = 1245;
export const MAX_IMPORT_CHARS = 2_000_000;

// ── RFC 4180 parser ─────────────────────────────────────────────────────────

export interface CsvRecord { line: number; cells: string[] }
export interface CsvParse { records: CsvRecord[]; error: string | null }

/// Handles BOM, CRLF / LF / CR, quoted fields with "" escapes and embedded
/// newlines. Malformed quoting is an error (never silently repaired).
export function parseCsv(input: string): CsvParse {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = "";
  let inQuotes = false;
  let quoted = false; // the current field started with a quote
  let afterQuote = false; // closing quote seen, only , or EOL may follow
  let line = 1;
  let recordLine = 1;
  const endField = () => { cells.push(field); field = ""; quoted = false; afterQuote = false; };
  const endRecord = () => { endField(); records.push({ line: recordLine, cells }); cells = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; afterQuote = true; }
      } else {
        if (ch === "\n") line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      if (field === "" && !quoted && !afterQuote) { inQuotes = true; quoted = true; continue; }
      return { records, error: `Line ${line}: unexpected quote character (quote the whole field and double inner quotes).` };
    }
    if (afterQuote && ch !== "," && ch !== "\n" && ch !== "\r") {
      return { records, error: `Line ${line}: text after a closing quote.` };
    }
    if (ch === ",") { endField(); continue; }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line++;
      recordLine = line;
      continue;
    }
    field += ch;
  }
  if (inQuotes) return { records, error: `Line ${recordLine}: a quoted field is never closed.` };
  if (field !== "" || cells.length > 0 || quoted) endRecord();
  return { records, error: null };
}

const needsQuote = /[",\r\n]/;
export function csvCell(v: string): string {
  return needsQuote.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
export function serializeCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

// ── Export ──────────────────────────────────────────────────────────────────

/// The current table (whatever rows are passed, e.g. the filtered view) for one
/// product. Unpriced rows export blank prices; money is in MAJOR units.
export function exportCsv(planId: PlanId, rows: readonly TableRow[]): string {
  const out: string[][] = [[...CSV_COLUMNS]];
  for (const r of rows) {
    out.push([
      planId, r.code, r.currency,
      r.priceMonthly === null ? "" : minorToMajorInput(r.priceMonthly, r.exponent),
      r.priceAnnual === null ? "" : minorToMajorInput(r.priceAnnual, r.exponent),
      r.available === null ? "" : r.available ? "true" : "false",
      r.enabled ? "true" : "false",
    ]);
  }
  return serializeCsv(out);
}

// ── Import (dry run) ────────────────────────────────────────────────────────

export type ImportStatus = "added" | "changed" | "unchanged" | "invalid";

export interface ImportLine {
  line: number;
  product: string;
  country: string;
  status: ImportStatus;
  errors: string[];
  warnings: string[];
  before: RowValues | null;
  after: RowValues | null;
  /// requested country enabled flag (null = not given)
  enabled: boolean | null;
  enabledChanged: boolean;
}

export interface ImportContext {
  registry: PricingRegistry;
  gateway: ReadonlySet<string>;
  countryByCode: (code: string) => CountryDef | undefined;
  /// effective row (draft over server) / enabled flag of the current state
  existing: (planId: PlanId, code: string) => RowValues | null;
  enabledOf: (code: string) => boolean;
}

export interface ImportResult {
  /// file-level problems (header, size, CSV syntax): nothing else is evaluated
  fatal: string[];
  lines: ImportLine[];
  counts: { total: number; added: number; changed: number; unchanged: number; invalid: number };
  rowEdits: RowEdits;
  enabledEdits: Record<string, boolean>;
  /// true only when there is no fatal error, no invalid line and something to apply
  canConfirm: boolean;
}

const BOOL: Record<string, boolean> = { true: true, yes: true, y: true, "1": true, false: false, no: false, n: false, "0": false };
const parseBool = (s: string): boolean | undefined => BOOL[s.trim().toLowerCase()];

function fatalResult(fatal: string[]): ImportResult {
  return { fatal, lines: [], counts: { total: 0, added: 0, changed: 0, unchanged: 0, invalid: 0 }, rowEdits: {}, enabledEdits: {}, canConfirm: false };
}

export function parseImport(text: string, ctx: ImportContext): ImportResult {
  if (text.length > MAX_IMPORT_CHARS) return fatalResult([`The file is too large (max ${MAX_IMPORT_CHARS.toLocaleString("en-US")} characters).`]);
  const parsed = parseCsv(text);
  if (parsed.error) return fatalResult([parsed.error]);
  const recs = parsed.records.filter((r) => !(r.cells.length === 1 && r.cells[0].trim() === ""));
  if (recs.length === 0) return fatalResult(["The file is empty."]);
  const header = recs[0].cells.map((c) => c.trim().toLowerCase());
  const missing = CSV_COLUMNS.filter((c) => !header.includes(c));
  const extra = header.filter((h) => !(CSV_COLUMNS as readonly string[]).includes(h));
  const dupHeader = header.filter((h, i) => header.indexOf(h) !== i);
  const headerErrors: string[] = [];
  if (missing.length) headerErrors.push(`Header is missing: ${missing.join(", ")}. Expected: ${CSV_COLUMNS.join(",")}.`);
  if (extra.length) headerErrors.push(`Header has unknown columns: ${extra.join(", ")}.`);
  if (dupHeader.length) headerErrors.push(`Header repeats: ${[...new Set(dupHeader)].join(", ")}.`);
  if (headerErrors.length) return fatalResult(headerErrors);
  const data = recs.slice(1);
  if (data.length === 0) return fatalResult(["The file has a header but no data rows."]);
  if (data.length > MAX_IMPORT_ROWS) return fatalResult([`Too many rows: ${data.length} (max ${MAX_IMPORT_ROWS} = 5 products x 249 countries).`]);
  const col = (cells: string[], c: CsvColumn): string => (cells[header.indexOf(c)] ?? "").trim();

  const lines: ImportLine[] = [];
  const firstSeen = new Map<string, number>();
  const dupKeys = new Set<string>();
  for (const rec of data) {
    const L: ImportLine = {
      line: rec.line, product: "", country: "", status: "invalid", errors: [], warnings: [], before: null, after: null, enabled: null, enabledChanged: false,
    };
    lines.push(L);
    if (rec.cells.length !== header.length) { L.errors.push(`Expected ${header.length} columns, found ${rec.cells.length}.`); continue; }
    L.product = col(rec.cells, "product");
    L.country = col(rec.cells, "country");
    const currency = col(rec.cells, "currency");
    const planId = (PLAN_IDS as readonly string[]).includes(L.product) && (ctx.registry.planIds as readonly string[]).includes(L.product) ? (L.product as PlanId) : null;
    if (!planId) L.errors.push(`Unknown product "${L.product}" (use ${ctx.registry.planIds.join(", ")}).`);
    const country = /^[A-Z]{2}$/.test(L.country) ? ctx.countryByCode(L.country) : undefined;
    if (!country) L.errors.push(`Unknown country "${L.country}" (use the upper-case ISO 3166-1 code, for example US).`);
    if (planId && country) {
      const key = docId(planId, country.code);
      const first = firstSeen.get(key);
      if (first !== undefined) { dupKeys.add(key); L.errors.push(`Duplicate row for ${key} (also on line ${first}).`); }
      else firstSeen.set(key, rec.line);
    }
    if (country && currency !== country.currency) L.errors.push(`Currency for ${country.code} must be ${country.currency}, not "${currency}".`);

    const mRaw = col(rec.cells, "monthly");
    const aRaw = col(rec.cells, "annual");
    const availRaw = col(rec.cells, "available");
    const enabledRaw = col(rec.cells, "enabled");
    const availParsed = availRaw === "" ? null : parseBool(availRaw);
    if (availRaw !== "" && availParsed === undefined) L.errors.push(`available must be true or false, not "${availRaw}".`);
    const enParsed = enabledRaw === "" ? null : parseBool(enabledRaw);
    if (enabledRaw !== "" && enParsed === undefined) L.errors.push(`enabled must be true or false, not "${enabledRaw}".`);
    if (enParsed === false && country?.code === "IN") L.errors.push("India (IN) can never be disabled.");
    L.enabled = enParsed === undefined ? null : enParsed;

    if (!planId || !country) continue;
    L.before = ctx.existing(planId, country.code);
    const exp = country.minorUnitExponent;
    let priceChanged = false;
    if (mRaw === "" && aRaw === "") {
      // an unpriced row of an export: nothing to set (an import never deletes a price)
      if (L.before === null) L.warnings.push("No price given: nothing to import for this row.");
      else L.warnings.push("Blank prices ignored: an import never deletes a price.");
      if (availParsed !== null && availParsed !== undefined && L.before && L.before.active !== availParsed) {
        L.after = { ...L.before, active: availParsed };
        priceChanged = true;
      }
    } else if (mRaw === "" || aRaw === "") {
      L.errors.push("Give both monthly and annual (or leave both blank).");
    } else {
      const m = strictMajorToMinor(mRaw, exp);
      const a = strictMajorToMinor(aRaw, exp);
      if (m === null) L.errors.push(exp === 0 ? `monthly "${mRaw}" must be a whole number (${country.currency} has no decimals).` : `monthly "${mRaw}" must be a positive number with at most ${exp} decimals (no thousands separators).`);
      if (a === null) L.errors.push(exp === 0 ? `annual "${aRaw}" must be a whole number (${country.currency} has no decimals).` : `annual "${aRaw}" must be a positive number with at most ${exp} decimals (no thousands separators).`);
      if (m !== null && a !== null) {
        const active = availParsed === null || availParsed === undefined ? (L.before ? L.before.active : true) : availParsed;
        const res = validateRowValues(country, { priceMonthly: m, priceAnnual: a, active }, { registry: ctx.registry, gateway: ctx.gateway });
        L.warnings.push(...res.warnings);
        if (hasRuleErrors(res)) L.errors.push(...Object.values(res.errors));
        else {
          L.after = { priceMonthly: m, priceAnnual: a, active };
          priceChanged = !L.before || L.before.priceMonthly !== m || L.before.priceAnnual !== a || L.before.active !== active;
        }
      }
    }
    if (L.enabled !== null && L.enabled !== ctx.enabledOf(country.code)) L.enabledChanged = true;
    if (L.errors.length === 0) {
      L.status = !L.before && L.after ? "added" : priceChanged || L.enabledChanged ? "changed" : "unchanged";
    }
  }
  // duplicates make BOTH lines invalid (ambiguous which one wins)
  if (dupKeys.size) {
    for (const L of lines) {
      const key = L.product && L.country ? docId(L.product, L.country) : "";
      if (dupKeys.has(key) && L.errors.length === 0) { L.status = "invalid"; L.errors.push(`Duplicate row for ${key} (see line ${firstSeen.get(key)} and later).`); }
    }
  }
  // the same country given different enabled flags in two lines
  const enabledBy = new Map<string, { line: number; value: boolean }>();
  for (const L of lines) {
    if (L.status === "invalid" || L.enabled === null) continue;
    const seen = enabledBy.get(L.country);
    if (!seen) enabledBy.set(L.country, { line: L.line, value: L.enabled });
    else if (seen.value !== L.enabled) {
      L.status = "invalid";
      L.errors.push(`enabled for ${L.country} conflicts with line ${seen.line}.`);
    }
  }
  const counts = { total: lines.length, added: 0, changed: 0, unchanged: 0, invalid: 0 };
  const rowEdits: RowEdits = {};
  const enabledEdits: Record<string, boolean> = {};
  for (const L of lines) {
    counts[L.status]++;
    if (L.status === "added" || L.status === "changed") {
      if (L.after) rowEdits[docId(L.product, L.country)] = L.after;
      if (L.enabledChanged && L.enabled !== null) enabledEdits[L.country] = L.enabled;
    }
  }
  const canConfirm = counts.invalid === 0 && counts.added + counts.changed > 0;
  return { fatal: [], lines, counts, rowEdits, enabledEdits, canConfirm };
}

/// "line 12: ..." summaries for the invalid lines (shown + copyable).
export function importErrorLines(r: ImportResult): string[] {
  return r.lines.filter((l) => l.status === "invalid").flatMap((l) => l.errors.map((e) => `Line ${l.line}${l.product && l.country ? ` (${l.product}_${l.country})` : ""}: ${e}`));
}

