"use client";
import { useEffect, useRef, useState } from "react";
import { callAdmin } from "@/lib/api";
import { Button, Field, Notice, Panel, Select, TextInput, Textarea } from "@/ui";
import { applyConfig, type TargetQuery } from "../config/useConfig";
import { chooseVoice, toggleIdentity, voiceId, type SpeechVoice } from "./speechLogic";

interface Catalog { voices: SpeechVoice[]; models: { provider: string; model: string; kind: string; mode: string; partialTranscripts: boolean; evidence: string }[]; currentTts: Record<string, { provider: string; model: string; voice?: string }[]>; catalogError: string | null; limitations: string[] }
interface Preview { provider: string; model: string; voice: string; audioBase64: string; contentType: string; firstByteMs: number; totalMs: number; metricScope: string; runtime: string; transportFallback: string | null }
const samples: Record<string, string> = { en: "Hello, I am Akaya. Your meeting is tomorrow at eight.", hi: "नमस्ते, मैं अकाया हूँ। आपकी बैठक कल सुबह आठ बजे है।", hinglish: "Namaste, kal morning eight baje aapki meeting hai. Main reminder laga sakti hoon." };
export function SpeechPanel({ query, canEdit }: { query: TargetQuery; canEdit: boolean }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(""); const [provider, setProvider] = useState("");
  const [voiceLanguage, setVoiceLanguage] = useState("");
  const [language, setLanguage] = useState("en"); const [text, setText] = useState(samples.en);
  const [reason, setReason] = useState(""); const [preview, setPreview] = useState<Preview | null>(null);
  const [audio, setAudio] = useState<string | null>(null); const objectUrl = useRef<string | null>(null);
  const [health, setHealth] = useState<{ reachable: boolean; checkedAtMs: number; error?: string } | null>(null);
  async function reload() { try { setCatalog(await callAdmin<Catalog>("adminSpeech", { action: "catalog" })); setError(null); } catch (e) { setError((e as Error).message); } }
  useEffect(() => { void reload(); return () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }; }, []);
  async function run(action: () => Promise<void>) { setBusy(true); setError(null); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function save(v: SpeechVoice, action: "default" | "fallback" | "enabled" | "selectable") {
    if (!query.data || !canEdit || reason.trim().length < 5) throw new Error("Enter a reason of at least five characters before changing a voice.");
    const current = query.data.snapshot; let patch: Record<string, unknown>;
    if (action === "enabled" || action === "selectable") {
      const key = action === "enabled" ? "speechDisabledVoices" : "speechUserSelectableVoices";
      const rows = Array.isArray(current[key]) ? current[key] as string[] : action === "selectable" ? (catalog?.voices.filter(v => v.userSelectable).map(voiceId) ?? []) : [];
      patch = { [key]: toggleIdentity(rows, voiceId(v), action === "enabled" ? v.enabled : !v.userSelectable) };
    } else {
      if (!v.enabled) throw new Error("Enable this voice before assigning it.");
      const raw = current.onlineTts && typeof current.onlineTts === "object" ? current.onlineTts as Catalog["currentTts"] : catalog!.currentTts;
      const base = raw[language] ?? raw.default ?? [];
      patch = { onlineTts: { ...raw, [language]: chooseVoice(base.map(r => ({ ...r, voice: r.voice ?? "" })), v, action) }, speechVoiceStrategy: "chain" };
    }
    await applyConfig("voice", patch, query.data.version, reason.trim()); query.reload(); await reload();
  }
  async function play(v: SpeechVoice) {
    setPreview(null); setAudio(null); if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const result = await callAdmin<Preview>("adminSpeech", { action: "preview", provider: v.provider, model: v.model, voice: v.voice, language, text });
    const bytes = Uint8Array.from(atob(result.audioBase64), c => c.charCodeAt(0));
    objectUrl.current = URL.createObjectURL(new Blob([bytes], { type: result.contentType })); setAudio(objectUrl.current); setPreview(result);
  }
  const voices = (catalog?.voices ?? []).filter(v => (!provider || v.provider === provider) && (!voiceLanguage || v.languages.includes(voiceLanguage) || v.languages.includes("default")) && (!search || `${v.provider} ${v.model} ${v.voice} ${v.name}`.toLowerCase().includes(search.toLowerCase())));
  const assigned = catalog?.currentTts[language] ?? catalog?.currentTts.default ?? [];
  return <>
    <Panel title="Speech provider inventory" description="Catalog and current configuration are separate from measured acceptance. Segmented STT is batch; native Sarvam supports partial transcripts with server authorization and usage metering.">
      <Button disabled={busy} onClick={() => void run(reload)}>Refresh catalog</Button>
      {catalog?.catalogError ? <Notice tone="warning">{catalog.catalogError}</Notice> : null}
      <div className="mt-3 max-h-60 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Provider / model</th><th>Speech role</th><th>Mode / partials</th></tr></thead><tbody>{catalog?.models.map(m => <tr key={`${m.provider}|${m.model}|${m.kind}`} className="border-t border-line"><td className="py-2">{m.provider} / {m.model}</td><td>{m.kind}</td><td>{m.mode} / {m.partialTranscripts ? "yes" : "no"}</td></tr>)}</tbody></table></div>
    </Panel>
    <Panel title="Voices" description="Set default and fallback for the selected language. Assignments switch the runtime voice source to the TTS chain and apply to new sessions. Disabled voices remain discoverable.">
      <div className="grid gap-3 md:grid-cols-3"><Field label="Provider">{p => <Select {...p} value={provider} onChange={e => setProvider(e.target.value)}><option value="">All providers</option>{[...new Set(catalog?.voices.map(v => v.provider) ?? [])].map(p => <option key={p}>{p}</option>)}</Select>}</Field><Field label="Search">{p => <TextInput {...p} value={search} onChange={e => setSearch(e.target.value)} />}</Field><Field label="Language / assignment">{p => <Select {...p} value={language} onChange={e => { setLanguage(e.target.value); setText(samples[e.target.value] ?? samples.en); }}><option value="en">English</option><option value="hi">Hindi</option><option value="hinglish">Hinglish</option><option value="default">All other languages (default)</option></Select>}</Field></div>
      <Field label="Change reason">{p => <TextInput {...p} value={reason} onChange={e => setReason(e.target.value)} disabled={!canEdit} />}</Field>
      <Field label="Filter voice language">{p => <Select {...p} value={voiceLanguage} onChange={e => setVoiceLanguage(e.target.value)}><option value="">All / unknown languages</option><option value="en">English</option><option value="hi">Hindi</option><option value="hinglish">Hinglish (configured only)</option></Select>}</Field>
      <Field label="Preview sample (maximum 300 characters)">{p => <Textarea {...p} value={text} maxLength={300} onChange={e => setText(e.target.value)} />}</Field>
      <div className="mt-4 max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Voice / provider / model</th><th>Metadata</th><th>Actions</th></tr></thead><tbody>{voices.map(v => <tr key={voiceId(v)} className="border-t border-line"><td className="py-3 pr-3"><div className="font-medium">{v.name}{assigned[0] && voiceId({ ...assigned[0], voice: assigned[0].voice ?? "" }) === voiceId(v) ? " · Default" : assigned[1] && voiceId({ ...assigned[1], voice: assigned[1].voice ?? "" }) === voiceId(v) ? " · Fallback" : ""}</div><div className="text-xs text-fg-subtle">{v.provider} / {v.model}<br/>{v.voice}</div></td><td className="pr-3 text-xs">{v.enabled ? "Enabled" : "Disabled"}<br/>{v.languages.join(", ") || "Languages unknown"}<br/>{v.gender ?? "Gender unknown"}<br/>Streaming: {v.streaming}<br/>{v.userSelectable ? "Available in app voice picker" : "Admin only"}</td><td><div className="flex flex-wrap gap-1"><Button disabled={busy || !canEdit || !v.enabled || !text.trim()} onClick={() => void run(() => play(v))}>Play sample</Button>{(["default", "fallback", "enabled", "selectable"] as const).map(action => <Button key={action} disabled={busy || !canEdit || reason.trim().length < 5} onClick={() => void run(() => save(v, action))}>{action === "enabled" ? v.enabled ? "Disable" : "Enable" : action === "selectable" ? v.userSelectable ? "Admin only" : "User-selectable" : `Set ${action}`}</Button>)}</div></td></tr>)}</tbody></table></div>
    </Panel>
    <Panel title="Test / benchmark and health" description="Preview measures server receipt of audio bytes. It cannot measure audible playback, naturalness or physical microphone acceptance.">
      {busy ? <p role="status">Request in progress…</p> : null}{error ? <Notice tone="danger">{error}</Notice> : null}
      {audio ? <audio controls src={audio} className="my-3" /> : null}
      {preview ? <p>{preview.provider} / {preview.model} / {preview.voice}: first received byte {Math.round(preview.firstByteMs)} ms; total synthesis {Math.round(preview.totalMs)} ms. Runtime: {preview.runtime}{preview.transportFallback ? `; fallback: ${preview.transportFallback}` : ""}. {preview.metricScope}.</p> : null}
      <Button disabled={busy} onClick={() => void run(async () => setHealth(await callAdmin("adminSpeech", { action: "health" })))}>Check worker health</Button>
      {health ? <p>{health.reachable ? "Worker reachable" : "Worker unavailable"} · {new Date(health.checkedAtMs).toLocaleString()}{health.error ? ` · ${health.error}` : ""}</p> : null}
      <p className="mt-3 text-sm text-fg-subtle">Config History provides version comparison, audit and rollback. Benchmarks must establish Hindi/Hinglish/English quality before selecting a best default.</p>
    </Panel>
  </>;
}


