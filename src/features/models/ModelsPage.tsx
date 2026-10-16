"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { callAdmin } from "@/lib/api";
import { db } from "@/lib/firebase";
import { useCan } from "@/lib/session";
import { BUILT_IN_LLM, RAM_TIERS, catalogDrift, type BuiltInLlm, type FileType, type ModelType } from "./catalog";
import {
  Badge, Button, ConfirmAction, Drawer, EmptyState, ErrorState, Field,
  Notice, PageHeader, Panel, Select, Skeleton, Stat, StatStrip, Switch,
  Tabs, TextInput, Textarea, useToast, type TabDef,
} from "@/ui";

interface BuiltInVoice {
  id: string;
  name: string;
  description: string;
  type: string;
  totalSizeMb: number;
}

interface CustomLlm {
  id: string;
  name: string;
  provider: string;
  description: string;
  downloadUrl: string;
  fileSizeBytes: number;
  ramRequiredMb: number;
  modelType: ModelType;
  fileType: FileType;
  capabilities: string[];
  version?: number;
}

interface StoredConfig {
  llmEnabledIds: string[] | null;
  llmCustom: CustomLlm[];
  voiceEnabledIds: string[] | null;
  recommendations: Record<string, string>;
}

const BUILT_IN_VOICE: BuiltInVoice[] = [
  { id: "silero-vad", name: "Silero VAD", description: "Voice activity detection", type: "VAD", totalSizeMb: 1.8 },
  { id: "whisper-tiny-stt", name: "Whisper Tiny STT", description: "Offline speech recognition (Hindi + English)", type: "STT", totalSizeMb: 39 },
  { id: "mms-hindi-tts", name: "Piper Hindi TTS", description: "Natural Hindi voice — offline TTS (Meta MMS)", type: "TTS", totalSizeMb: 30 },
  { id: "piper-english-tts", name: "Piper English TTS", description: "Natural English voice — Amy, offline TTS", type: "TTS", totalSizeMb: 28 },
];

const DEFAULT_RECOMMENDATIONS: Record<string, string> = Object.fromEntries(
  RAM_TIERS.map((t) => [t.key, t.default]),
);

const EMPTY_FORM = {
  name: "", provider: "", description: "", downloadUrl: "",
  fileSizeMb: "", ramRequiredMb: "",
  modelType: "gemmaIt" as ModelType, fileType: "litertlm" as FileType,
  capabilities: "", version: "1",
};

type ProviderTone = "success" | "info" | "accent" | "warning" | "neutral";
const PROVIDER_TONE: Record<string, ProviderTone> = {
  Google: "success", Microsoft: "info", Meta: "accent", Alibaba: "warning", DeepSeek: "neutral", HuggingFace: "warning",
};
const VOICE_TONE: Record<string, ProviderTone> = { VAD: "neutral", STT: "info", TTS: "success" };

