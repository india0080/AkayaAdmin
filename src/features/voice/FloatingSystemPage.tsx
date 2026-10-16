"use client";

// Floating System — the control plane for which architecture Floating runs.
//
// ── The distinction this page exists to make ───────────────────────────────
//
// ACTIVE is what phones are running right now. DRAFT is what the operator
// has typed. They are rendered as separate things, always, because every
// admin page in this panel that merged them taught its operators to read
// their own unsaved edits as production state.
//
// Nothing on this page writes Firestore directly. Every change goes through
// `adminFloatingSystem`, which is the only thing that can stamp who made it,
// validate it with the same rules the app uses, and bump the version
// atomically.
//
// NOTE ON SCOPE: Phases 4–7 — Overview, Current Active Configuration, System
// Mode, capability-filtered model selection, health check, smoke test,
// staging, activation, versioning and rollback.

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChainEditor } from "@/components/ChainEditor";
import {
  Button, Checkbox, ErrorState, Field, Notice, PageHeader, Panel, Select,
  Skeleton, Switch, TextInput,
} from "@/ui";
import { useCan } from "@/lib/session";
import {
  ARCHITECTURES,
  ArchitectureId,
  FloatingConfig,
  ACTION_LABEL,
  ACTION_TONE,
  ActivationDecision,
  AuditEntry,
  CAPABILITY_LABEL,
  EVIDENCE_WORD,
  HealthReport,
  LanguagesResult,
  TIER_LABEL,
  TIER_TONE,
  ModelsResult,
  RUNG_LABEL,
  RUNG_TONE,
  SmokeReport,
  VERDICT_LABEL,
  VERDICT_TONE,
  ReadResult,
  STATUS_TONE,
  Stage,
  STAGE_LABEL,
  Validation,
  VersionSummary,
  activeStages,
  callFloating,
  chainLabel,
  chainOf,
  formatTs,
  withChain,
} from "@/lib/floatingSystem";

/// What each job actually is, in the words of somebody who has to choose a
/// model for it. Stage NAMES are not self-explanatory — "Improvement" in
/// fused execution is the whole transformation, not a polish step.
const STAGE_HINT: Record<Stage, string> = {
  stt: "Turns the recording into a transcript. This is the first and most expensive leg of a dictation.",
  language_detection:
    "Works out what language was spoken. Split execution only — in fused execution the one call does this itself.",
  translation:
    "Renders the transcript in the target language. Split execution only.",
  improvement:
    "In fused execution this model does the WHOLE transformation — detect, translate, fix grammar, restructure and apply tone, in one call. In split execution it only fixes grammar and restructures.",
  tone: "Applies the requested tone. Split execution only.",
  fallback:
    "Tried after every rung above has failed. Optional — leave it empty and a total failure surfaces as an error instead of a worse answer.",
};

const CARD = "rounded-lg border border-line bg-panel p-5";
const H2 = "text-xs font-semibold text-fg-muted uppercase tracking-wider mb-4";

