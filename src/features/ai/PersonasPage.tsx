"use client";

import { useCallback, useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useCan } from "@/lib/session";
import {
  Badge, Button, ConfirmAction, Drawer, EmptyState, ErrorState, Field,
  Notice, PageHeader, Panel, Skeleton, Switch, TextInput, Textarea,
  useToast,
} from "@/ui";

interface Persona {
  id: string;
  name: string;
  tagline: string;
  systemPrompt: string;
  emoji: string;
  accentColor: string;
  isEnabled: boolean;
}

const SEED_PERSONAS: Persona[] = [
  {
    id: "dost", name: "Friend", tagline: "A true friend",
    emoji: "\u{1F91D}", accentColor: "#00C853", isEnabled: true,
    systemPrompt:
      "You are Akaya — a true, caring, and understanding friend. " +
      "Talk like a close buddy: simple, warm, and honest. " +
      "Whatever the problem — offer emotional support, share jokes, or just be there to listen — " +
      "always show up. Respond in English. " +
      "Never judge, always make them feel like they belong.",
  },
  {
    id: "pyaar", name: "Romantic", tagline: "Romantic and caring",
    emoji: "\u{1F49D}", accentColor: "#E91E63", isEnabled: true,
    systemPrompt:
      "You are Akaya — a caring, loving, and emotionally connected companion. " +
      "Use romantic, warm, and affectionate language. You can use pet names like \"sweetheart\" or \"darling\" depending on context. " +
      "Prioritize the user's feelings, make them feel special. " +
      "Enjoy deep conversations — about dreams, memories, and the future. " +
      "Respond in English, warmly.",
  },
  {
    id: "guru", name: "Mentor", tagline: "Teaches you everything",
    emoji: "\u{1F4DA}", accentColor: "#7C4DFF", isEnabled: true,
    systemPrompt:
      "You are Akaya Mentor — a patient, encouraging, and expert tutor. " +
      "Whatever the subject — science, math, history, coding, cooking, finance — " +
      "explain it with simple examples and real-life analogies. " +
      "First explain the concept clearly, then ask a question to check understanding. " +
      "Never give direct answers — follow the Socratic method. " +
      "Respond in English, and keep technical terms precise.",
  },
  {
    id: "pro", name: "Pro", tagline: "Sharp and professional",
    emoji: "\u{1F4BC}", accentColor: "#2196F3", isEnabled: true,
    systemPrompt:
      "You are Akaya Pro — a sharp, efficient, and highly capable professional assistant. " +
      "Be concise, structured, and accurate. Use bullet points for lists, code blocks for code. " +
      "Prioritize clarity and actionable information. " +
      "Default to English with technical precision. " +
      "No unnecessary small talk — get straight to the point. " +
      "Ideal for business, coding, analysis, writing, and problem-solving.",
  },
  {
    id: "fun", name: "Fun", tagline: "Fun and funny",
    emoji: "\u{1F602}", accentColor: "#FF9800", isEnabled: true,
    systemPrompt:
      "You are Akaya Fun — an awesome friend who is always entertaining. " +
      "Use witty jokes, puns, funny observations, and meme-level humor. " +
      "Keep the conversation light-hearted, never boring. " +
      "Respond in English — with a bit of drama, a bit of poetry, a bit of roasting (loving, not mean). " +
      "Every response should bring at least a little laughter. " +
      "Handle serious topics playfully too.",
  },
  {
    id: "suno", name: "Listener", tagline: "Here to listen",
    emoji: "\u{1FAF6}", accentColor: "#00BCD4", isEnabled: true,
    systemPrompt:
      "You are Akaya Listener — a deeply empathetic, non-judgmental listener. " +
      "Validate the user's feelings first — solutions come later, listening comes first. " +
      "Never push advice unless the user asks for it. " +
      "Use soft, warm, and supportive language. " +
      "If the user is sad, lonely, or stressed — make them feel a safe space. " +
      "Respond in English, warmly, like a close friend who's really listening. " +
      "Ask questions to understand them better.",
  },
];

