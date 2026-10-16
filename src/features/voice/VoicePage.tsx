"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { callAdmin } from "@/lib/api";
import { db } from "@/lib/firebase";
import { useCan } from "@/lib/session";
import {
  Badge, Button, ConfirmAction, DataTable, Drawer, ErrorState, Field, Icon, Notice, PageHeader, Panel, Select, Skeleton,
  StatusPill, Switch, TextInput, Textarea, useToast, type Column,
} from "@/ui";
import { TargetForm } from "../config/TargetForm";
import { useRegistry, useTarget } from "../config/useConfig";
import { SpeechPanel } from "./SpeechPanel";
import { VoiceRegistryDiagnostics } from "./VoiceRegistryDiagnostics";
import { VOICE_ENGINE_FIELD_KEYS } from "./voiceFieldMetadata";
import { PKG_TYPES, missingSeeds, packageError, parseFiles, unverifiedFiles, type VoicePkg } from "./logic";

export default function VoicePage() {
  const can = useCan();
  const reg = useRegistry();
  const voiceQ = useTarget("voice");
  const canEdit = can("voice.configure");

  if (reg.error) return <ErrorState message={reg.error.message} onRetry={reg.reload} />;
  return (
    <>
      <PageHeader
        title="Voice"
        description="Cloud voice (server), the Gold realtime engine and the app's on-device voice behaviour. Versioned: every change needs a reason and can be rolled back."
        actions={
          <Link href="/dashboard/config-history" className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-panel px-4 text-sm font-medium hover:bg-raised">
            <Icon name="history" size={16} /> History
          </Link>
        }
      />
      <div className="mb-4 space-y-3">
        <Notice tone="info">
          Voice kill switches (voice, cloud voice, wake word) are on <Link className="underline" href="/dashboard/flags">Feature Flags</Link>.
          The cloud speech-to-text order is built from the active speech-to-text rows on <Link className="underline" href="/dashboard/providers">Providers &amp; Keys</Link>.
          Speech routing and billing settings are checked on every cloud speech operation. Session provider choices apply to the next session.
        </Notice>
      </div>
      {!reg.data ? <Skeleton className="h-96 w-full" /> : (
        <div className="space-y-4">
          <VoiceRegistryDiagnostics fields={reg.data.fields} />
          <TargetForm registry={reg.data} target="voice" query={voiceQ} canEdit={canEdit}
            title="Pipecat voice engine — Active / Disabled"
            description="Active starts the selected Pipecat conversation pipeline. Official supports streaming voice conversation; app actions and personal memory still require Bridge. Disabled restores legacy voice. Changes apply to new sessions. Save with a reason. Requires a running private worker; offline speech stays on-device."
            only={[...VOICE_ENGINE_FIELD_KEYS]} />
          {voiceQ.data?.snapshot.pipecatEnabled === true ? <>
            <TargetForm registry={reg.data} target="voice" query={voiceQ} canEdit={canEdit} title="STT configuration"
              description="Segmented mode uses the common batch provider chain. Native Sarvam uses the official streaming service and live Akaya usage checks. Major changes apply to the next session."
              only={["speechRealtimeStt", "speechSttChain", "speechLanguageStrategy", "speechSttTimeoutMs", "speechSttRetries"]} />
            {voiceQ.data?.snapshot.speechRealtimeStt === "sarvam-realtime" ? <TargetForm registry={reg.data} target="voice" query={voiceQ} canEdit={canEdit}
              title="Native realtime STT and endpointing" description="Choose one finalization owner. A failed native stream closes clearly; partial utterances are never silently replayed into tools."
              only={["speechRealtimeModel", "speechEndpointing"]} /> : null}
            {voiceQ.data?.snapshot.speechRealtimeStt === "meta-realtime" ? <TargetForm registry={reg.data} target="voice" query={voiceQ} canEdit={canEdit}
              title="Meta Muse speech-to-text" description="Select an active Meta Model API provider and supported Muse transcription model. Requires the official pipeline and an entitled Meta account. Wit.ai TTS uses a separate provider/key and the TTS chains below."
              only={["speechMetaProvider", "speechMetaModel"]} /> : null}
            <TargetForm registry={reg.data} target="voice" query={voiceQ} canEdit={canEdit} title="TTS configuration and fallbacks"
              description="Provider/model/voice chains remain below. These options control streaming, retry and voice selection."
              only={["speechTtsStreaming", "speechTtsTimeoutMs", "speechTtsRetries", "speechFallbackEnabled", "speechVoiceStrategy"]} />
            <SpeechPanel query={voiceQ} canEdit={canEdit} />
          </> : null}
          <TargetForm registry={reg.data} target="voice" query={voiceQ} canEdit={canEdit}
            title="Realtime voice (Gold engine)"
            description="OpenAI realtime sessions. Each session is paid; the daily cap bounds cost per user."
            only={["realtimeEnabled", "realtimePlans", "realtimeDailySessions", "realtimeModel", "realtimeVoice", "realtimeEagerness", "realtimeInstructions"]} />
          <TargetForm registry={reg.data} target="voice" query={voiceQ} canEdit={canEdit}
            title="Cloud voice quotas & cost"
            description="Per-user caps and the token price of cloud speech."
            only={["maxTurnsPerDay", "allowFreeOnlineVoice", "voiceCloudForPaid", "sttTokensPerSec", "ttsTokensPerKChar"]} />
          <TargetForm registry={reg.data} target="voice" query={voiceQ} canEdit={canEdit}
            title="Cloud voice chains"
            description="Text-to-speech per language and the Floating Insert polish model, tried in order."
            only={["onlineTts", "voiceFemale", "voiceMale", "insertLlm"]} />
          <TargetForm registry={reg.data} target="voice" query={voiceQ} canEdit={canEdit}
            title="On-device voice (app)"
            description="Read by the app. Millisecond values are clamped by the app to safe ranges."
            only={["offlineSttChain", "offlineTtsChain", "bargeInEnabled", "continuousDefault", "maxUtteranceSec", "nativeEndpointMs", "nativePauseForMs", "continuationSettleMs", "recognizerLocale"]} />
          <VoicePackages canEdit={can("ai.models.configure")} />
        </div>
      )}
    </>
  );
}

