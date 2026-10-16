"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { callAdmin } from "@/lib/api";
import { db } from "@/lib/firebase";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import type { ProviderCategory, ProviderType } from "@/types";
import {
  Badge, Button, ConfirmAction, DataTable, Drawer, ErrorState, Field, Notice, PageHeader, Panel, Select, StatusPill, Switch,
  Tabs, TextInput, relativeTime, useToast, type Column,
} from "@/ui";
import {
  CATEGORY_META, EMPTY_PROVIDER_FORM, PLATFORMS, providerFormError, secretEnvName, suggestSttId, upsertPayload, usesMetaReasoning,
  type ProviderForm,
} from "./providerPresets";

interface Row {
  reasoningEffort?: string;
  id: string;
  name: string;
  hasKey: boolean;
  baseUrl: string;
  model: string;
  type: ProviderType;
  category: ProviderCategory;
  platform: string;
  order: number;
  isActive: boolean;
}

interface SecretStatus {
  id: "openrouter" | "huggingface";
  label: string;
  configured: boolean;
  source: string;
  rotatedAt: number | null;
  rotatedByEmail: string | null;
  hint: string | null;
}

interface Discover {
  providers: number;
  discovered: number;
  perProvider: { providerId: string; ok: boolean; models?: number; delisted?: number; error?: string }[];
}

function toRow(id: string, d: Record<string, unknown>): Row {
  const t = d.type as string | undefined;
  return {
    id,
    name: (d.name as string) ?? id,
    hasKey: d.hasKey === true,
    reasoningEffort: typeof d.reasoningEffort === 'string' ? d.reasoningEffort : 'auto',
    baseUrl: (d.baseUrl as string) ?? "",
    model: (d.model as string) ?? "",
    // Legacy rows wrote type 'google'; the callable only accepts the closed set.
    type: t === "gemini" || t === "google" ? "gemini" : t === "anthropic" ? "anthropic" : "openAiCompatible",
    // Legacy rows predate categories: 'websearch' is self-describing, the rest were chat.
    category: (d.category as ProviderCategory | undefined) ?? (id === "websearch" ? "websearch" : "chat"),
    platform: (d.platform as string) ?? "",
    order: typeof d.order === "number" ? d.order : 0,
    isActive: d.isActive === true,
  };
}