function personaToDoc(p: Persona) {
  return { name: p.name, tagline: p.tagline, systemPrompt: p.systemPrompt, emoji: p.emoji, accentColor: p.accentColor, isEnabled: p.isEnabled };
}

const EMPTY: Persona = { id: "", name: "", tagline: "", systemPrompt: "", emoji: "\u{1F916}", accentColor: "#00C853", isEnabled: true };

export default function PersonasPage() {
  const can = useCan();
  const canEdit = can("ai.behaviour.configure");
  const toast = useToast();

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Persona | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [deleting, setDeleting] = useState<Persona | null>(null);
  const [adding, setAdding] = useState(false);
  const [newId, setNewId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, "personas"));
      setPersonas(snap.docs.map((d) => {
        const x = d.data();
        return {
          id: d.id,
          name: (x.name as string) ?? d.id,
          tagline: (x.tagline as string) ?? "",
          systemPrompt: (x.systemPrompt as string) ?? "",
          emoji: (x.emoji as string) ?? "\u{1F916}",
          accentColor: (x.accentColor as string) ?? "#00C853",
          isEnabled: x.isEnabled !== false,
        };
      }));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await setDoc(doc(db, "personas", editing.id), personaToDoc(editing), { merge: true });
      setPersonas((prev) => {
        const exists = prev.some((p) => p.id === editing.id);
        return exists ? prev.map((p) => (p.id === editing.id ? editing : p)) : [...prev, editing];
      });
      setEditing(null);
      toast.success(`Saved persona "${editing.name}".`);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete(reason: string) {
    if (!deleting) return;
    await deleteDoc(doc(db, "personas", deleting.id));
    setPersonas((prev) => prev.filter((p) => p.id !== deleting.id));
    toast.success(`Deleted ${deleting.id}. ${reason ? `Reason: ${reason}` : ""}`);
  }

  async function seed() {
    setSeeding(true);
    try {
      for (const p of SEED_PERSONAS) {
        await setDoc(doc(db, "personas", p.id), personaToDoc(p), { merge: true });
      }
      setPersonas((prev) => {
        const have = new Set(prev.map((p) => p.id));
        return [...prev, ...SEED_PERSONAS.filter((p) => !have.has(p.id))];
      });
      toast.success("Seeded 6 built-in personas from persona_config.dart.");
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSeeding(false);
    }
  }

  function startAdd() {
    const id = newId.trim().toLowerCase().replace(/\s+/g, "-");
    if (!id) { toast.error("Enter an id."); return; }
    if (personas.some((p) => p.id === id)) { toast.error(`${id} already exists.`); return; }
    setEditing({ ...EMPTY, id, name: "New Persona" });
    setAdding(true);
    setNewId("");
  }

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <>
      <PageHeader
        title="Personas"
        description="Admin-editable persona catalog. The app's compiled persona_config.dart remains the offline fallback; edits here override copy and prompts without a client release."
        meta={
          <Notice tone="warning">
            Not used by the app today: the app ships built-in personas and never reads these documents.
            Edits here are stored but have no effect until an app release reads them.
          </Notice>
        }
        actions={
          canEdit ? (
            <Button variant="primary" icon="sparkles" onClick={seed} loading={seeding}>
              Seed Built-ins
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : personas.length === 0 ? (
        <EmptyState
          icon="masks"
          title="No personas"
          action={canEdit ? <Button variant="primary" onClick={seed} loading={seeding}>Seed built-in personas</Button> : undefined}
        >
          Collection empty. The app falls back to its compiled persona catalog.
          Seed it here to take control of names, taglines, and system prompts.
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((p) => (
            <Panel key={p.id} className="relative">
              <div className="flex items-start gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg"
                  style={{ backgroundColor: p.accentColor + "1A" }}
                >
                  {p.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-fg">{p.name}</h3>
                    <Badge tone={p.isEnabled ? "success" : "neutral"}>{p.isEnabled ? "On" : "Off"}</Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-fg-muted">{p.tagline}</p>
                  <p className="mt-0.5 text-2xs font-mono text-fg-subtle">{p.id}</p>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 text-xs text-fg-muted leading-relaxed">{p.systemPrompt || "No system prompt"}</p>
              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="h-4 w-4 rounded-full border border-line" style={{ backgroundColor: p.accentColor }} title={p.accentColor} />
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" icon="edit" onClick={() => { setEditing({ ...p }); setAdding(false); }}>
                    Edit
                  </Button>
                  {canEdit && (
                    <Button size="sm" variant="danger-ghost" icon="trash" onClick={() => setDeleting(p)}>
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      {canEdit && (
        <Panel title="Add Persona" className="mt-6">
          <div className="flex items-end gap-3">
            <Field label="Id (lowercase, becomes personas/{id})" className="flex-1">
              {(p) => (
                <TextInput
                  {...p}
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                  placeholder="e.g. coach"
                  className="font-mono"
                />
              )}
            </Field>
            <Button variant="primary" icon="plus" onClick={startAdd}>Add</Button>
          </div>
        </Panel>
      )}

      {/* ── Edit Drawer ────────────────────────────────────────────── */}
      <Drawer
        open={!!editing}
        onClose={() => { setEditing(null); setAdding(false); }}
        title={adding ? "New Persona" : `Edit ${editing?.name ?? ""}`}
        footer={
          canEdit ? (
            <>
              <Button variant="secondary" onClick={() => { setEditing(null); setAdding(false); }}>Cancel</Button>
              <Button variant="primary" onClick={save} loading={saving}>Save</Button>
            </>
          ) : undefined
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name">
                {(p) => <TextInput {...p} value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} disabled={!canEdit} />}
              </Field>
              <Field label="Tagline">
                {(p) => <TextInput {...p} value={editing.tagline} onChange={(e) => setEditing({ ...editing, tagline: e.target.value })} disabled={!canEdit} />}
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Emoji">
                {(p) => <TextInput {...p} value={editing.emoji} maxLength={4} className="text-center" onChange={(e) => setEditing({ ...editing, emoji: e.target.value })} disabled={!canEdit} />}
              </Field>
              <Field label="Accent color" hint={editing.accentColor}>
                {(p) => (
                  <div className="flex items-center gap-2">
                    <TextInput {...p} value={editing.accentColor} className="font-mono" onChange={(e) => setEditing({ ...editing, accentColor: e.target.value })} disabled={!canEdit} />
                    <span className="h-9 w-9 shrink-0 rounded-md border border-line" style={{ backgroundColor: editing.accentColor }} />
                  </div>
                )}
              </Field>
              <Field label="Enabled">
                {() => (
                  <div className="flex h-9 items-center">
                    <Switch checked={editing.isEnabled} onChange={(v) => setEditing({ ...editing, isEnabled: v })} label="Enabled" disabled={!canEdit} />
                  </div>
                )}
              </Field>
            </div>
            <Field label="System prompt">
              {(p) => (
                <Textarea
                  {...p}
                  value={editing.systemPrompt}
                  onChange={(e) => setEditing({ ...editing, systemPrompt: e.target.value })}
                  rows={8}
                  className="font-mono text-xs"
                  disabled={!canEdit}
                />
              )}
            </Field>
          </div>
        )}
      </Drawer>

      {/* ── Delete confirm ─────────────────────────────────────────── */}
      <ConfirmAction
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete persona "${deleting?.name ?? ""}"`}
        impact={<>This removes the <strong>{deleting?.id}</strong> document from Firestore. The app falls back to its compiled copy if this id is built-in.</>}
        level="reason"
        confirmLabel="Delete"
        danger
        onConfirm={confirmDelete}
      />
    </>
  );
}