function Pill({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.configured;
  return (
    <span
      className={`px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md border ${tone}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 border-b border-line last:border-0">
      <span className="text-xs text-fg-muted shrink-0">{label}</span>
      <span
        className={`text-sm font-mono text-right break-all ${muted ? "text-fg-subtle" : "text-fg"}`}
      >
        {value}
      </span>
    </div>
  );
}

function Issues({ validation }: { validation: Validation }) {
  if (validation.issues.length === 0) return null;
  return (
    <div className="mt-4 space-y-1.5">
      {validation.errors.map((i, n) => (
        <div
          key={`e${n}`}
          className="text-xs text-danger flex gap-2 items-baseline"
        >
          <span className="font-mono shrink-0 text-danger/70">{i.field}</span>
          <span>{i.message}</span>
        </div>
      ))}
      {validation.warnings.map((i, n) => (
        <div
          key={`w${n}`}
          className="text-xs text-warning flex gap-2 items-baseline"
        >
          <span className="font-mono shrink-0 text-warning/60">{i.field}</span>
          <span>{i.message}</span>
        </div>
      ))}
    </div>
  );
}

export default function FloatingSystemPage() {
  const can = useCan();
  const canWrite = can("floating.configure");
  const canActivate = can("floating.activate");
  const [data, setData] = useState<ReadResult | null>(null);
  const [draft, setDraft] = useState<FloatingConfig | null>(null);
  const [draftValidation, setDraftValidation] = useState<Validation | null>(null);
  const [models, setModels] = useState<ModelsResult | null>(null);
  const [showUnknown, setShowUnknown] = useState(false);
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [smoke, setSmoke] = useState<SmokeReport | null>(null);
  const [decision, setDecision] = useState<ActivationDecision | null>(null);
  const [forceReason, setForceReason] = useState("");
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [langs, setLangs] = useState<LanguagesResult | null>(null);
  const [langTier, setLangTier] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setBusy("load");
    setErr("");
    try {
      const res = await callFloating<ReadResult>("read", { versionLimit: 10 });
      setData(res);
      setDraft(res.draft.config);
      setDraftValidation(res.draft.validation);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The registry is fetched separately from the configuration, and a failure
  // to read it leaves `models` null rather than empty. An empty list would
  // read as "no model can do this job"; null reads as "we do not know yet",
  // which is the truth.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await callFloating<ModelsResult>("models", {
          includeUnknown: showUnknown,
        });
        if (!cancelled) setModels(res);
      } catch (e) {
        if (!cancelled) {
          setModels(null);
          setErr(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showUnknown]);

  // Validation comes from the SERVER, on every edit, so what the operator
  // reads is the same verdict the app will reach — not a browser copy of
  // the rules that can drift away from it.
  const revalidate = useCallback(async (next: FloatingConfig) => {
    try {
      const res = await callFloating<{ validation: Validation }>("validate", {
        config: next,
      });
      setDraftValidation(res.validation);
    } catch {
      setDraftValidation(null); // "unknown", never "fine"
    }
  }, []);

  function edit(patch: Partial<FloatingConfig>) {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    setMsg("");
    void revalidate(next);
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy("save");
    setErr("");
    try {
      const res = await callFloating<{ validation: Validation }>("saveDraft", {
        config: draft,
        reason,
      });
      setDraftValidation(res.validation);
      setMsg("Draft saved. Nothing in production has changed.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function healthCheck() {
    if (!draft) return;
    setBusy("health");
    setErr("");
    setMsg("");
    try {
      const res = await callFloating<{ report: HealthReport }>("healthCheck", {
        config: draft,
      });
      setHealth(res.report);
      // A health check upgrades capability evidence in the registry, so the
      // selectors are re-read: a rung the provider just refused by name
      // disappears from them.
      setModels(
        await callFloating<ModelsResult>("models", { includeUnknown: showUnknown }),
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function smokeTest() {
    if (!draft) return;
    setBusy("smoke");
    setErr("");
    setMsg("");
    try {
      const res = await callFloating<{ report: SmokeReport }>("smokeTest", {
        config: draft,
      });
      setSmoke(res.report);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  /// Stage or Apply. `expectedVersion` is what this browser last saw live —
  /// the server compares it inside its transaction so two admins working at
  /// once cannot silently overwrite each other.
  async function activate(action: "stage" | "apply", force = false) {
    if (!draft || !data) return;
    setBusy(action);
    setErr("");
    setMsg("");
    try {
      const res = await callFloating<{
        applied?: boolean;
        staged?: boolean;
        version?: number;
        decision: ActivationDecision;
        needsForceReason?: boolean;
      }>(action, {
        config: draft,
        expectedVersion: data.active.config.version,
        reason,
        force,
        forceReason: force ? forceReason : "",
      });
      setDecision(res.decision.allowed ? null : res.decision);
      if (res.applied) {
        setMsg(
          `Applied as v${res.version}. Devices pick it up on their next recording.`,
        );
        setDecision(null);
        setForceReason("");
        setReason("");
        setHealth(null);
        setSmoke(null);
        await load();
      } else if (res.staged) {
        setMsg("Staged. Nothing has reached a device yet — press Apply for that.");
        await load();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function rollback(toVersion: number) {
    setBusy(`rollback${toVersion}`);
    setErr("");
    setMsg("");
    try {
      const res = await callFloating<{
        rolledBack: boolean;
        version?: number;
        decision: ActivationDecision;
      }>("rollback", { toVersion, reason: reason || `Rolled back to v${toVersion}` });
      if (res.rolledBack) {
        setMsg(
          `Rolled back to v${toVersion}, live as v${res.version}. Devices pick it up on their next recording.`,
        );
        setDecision(null);
        await load();
      } else {
        setDecision(res.decision);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function loadAudit() {
    setBusy("audit");
    try {
      const res = await callFloating<{ entries: AuditEntry[] }>("audit", {
        limit: 40,
      });
      setAudit(res.entries);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function loadLanguages(tier = "") {
    setBusy("langs");
    try {
      setLangs(
        await callFloating<LanguagesResult>("languages", tier ? { tier } : {}),
      );
      setLangTier(tier);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function discardDraft() {
    setBusy("discard");
    setErr("");
    try {
      await callFloating("discardDraft");
      setMsg("Draft discarded — back to what is running.");
      setReason("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!data || !draft) {
    return (
      <div className="p-8 max-w-4xl">
        <PageHeader title="Floating Control Plane" />
        {err ? <ErrorState message={err} onRetry={load} /> : <Skeleton className="h-96 w-full" />}
      </div>
    );
  }

  const active = data.active.config;
  const activeArch = ARCHITECTURES.find((a) => a.id === active.mode)!;
  const draftArch = ARCHITECTURES.find((a) => a.id === draft.mode)!;
  const draftStages = activeStages(draft);
  const changed =
    JSON.stringify(draft) !== JSON.stringify(data.draft.config) || data.draft.dirty;

  return (
    <div className="p-8 max-w-4xl">
      <PageHeader
        title="Floating Control Plane"
        description="Which architecture Floating Insert runs on, and the models doing each job. Changes here take effect on the next recording — never in the middle of one."
      />

      {err && <div className="mb-4"><Notice tone="danger">{err}</Notice></div>}
      {msg && <div className="mb-4"><Notice tone="success">{msg}</Notice></div>}

      {/* ── CURRENT ACTIVE CONFIGURATION ───────────────────────────────── */}
      <section className={`${CARD} mb-6`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`${H2} mb-0`}>Current Active Configuration</h2>
          <div className="flex items-center gap-2">
            {active.emergencyDisabled && (
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-md border text-danger border-danger/40 bg-danger-soft">
                Emergency Off
              </span>
            )}
            <Pill status={active.status} />
          </div>
        </div>

        {!data.active.configured ? (
          <p className="text-sm text-fg-subtle mb-4">
            No configuration has ever been activated. Every device is running
            the compiled baseline —{" "}
            <span className="text-fg font-semibold">Existing Floating</span>{" "}
            — which is the intended state until you activate something else.
          </p>
        ) : null}

        <div className="mb-4">
          <div className="text-2xl font-bold text-fg">
            {active.emergencyDisabled ? "Existing Floating" : activeArch.label}
          </div>
          <p className="text-xs text-fg-muted mt-1 leading-relaxed">
            {active.emergencyDisabled
              ? `The emergency switch is ON. ${activeArch.label} is configured but is NOT running — every session is being served by the baseline.`
              : activeArch.blurb}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-8">
          <div>
            <Row label="Version" value={active.version > 0 ? `v${active.version}` : "compiled"} />
            <Row label="Execution" value={active.stageExecution} />
            <Row label="Cost policy" value={active.costPolicy.replace(/_/g, " ")} />
            <Row label="Fallback architecture" value={active.fallbackArchitecture} />
          </div>
          <div>
            {active.mode === "existing" ? (
              <>
                <Row label="Speech to Text" value="config/voice · onlineStt" muted />
                <Row label="Transformation" value="config/voice · insertLlm" muted />
                <Row label="Where" value="Voice page" muted />
              </>
            ) : (
              (["stt", "improvement", "translation", "fallback"] as Stage[]).map(
                (s) => (
                  <Row
                    key={s}
                    label={STAGE_LABEL[s]}
                    value={chainLabel(chainOf(active, s))}
                    muted={chainOf(active, s).length === 0}
                  />
                ),
              )
            )}
          </div>
        </div>

        {active.mode === "existing" && (
          <p className="text-xs text-fg-muted mt-4 leading-relaxed">
            Existing Floating does not read this document for its models — its
            speech-to-text and transformation chains live in{" "}
            <span className="font-mono text-fg-muted">config/voice</span>, edited
            on the{" "}
            <Link href="/dashboard/voice" className="text-accent hover:underline">
              Voice
            </Link>{" "}
            page. That is deliberate: the baseline keeps running exactly as it
            always has, whatever is configured here.
          </p>
        )}

        <Issues validation={data.active.validation} />
      </section>

      {/* ── SYSTEM MODE (draft) ────────────────────────────────────────── */}
      <section className={`${CARD} mb-6`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className={`${H2} mb-0`}>Floating System Mode</h2>
          {changed && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-warning">
              Unsaved changes
            </span>
          )}
        </div>
        <p className="text-xs text-fg-muted mb-4">
          Selecting a mode changes the DRAFT only. Nothing reaches a device
          until the draft is validated, health-checked and applied.
        </p>

        <div className="space-y-2 mb-5" role="radiogroup" aria-label="Floating architecture">
          {ARCHITECTURES.map((a) => {
            const selected = draft.mode === a.id;
            return (
              <button
                key={a.id}
                role="radio"
                aria-checked={selected}
                onClick={() => edit({ mode: a.id as ArchitectureId })}
                className={`w-full text-left p-4 rounded-xl border transition-all ${
                  selected
                    ? "border-accent/40 bg-accent/5"
                    : "border-line bg-canvas hover:border-line-strong"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 ${
                      selected ? "border-accent bg-accent" : "border-line-strong"
                    }`}
                  />
                  <span className="text-sm font-semibold text-fg">{a.label}</span>
                  {active.mode === a.id && !active.emergencyDisabled && (
                    <span className="text-[10px] uppercase tracking-wider text-accent">
                      running
                    </span>
                  )}
                </div>
                <p className="text-xs text-fg-muted mt-1.5 ml-[26px] leading-relaxed">
                  {a.blurb}
                </p>
              </button>
            );
          })}
        </div>

        {/* Stage execution — only meaningful for the multi-model mode. */}
        {draft.mode === "openai_multi" && (
          <div className="p-4 rounded-xl border border-line bg-canvas mb-5">
            <div className="text-sm text-fg mb-1">Stage execution</div>
            <p className="text-xs text-fg-muted leading-relaxed mb-3">
              Floating Insert normally runs language detection, translation,
              grammar, restructuring and tone as{" "}
              <span className="text-fg">one model call</span> — each stage a
              clause in a single prompt. Splitting them lets you assign a
              different model to each, and costs a network round trip per
              stage. One extra leg measured ~470&nbsp;ms per turn on the
              handset, so this is a real trade, not a preference.
            </p>
            <div className="flex gap-2" role="radiogroup" aria-label="Stage execution mode">
              {(["fused", "split"] as const).map((e) => (
                <button
                  key={e}
                  role="radio"
                  aria-checked={draft.stageExecution === e}
                  onClick={() => edit({ stageExecution: e })}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${
                    draft.stageExecution === e
                      ? "border-accent/40 bg-accent/10 text-accent"
                      : "border-line bg-panel text-fg-subtle hover:text-fg"
                  }`}
                >
                  {e === "fused" ? "Fused — one call" : "Split — one call per stage"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Emergency kill switch (§47). */}
        <div className="p-4 rounded-xl border border-danger/20 bg-danger-soft mb-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-fg">
                Disable OpenAI advanced Floating
              </div>
              <p className="text-xs text-fg-muted mt-1 leading-relaxed">
                Routes every new session straight back to Existing Floating,
                whatever the mode says. Unlike a mode change this applies{" "}
                <span className="text-fg">immediately</span>, including to a
                draft already in progress — a kill switch that waits for the
                current dictation to finish is not one.
              </p>
            </div>
            <Switch
              checked={draft.emergencyDisabled}
              onChange={(v) => edit({ emergencyDisabled: v })}
              label="Disable OpenAI advanced Floating"
              disabled={!canWrite}
            />
          </div>
        </div>

        {draftValidation === null ? (
          <div className="text-xs text-fg-subtle">
            Could not reach the validator — treat this draft as unchecked.
          </div>
        ) : (
          <Issues validation={draftValidation} />
        )}

        <div className="mt-5">
          <Field label="Change reason" hint="Recorded in the audit log">
            {(p) => (
              <TextInput
                {...p}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you changing this?"
              />
            )}
          </Field>
        </div>

        {canWrite && (
        <div className="flex flex-wrap gap-2 mt-4">
          <Button onClick={saveDraft} disabled={busy !== null} loading={busy === "save"}>
            Save Draft
          </Button>
          <Button
            variant="secondary"
            onClick={discardDraft}
            disabled={busy !== null || !data.draft.exists}
          >
            Discard Draft
          </Button>
          <Button
            variant="secondary"
            onClick={healthCheck}
            disabled={busy !== null || draft.mode === "existing"}
            loading={busy === "health"}
            title={
              draft.mode === "existing"
                ? "Existing Floating's chains live in config/voice — check them on the Voice page."
                : "Probe every rung this configuration would use"
            }
          >
            Health Check
          </Button>
          <Button
            variant="secondary"
            onClick={smokeTest}
            disabled={busy !== null || draft.mode !== "openai_multi"}
            loading={busy === "smoke"}
            title={
              draft.mode === "openai_multi"
                ? "Run three real transformations and judge the output"
                : "Only OpenAI Multi-Model can be smoke-tested from the server"
            }
          >
            Smoke Test
          </Button>
          {canActivate && (
          <>
          <Button
            variant="secondary"
            onClick={() => activate("stage")}
            disabled={busy !== null}
            loading={busy === "stage"}
            title="Mark this draft ready to activate. Changes nothing a device can see."
          >
            Stage
          </Button>
          <Button
            onClick={() => activate("apply")}
            disabled={busy !== null}
            loading={busy === "apply"}
            title="Make this the active configuration for every device"
          >
            Apply
          </Button>
          </>
          )}
        </div>
        )}
        <p className="text-xs text-fg-muted mt-3">
          Apply takes effect on the <span className="text-fg-subtle">next
          recording</span> on each device — never in the middle of one. A
          dictation already under way finishes on the configuration it
          started with.
        </p>

        {/* A refusal, and what to do about it. */}
        {decision && !decision.allowed && (
          <div className="mt-4 p-4 rounded-xl border border-warning/30 bg-warning-soft">
            <div className="text-sm text-warning font-semibold mb-1">
              Not applied — {decision.refusal?.replace(/_/g, " ")}
            </div>
            <p className="text-xs text-fg-subtle leading-relaxed">
              {decision.message}
            </p>
            {decision.forcible && (
              <div className="mt-3">
                <Field label="Override reason" hint="10+ characters, recorded permanently">
                  {(p) => (
                    <TextInput
                      {...p}
                      value={forceReason}
                      onChange={(e) => setForceReason(e.target.value)}
                      placeholder="Why are you overriding this?"
                    />
                  )}
                </Field>
                <Button
                  variant="danger"
                  onClick={() => activate("apply", true)}
                  disabled={busy !== null || forceReason.trim().length < 10}
                  className="mt-2"
                >
                  Apply anyway
                </Button>
              </div>
            )}
            {!decision.forcible && (
              <p className="text-xs text-fg-muted mt-2">
                This one cannot be overridden — the app refuses an invalid
                configuration on load, so applying it would take Floating back
                to the baseline rather than to this.
              </p>
            )}
          </div>
        )}
      </section>

      {/* ── HEALTH ──────────────────────────────────────────────────────── */}
      {health && (
        <section className={`${CARD} mb-6`}>
          <div className="flex items-center justify-between mb-1">
            <h2 className={`${H2} mb-0`}>Health Check</h2>
            <span
              className={`text-xs font-semibold ${health.ok ? "text-accent" : "text-danger"}`}
            >
              {health.ok
                ? "Every required rung answered"
                : "A required rung did not answer"}
            </span>
          </div>
          <p className="text-xs text-fg-muted mb-4">
            {formatTs(health.checkedAt)} · {health.summary.healthy} answered,{" "}
            {health.summary.failed} failed
            {health.summary.skipped > 0 && `, ${health.summary.skipped} not probed`}
          </p>

          {health.rungs.length === 0 ? (
            <p className="text-sm text-fg-muted">Nothing to probe.</p>
          ) : (
            <div className="space-y-1.5">
              {health.rungs.map((r, i) => (
                <div key={i} className="flex items-baseline gap-3 text-sm py-1">
                  <span className="text-fg-muted text-xs w-28 shrink-0">
                    {STAGE_LABEL[r.stage as Stage] ?? r.stage}
                    {r.index > 0 && (
                      <span className="text-fg-subtle"> fb{r.index}</span>
                    )}
                  </span>
                  <span className="font-mono text-fg flex-1 min-w-0 truncate">
                    {r.provider}/{r.model}
                  </span>
                  {r.required && (
                    <span className="text-[10px] uppercase tracking-wider text-fg-muted shrink-0">
                      required
                    </span>
                  )}
                  <span className="text-xs text-fg-muted w-16 text-right shrink-0">
                    {r.latencyMs === null ? "—" : `${r.latencyMs} ms`}
                  </span>
                  <span
                    className={`text-xs w-28 text-right shrink-0 ${RUNG_TONE[r.status]}`}
                  >
                    {RUNG_LABEL[r.status]}
                  </span>
                </div>
              ))}
              {health.rungs
                .filter((r) => r.status !== "healthy")
                .map((r, i) => (
                  <p key={`d${i}`} className="text-xs text-fg-muted pl-28">
                    <span className="font-mono text-fg-muted">
                      {r.provider}/{r.model}
                    </span>{" "}
                    — {r.detail}
                  </p>
                ))}
            </div>
          )}

          {/* What the check could NOT establish. Rendered so an absence is
              never read as a pass. */}
          <div className="mt-4 pt-4 border-t border-line space-y-1.5">
            {health.notes.map((n, i) => (
              <p key={i} className="text-xs text-fg-muted leading-relaxed">
                {n}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* ── SMOKE TEST ──────────────────────────────────────────────────── */}
      {smoke && (
        <section className={`${CARD} mb-6`}>
          <div className="flex items-center justify-between mb-1">
            <h2 className={`${H2} mb-0`}>Smoke Test</h2>
            <span
              className={`text-xs font-semibold ${smoke.ok ? "text-accent" : "text-danger"}`}
            >
              {smoke.results.filter((r) => r.verdict === "passed").length}/
              {smoke.results.length} passed
            </span>
          </div>
          <p className="text-xs text-fg-muted mb-4">{formatTs(smoke.ranAt)}</p>

          <div className="space-y-3">
            {smoke.results.map((r) => (
              <div key={r.caseId} className="border-b border-line pb-3 last:border-0">
                <div className="flex items-baseline gap-3">
                  <span className="text-sm text-fg flex-1">{r.caseId}</span>
                  <span className="text-xs text-fg-muted">
                    {r.latencyMs === null ? "—" : `${r.latencyMs} ms`}
                  </span>
                  <span className={`text-xs ${VERDICT_TONE[r.verdict]}`}>
                    {VERDICT_LABEL[r.verdict]}
                  </span>
                </div>
                {r.verdict !== "passed" && (
                  <p className="text-xs text-fg-muted mt-1">{r.detail}</p>
                )}
                {r.output && (
                  <p className="text-xs font-mono text-fg-subtle mt-1.5 break-all">
                    {r.output}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-line space-y-1.5">
            {smoke.notes.map((n, i) => (
              <p key={i} className="text-xs text-fg-muted leading-relaxed">
                {n}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* ── MODEL CONFIGURATION ────────────────────────────────────────── */}
      {draft.mode !== "existing" && (
        <section className={`${CARD} mb-6`}>
          <div className="flex items-center justify-between mb-1">
            <h2 className={`${H2} mb-0`}>Model Configuration — {draftArch.label}</h2>
            <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer">
              <Checkbox
                checked={showUnknown}
                onChange={setShowUnknown}
                label="Show unconfirmed models"
              />
              Show unconfirmed models
            </label>
          </div>
          <p className="text-xs text-fg-muted mb-4 leading-relaxed">
            Each list is filtered by capability against the model registry — a
            model that cannot transcribe is never offered for Speech to Text.
            The tag beside each choice says how we know:{" "}
            <span className="text-accent">measured</span> means a probe ran
            and it worked, <span className="text-info">catalogue</span> means
            the provider says so,{" "}
            <span className="text-warning">unconfirmed</span> means nobody
            has said either way.
          </p>

          {models === null ? (
            <p className="text-sm text-fg-muted">Loading the model registry…</p>
          ) : (
            <>
              {models.unreadableSources.length > 0 && (
                <p className="text-xs text-warning mb-4">
                  Could not read {models.unreadableSources.join(", ")} — these
                  lists may be shorter than what is actually available.
                </p>
              )}
              <div className="space-y-3">
                {(Object.keys(STAGE_LABEL) as Stage[]).map((s) => {
                  const used = draftStages.has(s);
                  if (!used && chainOf(draft, s).length === 0) return null;
                  return (
                    <ChainEditor
                      key={s}
                      label={STAGE_LABEL[s]}
                      hint={
                        !used
                          ? `${draftArch.label} does not use this stage — these settings have no effect right now.`
                          : STAGE_HINT[s]
                      }
                      chain={chainOf(draft, s)}
                      options={models.byStage[s] ?? []}
                      disabled={!used}
                      onChange={(next) => edit(withChain(draft, s, next) as Partial<FloatingConfig>)}
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* Realtime block — its own shape, not a chain. */}
          {draft.mode === "openai_realtime" && (
            <div className="mt-3 p-4 rounded-xl border border-line bg-canvas">
              <div className="text-sm font-semibold text-fg mb-3">
                Realtime Session
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-fg-muted w-32 shrink-0">Model</span>
                  <Select
                    value={`${draft.realtime.model}`}
                    onChange={(e) =>
                      edit({ realtime: { ...draft.realtime, model: e.target.value } })
                    }
                    aria-label="Realtime model"
                    className="flex-1"
                  >
                    {!draft.realtime.model && <option value="">— choose a model —</option>}
                    {(models?.realtime ?? []).map((o) => (
                      <option key={o.modelId} value={o.modelId}>
                        {o.provider} / {o.modelId}
                      </option>
                    ))}
                    {draft.realtime.model &&
                      !(models?.realtime ?? []).some((o) => o.modelId === draft.realtime.model) && (
                        <option value={draft.realtime.model}>
                          {draft.realtime.model} (not in registry)
                        </option>
                      )}
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-fg">Realtime enabled</div>
                    <p className="text-xs text-fg-muted mt-0.5">
                      Off by default. An architecture that bills for wall-clock
                      audio does not turn itself on.
                    </p>
                  </div>
                  <Switch
                    checked={draft.realtime.enabled}
                    onChange={(v) =>
                      edit({
                        realtime: { ...draft.realtime, enabled: v },
                      })
                    }
                    label="Realtime enabled"
                    disabled={!canWrite}
                  />
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm text-fg">Persistent (warm) session</div>
                    <p className="text-xs text-fg-muted mt-0.5 leading-relaxed">
                      Keeps a session open between recordings so a tap pays no
                      network setup. It also{" "}
                      <span className="text-warning">
                        bills for wall-clock audio while it is open
                      </span>
                      , including while nobody is speaking.
                    </p>
                  </div>
                  <Switch
                    checked={draft.realtime.persistentSession}
                    onChange={(v) =>
                      edit({
                        realtime: {
                          ...draft.realtime,
                          persistentSession: v,
                        },
                      })
                    }
                    label="Persistent session"
                    disabled={!canWrite}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Field label="Idle timeout (s)" hint="The server lease expires at 900" className="flex-1">
                    {(p) => (
                      <TextInput
                        {...p}
                        type="number"
                        min={1}
                        max={900}
                        value={Math.round(draft.realtime.sessionIdleTimeoutMs / 1000)}
                        onChange={(e) =>
                          edit({
                            realtime: {
                              ...draft.realtime,
                              sessionIdleTimeoutMs: (Number(e.target.value) || 0) * 1000,
                            },
                          })
                        }
                        className="w-28"
                      />
                    )}
                  </Field>
                </div>

                <div className="flex items-center gap-3">
                  <Field label="Reconnect attempts" className="flex-1">
                    {(p) => (
                      <TextInput
                        {...p}
                        type="number"
                        min={0}
                        max={5}
                        value={draft.realtime.maxReconnectAttempts}
                        onChange={(e) =>
                          edit({
                            realtime: {
                              ...draft.realtime,
                              maxReconnectAttempts: Number(e.target.value) || 0,
                            },
                          })
                        }
                        className="w-28"
                      />
                    )}
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* Cross-architecture fallback (§17). */}
          <div className="mt-3 p-4 rounded-xl border border-line bg-canvas">
            <div className="text-sm font-semibold text-fg mb-1">
              If {draftArch.label} cannot serve at all
            </div>
            <p className="text-xs text-fg-muted mb-3 leading-relaxed">
              Which architecture takes over when every rung above has failed.
              The hand-over is logged, so a fallback never happens silently.
            </p>
            <Select
              value={draft.fallbackArchitecture}
              onChange={(e) =>
                edit({ fallbackArchitecture: e.target.value as ArchitectureId })
              }
              aria-label="Fallback architecture"
            >
              {ARCHITECTURES.filter((a) => a.id !== draft.mode).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </Select>
          </div>
        </section>
      )}

      {/* ── VERSION HISTORY ────────────────────────────────────────────── */}
      <section className={CARD}>
        <h2 className={H2}>Configuration History</h2>
        {data.versions.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No configuration has been activated yet. Every apply creates a
            version here, and any of them can be rolled back to.
          </p>
        ) : (
          <div className="space-y-2">
            {data.versions.map((v: VersionSummary) => (
              <div
                key={v.version}
                className="flex items-center gap-4 py-2 border-b border-line last:border-0"
              >
                <span className="text-sm font-mono text-fg w-12 shrink-0">
                  v{v.version}
                </span>
                <Pill status={v.status} />
                <span className="text-sm text-fg-subtle w-36 shrink-0">{v.mode}</span>
                <span className="text-xs text-fg-muted flex-1 truncate">
                  {v.reason || "—"}
                </span>
                <span className="text-xs text-fg-muted shrink-0">
                  {v.createdByEmail}
                </span>
                <span className="text-xs text-fg-muted shrink-0 w-40 text-right">
                  {formatTs(v.activatedAt ?? v.createdAt)}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => rollback(v.version)}
                  disabled={
                    !canActivate || busy !== null || v.version === data.active.config.version
                  }
                  loading={busy === `rollback${v.version}`}
                  title={
                    v.version === data.active.config.version
                      ? "This is what is running"
                      : `Restore v${v.version} as a new version`
                  }
                >
                  Roll back
                </Button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-fg-muted mt-4 leading-relaxed">
          A rollback restores an earlier configuration as a{" "}
          <span className="text-fg-subtle">new</span> version rather than
          re-pointing at the old one, so the number always means one thing and
          the history records that a rollback happened. It does not require a
          health check — a rollback happens during an incident, which is
          exactly when health checks fail.
        </p>
      </section>

      {/* ── LANGUAGE COVERAGE ───────────────────────────────────────────── */}
      <section className={`${CARD} mb-6`}>
        <div className="flex items-center justify-between mb-1">
          <h2 className={`${H2} mb-0`}>Language Coverage</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadLanguages(langTier)}
            disabled={busy !== null}
            loading={busy === "langs"}
          >
            {langs ? "Refresh" : "Load"}
          </Button>
        </div>
        <p className="text-xs text-fg-muted mb-4 leading-relaxed">
          What each language can actually do, and how we know. A language is
          never marked supported because a model claims broad multilingual
          capability — every cell carries its evidence, and{" "}
          <span className="text-fg">not checked</span> is a real answer that
          is never rendered as a pass.
        </p>

        {langs === null ? (
          <p className="text-sm text-fg-muted">
            {busy === "langs" ? "" : "Not loaded."}
          </p>
        ) : (
          <>
            {/* The headline an operator repeats to a customer. */}
            <div className="grid grid-cols-5 gap-2 mb-5" role="group" aria-label="Filter by language tier">
              {(["A", "B", "C", "D", "E"] as const).map((t) => (
                <button
                  key={t}
                  aria-pressed={langTier === t}
                  onClick={() => loadLanguages(langTier === t ? "" : t)}
                  className={`p-3 rounded-xl border text-left transition-all ${TIER_TONE[t]} ${langTier === t ? "ring-1 ring-white/20" : "opacity-80 hover:opacity-100"}`}
                >
                  <div className="text-2xl font-bold">
                    {langs.tierCounts[t] ?? 0}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider mt-0.5">
                    Tier {t}
                  </div>
                  <div className="text-[10px] opacity-70 leading-tight mt-0.5">
                    {TIER_LABEL[t]}
                  </div>
                </button>
              ))}
            </div>

            {/* Per capability, at three evidence floors — because "how many
                languages does this support" has three different answers and
                only one of them is honest to quote. */}
            <div className="mb-5">
              <div className="text-xs text-fg-muted uppercase tracking-wider mb-2">
                By capability — of {langs.languageCount} languages
              </div>
              <div className="grid grid-cols-[1fr_repeat(4,4.5rem)] gap-x-3 text-xs">
                <span />
                <span className="text-accent text-right">measured</span>
                <span className="text-info text-right">benchmarked</span>
                <span className="text-fg-subtle text-right">any claim</span>
                <span className="text-danger text-right">failed</span>
                {Object.entries(langs.capabilitySummary).map(([cap, n]) => (
                  // The key belongs on the FRAGMENT: the row is five grid
                  // cells, and keying only the first leaves the other four
                  // unkeyed siblings for React to re-order by position.
                  <Fragment key={cap}>
                    <span className="text-fg-subtle py-1">
                      {CAPABILITY_LABEL[cap] ?? cap}
                    </span>
                    <span className="text-accent text-right py-1 font-mono">
                      {n.verified}
                    </span>
                    <span className="text-info text-right py-1 font-mono">
                      {n.tested}
                    </span>
                    <span className="text-fg-subtle text-right py-1 font-mono">
                      {n.any}
                    </span>
                    <span className="text-danger text-right py-1 font-mono">
                      {n.unsupported || "—"}
                    </span>
                  </Fragment>
                ))}
              </div>
              <p className="text-xs text-fg-muted mt-3 leading-relaxed">
                These are three different questions.{" "}
                <span className="text-accent">Measured</span> means a real
                turn on a real device is recorded for it.{" "}
                <span className="text-info">Benchmarked</span> means a sweep
                scored it as passing — for Latin-script targets that check can
                only tell that the model did not hand the English back, so it
                cannot catch Spanish returned for a Portuguese request.{" "}
                <span className="text-fg-subtle">Any claim</span> includes what a
                provider merely publishes. Quote the first column.
              </p>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {langs.languages.map((l) => (
                <div
                  key={l.code}
                  className="flex items-baseline gap-3 py-1.5 border-b border-line last:border-0 text-sm"
                >
                  <span
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded border shrink-0 ${TIER_TONE[l.tier]}`}
                  >
                    {l.tier}
                  </span>
                  <span className="text-fg w-40 shrink-0 truncate">
                    {l.name}
                  </span>
                  <span className="text-fg-muted font-mono w-16 shrink-0">
                    {l.code}
                  </span>
                  <span className="text-fg-muted w-24 shrink-0 text-xs">
                    {l.script}
                    {l.rtl && <span className="text-warning/70"> rtl</span>}
                  </span>
                  <span className="text-xs text-fg-muted flex-1 truncate">
                    translation: {EVIDENCE_WORD[l.capabilities.translation]} ·
                    speech: {EVIDENCE_WORD[l.capabilities.stt]}
                  </span>
                  <span className="text-xs text-fg-muted shrink-0">
                    {l.verifiedOn || ""}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ── AUDIT LOG ───────────────────────────────────────────────────── */}
      <section className={CARD}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`${H2} mb-0`}>Audit Log</h2>
          <Button variant="secondary" size="sm" onClick={loadAudit} disabled={busy !== null} loading={busy === "audit"}>
            {audit ? "Refresh" : "Load"}
          </Button>
        </div>
        {audit === null ? (
          <p className="text-sm text-fg-muted">
            Every draft save, check, activation and rollback, with who did it
            and what changed.
          </p>
        ) : audit.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {audit.map((e) => (
              <div key={e.id} className="py-2 border-b border-line last:border-0">
                <div className="flex items-baseline gap-3">
                  <span
                    className={`text-xs font-semibold w-32 shrink-0 ${ACTION_TONE[e.action] ?? "text-fg-subtle"}`}
                  >
                    {ACTION_LABEL[e.action] ?? e.action}
                  </span>
                  <span className="text-xs text-fg-muted w-12 shrink-0">
                    {e.version !== null ? `v${e.version}` : "—"}
                  </span>
                  <span className="text-xs text-fg-muted flex-1 truncate">
                    {e.reason || "—"}
                  </span>
                  <span className="text-xs text-fg-muted shrink-0">{e.adminEmail}</span>
                  <span className="text-xs text-fg-muted shrink-0 w-40 text-right">
                    {formatTs(e.at)}
                  </span>
                </div>
                {e.changes.length > 0 && (
                  <div className="mt-1 pl-32 space-y-0.5">
                    {e.changes.map((c, i) => (
                      <p key={i} className="text-xs text-fg-muted font-mono">
                        <span className="text-fg-subtle">{c.field}</span>{" "}
                        {c.from} → <span className="text-fg-subtle">{c.to}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
