"use client";

import { Badge, Select, TextInput } from "@/ui";
import { useCosCtx } from "./CosContext";
import { Switch } from "@/ui";
import { INTENTS, LIMITS, MODES, compactIntent, humanize, textError, type CosConfig, type Intent, type IntentCfg } from "./logic";

function withIntent(cfg: CosConfig, it: Intent, patch: IntentCfg): CosConfig {
  const merged = compactIntent({ ...(cfg.intents?.[it] ?? {}), ...patch });
  const intents = { ...(cfg.intents ?? {}) };
  if (merged) intents[it] = merged;
  else delete intents[it];
  const next: CosConfig = { ...cfg, intents };
  if (Object.keys(intents).length === 0) delete next.intents;
  return next;
}

export function IntentsTab() {
  const c = useCosCtx();
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        Per-intent behaviour for the 26 intents. A mode here overrides the channel default. &quot;Confirm first&quot; makes Akaya ask before acting and never claim
        success until the tool confirms it.
      </p>
      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-[720px] text-left text-sm">
          <caption className="sr-only">Intent profiles</caption>
          <thead className="border-b border-line bg-panel-2 text-xs text-fg-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Intent</th>
              <th scope="col" className="px-3 py-2 font-medium">Mode override</th>
              <th scope="col" className="px-3 py-2 font-medium">Confirm first</th>
              <th scope="col" className="px-3 py-2 font-medium">Tone note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {INTENTS.map((it) => {
              const cur = c.working.intents?.[it] ?? {};
              const note = cur.toneNote ?? "";
              const err = note ? textError("Tone note", note, LIMITS.toneNoteMax) : null;
              const set = (patch: IntentCfg) => c.update((cfg) => withIntent(cfg, it, patch));
              return (
                <tr key={it}>
                  <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium text-fg">
                    {humanize(it)} {c.working.intents?.[it] ? <Badge tone="accent">custom</Badge> : null}
                  </th>
                  <td className="px-3 py-2">
                    <Select
                      aria-label={`${humanize(it)} mode override`}
                      value={cur.mode ?? ""}
                      disabled={c.readOnly}
                      onChange={(e) => set({ mode: e.target.value === "" ? null : (e.target.value as IntentCfg["mode"]) })}
                    >
                      <option value="">Inherit</option>
                      {MODES.map((m) => (
                        <option key={m} value={m}>
                          {humanize(m)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Switch checked={cur.confirmationFirst ?? false} disabled={c.readOnly} label={`${humanize(it)} confirm first`} onChange={(v) => set({ confirmationFirst: v })} />
                  </td>
                  <td className="px-3 py-2">
                    <TextInput
                      aria-label={`${humanize(it)} tone note`}
                      aria-invalid={err ? true : undefined}
                      title={err ?? undefined}
                      disabled={c.readOnly}
                      value={note}
                      maxLength={LIMITS.toneNoteMax + 20}
                      onChange={(e) => set({ toneNote: e.target.value })}
                    />
                    {err ? <p className="mt-1 text-xs text-danger">{err}</p> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
