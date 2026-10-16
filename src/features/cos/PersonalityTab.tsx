"use client";

import { useState } from "react";
import { Badge, Button, Field, Notice, Panel, Textarea, TextInput } from "@/ui";
import { useCosCtx } from "./CosContext";
import { CharCount, SliderField } from "./widgets";
import { DEFAULT_TRAITS, LIMITS, TRAITS, TRAIT_HELP, cpLen, effectiveTraits, humanize, setSection, textError, type Trait } from "./logic";

export function PersonalityTab() {
  const c = useCosCtx();
  const [phrase, setPhrase] = useState("");
  const traits = effectiveTraits(c.working);
  const text = c.working.personalityText ?? "";
  const phrases = c.working.forbiddenPhrases ?? [];
  const textErr = textError("Personality text", text, LIMITS.personalityTextMax, { multiline: true });
  const phraseErr = phrase.trim() ? textError("Phrase", phrase, LIMITS.forbiddenPhraseMax) : null;
  const dup = phrases.some((p) => p.toLowerCase() === phrase.trim().toLowerCase());

  const setTrait = (t: Trait, v: number) => c.update((cfg) => setSection(cfg, "traits", { ...effectiveTraits(cfg), [t]: v }));
  const addPhrase = () => {
    const p = phrase.trim();
    if (!p || phraseErr || dup || phrases.length >= LIMITS.forbiddenPhrasesMax) return;
    c.update((cfg) => setSection(cfg, "forbiddenPhrases", [...(cfg.forbiddenPhrases ?? []), p]));
    setPhrase("");
  };

  return (
    <div className="space-y-4">
      <Notice tone="info">
        Personality is composed first; tools, safety, date and live-data rules are always added AFTER it by the app and can never be removed here. Users can adjust
        tone preferences but never lower professionalism.
      </Notice>
      <Panel
        title="Traits"
        description="0 to 1. Unchanged traits use the compiled default."
        actions={
          <Button size="sm" variant="ghost" disabled={c.readOnly || c.working.traits === undefined} onClick={() => c.update((cfg) => setSection(cfg, "traits", undefined))}>
            Reset to defaults
          </Button>
        }
      >
        <div className="grid gap-x-8 md:grid-cols-2">
          {TRAITS.map((t) => (
            <SliderField key={t} label={humanize(t)} help={TRAIT_HELP[t]} value={traits[t]} defaultValue={DEFAULT_TRAITS[t]} disabled={c.readOnly} onChange={(v) => setTrait(t, v)} />
          ))}
        </div>
      </Panel>

      <Panel title="Personality text" description="Plain text only (no markup, no templates). Describes who Akaya is, in your own words.">
        <Field label="Identity and voice" error={textErr}>
          {(p) => <Textarea {...p} rows={7} value={text} disabled={c.readOnly} onChange={(e) => c.update((cfg) => setSection(cfg, "personalityText", e.target.value))} />}
        </Field>
        <div className="mt-1 flex justify-end">
          <CharCount value={cpLen(text.trim())} max={LIMITS.personalityTextMax} />
        </div>
      </Panel>

      <Panel
        title="Forbidden phrases"
        description={`Responses containing these are flagged by the quality gate and scrubbed where possible. Up to ${LIMITS.forbiddenPhrasesMax}, ${LIMITS.forbiddenPhraseMax} characters each.`}
      >
        {phrases.length === 0 ? <p className="mb-3 text-sm text-fg-muted">No forbidden phrases.</p> : null}
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="Forbidden phrases">
          {phrases.map((p) => (
            <li key={p} className="inline-flex items-center gap-1 rounded-md border border-line bg-raised px-2 py-1 text-sm">
              <span className="break-all">{p}</span>
              {!c.readOnly ? (
                <button
                  type="button"
                  aria-label={`Remove phrase ${p}`}
                  className="ml-1 rounded px-1 text-fg-muted hover:bg-danger-soft hover:text-danger focus:outline-none focus:ring-2 focus:ring-accent/40"
                  onClick={() => c.update((cfg) => setSection(cfg, "forbiddenPhrases", (cfg.forbiddenPhrases ?? []).filter((x) => x !== p)))}
                >
                  x
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {!c.readOnly ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addPhrase();
            }}
          >
            <Field label="Add a phrase" error={phraseErr ?? (dup ? "Already in the list." : null)} className="min-w-[240px] flex-1">
              {(p) => <TextInput {...p} value={phrase} onChange={(e) => setPhrase(e.target.value)} maxLength={LIMITS.forbiddenPhraseMax + 20} />}
            </Field>
            <Button type="submit" disabled={!phrase.trim() || !!phraseErr || dup || phrases.length >= LIMITS.forbiddenPhrasesMax}>
              Add
            </Button>
            <Badge tone="neutral">
              {phrases.length}/{LIMITS.forbiddenPhrasesMax}
            </Badge>
          </form>
        ) : null}
      </Panel>
    </div>
  );
}