export default function ProvidersPage({ embedded = false, createRequested = false, onCreateHandled }: { embedded?: boolean; createRequested?: boolean; onCreateHandled?: () => void } = {}) {
  const can = useCan();
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<ProviderCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ id: string | null; form: ProviderForm } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggle, setToggle] = useState<Row | null>(null);
  const [remove, setRemove] = useState<Row | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [discover, setDiscover] = useState<Discover | null>(null);
  useEffect(() => {
    if (createRequested && can("ai.providers.configure")) {
      setFormError(null);
      setEditing({ id: null, form: EMPTY_PROVIDER_FORM });
      onCreateHandled?.();
    }
  }, [createRequested, can, onCreateHandled]);

  async function load() {
    setLoadError(null);
    try {
      const snap = await getDocs(collection(db, "providers"));
      setRows(snap.docs.map((d) => toRow(d.id, d.data())));
    } catch {
      setLoadError("Could not load providers. Check your connection and permissions.");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const ids = useMemo(() => new Set((rows ?? []).map((r) => r.id)), [rows]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => tab === "all" || r.category === tab)
      .filter((r) => !q || [r.name, r.id, r.model, r.platform].some((x) => x.toLowerCase().includes(q)))
      .sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order || a.name.localeCompare(b.name));
  }, [rows, tab, search]);
  const count = (c: ProviderCategory) => (rows ?? []).filter((r) => r.category === c).length;

  function applyPreset(platformId: string, category?: ProviderCategory) {
    if (!editing) return;
    const preset = PLATFORMS.find((p) => p.id === platformId) ?? PLATFORMS.find((p) => p.id === "groq")!;
    const cat = category && preset.categories.includes(category) ? category : preset.categories[0];
    const models = cat === "stt" ? preset.sttModels ?? [] : cat === "tts" ? preset.ttsModels ?? [] : preset.models;
    const taken = new Set((rows ?? []).filter((r) => r.category === cat).map((r) => r.id));
    setEditing({
      ...editing,
      form: {
        ...editing.form,
        platform: preset.id,
        category: cat,
        name: editing.form.name || (cat === "chat" ? preset.label : `${preset.label} ${CATEGORY_META[cat].label}`),
        providerId: cat === "websearch" ? "websearch" : cat === "stt" || cat === "tts" ? suggestSttId(preset.id, taken) : "",
        baseUrl: preset.baseUrl,
        model: models[0] ?? "",
        type: preset.dialect,
        reasoningEffort: 'auto',
      },
    });
  }

  async function save() {
    if (!editing) return;
    const { id, form } = editing;
    const err = providerFormError(form, id, ids);
    if (err) {
      setFormError(err);
      return;
    }
    setSaving(true);
    setFormError(null);
    let providerId: string | null = id;
    try {
      const res = await callAdmin<{ providerId: string }>("adminUpsertProvider", upsertPayload(form, id ?? (form.providerId.trim() || undefined)));
      providerId = res.providerId;
    } catch (e) {
      setFormError((e as Error).message);
      setSaving(false);
      return;
    }
    // Metadata saved. The key is a separate call: if it fails, say exactly
    // that (the row now exists without a key) instead of a generic error.
    if (form.apiKey.trim()) {
      try {
        const k = await callAdmin<{ shadowedBySecretManager?: boolean }>("adminSaveProviderKey", { providerId, apiKey: form.apiKey.trim() });
        setNotice(
          k.shadowedBySecretManager
            ? `Saved, but ${providerId}'s key is served from Secret Manager, so the value you entered is NOT the one in use. Rotate it with firebase functions:secrets:set ${secretEnvName(providerId!)} and redeploy.`
            : null,
        );
      } catch (e) {
        toast.error("Provider saved, key NOT saved", `${(e as Error).message}. Edit ${providerId} to add the key.`);
        setEditing({ id: providerId, form: { ...form, apiKey: "" } });
        setSaving(false);
        void load();
        return;
      }
    }
    toast.success(id ? "Provider updated" : "Provider created", providerId ?? undefined);
    setEditing(null);
    setSaving(false);
    void load();
  }

  async function runDiscover() {
    setDiscovering(true);
    try {
      setDiscover(await callAdmin<Discover>("syncProviderModels", {}));
    } catch (e) {
      toast.error("Model discovery failed", (e as Error).message);
    } finally {
      setDiscovering(false);
    }
  }

  const canConfigure = can("ai.providers.configure");
  const cols: Column<Row>[] = [
    { id: "n", header: "Provider", cell: (r) => <div><p className="text-sm font-medium">{r.name}</p><p className="font-mono text-xs text-fg-muted">{r.id}</p></div> },
    { id: "c", header: "Used for", cell: (r) => <Badge>{CATEGORY_META[r.category].label}</Badge> },
    { id: "m", header: "Model", hideOnNarrow: true, cell: (r) => (r.category === "websearch" ? "—" : <span className="font-mono text-xs">{r.model || "—"}</span>) },
    { id: "o", header: "STT order", align: "right", hideOnNarrow: true, cell: (r) => (r.category === "stt" ? r.order : "") },
    { id: "k", header: "Key", cell: (r) => (r.hasKey ? <Badge tone="success">Stored</Badge> : <Badge tone="danger">Missing</Badge>) },
    { id: "a", header: "State", cell: (r) => <StatusPill status={r.isActive ? "ok" : "off"} label={r.isActive ? "Active" : "Inactive"} /> },
    {
      id: "x", header: "", align: "right",
      cell: (r) =>
        canConfigure ? (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="ghost" onClick={() => setToggle(r)}>{r.isActive ? "Deactivate" : "Activate"}</Button>
            <Button size="sm" variant="danger-ghost" onClick={() => setRemove(r)}>Delete</Button>
          </div>
        ) : null,
    },
  ];

  const f = editing?.form;
  const preset = f ? PLATFORMS.find((p) => p.id === f.platform) : undefined;
  const presetModels = f ? (f.category === "stt" ? preset?.sttModels : f.category === "tts" ? preset?.ttsModels : preset?.models) ?? [] : [];
  const setForm = (patch: Partial<ProviderForm>) => editing && setEditing({ ...editing, form: { ...editing.form, ...patch } });

  return (
    <>
      <PageHeader
        title={embedded ? "Configured Providers" : "Providers & Keys"}
        description="Every AI provider and API key the platform uses. Keys are write-only: the console shows whether one is stored and where it is served from, never the value."
        actions={
          canConfigure ? (
            <>
              <Button variant="secondary" icon="refresh" loading={discovering} onClick={() => void runDiscover()}>Discover models</Button>
              {!embedded ? <Button variant="primary" icon="plus" onClick={() => { setFormError(null); setEditing({ id: null, form: EMPTY_PROVIDER_FORM }); }}>Add provider</Button> : null}
            </>
          ) : null
        }
      />
      <div className="space-y-4">
        <PlatformKeys />
        {notice ? <Notice tone="warning" action={<Button size="sm" variant="ghost" onClick={() => setNotice(null)}>Dismiss</Button>}>{notice}</Notice> : null}
        {discover ? (
          <Notice tone={discover.perProvider.some((p) => !p.ok) ? "warning" : "success"} title={`Discovered ${discover.discovered} models across ${discover.providers} providers`}
            action={<Button size="sm" variant="ghost" onClick={() => setDiscover(null)}>Dismiss</Button>}>
            <ul className="mt-1 space-y-0.5 font-mono text-xs">
              {discover.perProvider.map((p) => (
                <li key={p.providerId}>{p.ok ? "✓" : "✕"} {p.providerId} — {p.ok ? `${p.models} models${p.delisted ? `, ${p.delisted} delisted` : ""}` : p.error}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        <Panel title="Direct providers" description="Used when OpenRouter is off or fails, and for voice (STT/TTS) and web search." flush>
          <div className="flex flex-wrap items-end justify-between gap-3 p-3">
            <Tabs
              label="Category"
              value={tab}
              onChange={(v) => setTab(v as ProviderCategory | "all")}
              tabs={[
                { id: "all", label: "All", count: rows?.length ?? 0 },
                { id: "chat", label: "Chat", count: count("chat") },
                { id: "stt", label: "Speech-to-text", count: count("stt") },
                { id: "tts", label: "Text-to-speech", count: count("tts") },
                { id: "websearch", label: "Web search", count: count("websearch") },
              ]}
            />
            <Field label="Search" className="w-full sm:w-64">
              {(p) => <TextInput {...p} value={search} placeholder="Name, id, model, platform" onChange={(e) => setSearch(e.target.value)} />}
            </Field>
          </div>
          {loadError ? <ErrorState compact message={loadError} onRetry={() => void load()} /> : (
            <DataTable
              label="Providers"
              columns={cols}
              rows={visible}
              rowKey={(r) => r.id}
              loading={rows === null}
              onRowClick={canConfigure ? (r) => { setFormError(null); setEditing({ id: r.id, form: { ...r, providerId: r.id, apiKey: "", platform: r.platform || "custom" } }); } : undefined}
              rowTone={(r) => (r.isActive && !r.hasKey ? "warning" : null)}
              empty={{ title: rows?.length ? "Nothing matches" : "No providers yet", body: rows?.length ? undefined : "Add one to enable direct-provider fallback, voice and search." }}
            />
          )}
        </Panel>
      </div>

      <Drawer
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? `Edit ${editing.id}` : "New provider"}
        width={560}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>{editing?.id ? "Save changes" : "Create provider"}</Button>
          </>
        }
      >
        {f ? (
          <div className="grid gap-4">
            {!editing!.id ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Platform" hint={preset?.keyUrl ? `Get a key at ${preset.keyUrl}` : undefined}>
                  {(p) => (
                    <Select {...p} value={f.platform} onChange={(e) => applyPreset(e.target.value, f.category)}>
                      {PLATFORMS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label="Used for" hint={CATEGORY_META[f.category].hint}>
                  {(p) => (
                    <Select {...p} value={f.category} onChange={(e) => applyPreset(f.platform, e.target.value as ProviderCategory)}>
                      {(preset?.categories ?? ["chat"]).map((c) => <option key={c} value={c}>{CATEGORY_META[c].label}</option>)}
                    </Select>
                  )}
                </Field>
              </div>
            ) : null}
            <Field label="Display name" required>
              {(p) => <TextInput {...p} value={f.name} onChange={(e) => setForm({ name: e.target.value })} />}
            </Field>
            {f.category === "stt" || f.category === "tts" ? (
              <Field label="Provider id" hint="Stable: the voice chains reference it.">
                {(p) => <TextInput {...p} className="font-mono" disabled={!!editing!.id} value={f.providerId} onChange={(e) => setForm({ providerId: e.target.value })} />}
              </Field>
            ) : null}
            <Field label="API key" hint={editing!.id ? "Leave blank to keep the stored key. It is never shown again." : "Stored server-side only; never readable from the console or the app."}>
              {(p) => <TextInput {...p} type="password" autoComplete="off" className="font-mono" value={f.apiKey} placeholder={editing!.id ? "Enter a new key to replace it" : preset?.keyPrefix} onChange={(e) => setForm({ apiKey: e.target.value })} />}
            </Field>
            {f.category !== "websearch" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Base URL">
                  {(p) => <TextInput {...p} className="font-mono text-xs" value={f.baseUrl} onChange={(e) => setForm({ baseUrl: e.target.value })} />}
                </Field>
                <Field label="Model">
                  {(p) => (
                    <>
                      <TextInput {...p} className="font-mono text-xs" list="provider-models" value={f.model} onChange={(e) => setForm({ model: e.target.value })} />
                      <datalist id="provider-models">{presetModels.map((m) => <option key={m} value={m} />)}</datalist>
                    </>
                  )}
                </Field>
              </div>
            ) : null}
            {usesMetaReasoning(f) ? (
              <Field label="Reasoning effort" hint="Automatic uses minimal reasoning for responsive chat and live notes. Higher effort takes longer and uses more output tokens.">
                {(p) => <Select {...p} value={f.reasoningEffort || 'auto'} onChange={(e) => setForm({reasoningEffort: e.target.value})}>
                  <option value="auto">Automatic (minimal)</option>
                  {['minimal', 'low', 'medium', 'high', 'xhigh'].map(effort => <option key={effort} value={effort}>{effort}</option>)}
                </Select>}
              </Field>
            ) : null}
            {f.category === "stt" ? (
              <Field label="Fallback order" hint={f.baseUrl === 'https://api.meta.ai/v1' ? 'Lower is tried first for recordings. For live streaming, select this provider ID in Voice → Meta.' : 'Lower is tried first.'}>
                {(p) => <TextInput {...p} inputMode="numeric" value={String(f.order)} onChange={(e) => setForm({ order: Number(e.target.value) || 0 })} />}
              </Field>
            ) : null}
            <label className="flex items-center justify-between rounded-md border border-line p-3">
              <span className="text-sm">{f.category === "chat" ? "Active (offered to the app)" : "Active (used by the backend)"}</span>
              <Switch label="Active" checked={f.isActive} onChange={(v) => setForm({ isActive: v })} />
            </label>
            {formError ? <Notice tone="danger">{formError}</Notice> : null}
          </div>
        ) : null}
      </Drawer>

      <ConfirmAction
        open={!!toggle}
        onClose={() => setToggle(null)}
        title={toggle ? `${toggle.isActive ? "Deactivate" : "Activate"} ${toggle.name}` : ""}
        level={toggle?.isActive ? "reason" : "confirm"}
        danger={toggle?.isActive}
        confirmLabel={toggle?.isActive ? "Deactivate" : "Activate"}
        impact={toggle ? (toggle.isActive
          ? <>{toggle.category === "stt" ? "It leaves the speech-to-text fallback chain." : toggle.category === "chat" ? "The app stops offering it and direct-provider rescue skips it." : "The backend stops using it."}</>
          : <>{toggle.hasKey ? "It becomes available immediately." : "It has no stored key, so calls to it will fail until you add one."}</>) : null}
        onConfirm={async (reason) => {
          if (!toggle) return;
          await callAdmin("adminUpsertProvider", upsertPayload({ ...toggle, isActive: !toggle.isActive }, toggle.id, reason || undefined));
          toast.success(toggle.isActive ? "Deactivated" : "Activated", toggle.id);
          void load();
        }}
      />
      <ConfirmAction
        open={!!remove}
        onClose={() => setRemove(null)}
        title={remove ? `Delete ${remove.name}` : ""}
        level="typed"
        phrase={remove?.id}
        danger
        confirmLabel="Delete provider and key"
        impact={<>The stored API key is deleted first, then the provider. {remove?.category === "stt" ? "The speech-to-text chain is rebuilt without it." : ""} This cannot be undone.</>}
        onConfirm={async (reason) => {
          if (!remove) return;
          await callAdmin("adminDeleteProvider", { providerId: remove.id, reason });
          toast.success("Provider deleted", remove.id);
          void load();
        }}
      />
    </>
  );
}

/// OpenRouter + HuggingFace keys and the OpenRouter gateway kill switch
/// (adminAiGateway: status, write-only rotation, audited switch).
export function PlatformKeys() {
  const can = useCan();
  const toast = useToast();
  const q = useCallable<{ secrets: SecretStatus[]; gatewayEnabled: boolean }>("adminAiGateway", { action: "status" });
  const [rotating, setRotating] = useState<SecretStatus | null>(null);
  const [value, setValue] = useState("");
  const [gateway, setGateway] = useState<boolean | null>(null);

  return (
    <Panel title="Platform keys & gateway" description="OpenRouter serves almost all cloud chat; HuggingFace authorises on-device model downloads.">
      {q.error && !q.data ? <ErrorState compact message={q.error.message} onRetry={q.reload} /> : !q.data ? <p className="text-sm text-fg-muted">Checking…</p> : (
        <div className="grid gap-3 md:grid-cols-3">
          {q.data.secrets.map((s) => (
            <div key={s.id} className="rounded-md border border-line p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{s.label} key</p>
                <StatusPill status={s.configured ? "ok" : "down"} label={s.configured ? "Configured" : "Missing"} />
              </div>
              <p className="mt-1 text-xs text-fg-muted">
                {s.configured ? `Served from ${s.source === "env" ? "Secret Manager" : "Firestore"}${s.hint ? ` · …${s.hint}` : ""}` : "Not set"}
                {s.rotatedAt ? ` · rotated ${relativeTime(s.rotatedAt)} by ${s.rotatedByEmail}` : ""}
              </p>
              {can("ai.secrets.rotate") ? (
                <Button className="mt-2" size="sm" variant="secondary" icon="key" onClick={() => { setValue(""); setRotating(s); }}>Rotate</Button>
              ) : null}
            </div>
          ))}
          <div className="rounded-md border border-line p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">OpenRouter gateway</p>
              <StatusPill status={q.data.gatewayEnabled ? "ok" : "off"} label={q.data.gatewayEnabled ? "On" : "Off"} />
            </div>
            <p className="mt-1 text-xs text-fg-muted">Off sends all cloud chat to direct providers only.</p>
            {can("flags.killswitch") ? (
              <Button className="mt-2" size="sm" variant={q.data.gatewayEnabled ? "danger" : "primary"} onClick={() => setGateway(!q.data!.gatewayEnabled)}>
                {q.data.gatewayEnabled ? "Turn off" : "Turn on"}
              </Button>
            ) : null}
          </div>
        </div>
      )}
      <ConfirmAction
        open={!!rotating}
        onClose={() => setRotating(null)}
        title={rotating ? `Rotate the ${rotating.label} key` : ""}
        level="reason"
        confirmLabel="Rotate key"
        impact={
          <div className="space-y-3">
            <p>The new key is used within about 5 minutes. Revoke the old key at the provider if it was exposed.</p>
            {rotating?.source === "env" ? <p className="text-warning">This key is currently served from Secret Manager, which takes precedence: the value saved here will not be used.</p> : null}
            <Field label="New key">
              {(p) => <TextInput {...p} type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />}
            </Field>
          </div>
        }
        onConfirm={async (reason) => {
          if (!rotating) return;
          if (value.trim().length < 8) throw new Error("That does not look like an API key.");
          await callAdmin("adminAiGateway", { action: "rotateKey", secret: rotating.id, value, reason });
          setValue("");
          toast.success("Key rotated", rotating.label);
          q.reload();
        }}
      />
      <ConfirmAction
        open={gateway !== null}
        onClose={() => setGateway(null)}
        title={gateway ? "Turn the OpenRouter gateway on" : "Turn the OpenRouter gateway OFF"}
        level={gateway ? "confirm" : "typed"}
        phrase="GATEWAY OFF"
        danger={!gateway}
        confirmLabel={gateway ? "Turn on" : "Turn off"}
        impact={gateway ? <>Cloud chat returns to OpenRouter models.</> : <>Every cloud chat request moves to direct providers only. Users on models only OpenRouter serves get a fallback model.</>}
        onConfirm={async (reason) => {
          await callAdmin("adminAiGateway", { action: "setGateway", enabled: gateway, reason });
          toast.success(gateway ? "Gateway on" : "Gateway off");
          q.reload();
        }}
      />
    </Panel>
  );
}