const EMPTY: VoicePkg = { id: "", type: "stt", name: "", description: "", languages: [], version: 1, enabled: true, files: [] };

/// Offline voice package catalog (/voice_packages). Direct writes, gated by
/// firestore.rules to ai_ops / super_admin (ai.models.configure).
function VoicePackages({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [pkgs, setPkgs] = useState<VoicePkg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ isNew: boolean; pkg: VoicePkg; files: string; langs: string } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [remove, setRemove] = useState<VoicePkg | null>(null);
  const [seeding, setSeeding] = useState(false);

  async function load() {
    setError(null);
    try {
      const snap = await getDocs(collection(db, "voice_packages"));
      setPkgs(snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          type: (x.type as string) ?? "stt",
          name: (x.name as string) ?? d.id,
          description: (x.description as string) ?? "",
          languages: Array.isArray(x.languages) ? (x.languages as string[]) : [],
          version: typeof x.version === "number" ? x.version : 1,
          enabled: x.enabled !== false,
          files: Array.isArray(x.files) ? (x.files as VoicePkg["files"]) : [],
        };
      }).sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id)));
    } catch {
      setError("Could not load voice packages.");
    }
  }
  useEffect(() => {
    void load();
  }, []);

  const missing = useMemo(() => (pkgs ? missingSeeds(new Set(pkgs.map((p) => p.id))) : []), [pkgs]);

  function open(p: VoicePkg | null) {
    const pkg = p ?? EMPTY;
    setFormError(null);
    setEdit({ isNew: !p, pkg, files: JSON.stringify(pkg.files, null, 2), langs: pkg.languages.join(", ") });
  }

  async function save() {
    if (!edit) return;
    const f = parseFiles(edit.files);
    const langs = edit.langs.split(",").map((s) => s.trim()).filter(Boolean);
    const err = packageError(edit.pkg) ?? f.error ?? (langs.every((l) => /^[a-z]{2,3}$/.test(l)) ? null : "Languages: codes like hi, en.");
    if (err) {
      setFormError(err);
      return;
    }
    if (edit.isNew && pkgs?.some((p) => p.id === edit.pkg.id)) {
      setFormError(`Package ${edit.pkg.id} already exists.`);
      return;
    }
    setSaving(true);
    try {
      const id = edit.pkg.id;
      await callAdmin("adminCatalogs", { action: "savePackage", isNew: edit.isNew, pkg: { ...edit.pkg, languages: langs, files: f.files } });
      toast.success("Package saved", `${id} v${edit.pkg.version}`);
      setEdit(null);
      void load();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function seed() {
    setSeeding(true);
    try {
      for (const p of missing) {
        await callAdmin("adminCatalogs", { action: "savePackage", isNew: true, pkg: p, reason: "Add built-in package" });
      }
      toast.success("Built-in packages added", missing.map((p) => p.id).join(", "));
      void load();
    } catch (e) {
      toast.error("Could not add packages", (e as Error).message);
    } finally {
      setSeeding(false);
    }
  }

  const cols: Column<VoicePkg>[] = [
    { id: "p", header: "Package", cell: (p) => <div><p className="text-sm font-medium">{p.name}</p><p className="font-mono text-xs text-fg-muted">{p.id}</p></div> },
    { id: "t", header: "Type", cell: (p) => <Badge>{p.type}</Badge> },
    { id: "l", header: "Languages", hideOnNarrow: true, cell: (p) => p.languages.join(", ") || "—" },
    { id: "v", header: "Version", align: "right", cell: (p) => p.version },
    { id: "h", header: "Integrity", cell: (p) => (unverifiedFiles(p) ? <Badge tone="warning">{unverifiedFiles(p)} file(s) without sha256</Badge> : <Badge tone="success">All hashed</Badge>) },
    { id: "e", header: "State", cell: (p) => <StatusPill status={p.enabled ? "ok" : "off"} label={p.enabled ? "Offered" : "Hidden"} /> },
  ];

  return (
    <Panel
      title="Offline voice packages"
      description="Downloadable on-device models. The app refreshes the catalog within 24 hours or when the Model Hub opens; installed copies keep working if a package is removed."
      actions={canEdit ? (
        <>
          {missing.length ? <Button variant="secondary" loading={seeding} onClick={() => void seed()}>Add {missing.length} built-in</Button> : null}
          <Button variant="primary" icon="plus" onClick={() => open(null)}>Add package</Button>
        </>
      ) : null}
      flush
    >
      {error ? <ErrorState compact message={error} onRetry={() => void load()} /> : (
        <DataTable label="Voice packages" columns={cols} rows={pkgs ?? []} rowKey={(p) => p.id} loading={pkgs === null}
          onRowClick={canEdit ? (p) => open(p) : undefined}
          empty={{ title: "No packages in the catalog", body: "The app falls back to its compiled catalog." }} />
      )}
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.isNew ? "New voice package" : edit?.pkg.id ?? ""} width={620}
        footer={
          <>
            {!edit?.isNew ? <Button variant="danger-ghost" onClick={() => { setRemove(edit!.pkg); setEdit(null); }}>Delete</Button> : null}
            <Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={() => void save()}>Save</Button>
          </>
        }>
        {edit ? (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Id">{(p) => <TextInput {...p} className="font-mono" disabled={!edit.isNew} value={edit.pkg.id} onChange={(e) => setEdit({ ...edit, pkg: { ...edit.pkg, id: e.target.value.trim() } })} />}</Field>
              <Field label="Type">{(p) => (
                <Select {...p} value={edit.pkg.type} onChange={(e) => setEdit({ ...edit, pkg: { ...edit.pkg, type: e.target.value } })}>
                  {PKG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              )}</Field>
            </div>
            <Field label="Name">{(p) => <TextInput {...p} value={edit.pkg.name} onChange={(e) => setEdit({ ...edit, pkg: { ...edit.pkg, name: e.target.value } })} />}</Field>
            <Field label="Description">{(p) => <TextInput {...p} value={edit.pkg.description} onChange={(e) => setEdit({ ...edit, pkg: { ...edit.pkg, description: e.target.value } })} />}</Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Languages" hint="Comma-separated codes, e.g. hi, en">{(p) => <TextInput {...p} value={edit.langs} onChange={(e) => setEdit({ ...edit, langs: e.target.value })} />}</Field>
              <Field label="Version" hint="Raise it to make installed apps re-download.">{(p) => (
                <TextInput {...p} inputMode="numeric" value={String(edit.pkg.version)} onChange={(e) => setEdit({ ...edit, pkg: { ...edit.pkg, version: Number(e.target.value) || 0 } })} />
              )}</Field>
            </div>
            <Field label="Files (JSON)" hint='[{"filename", "url" (https), "sizeBytes", "sha256" (recommended)}]'>
              {(p) => <Textarea {...p} className="font-mono text-xs" rows={10} value={edit.files} onChange={(e) => setEdit({ ...edit, files: e.target.value })} />}
            </Field>
            <label className="flex items-center justify-between rounded-md border border-line p-3">
              <span className="text-sm">Offered in the app</span>
              <Switch label="Offered" checked={edit.pkg.enabled} onChange={(v) => setEdit({ ...edit, pkg: { ...edit.pkg, enabled: v } })} />
            </label>
            {formError ? <Notice tone="danger">{formError}</Notice> : null}
          </div>
        ) : null}
      </Drawer>
      <ConfirmAction
        open={!!remove}
        onClose={() => setRemove(null)}
        title={remove ? `Delete ${remove.id}` : ""}
        level="typed"
        phrase={remove?.id}
        danger
        confirmLabel="Delete package"
        impact={<>New installs can no longer download it. Phones that already installed it keep their copy.</>}
        onConfirm={async (reason) => {
          if (!remove) return;
          await callAdmin("adminCatalogs", { action: "deletePackage", id: remove.id, reason });
          toast.success("Package deleted", remove.id);
          void load();
        }}
      />
    </Panel>
  );
}
