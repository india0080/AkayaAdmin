import type { FieldDef } from "../config/logic";

/** Exactly the definitions requested by the Voice engine panel. */
export const VOICE_ENGINE_FIELD_KEYS = [
  "pipecatEnabled", "pipecatPipeline", "pipecatLlmProvider",
  "pipecatFallbackEnabled", "pipecatTimeoutMs", "pipecatDailySessions",
  "pipecatVadStopMs", "pipecatTurnTimeoutMs", "bargeInEnabled",
  "pipecatDiagnostics",
] as const;

export interface VoiceFieldMetadata {
  key: string;
  present: boolean;
  target: string | null;
  type: string | null;
}

type Definition = Pick<FieldDef, "key" | "target" | "type">;

/** Project definition metadata only. Never inspect snapshots or defaults. */
export function voiceFieldMetadata(fields: readonly Definition[]): VoiceFieldMetadata[] {
  return VOICE_ENGINE_FIELD_KEYS.map((key) => {
    // Match TargetForm's voice-target lookup; retain a wrong-target definition
    // for diagnosis when no voice-target definition exists.
    const field = fields.find((f) => f.key === key && f.target === "voice")
      ?? fields.find((f) => f.key === key);
    return {
      key,
      present: field !== undefined,
      target: field?.target ?? null,
      type: field?.type ?? null,
    };
  });
}

export function unavailableVoiceFields(rows: readonly VoiceFieldMetadata[]): string[] {
  return rows.filter((row) => !row.present || row.target !== "voice").map((row) => row.key);
}
