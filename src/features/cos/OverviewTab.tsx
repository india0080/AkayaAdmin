"use client";

import { useState } from "react";
import { Badge, Field, Notice, Panel, Select, Stat, StatStrip, Textarea, TextInput } from "@/ui";
import { useCosCtx } from "./CosContext";
import { KeyValue, ToggleRow } from "./widgets";
import {
  CHANNELS, ROLLOUT_MODES, humanize, parseAllowlist, setSection, type Channel, type CosConfig, type Rollout,
} from "./logic";

const ROLLOUT_HELP: Record<(typeof ROLLOUT_MODES)[number], string> = {
  disabled: "Nobody gets the OS path. The legacy path runs for everyone.",
  internal: "Only internal testers (the allowlist and staff builds).",
  selected: "Only the users in the allowlist.",
  percentage: "A deterministic, sticky share of users by hashed id.",
  channels: "Everyone, but only on the listed channels.",
  full: "Everyone, every channel.",
};

const fmt = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleString() : "never");

export function OverviewTab() {
  const c = useCosCtx();
  const d = c.q.data;
  const [allowText, setAllowText] = useState<string | null>(null);
  if (!d) return null;
  const pub = d.published;
  const w = c.working;
  const rollout: Rollout = w.rollout ?? {};
  const mode = rollout.mode ?? "disabled";
  const enabled = w.enabled ?? false;
  const running = Object.values(d.experiments.items).filter((e) => e.status === "running").length;

  const setRollout = (patch: Partial<Rollout>) =>
    c.update((cfg: CosConfig) => setSection(cfg, "rollout", { ...(cfg.rollout ?? {}), ...patch }));
  const allowShown = allowText ?? (rollout.allowlist ?? []).join("\n");
  const parsed = parseAllowlist(allowShown);

  return (
    <div className="space-y-4">
      <StatStrip>
        <Stat label="Published version" value={pub.present ? `v${pub.metaVersion}` : "none"} hint={pub.versionId ?? "defaults in effect"} />
        <Stat label="OS master switch" value={pub.config.enabled ? "ON" : "OFF"} tone={pub.config.enabled ? "success" : "default"} hint="published value" />
        <Stat
          label="Rollout"
          value={humanize(pub.config.rollout?.mode ?? "disabled")}
          hint={pub.config.rollout?.mode === "percentage" ? `${pub.config.rollout.percentage ?? 0}% of users` : undefined}
        />
        <Stat label="Running experiments" value={running} />
      </StatStrip>

      {!pub.present ? (
        <Notice tone="info" title="Nothing is published yet">
          Apps use the compiled defaults and the legacy path. Edit the sections, save a draft, then publish.
        </Notice>
      ) : null}

      <Panel
        title="Master switch and rollout"
        description="Both are part of the draft: changing them does nothing until you publish. Turning the OS off returns every user to the legacy path."
      >
        <div className="space-y-3">
          <ToggleRow
            label="Conversation OS enabled"
            help="OFF means the legacy path runs for everyone, regardless of rollout."
            checked={enabled}
            disabled={c.readOnly}
            onChange={(v) => c.update((cfg) => setSection(cfg, "enabled", v))}
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Rollout mode" hint={ROLLOUT_HELP[mode]}>
              {(p) => (
                <Select {...p} value={mode} disabled={c.readOnly} onChange={(e) => setRollout({ mode: e.target.value as Rollout["mode"] })}>
                  {ROLLOUT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {humanize(m)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {mode === "percentage" ? (
              <Field label="Percentage of users" hint="0 to 100, whole numbers. Bucketing is deterministic and sticky per user.">
                {(p) => (
                  <TextInput
                    {...p}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    inputMode="numeric"
                    disabled={c.readOnly}
                    value={rollout.percentage ?? 0}
                    onChange={(e) => setRollout({ percentage: e.target.value === "" ? 0 : Number(e.target.value) })}
                  />
                )}
              </Field>
            ) : null}
          </div>
          {mode === "channels" || (rollout.channels?.length ?? 0) > 0 ? (
            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-fg-muted">Rollout channels</legend>
              <div className="flex flex-wrap gap-3">
                {CHANNELS.map((ch) => {
                  const on = (rollout.channels ?? []).includes(ch);
                  return (
                    <label key={ch} className="inline-flex cursor-pointer items-center gap-2 text-sm text-fg">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={c.readOnly}
                        onChange={(e) => {
                          const cur = new Set<Channel>(rollout.channels ?? []);
                          if (e.target.checked) cur.add(ch);
                          else cur.delete(ch);
                          setRollout({ channels: CHANNELS.filter((x) => cur.has(x)) });
                        }}
                        className="h-4 w-4 accent-[rgb(var(--accent-solid))]"
                      />
                      {humanize(ch)}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          <Field
            label="Allowlist (hashed user ids)"
            hint="One lowercase hex hash per line (8-64 characters). Never paste raw user ids or emails."
            error={parsed.invalid.length ? `Not a valid hash: ${parsed.invalid.slice(0, 3).join(", ")}${parsed.invalid.length > 3 ? "..." : ""}` : null}
          >
            {(p) => (
              <Textarea
                {...p}
                value={allowShown}
                disabled={c.readOnly}
                spellCheck={false}
                rows={3}
                onChange={(e) => {
                  setAllowText(e.target.value);
                  const r = parseAllowlist(e.target.value);
                  setRollout({ allowlist: r.hashes });
                }}
                onBlur={() => setAllowText(null)}
              />
            )}
          </Field>
        </div>
      </Panel>

      <Panel title="Published right now">
        <KeyValue
          items={[
            { k: "Version", v: pub.present ? `v${pub.metaVersion} (${pub.versionId ?? "unlabelled"})` : "none (defaults)" },
            { k: "Content hash", v: pub.hash ?? "n/a" },
            { k: "Last published", v: `${fmt(pub.updatedAt)}${pub.updatedByEmail ? ` by ${pub.updatedByEmail}` : ""}` },
            {
              k: "Draft",
              v: d.draft ? (
                <span>
                  v{d.draft.version}, {d.draft.changes.length} change(s) vs published{" "}
                  {d.draft.baseVersion !== pub.metaVersion ? <Badge tone="warning">based on an older version</Badge> : null}
                </span>
              ) : (
                "none"
              ),
            },
            { k: "Model profiles", v: Object.keys(d.profiles.items).length },
            { k: "Experiments", v: Object.keys(d.experiments.items).length },
          ]}
        />
      </Panel>
    </div>
  );
}