function fmtSize(bytes: number) { return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`; }
function fmtRam(mb: number) { return mb >= 1024 ? `${Math.round(mb / 1024)} GB` : `${mb} MB`; }

const TABS: TabDef[] = [
  { id: "llm", label: "LLM Models" },
  { id: "voice", label: "Voice Models" },
  { id: "recs", label: "RAM Recommendations" },
];

export default function ModelsPage() {
  const can = useCan();
  const canEdit = can("ai.models.configure");
  const toast = useToast();

  const [tab, setTab] = useState("llm");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabledLlm, setEnabledLlm] = useState<Set<string>>(new Set(BUILT_IN_LLM.map((m) => m.id)));
  const [customLlm, setCustomLlm] = useState<CustomLlm[]>([]);
  const [enabledVoice, setEnabledVoice] = useState<Set<string>>(new Set(BUILT_IN_VOICE.map((m) => m.id)));
  const [recommendations, setRecommendations] = useState<Record<string, string>>(DEFAULT_RECOMMENDATIONS);

  const [editing, setEditing] = useState<typeof EMPTY_FORM | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CustomLlm | null>(null);

  const [stored, setStored] = useState<{ enabledIds: string[] | null; recommendations: Record<string, string> | null } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const loadConfig = useCallback(async () => {
    setLoadError(null);
    try {
      const snap = await getDoc(doc(db, "app_config", "models"));
      const raw = snap.exists() ? (snap.data() as Partial<StoredConfig>) : null;
      const at = (snap.data() as { updatedAt?: { toMillis?: () => number } } | undefined)?.updatedAt;
      setLoadedAt(at?.toMillis ? at.toMillis() : null);
      setStored({ enabledIds: Array.isArray(raw?.llmEnabledIds) ? raw!.llmEnabledIds! : null, recommendations: raw?.recommendations && typeof raw.recommendations === "object" ? raw.recommendations : null });
      if (snap.exists()) {
        const data = snap.data() as StoredConfig;
        if (Array.isArray(data.llmEnabledIds)) setEnabledLlm(new Set(data.llmEnabledIds));
        if (Array.isArray(data.llmCustom)) setCustomLlm(data.llmCustom);
        if (Array.isArray(data.voiceEnabledIds)) setEnabledVoice(new Set(data.voiceEnabledIds));
        if (data.recommendations && typeof data.recommendations === "object") setRecommendations({ ...DEFAULT_RECOMMENDATIONS, ...data.recommendations });
      }
    } catch { setLoadError("Could not load app_config/models. Editing is disabled."); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadConfig(); }, [loadConfig]);

  async function persist(patch: Partial<StoredConfig>, opts: { dropStale?: boolean } = {}) {
    if (loadError) { toast.error("Not saved — config could not be loaded."); return; }
    setSaving(true);
    try {
      const merged: StoredConfig = { llmEnabledIds: [...enabledLlm], llmCustom: customLlm, voiceEnabledIds: [...enabledVoice], recommendations, ...patch };
      const known = new Set([...BUILT_IN_LLM.map((m) => m.id), ...merged.llmCustom.map((c) => c.id)]);
      // Owner decision D5: never silently strip ids. Unknown (stale) ids block the
      // save until the operator removes them explicitly from the drift notice.
      const unknown = merged.llmEnabledIds ? merged.llmEnabledIds.filter((id) => !known.has(id)) : [];
      if (unknown.length > 0 && !opts.dropStale) {
        toast.error(`Not saved — unknown model ids in the stored list: ${unknown.join(", ")}. Use "Remove stale ids" in the drift notice first.`);
        return;
      }
      const full: StoredConfig = { ...merged, llmEnabledIds: merged.llmEnabledIds ? merged.llmEnabledIds.filter((id) => known.has(id)) : null };
      const res = await callAdmin<{ updatedAt: number }>("adminCatalogs", { action: "saveModels", doc: full, expectedUpdatedAt: loadedAt });
      setLoadedAt(res.updatedAt);
      setStored({ enabledIds: full.llmEnabledIds, recommendations: full.recommendations });
      toast.success("Saved.");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      toast.error(`${m}${/changed since you loaded/.test(m) ? " Reload the page." : ""}`);
    } finally { setSaving(false); }
  }

  async function toggleLlm(id: string) { const next = new Set(enabledLlm); if (next.has(id)) next.delete(id); else next.add(id); setEnabledLlm(next); await persist({ llmEnabledIds: [...next] }); }
  async function toggleVoice(id: string) { const next = new Set(enabledVoice); if (next.has(id)) next.delete(id); else next.add(id); setEnabledVoice(next); await persist({ voiceEnabledIds: [...next] }); }

  function startEditBuiltIn(m: BuiltInLlm) {
    const ov = customLlm.find((c) => c.id === m.id);
    const src = ov ?? m;
    setEditing({ name: src.name, provider: src.provider, description: src.description, downloadUrl: ov?.downloadUrl ?? "", fileSizeMb: String(Math.round(src.fileSizeBytes / 1e6)), ramRequiredMb: String(src.ramRequiredMb), modelType: src.modelType, fileType: src.fileType, capabilities: src.capabilities.join(", "), version: String(ov?.version ?? 1) });
    setEditId(m.id);
  }

  function startAddCustom() { setEditing({ ...EMPTY_FORM }); setEditId(null); }

  async function saveForm() {
    if (!editing) return;
    if (!editing.name.trim() || !editing.downloadUrl.trim() || !editing.ramRequiredMb || !editing.fileSizeMb) { toast.error("Name, URL, RAM, and file size are required."); return; }
    if (!editing.downloadUrl.startsWith("https://")) { toast.error("URL must start with https://"); return; }
    const slug = editing.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const newModel: CustomLlm = {
      id: editId ?? `custom-${slug}-${Date.now()}`,
      name: editing.name.trim(), provider: editing.provider.trim() || "Custom", description: editing.description.trim(),
      downloadUrl: editing.downloadUrl.trim(), fileSizeBytes: Math.round(parseFloat(editing.fileSizeMb) * 1e6),
      ramRequiredMb: parseInt(editing.ramRequiredMb, 10), modelType: editing.modelType, fileType: editing.fileType,
      capabilities: editing.capabilities.split(",").map((c) => c.trim()).filter(Boolean),
      version: Math.max(1, parseInt(editing.version, 10) || 1),
    };
    const next = editId ? [...customLlm.filter((c) => c.id !== editId), newModel] : [...customLlm, newModel];
    setCustomLlm(next);
    setEditing(null);
    setEditId(null);
    await persist({ llmCustom: next });
  }

  async function confirmDelete(_reason: string) {
    if (!deleting) return;
    const next = customLlm.filter((m) => m.id !== deleting.id);
    setCustomLlm(next);
    await persist({ llmCustom: next });
    toast.success(`Deleted ${deleting.name}.`);
  }

  async function updateRec(tier: string, modelId: string) { const next = { ...recommendations, [tier]: modelId }; setRecommendations(next); await persist({ recommendations: next }); }

  const allSelectable = [...BUILT_IN_LLM.filter((m) => enabledLlm.has(m.id)), ...customLlm];
  const enabledCount = BUILT_IN_LLM.filter((m) => enabledLlm.has(m.id)).length;
  const drift = stored ? catalogDrift(stored.enabledIds, customLlm.map((c) => c.id), stored.recommendations) : null;

  if (loadError) return <ErrorState message={loadError} onRetry={loadConfig} />;
  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <>
      <PageHeader
        title="Offline Models"
        description="Manage downloadable AI models — changes sync to app within ~30 seconds."
        actions={saving ? <Badge tone="accent">Saving...</Badge> : undefined}
      />

      {drift && (drift.hiddenBuiltIns.length > 0 || drift.staleEnabledIds.length > 0 || drift.staleRecommendations.length > 0) && (
        <div className="mb-4">
          <Notice tone="warning" title="Catalog drift detected">
            {drift.hiddenBuiltIns.length > 0 && <p>Hidden from users: <code>{drift.hiddenBuiltIns.join(", ")}</code></p>}
            {drift.staleEnabledIds.length > 0 && <p>Stale ids (block saving until removed): <code>{drift.staleEnabledIds.join(", ")}</code></p>}
            {drift.staleEnabledIds.length > 0 && (
              <Button size="sm" variant="secondary" loading={saving} onClick={() => void persist({ llmEnabledIds: (stored?.enabledIds ?? []) }, { dropStale: true })}>
                Remove stale ids
              </Button>
            )}
            {drift.staleRecommendations.length > 0 && <p>Stale recommendations: <code>{drift.staleRecommendations.join(", ")}</code></p>}
          </Notice>
        </div>
      )}

      <StatStrip className="mb-5">
        <Stat label="LLM Models" value={`${enabledCount}/${BUILT_IN_LLM.length}`} hint="enabled" />
        <Stat label="Custom LLMs" value={customLlm.length} hint="added" />
        <Stat label="Voice Models" value={`${enabledVoice.size}/${BUILT_IN_VOICE.length}`} hint="enabled" />
        <Stat label="Config" value="app_config/models" hint="Firestore doc" />
      </StatStrip>

      <div className="mb-5">
        <Tabs tabs={TABS} value={tab} onChange={setTab} label="Model categories" />
      </div>

      {/* ── LLM Tab ──────────────────────────────────────────── */}
      {tab === "llm" && (
        <>
          <Panel title={`Built-in Models — ${enabledCount}/${BUILT_IN_LLM.length} enabled`} className="mb-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {BUILT_IN_LLM.map((m) => {
                const on = enabledLlm.has(m.id);
                const ov = customLlm.find((c) => c.id === m.id);
                return (
                  <div key={m.id} className={`rounded-lg border border-line p-3 transition-opacity ${on ? "" : "opacity-50"}`}>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-fg">{m.name}</span>
                      <Badge tone={PROVIDER_TONE[m.provider] ?? "neutral"}>{m.provider}</Badge>
                      <Badge tone="neutral">{m.fileType}</Badge>
                      {ov && <Badge tone="warning">Override{ov.version ? ` v${ov.version}` : ""}</Badge>}
                    </div>
                    <p className="text-xs text-fg-muted mb-2">{m.description}</p>
                    <div className="flex items-center gap-4 text-xs text-fg-subtle mb-2">
                      <span>RAM: {fmtRam(m.ramRequiredMb)}+</span>
                      <span>Size: {fmtSize(m.fileSizeBytes)}</span>
                    </div>
                    <div className="flex gap-1 flex-wrap mb-3">
                      {m.capabilities.map((c) => <Badge key={c} tone="neutral">{c}</Badge>)}
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button size="sm" variant={on ? "danger-ghost" : "primary"} onClick={() => toggleLlm(m.id)}>{on ? "Disable" : "Enable"}</Button>
                        <Button size="sm" variant="ghost" icon="edit" onClick={() => startEditBuiltIn(m)}>Edit</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel
            title={`Custom Models — ${customLlm.length} added`}
            actions={canEdit ? <Button size="sm" variant="primary" icon="plus" onClick={startAddCustom}>Add Custom Model</Button> : undefined}
          >
            {customLlm.length === 0 ? (
              <EmptyState icon="download" title="No custom models">Add models not in the built-in catalog.</EmptyState>
            ) : (
              <div className="space-y-3">
                {customLlm.map((m) => (
                  <div key={m.id} className="flex items-start gap-3 rounded-lg border border-line p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-semibold text-fg">{m.name}</span>
                        <Badge tone={BUILT_IN_LLM.some((b) => b.id === m.id) ? "warning" : "info"}>{BUILT_IN_LLM.some((b) => b.id === m.id) ? "Override" : "Custom"}</Badge>
                        <Badge tone="neutral">{m.fileType}</Badge>
                        {m.version != null && <Badge tone="success">v{m.version}</Badge>}
                      </div>
                      <p className="text-xs text-fg-muted">{m.description}</p>
                      <div className="flex items-center gap-4 text-xs text-fg-subtle mt-1">
                        <span>RAM: {fmtRam(m.ramRequiredMb)}+</span>
                        <span>Size: {fmtSize(m.fileSizeBytes)}</span>
                      </div>
                      <p className="mt-1 truncate text-2xs font-mono text-fg-subtle">{m.downloadUrl}</p>
                    </div>
                    {canEdit && <Button size="sm" variant="danger-ghost" icon="trash" onClick={() => setDeleting(m)}>Delete</Button>}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </>
      )}

      {/* ── Voice Tab ─────────────────────────────────────────── */}
      {tab === "voice" && (
        <>
          <div className="mb-4">
            <Notice tone="info">
              Voice packages are now managed on the <Link href="/dashboard/voice" className="underline font-semibold">Voice page</Link>.
              The legacy toggles below write voiceEnabledIds, which the app no longer reads.
            </Notice>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {BUILT_IN_VOICE.map((m) => {
              const on = enabledVoice.has(m.id);
              return (
                <Panel key={m.id} className={on ? "" : "opacity-50"}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-fg">{m.name}</span>
                        <Badge tone={VOICE_TONE[m.type] ?? "neutral"}>{m.type}</Badge>
                      </div>
                      <p className="text-xs text-fg-muted">{m.description}</p>
                      <p className="text-xs text-fg-subtle mt-1">~{m.totalSizeMb} MB</p>
                    </div>
                    {canEdit && <Button size="sm" variant={on ? "danger-ghost" : "primary"} onClick={() => toggleVoice(m.id)}>{on ? "Disable" : "Enable"}</Button>}
                  </div>
                </Panel>
              );
            })}
          </div>
        </>
      )}

      {/* ── Recommendations Tab ──────────────────────────────── */}
      {tab === "recs" && (
        <Panel title="RAM-based Recommendations" description="The app suggests the best download based on device RAM.">
          <div className="divide-y divide-line">
            {RAM_TIERS.map((tier) => {
              const selectedId = recommendations[tier.key] ?? tier.default;
              const selected = allSelectable.find((m) => m.id === selectedId);
              return (
                <div key={tier.key} className="flex items-center gap-4 py-3">
                  <span className="w-24 text-sm font-semibold text-fg">{tier.label}</span>
                  <div className="flex-1">
                    <Select value={selectedId} onChange={(e) => updateRec(tier.key, e.target.value)} disabled={!canEdit}>
                      {allSelectable.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      {allSelectable.length === 0 && <option value="">Enable models first</option>}
                    </Select>
                  </div>
                  <span className="w-24 text-right text-xs text-fg-muted">{selected ? (selected as BuiltInLlm | CustomLlm).provider : "—"}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* ── Edit / Add Drawer ────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => { setEditing(null); setEditId(null); }}
        title={editId ? "Edit Model (Override)" : "Add Custom Model"}
        subtitle={editId ? `ID: ${editId}` : "Only MediaPipe-compatible models work."}
        width={560}
        footer={
          canEdit ? (
            <>
              <Button variant="secondary" onClick={() => { setEditing(null); setEditId(null); }}>Cancel</Button>
              <Button variant="primary" onClick={saveForm}>{editId ? "Save Override" : "Add Model"}</Button>
            </>
          ) : undefined
        }
      >
        {editing && (
          <div className="space-y-4">
            {editId && (
              <Field label="Model ID (locked)">
                {(p) => <TextInput {...p} value={editId} readOnly disabled className="font-mono text-xs opacity-60" />}
              </Field>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Display Name" required>
                {(p) => <TextInput {...p} value={editing.name} placeholder="My Model 3B" onChange={(e) => setEditing({ ...editing, name: e.target.value })} />}
              </Field>
              <Field label="Provider">
                {(p) => <TextInput {...p} value={editing.provider} placeholder="Custom" onChange={(e) => setEditing({ ...editing, provider: e.target.value })} />}
              </Field>
            </div>
            <Field label="Download URL" required hint=".task or .litertlm">
              {(p) => <TextInput {...p} value={editing.downloadUrl} className="font-mono text-xs" placeholder="https://huggingface.co/..." onChange={(e) => setEditing({ ...editing, downloadUrl: e.target.value })} />}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="File Size (MB)" required>
                {(p) => <TextInput {...p} type="number" min={1} value={editing.fileSizeMb} placeholder="2300" onChange={(e) => setEditing({ ...editing, fileSizeMb: e.target.value })} />}
              </Field>
              <Field label="RAM Required (MB)" required>
                {(p) => <TextInput {...p} type="number" min={512} step={512} value={editing.ramRequiredMb} placeholder="4096" onChange={(e) => setEditing({ ...editing, ramRequiredMb: e.target.value })} />}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Model Type">
                {(p) => (
                  <Select {...p} value={editing.modelType} onChange={(e) => setEditing({ ...editing, modelType: e.target.value as ModelType })}>
                    <option value="gemmaIt">gemmaIt — Google Gemma</option>
                    <option value="llama">llama — Meta / Microsoft</option>
                    <option value="qwen">qwen — Alibaba Qwen</option>
                    <option value="deepSeek">deepSeek — DeepSeek</option>
                  </Select>
                )}
              </Field>
              <Field label="File Type">
                {(p) => (
                  <Select {...p} value={editing.fileType} onChange={(e) => setEditing({ ...editing, fileType: e.target.value as FileType })}>
                    <option value="litertlm">.litertlm</option>
                    <option value="task">.task (Google official)</option>
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Description">
              {(p) => <TextInput {...p} value={editing.description} placeholder="Short description" onChange={(e) => setEditing({ ...editing, description: e.target.value })} />}
            </Field>
            <Field label="Capabilities (comma-separated)">
              {(p) => <TextInput {...p} value={editing.capabilities} placeholder="chat, hindi, reasoning" onChange={(e) => setEditing({ ...editing, capabilities: e.target.value })} />}
            </Field>
            <Field label="Version" hint="Bump to push auto-update">
              {(p) => <TextInput {...p} type="number" min={1} step={1} value={editing.version} onChange={(e) => setEditing({ ...editing, version: e.target.value })} />}
            </Field>
          </div>
        )}
      </Drawer>

      {/* ── Delete confirm ─────────────────────────────────────── */}
      <ConfirmAction
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? ""}`}
        impact={<>Users who already downloaded it keep the file, but it will no longer appear in the app.</>}
        level="confirm"
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
      />
    </>
  );
}
