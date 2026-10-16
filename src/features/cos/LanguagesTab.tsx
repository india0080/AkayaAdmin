"use client";

import { useState } from "react";
import { Button, Field, Notice, Panel, Select, TextInput } from "@/ui";
import { useCosCtx } from "./CosContext";
import {
  FALLBACK_LANGUAGES, LANGUAGES, LIMITS, effectiveLanguages, humanize, setSection, textError, type CosConfig, type Language,
} from "./logic";

const LANG_NAME: Record<Language, string> = { en: "English", hi: "Hindi (Devanagari)", hinglish: "Hinglish (Roman script)", mixed: "Mixed Hindi-English", other: "Other languages" };

type FbLang = (typeof FALLBACK_LANGUAGES)[number];

export function LanguagesTab() {
  const c = useCosCtx();
  const langs = effectiveLanguages(c.working);
  const [newKey, setNewKey] = useState<Record<FbLang, string>>({ en: "", hi: "", hinglish: "" });
  const texts = c.working.fallbackTexts ?? {};

  const setLangs = (enabled: Language[], fallback: Language) =>
    c.update((cfg) => setSection(cfg, "languages", { enabled: LANGUAGES.filter((l) => enabled.includes(l)), fallback }));
  const setText = (lang: FbLang, key: string, value: string | null) =>
    c.update((cfg: CosConfig) => {
      const all = { ...(cfg.fallbackTexts ?? {}) };
      const m = { ...(all[lang] ?? {}) };
      if (value === null) delete m[key];
      else m[key] = value;
      if (Object.keys(m).length === 0) delete all[lang];
      else all[lang] = m;
      return setSection(cfg, "fallbackTexts", Object.keys(all).length ? all : undefined);
    });

  return (
    <div className="space-y-4">
      <Panel title="Languages" description="Akaya mirrors the user's language. Languages that are not enabled fall back to the fallback language.">
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-fg-muted">Enabled languages</legend>
          <div className="flex flex-wrap gap-4">
            {LANGUAGES.map((l) => {
              const on = langs.enabled.includes(l);
              return (
                <label key={l} className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={c.readOnly || (on && langs.enabled.length === 1)}
                    onChange={(e) => {
                      const next = e.target.checked ? [...langs.enabled, l] : langs.enabled.filter((x) => x !== l);
                      setLangs(next, next.includes(langs.fallback) ? langs.fallback : next[0]);
                    }}
                    className="h-4 w-4 accent-[rgb(var(--accent-solid))]"
                  />
                  {LANG_NAME[l]}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="mt-3 max-w-xs">
          <Field label="Fallback language" hint="Used when the detected language is not enabled.">
            {(p) => (
              <Select {...p} value={langs.fallback} disabled={c.readOnly} onChange={(e) => setLangs(langs.enabled, e.target.value as Language)}>
                {langs.enabled.map((l) => (
                  <option key={l} value={l}>
                    {LANG_NAME[l]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Panel>

      <Notice tone="info">
        Fallback texts are what a user sees when everything else failed. Keep them short, calm and free of technical detail. They are plain text only.
      </Notice>
      {FALLBACK_LANGUAGES.map((lang) => {
        const m = texts[lang] ?? {};
        const keys = Object.keys(m).sort();
        const nk = newKey[lang];
        const nkErr = nk && !/^[a-z][A-Za-z0-9_]{1,30}$/.test(nk) ? "Use letters/digits, starting with a lowercase letter (2 to 31 characters)." : keys.includes(nk) ? "Already exists." : null;
        return (
          <Panel key={lang} title={`Fallback texts: ${humanize(lang)}`}>
            {keys.length === 0 ? <p className="mb-2 text-sm text-fg-muted">None. The built-in text is used.</p> : null}
            <div className="space-y-3">
              {keys.map((k) => {
                const err = textError(`${k}`, m[k], LIMITS.fallbackTextMax, { required: true });
                return (
                  <div key={k} className="flex flex-wrap items-start gap-2">
                    <Field label={k} error={err} className="min-w-[260px] flex-1">
                      {(p) => <TextInput {...p} value={m[k]} disabled={c.readOnly} onChange={(e) => setText(lang, k, e.target.value)} />}
                    </Field>
                    {!c.readOnly ? (
                      <Button size="sm" variant="danger-ghost" className="mt-6" onClick={() => setText(lang, k, null)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {!c.readOnly && keys.length < LIMITS.fallbackKeysMax ? (
              <form
                className="mt-3 flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!nk || nkErr) return;
                  setText(lang, nk, "");
                  setNewKey((s) => ({ ...s, [lang]: "" }));
                }}
              >
                <Field label="New text key" error={nkErr} hint="e.g. generic, offline, busy" className="min-w-[200px]">
                  {(p) => <TextInput {...p} value={nk} onChange={(e) => setNewKey((s) => ({ ...s, [lang]: e.target.value }))} />}
                </Field>
                <Button type="submit" disabled={!nk || !!nkErr}>
                  Add text
                </Button>
              </form>
            ) : null}
          </Panel>
        );
      })}
    </div>
  );
}
