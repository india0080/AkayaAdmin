export interface SpeechVoice { provider: string; model: string; voice: string; name: string; languages: string[]; gender: string | null; streaming: string; evidence: string; enabled: boolean; userSelectable: boolean }
export const voiceId = (v: Pick<SpeechVoice, "provider" | "model" | "voice">) => `${v.provider}|${v.model}|${v.voice}`;
export function chooseVoice(chain: Pick<SpeechVoice, "provider" | "model" | "voice">[], selected: SpeechVoice, role: "default" | "fallback") {
  const row = { provider: selected.provider, model: selected.model, voice: selected.voice };
  const rest = chain.filter(r => voiceId(r) !== voiceId(selected));
  if (role === "default") return [row, ...rest].slice(0, 6);
  if (!rest.length) throw new Error("Set a different default voice before selecting a fallback.");
  return [rest[0], row, ...rest.slice(1)].slice(0, 6);
}
export function toggleIdentity(ids: string[], id: string, present: boolean) { return present ? [...new Set([...ids, id])] : ids.filter(x => x !== id); }
