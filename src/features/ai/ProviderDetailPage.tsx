"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { callAdmin } from "@/lib/api";
import { db } from "@/lib/firebase";
import { useCan } from "@/lib/session";
import { useCallable } from "@/lib/useCallable";
import type { ProviderCategory, ProviderType } from "@/types";
import {
  Badge, Button, ConfirmAction, EmptyState, ErrorState, Field, Icon,
  Notice, PageHeader, Panel, Skeleton, Stat, StatStrip, StatusPill,
  Switch, TextInput, relativeTime, useToast,
} from "@/ui";
import { CATEGORY_META, PLATFORMS, upsertPayload } from "./providerPresets";

interface Detail {
  id: string; name: string; hasKey: boolean; baseUrl: string; model: string;
  type: ProviderType; category: ProviderCategory; platform: string;
  order: number; isActive: boolean;
}
interface HealthEntry {
  modelId: string; circuit: string; successes: number; failures: number;
  p50Ms: number | null; p95Ms: number | null;
  lastSuccessTs: number | null; lastFailureTs: number | null;
}

function toDetail(id: string, d: Record<string, unknown>): Detail {
  const t = d.type as string | undefined;
  return {
    id, name: (d.name as string) ?? id, hasKey: d.hasKey === true,
    baseUrl: (d.baseUrl as string) ?? "", model: (d.model as string) ?? "",
    type: t === "gemini" || t === "google" ? "gemini" : t === "anthropic" ? "anthropic" : "openAiCompatible",
    category: (d.category as ProviderCategory | undefined) ?? (id === "websearch" ? "websearch" : "chat"),
    platform: (d.platform as string) ?? "", order: typeof d.order === "number" ? d.order : 0,
    isActive: d.isActive === true,
  };
}

const platformName = (id: string) => PLATFORMS.find((p) => p.id === id)?.label ?? id;

