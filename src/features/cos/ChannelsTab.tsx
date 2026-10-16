"use client";

import { Badge, Button, Field, Panel, Select, TextInput } from "@/ui";
import { useCosCtx } from "./CosContext";
import { CharCount, ToggleRow } from "./widgets";
import {
  CHANNELS, LIMITS, MODES, compactChannel, cpLen, effectiveChannel, humanize, textError, type Channel, type ChannelCfg, type CosConfig,
} from "./logic";

const BOOLS: { key: "allowMarkdown" | "allowHeadings" | "allowBullets" | "allowEmoji" | "readUrls"; label: string }[] = [
  { key: "allowMarkdown", label: "Markdown" },
  { key: "allowHeadings", label: "Headings" },
  { key: "allowBullets", label: "Bullet lists" },
  { key: "allowEmoji", label: "Emoji" },
  { key: "readUrls", label: "Read URLs aloud / include links" },
];

function withChannel(cfg: CosConfig, ch: Channel, patch: ChannelCfg): CosConfig {
  const merged = compactChannel({ ...(cfg.channels?.[ch] ?? {}), ...patch });
  const channels = { ...(cfg.channels ?? {}) };
  if (merged) channels[ch] = merged;
  else delete channels[ch];
  const next: CosConfig = { ...cfg, channels };
  if (Object.keys(channels).length === 0) delete next.channels;
  return next;
}

export function ChannelsTab() {
  const c = useCosCtx();
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        How Akaya presents answers on each surface. Brief channels (voice, floating, notification) stay short and plain by default. Unchanged fields use the
        compiled default.
      </p>
      {CHANNELS.map((ch) => {
        const eff = effectiveChannel(c.working, ch);
        const custom = c.working.channels?.[ch] !== undefined;
        const note = c.working.channels?.[ch]?.toneNote ?? "";
        const noteErr = note ? textError("Tone note", note, LIMITS.toneNoteMax) : null;
        const set = (patch: ChannelCfg) => c.update((cfg) => withChannel(cfg, ch, patch));
        return (
          <Panel
            key={ch}
            title={
              <span className="inline-flex items-center gap-2">
                {humanize(ch)} {custom ? <Badge tone="accent">customised</Badge> : <Badge tone="neutral">defaults</Badge>}
              </span>
            }
            actions={
              custom && !c.readOnly ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    c.update((cfg) => {
                      const channels = { ...(cfg.channels ?? {}) };
                      delete channels[ch];
                      const next: CosConfig = { ...cfg, channels };
                      if (Object.keys(channels).length === 0) delete next.channels;
                      return next;
                    })
                  }
                >
                  Reset
                </Button>
              ) : null
            }
          >
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Default response mode">
                {(p) => (
                  <Select {...p} value={eff.defaultMode} disabled={c.readOnly} onChange={(e) => set({ defaultMode: e.target.value as ChannelCfg["defaultMode"] })}>
                    {MODES.map((m) => (
                      <option key={m} value={m}>
                        {humanize(m)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Max sentences" hint="Empty = no limit.">
                {(p) => (
                  <TextInput
                    {...p}
                    type="number"
                    min={1}
                    max={LIMITS.maxSentencesMax}
                    step={1}
                    inputMode="numeric"
                    disabled={c.readOnly}
                    value={eff.maxSentences ?? ""}
                    onChange={(e) => set({ maxSentences: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                )}
              </Field>
              <Field label="Tone note" error={noteErr} hint={`Short plain hint, up to ${LIMITS.toneNoteMax} characters.`}>
                {(p) => <TextInput {...p} disabled={c.readOnly} value={note} onChange={(e) => set({ toneNote: e.target.value })} />}
              </Field>
            </div>
            <div className="mt-1 flex justify-end">
              <CharCount value={cpLen(note.trim())} max={LIMITS.toneNoteMax} />
            </div>
            <div className="mt-2 grid gap-x-8 md:grid-cols-2">
              {BOOLS.map((b) => (
                <ToggleRow key={b.key} label={`Allow ${b.label.toLowerCase()}`} checked={eff[b.key]} disabled={c.readOnly} onChange={(v) => set({ [b.key]: v } as ChannelCfg)} />
              ))}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
