"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge, Button, Checkbox, ErrorState, Field, Notice, Panel, Select, Skeleton, Switch, TextInput, Textarea, relativeTime, useToast } from "@/ui";
import { ChangeConfirm } from "./ChangeConfirm";
import {
  chainMapToText, chainToText, draftPatch, parseChain, parseChainMap, parseList, parseModelLines, parseRegexList, unknownModels,
  type FieldDef, type Parsed, type Registry, type Snapshot, type Target,
} from "./logic";
import { applyConfig, useTarget, type TargetQuery } from "./useConfig";

/// A registry-driven editor for one config target. Shows the LIVE value of
/// every field (a failed load renders an error, never defaults), keeps edits
/// as a draft, and saves only the changed keys through ChangeConfirm.
export function TargetForm({
  registry,
  target,
  title,
  description,
  canEdit,
  only,
  query,
  catalog = null,
}: {
  registry: Registry;
  target: Target;
  title: string;
  description?: string;
  canEdit: boolean;
  /// Optional subset of field keys, in display order.
  only?: string[];
  /// Share one load between several forms over the same target, so an
  /// apply in one refreshes the version the others will send.
  query?: TargetQuery;
  /// Synced model ids, for model fields (inline check + the page's
  /// <datalist id="model-catalog">). null = not loaded: no inline check.
  catalog?: ReadonlySet<string> | null;
}) {
  const toast = useToast();
  const own = useTarget(target, !!query);
  const q = query ?? own;
  // Keyed on the key list, not the array: callers pass inline literals, and a
  // new identity per parent render would reset the draft mid-edit.
  const onlyKey = only?.join("|") ?? "";
  const fields = useMemo(() => {
    const all = registry.fields.filter((f) => f.target === target);
    const keys = onlyKey ? onlyKey.split("|") : null;
    return keys ? (keys.map((k) => all.find((f) => f.key === k)).filter(Boolean) as FieldDef[]) : all;
  }, [registry, target, onlyKey]);
  const [draft, setDraft] = useState<Snapshot>({});
  const [confirm, setConfirm] = useState(false);
  /// Per-field parse errors from line-based editors (unparseable text never
  /// reaches the draft, and blocks apply).
  const [parseErrors, setParseErrors] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (q.data) setDraft(Object.fromEntries(fields.map((f) => [f.key, q.data!.snapshot[f.key] ?? null])));
  }, [q.data, fields]);

  if (q.error && !q.data) return <Panel title={title}><ErrorState compact message={q.error.message} onRetry={q.reload} /></Panel>;
  if (!q.data) return <Panel title={title}><Skeleton className="h-40 w-full" /></Panel>;

  const current = q.data.snapshot;
  const patch = draftPatch(Object.fromEntries(fields.map((f) => [f.key, current[f.key] ?? null])), draft);
  const dirty = Object.keys(patch).length > 0;
  const set = (k: string, v: unknown) => setDraft((d) => ({ ...d, [k]: v }));
  const invalid =
    fields.some((f) => (f.type === "model" || f.type === "modelList") && unknownModels(draft[f.key], catalog).length > 0) ||
    Object.values(parseErrors).some(Boolean);

  return (
    <Panel
      title={title}
      description={
        <>
          {description} <span className="text-fg-subtle">Version {q.data.version}{q.data.updatedAt ? ` · ${relativeTime(q.data.updatedAt)} by ${q.data.updatedByEmail}` : ""}</span>
        </>
      }
      actions={
        canEdit ? (
          <>
            {dirty ? <Button variant="ghost" onClick={() => setDraft(Object.fromEntries(fields.map((f) => [f.key, current[f.key] ?? null])))}>Discard</Button> : null}
            <Button variant="primary" disabled={!dirty || invalid} onClick={() => setConfirm(true)}>Review &amp; apply</Button>
          </>
        ) : <Badge>View only</Badge>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((f) => (
          <FieldControl
            key={f.key}
            def={f}
            value={draft[f.key]}
            live={current[f.key]}
            disabled={!canEdit}
            catalog={catalog}
            onChange={(v) => set(f.key, v)}
            onParseError={(e) => setParseErrors((p) => (p[f.key] === e ? p : { ...p, [f.key]: e }))}
          />
        ))}
      </div>
      {dirty ? <div className="mt-4"><Notice tone="info">{Object.keys(patch).length} unsaved change(s). Nothing reaches the app until you apply.</Notice></div> : null}
      <ChangeConfirm
        open={confirm}
        onClose={() => setConfirm(false)}
        registry={registry}
        target={target}
        current={current}
        patch={patch}
        onApply={async (reason) => {
          await applyConfig(target, patch, q.data!.version, reason);
          toast.success("Applied", `${title}: version ${q.data!.version + 1}`);
          q.reload();
        }}
      />
    </Panel>
  );
}