export default function ProviderDetailPage() {
  const params = useSearchParams();
  const providerId = params.get("id") ?? "";
  const router = useRouter();
  const can = useCan();
  const toast = useToast();
  const canWrite = can("ai.providers.configure");

  const [prov, setProv] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [name, setName] = useState(""); const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState(""); const [active, setActive] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [newKey, setNewKey] = useState("");

  const healthQ = useCallable<{ health: HealthEntry[] }>("adminModelInventory", providerId ? {} : null);

  async function load() {
    setLoading(true); setLoadErr(null);
    try {
      const snap = await getDocs(collection(db, "providers"));
      const m = snap.docs.find((d) => d.id === providerId);
      if (m) setProv(toDetail(m.id, m.data()));
      else setLoadErr("Provider not found.");
    } catch { setLoadErr("Could not load provider."); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (providerId) void load(); else setLoading(false); }, [providerId]);
  useEffect(() => {
    if (!prov) return;
    setName(prov.name); setBaseUrl(prov.baseUrl); setModel(prov.model);
    setActive(prov.isActive); setDirty(false);
  }, [prov]);

  const set = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { fn(e.target.value); setDirty(true); };

  async function save() {
    if (!prov || !canWrite) return;
    setSaving(true);
    try {
      await callAdmin("adminUpsertProvider", upsertPayload(
        { ...prov, name, baseUrl, model, isActive: active }, prov.id,
      ));
      toast.success("Provider updated", prov.id); setDirty(false); void load();
    } catch (e) { toast.error("Save failed", (e as Error).message); }
    finally { setSaving(false); }
  }

  async function testConnection() {
    if (!prov) return;
    setTesting(true); setTestMsg(null);
    try {
      const r = await callAdmin<{ results: { id: string; status: string }[] }>("checkProviderHealth", {
        providers: [{ id: prov.id, baseUrl: baseUrl || prov.baseUrl, isActive: true }],
      });
      const status = r.results?.[0]?.status;
      if (status === "down") throw new Error("Provider endpoint is unreachable.");
      setTestMsg(status === "degraded" ? "Reachable but slow or degraded" : "ok");
      toast.success("Connection successful");
    } catch (e) { setTestMsg((e as Error).message); toast.error("Connection failed", (e as Error).message); }
    finally { setTesting(false); }
  }

  const health = healthQ.data?.health?.find((h) => h.modelId === prov?.model) ?? null;

  if (!providerId) return <EmptyState title="No provider selected" action={<Link href="/dashboard/providers" className="text-accent-text underline">Open Providers &amp; Keys</Link>} />;
  if (loadErr && !prov) return <><BLink /><ErrorState title="Could not load provider" message={loadErr} onRetry={() => void load()} /></>;

  return (
    <>
      <BLink />
      <PageHeader
        title={prov?.name ?? "Loading…"}
        meta={prov ? <>
          <StatusPill status={prov.isActive ? "ok" : "off"} label={prov.isActive ? "Active" : "Inactive"} />
          <Badge>{CATEGORY_META[prov.category].label}</Badge>
          <Badge tone={prov.hasKey ? "success" : "danger"}>{prov.hasKey ? "Key set" : "No key"}</Badge>
        </> : null}
        actions={canWrite && prov ? <>
          <Button variant="secondary" loading={testing} onClick={() => void testConnection()}>Test connection</Button>
          <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => void save()}>Save changes</Button>
        </> : null}
      />
      {loading ? <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-32" /></div> : prov ? (
        <div className="space-y-4">
          {testMsg && testMsg !== "ok" ? <Notice tone="danger" title="Connection test failed">{testMsg}</Notice> : null}
          {testMsg === "ok" ? <Notice tone="success" title="Connection test passed">The provider responded successfully.</Notice> : null}

          <Panel title="Configuration" description="Core provider settings.">
            <StatStrip>
              <Stat label="Provider ID" value={<span className="font-mono text-xs">{prov.id}</span>} />
              <Stat label="Type" value={prov.type} />
              <Stat label="Platform" value={platformName(prov.platform)} />
              {prov.category === "stt" ? <Stat label="Fallback order" value={prov.order} /> : null}
            </StatStrip>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Field label="Display name" required>
                {(p) => <TextInput {...p} value={name} disabled={!canWrite} onChange={set(setName)} />}
              </Field>
              {prov.category !== "websearch" ? <>
                <Field label="Base URL">
                  {(p) => <TextInput {...p} className="font-mono text-xs" value={baseUrl} disabled={!canWrite} onChange={set(setBaseUrl)} />}
                </Field>
                <Field label="Model">
                  {(p) => <TextInput {...p} className="font-mono text-xs" value={model} disabled={!canWrite} onChange={set(setModel)} />}
                </Field>
              </> : null}
              <div className="flex items-center justify-between rounded-md border border-line p-3 sm:col-span-2">
                <span className="text-sm">Active</span>
                <Switch label="Active" checked={active} disabled={!canWrite} onChange={(v) => { setActive(v); setDirty(true); }} />
              </div>
            </div>
          </Panel>

          <Panel title="API Key" description="Keys are write-only. The console never displays the stored value.">
            <div className="flex items-center justify-between p-4">
              <div>
                <Badge tone={prov.hasKey ? "success" : "danger"}>{prov.hasKey ? "Configured" : "Not set"}</Badge>
                <p className="mt-1 text-xs text-fg-muted">API keys are stored server-side and never returned to the console.</p>
              </div>
              {canWrite ? <Button size="sm" variant="secondary" icon="key" onClick={() => { setNewKey(""); setConfirmRotate(true); }}>Rotate key</Button> : null}
            </div>
          </Panel>

          <Panel title="Health" description="Latest health-check data for this provider's model.">
            {healthQ.loading ? <Skeleton className="m-4 h-16" /> : health ? (
              <StatStrip>
                <Stat label="Circuit" value={<StatusPill status={health.circuit === "closed" ? "ok" : "down"} label={health.circuit} />} />
                <Stat label="Successes" value={health.successes} />
                <Stat label="Failures" value={health.failures} />
                <Stat label="p50 latency" value={health.p50Ms !== null ? `${Math.round(health.p50Ms)} ms` : "—"} />
                <Stat label="p95 latency" value={health.p95Ms !== null ? `${Math.round(health.p95Ms)} ms` : "—"} />
                <Stat label="Last success" value={health.lastSuccessTs ? relativeTime(health.lastSuccessTs) : "—"} />
              </StatStrip>
            ) : <p className="p-4 text-sm text-fg-muted">No health data available for this provider{"'"}s model.</p>}
          </Panel>

          {canWrite ? (
            <Panel title="Danger zone">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">Delete this provider</p>
                  <p className="text-xs text-fg-muted">Removes the provider record and its stored API key. This cannot be undone.</p>
                </div>
                <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>Delete provider</Button>
              </div>
            </Panel>
          ) : null}
        </div>
      ) : null}

      <ConfirmAction
        open={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        title={prov ? `Rotate key for ${prov.name}` : ""}
        level="reason"
        confirmLabel="Rotate key"
        impact={
          <div className="space-y-3">
            <p>The new key replaces the current one. Revoke the old key at the provider if it was compromised.</p>
            <Field label="New key">
              {(p) => <TextInput {...p} type="password" autoComplete="off" value={newKey} onChange={(e) => setNewKey(e.target.value)} />}
            </Field>
          </div>
        }
        onConfirm={async (reason) => {
          if (newKey.trim().length < 8) throw new Error("That does not look like an API key.");
          await callAdmin("adminSaveProviderKey", { providerId: prov!.id, apiKey: newKey.trim() });
          toast.success("Key rotated", prov!.name);
          setNewKey(""); void load();
        }}
      />
      <ConfirmAction
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={prov ? `Delete ${prov.name}` : ""}
        level="typed"
        phrase={prov?.id}
        danger
        confirmLabel="Delete provider and key"
        impact={<>The stored API key is deleted first, then the provider. This cannot be undone.</>}
        onConfirm={async (reason) => {
          await callAdmin("adminDeleteProvider", { providerId: prov!.id, reason });
          toast.success("Provider deleted", prov!.id);
          router.push("/dashboard/providers");
        }}
      />
    </>
  );
}

function BLink() {
  return (
    <Link href="/dashboard/providers" className="mb-3 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
      <Icon name="chevron-left" size={16} /> Providers &amp; Keys
    </Link>
  );
}
