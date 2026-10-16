"use client";

import { Field, Notice, Panel, Select } from "@/ui";
import { useCosCtx } from "./CosContext";
import { SliderField, ToggleRow } from "./widgets";
import {
  DEFAULT_THRESHOLDS, LIMITS, THRESHOLDS, THRESHOLD_HELP, effectiveLkgMaxAgeDays, effectiveQuality, effectiveTelemetryEnabled, effectiveThresholds, humanize, setSection,
  type Threshold,
} from "./logic";

const LKG_CHOICES = [1, 3, 7, 14, 30, 60, 90];

export function QualityTab() {
  const c = useCosCtx();
  const th = effectiveThresholds(c.working);
  const q = effectiveQuality(c.working);
  const setQ = (patch: Partial<typeof q>) => c.update((cfg) => setSection(cfg, "quality", { ...effectiveQuality(cfg), ...patch }));
  const setTh = (k: Threshold, v: number) => c.update((cfg) => setSection(cfg, "thresholds", { ...effectiveThresholds(cfg), [k]: v }));

  const lkgDays = effectiveLkgMaxAgeDays(c.working);
  const lkgOptions = LKG_CHOICES.includes(lkgDays) ? LKG_CHOICES : [...LKG_CHOICES, lkgDays].sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <Notice tone="info">
        The gate is deterministic and local (well under 2 ms): no extra model call on the normal path. A model repair is attempted at most ONCE, only when local
        repair cannot fix a response, and never on the voice or floating fast path.
      </Notice>
      <Panel title="Gate, repair and escalation">
        <div className="divide-y divide-line">
          <ToggleRow label="Quality gate" help="Evaluate every completed response against the thresholds below." checked={q.gateEnabled} disabled={c.readOnly} onChange={(v) => setQ({ gateEnabled: v })} />
          <ToggleRow label="Repair" help="Fix a failing response locally (tone, language, verbosity, format) before showing it." checked={q.repairEnabled} disabled={c.readOnly} onChange={(v) => setQ({ repairEnabled: v })} />
          <ToggleRow label="Escalation" help="Retry on a stronger model or show a safe fallback text when repair fails." checked={q.escalationEnabled} disabled={c.readOnly} onChange={(v) => setQ({ escalationEnabled: v })} />
        </div>
        <div className="mt-3 max-w-xs">
          <Field label="Model repair attempts" hint="Hard-capped at one bounded attempt.">
            {(p) => (
              <Select {...p} value={q.maxRepairAttempts} disabled={c.readOnly} onChange={(e) => setQ({ maxRepairAttempts: Number(e.target.value) })}>
                <option value={0}>0 - local repair only</option>
                <option value={1}>1 - one bounded model repair</option>
              </Select>
            )}
          </Field>
        </div>
      </Panel>
      <Panel title="Offline safety and telemetry">
        <div className="max-w-xs">
          <Field label="Offline config expiry (days)" hint={`A device that cannot reach the server stops using a stored configuration after this many days and falls back to the built-in defaults (Conversation OS off). ${LIMITS.lkgMaxAgeDaysMin} to ${LIMITS.lkgMaxAgeDaysMax}, default ${LIMITS.lkgMaxAgeDaysDefault}.`}>
            {(p) => (
              <Select {...p} value={lkgDays} disabled={c.readOnly} onChange={(e) => c.update((cfg) => setSection(cfg, "lkgMaxAgeDays", Number(e.target.value)))}>
                {lkgOptions.map((d) => (
                  <option key={d} value={d}>
                    {d} day{d === 1 ? "" : "s"}
                    {d === LIMITS.lkgMaxAgeDaysDefault ? " (default)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="mt-3 divide-y divide-line">
          <ToggleRow
            label="Report anonymous quality metrics"
            help="Lets the app send ids, counts and latencies per turn (never text) to a daily rollup shown in the Telemetry tab. Default off."
            checked={effectiveTelemetryEnabled(c.working)}
            disabled={c.readOnly}
            onChange={(v) => c.update((cfg) => setSection(cfg, "telemetryEnabled", v))}
          />
        </div>
      </Panel>
      <Panel title="Thresholds" description="0 to 1. Minimums for good scores, maximums for bad ones (rudeness, repetition).">
        <div className="grid gap-x-8 md:grid-cols-2">
          {THRESHOLDS.map((k) => (
            <SliderField
              key={k}
              label={`${humanize(k)} (${k === "rudeness" || k === "repetition" ? "max" : "min"})`}
              help={THRESHOLD_HELP[k]}
              value={th[k]}
              defaultValue={DEFAULT_THRESHOLDS[k]}
              disabled={c.readOnly}
              onChange={(v) => setTh(k, v)}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}