function FieldControl({
  def,
  value,
  live,
  disabled,
  onChange,
  catalog,
  onParseError,
}: {
  def: FieldDef;
  value: unknown;
  live: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
  catalog: ReadonlySet<string> | null;
  onParseError: (e: string | null) => void;
}) {
  const changed = JSON.stringify(value ?? null) !== JSON.stringify(live ?? null);
  const defaultLabel =
    def.defaultValue === null || def.defaultValue === undefined ? "compiled"
    : Array.isArray(def.defaultValue)
      ? def.defaultValue.length ? def.defaultValue.join(", ") : def.type === "modelList" ? "compiled chain" : "none"
      : def.defaultValue === "" ? (def.type === "model" ? "user's model" : "compiled") : String(def.defaultValue);
  const hint = (
    <>
      {def.description}
      {live === null || live === undefined ? <span className="text-fg-subtle"> · not set (default: {defaultLabel})</span> : null}
      {changed ? <span className="font-medium text-warning"> · changed</span> : null}
    </>
  );
  if (def.type === "model" || def.type === "modelList") {
    return <ModelControl def={def} value={value} disabled={disabled} onChange={onChange} catalog={catalog} hint={hint} />;
  }
  if (def.type === "orderedList" || def.type === "textList" || def.type === "voiceChain" || def.type === "voiceChainMap" || def.type === "regexList") {
    return <LinesControl def={def} value={value} disabled={disabled} onChange={onChange} onParseError={onParseError} hint={hint} />;
  }
  if (def.type === "enum") {
    return (
      <Field label={def.label} hint={hint}>
        {(p) => (
          <Select {...p} disabled={disabled} value={(value as string | null) ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}>
            <option value="">Default ({String(def.defaultValue)})</option>
            {(def.allowed ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        )}
      </Field>
    );
  }
  if (def.type === "locale") {
    const v = (value as string | null) ?? "";
    return (
      <Field label={def.label} hint={hint} error={v && !/^[a-z]{2}-[A-Z]{2}$/.test(v) ? "Use the form hi-IN" : null}>
        {(p) => <TextInput {...p} className="font-mono" disabled={disabled} value={v} placeholder={`Default ${def.defaultValue}`} onChange={(e) => onChange(e.target.value.trim() || null)} />}
      </Field>
    );
  }
  if (def.type === "bool") {
    const on = (value as boolean | null) ?? (def.defaultValue as boolean);
    return (
      <div className="flex items-start justify-between gap-4 rounded-md border border-line p-3">
        <div>
          <p className="text-sm font-medium">{def.label}{def.dangerousWhen !== undefined ? <Badge tone="danger" className="ml-2">Kill switch</Badge> : null}</p>
          <p className="mt-0.5 text-xs text-fg-muted">{hint}</p>
        </div>
        <Switch label={def.label} checked={on} disabled={disabled} onChange={onChange} />
      </div>
    );
  }
  if (def.type === "stringList") {
    const list = (value as string[] | null) ?? [];
    return (
      <fieldset className="rounded-md border border-line p-3 md:col-span-2">
        <legend className="px-1 text-sm font-medium">{def.label}</legend>
        <p className="mb-2 text-xs text-fg-muted">{hint}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {(def.allowed ?? []).map((opt) => (
            <label key={opt} className="flex items-center gap-2 text-sm">
              <Checkbox
                label={opt}
                checked={list.includes(opt)}
                disabled={disabled}
                onChange={(on) => onChange(on ? [...list, opt].sort() : list.filter((x) => x !== opt))}
              />
              <code className="font-mono text-xs">{opt}</code>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (def.type === "int") {
    const raw = value === null || value === undefined ? "" : String(value);
    return (
      <Field label={def.label} hint={hint}>
        {(p) => (
          <TextInput
            {...p}
            inputMode="numeric"
            disabled={disabled}
            value={raw}
            placeholder={`Default ${def.defaultValue ?? "(compiled)"}`}
            onChange={(e) => {
              const t = e.target.value.trim();
              onChange(t === "" ? null : /^-?\d+$/.test(t) ? Number(t) : t);
            }}
          />
        )}
      </Field>
    );
  }
  const long = (def.maxLength ?? 0) > 200;
  return (
    <Field label={def.label} hint={hint} className={long ? "md:col-span-2" : undefined}>
      {(p) =>
        long ? (
          <Textarea {...p} disabled={disabled} maxLength={def.maxLength} value={(value as string | null) ?? ""} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <TextInput {...p} disabled={disabled} maxLength={def.maxLength} value={(value as string | null) ?? ""} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Field>
  );
}

/// One model id (with the catalog datalist) or an ordered chain, one id per
/// line. The raw text is kept locally so typing a newline is not eaten by
/// the parse; `null` (Use default) is explicit, never implied by blank text
/// — except where the reader treats an empty chain as a real setting.
function ModelControl({
  def,
  value,
  disabled,
  onChange,
  catalog,
  hint,
}: {
  def: FieldDef;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
  catalog: ReadonlySet<string> | null;
  hint: ReactNode;
}) {
  const list = def.type === "modelList";
  const external = list ? (Array.isArray(value) ? (value as string[]).join("\n") : "") : typeof value === "string" ? value : "";
  const [text, setText] = useState(external);
  useEffect(() => {
    // Follow external changes (load, discard) without clobbering typing.
    const same = list ? JSON.stringify(parseModelLines(text)) === JSON.stringify(Array.isArray(value) ? value : []) : text.trim() === external;
    if (!same) setText(external);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external]);
  const bad = unknownModels(value, catalog);
  const isDefault = value === null || value === undefined;
  const error = bad.length ? `Not in the synced catalog: ${bad.join(", ")}` : null;
  const update = (t: string) => {
    setText(t);
    if (list) {
      const ids = parseModelLines(t);
      onChange(ids.length === 0 && !def.allowEmpty ? null : ids);
    } else {
      onChange(t.trim());
    }
  };
  return (
    <Field
      label={def.label}
      hint={
        <>
          {hint}
          {isDefault ? <span className="text-fg-subtle"> · using default</span> : null}
          {!disabled && !isDefault ? (
            <button type="button" className="ml-2 text-xs font-medium text-accent underline" onClick={() => { setText(""); onChange(null); }}>
              Use default
            </button>
          ) : null}
        </>
      }
      error={error}
      className={list ? "md:col-span-2" : undefined}
    >
      {(p) =>
        list ? (
          <Textarea {...p} className="font-mono text-xs" rows={Math.min(8, Math.max(3, text.split("\n").length + 1))} disabled={disabled}
            value={text} placeholder={isDefault ? "Default chain — one model id per line to override" : "(empty)"} onChange={(e) => update(e.target.value)} />
        ) : (
          <TextInput {...p} className="font-mono text-xs" list="model-catalog" disabled={disabled} value={text}
            placeholder={isDefault ? `Default: ${def.defaultValue || "user's model"}` : "Blank = user's model"} onChange={(e) => update(e.target.value)} />
        )
      }
    </Field>
  );
}

/// Ordered engine lists, free-text lists and voice chains, one entry per
/// line. Text that does not parse stays in the box with an error and never
/// reaches the draft (and blocks apply through onParseError).
function LinesControl({
  def,
  value,
  disabled,
  onChange,
  onParseError,
  hint,
}: {
  def: FieldDef;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
  onParseError: (e: string | null) => void;
  hint: ReactNode;
}) {
  const format = (v: unknown): string =>
    def.type === "voiceChain" ? chainToText(v)
    : def.type === "voiceChainMap" ? chainMapToText(v)
    : Array.isArray(v) ? (v as string[]).join("\n") : "";
  const parse = (t: string): Parsed<unknown> =>
    def.type === "voiceChain" ? parseChain(t)
    : def.type === "voiceChainMap" ? parseChainMap(t)
    : def.type === "regexList" ? parseRegexList(t)
    : parseList(t, { allowed: def.type === "orderedList" ? def.allowed : undefined, pattern: def.pattern });
  const external = format(value);
  const [text, setText] = useState(external);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    // Follow load/discard, but not our own edits echoing back.
    if (JSON.stringify(parse(text).value) !== JSON.stringify(value ?? null)) {
      setText(external);
      setError(null);
      onParseError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external]);
  const isDefault = value === null || value === undefined;
  const placeholder =
    def.type === "voiceChain" ? "provider | model | voice (one rung per line)"
    : def.type === "voiceChainMap" ? "default: sarvam | bulbul:v3 | priya\nhi: openrouter | hexgrad/kokoro-82m | hf_alpha"
    : def.type === "orderedList" ? (def.allowed ?? []).join("\n")
    : "one per line";
  return (
    <Field
      label={def.label}
      hint={
        <>
          {hint}
          {isDefault ? <span className="text-fg-subtle"> · using default</span> : null}
          {!disabled && !isDefault ? (
            <button type="button" className="ml-2 text-xs font-medium text-accent underline" onClick={() => { setText(""); setError(null); onParseError(null); onChange(null); }}>
              Use default
            </button>
          ) : null}
        </>
      }
      error={error}
      className="md:col-span-2"
    >
      {(p) => (
        <Textarea
          {...p}
          className="font-mono text-xs"
          rows={Math.min(10, Math.max(3, text.split("\n").length + 1))}
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            const r = parse(t);
            setError(r.error);
            onParseError(r.error);
            if (!r.error) onChange(r.value);
          }}
        />
      )}
    </Field>
  );
}
