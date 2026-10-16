"use client";

// One stage's model chain.
//
// ── Why a chain and not a single dropdown ──────────────────────────────────
//
// The brief asks for "Model" and "Fallback" as separate rows, and that is
// how this renders — but the underlying value is an ordered list, because
// that is what the server has always walked: first rung that is configured
// AND answers wins. Rung 0 is "Model"; everything after it is a fallback.
// Storing one model plus one fallback would have been a second shape for the
// same fact.
//
// ── Why the options are capability-filtered on the SERVER ──────────────────
//
// The list this renders comes from `adminFloatingSystem`'s `models` action,
// which filters by capability against the model registry. The browser is
// never given the whole catalogue and asked to work out what can transcribe
// — that decision has one home, and it is not here.
//
// Every option carries its EVIDENCE, and the label says which kind it is:
// `measured` means a probe ran and the model did the job, `catalogue` means
// the provider says so, `unconfirmed` means nobody has said either way.
// Those are shown as words, not just colours, because an operator picking a
// speech-to-text rung needs to know which of the three they are choosing.

import { useState } from "react";
import { Button, Select, TextInput } from "@/ui";
import {
  EVIDENCE_LABEL,
  EVIDENCE_TONE,
  ModelRef,
  RegistryOption,
} from "@/lib/floatingSystem";

function key(r: { provider: string; modelId: string }) {
  return `${r.provider}::${r.modelId}`;
}

export function ChainEditor({
  label,
  hint,
  chain,
  options,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  chain: ModelRef[];
  options: RegistryOption[];
  disabled?: boolean;
  onChange: (next: ModelRef[]) => void;
}) {
  const [custom, setCustom] = useState("");

  // An option the chain already names but the registry does not know about —
  // a model typed in before discovery could see it, or one from a provider
  // whose catalogue we cannot read. It must stay selectable, and it must be
  // visibly flagged rather than silently dropped from the dropdown (which
  // would reset the operator's configuration the moment they touched it).
  const known = new Set(options.map(key));
  const orphans: RegistryOption[] = chain
    .filter(
      (r) =>
        r.provider &&
        r.model &&
        !known.has(key({ provider: r.provider, modelId: r.model })),
    )
    .map((r) => ({
      provider: r.provider,
      modelId: r.model,
      displayName: r.model,
      evidence: "unknown" as const,
      source: "configured",
    }));
  const all = [...options, ...orphans];

  function setRung(i: number, value: string) {
    const [provider, modelId] = value.split("::");
    const next = [...chain];
    next[i] = { provider, model: modelId };
    onChange(next);
  }

  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= chain.length) return;
    const next = [...chain];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  function addFromCustom() {
    const raw = custom.trim();
    const slash = raw.indexOf("/");
    if (slash <= 0 || slash === raw.length - 1) return;
    onChange([
      ...chain,
      { provider: raw.slice(0, slash), model: raw.slice(slash + 1) },
    ]);
    setCustom("");
  }

  return (
    <div
      className={`p-4 rounded-xl border border-line bg-canvas ${
        disabled ? "opacity-40" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <span className="text-sm font-semibold text-fg">{label}</span>
        <span className="text-[10px] uppercase tracking-wider text-fg-subtle">
          {options.length} eligible
        </span>
      </div>
      {hint && <p className="text-xs text-fg-muted mb-3 leading-relaxed">{hint}</p>}

      {chain.length === 0 && (
        <p className="text-xs text-fg-subtle mb-3">
          No model set. The first rung is the model that answers; anything
          after it is a fallback.
        </p>
      )}

      <div className="space-y-2">
        {chain.map((rung, i) => {
          const sel = all.find(
            (o) => o.provider === rung.provider && o.modelId === rung.model,
          );
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-fg-subtle w-16 shrink-0">
                {i === 0 ? "Model" : `Fallback ${i}`}
              </span>
              <Select
                disabled={disabled}
                value={sel ? key(sel) : ""}
                onChange={(e) => setRung(i, e.target.value)}
                aria-label={i === 0 ? `${label} model` : `${label} fallback ${i}`}
                className="flex-1 min-w-0"
              >
                {!sel && <option value="">— choose a model —</option>}
                {all.map((o) => (
                  <option key={key(o)} value={key(o)}>
                    {o.provider} / {o.modelId}
                  </option>
                ))}
              </Select>
              {sel && (
                <span
                  className={`text-[10px] uppercase tracking-wider w-24 shrink-0 ${EVIDENCE_TONE[sel.evidence]}`}
                  title={
                    sel.evidence === "verified"
                      ? "A probe ran and this model did the job."
                      : sel.evidence === "declared"
                        ? "The provider's catalogue says it can. Not measured here."
                        : "Nobody has confirmed this model can do this job."
                  }
                >
                  {EVIDENCE_LABEL[sel.evidence]}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled || i === 0}
                onClick={() => move(i, -1)}
                title="Try this rung earlier"
              >
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled || i === chain.length - 1}
                onClick={() => move(i, 1)}
                title="Try this rung later"
              >
                ↓
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled}
                onClick={() => onChange(chain.filter((_, n) => n !== i))}
                title="Remove this rung"
              >
                ✕
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || all.length === 0}
          onClick={() =>
            onChange([
              ...chain,
              { provider: all[0].provider, model: all[0].modelId },
            ])
          }
        >
          + Add {chain.length === 0 ? "model" : "fallback"}
        </Button>
        <TextInput
          disabled={disabled}
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addFromCustom();
          }}
          placeholder="provider/model-id"
          aria-label="Custom model id"
          className="w-48 text-xs"
        />
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || !custom.includes("/")}
          onClick={addFromCustom}
        >
          Add by id
        </Button>
      </div>

      {orphans.length > 0 && (
        <p className="text-xs text-warning mt-3">
          {orphans.map((o) => `${o.provider}/${o.modelId}`).join(", ")}{" "}
          {orphans.length === 1 ? "is" : "are"} configured but not in the model
          registry — we cannot confirm {orphans.length === 1 ? "it" : "they"} can
          do this job. The health check will say whether it answers.
        </p>
      )}
    </div>
  );
}
