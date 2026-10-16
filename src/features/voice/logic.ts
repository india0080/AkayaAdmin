// Voice packages — pure helpers (unit-tested).
//
// /voice_packages is the downloadable offline STT/TTS/VAD/KWS catalog the
// app's Model Hub reads. The legacy page's "Seed built-ins" merge-wrote the
// seed `files` over existing docs, and arrays replace wholesale — wiping any
// sha256 an admin had added. Seeding now only ADDS packages that are missing.

export interface PkgFile {
  filename: string;
  url: string;
  sizeBytes: number;
  sha256?: string;
}

export interface VoicePkg {
  id: string;
  type: string;
  name: string;
  description: string;
  languages: string[];
  version: number;
  enabled: boolean;
  files: PkgFile[];
}

export const PKG_TYPES = ["stt", "tts", "vad", "kws"] as const;

// Mirrors the app's compiled fallback (VoiceModelCatalog).
export const SEED_PACKAGES: VoicePkg[] = [
  {
    id: "silero-vad", type: "vad", name: "Silero VAD",
    description: "Voice activity detection — reacts only to speech, ignores noise",
    languages: [], version: 1, enabled: true,
    files: [{ filename: "silero_vad.onnx", url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx", sizeBytes: 1800000 }],
  },
  {
    id: "whisper-tiny-stt", type: "stt", name: "Whisper Tiny STT",
    description: "Offline speech recognition — supports both Hindi and English",
    languages: ["hi", "en"], version: 1, enabled: true,
    files: [
      { filename: "encoder.int8.onnx", url: "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main/tiny-encoder.int8.onnx", sizeBytes: 27000000 },
      { filename: "decoder.int8.onnx", url: "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main/tiny-decoder.int8.onnx", sizeBytes: 11000000 },
      { filename: "tokens.txt", url: "https://huggingface.co/csukuangfj/sherpa-onnx-whisper-tiny/resolve/main/tiny-tokens.txt", sizeBytes: 1000000 },
    ],
  },
  {
    id: "mms-hindi-tts", type: "tts", name: "Piper Hindi TTS",
    description: "Natural Hindi voice — offline text-to-speech, Meta MMS model",
    languages: ["hi"], version: 1, enabled: true,
    files: [
      { filename: "model.onnx", url: "https://huggingface.co/willwade/mms-tts-multilingual-models-onnx/resolve/main/hin/model.onnx", sizeBytes: 114000000 },
      { filename: "tokens.txt", url: "https://huggingface.co/willwade/mms-tts-multilingual-models-onnx/resolve/main/hin/tokens.txt", sizeBytes: 472 },
    ],
  },
  {
    id: "piper-english-tts", type: "tts", name: "Piper English TTS",
    description: "Natural English voice — offline text-to-speech, Amy voice",
    languages: ["en"], version: 1, enabled: true,
    files: [
      { filename: "model.onnx", url: "https://huggingface.co/csukuangfj/vits-piper-en_US-amy-low/resolve/main/en_US-amy-low.onnx", sizeBytes: 27000000 },
      { filename: "tokens.txt", url: "https://huggingface.co/csukuangfj/vits-piper-en_US-amy-low/resolve/main/tokens.txt", sizeBytes: 4000 },
    ],
  },
];

export function missingSeeds(existingIds: ReadonlySet<string>): VoicePkg[] {
  return SEED_PACKAGES.filter((p) => !existingIds.has(p.id));
}

/// Parses and checks the files JSON of a package. https only (the app
/// downloads these), a name and a positive size per file, sha256 hex if set.
export function parseFiles(json: string): { files: PkgFile[] | null; error: string | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { files: null, error: "Not valid JSON." };
  }
  if (!Array.isArray(raw) || raw.length === 0) return { files: null, error: "List at least one file." };
  const files: PkgFile[] = [];
  for (const f of raw) {
    const x = (f ?? {}) as Record<string, unknown>;
    if (typeof x.filename !== "string" || !/^[\w.-]{1,120}$/.test(x.filename)) return { files: null, error: "Each file needs a plain filename." };
    if (typeof x.url !== "string" || !/^https:\/\/\S+$/.test(x.url)) return { files: null, error: `${x.filename}: url must be https.` };
    if (typeof x.sizeBytes !== "number" || !(x.sizeBytes > 0)) return { files: null, error: `${x.filename}: sizeBytes must be a positive number.` };
    if (x.sha256 !== undefined && (typeof x.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(x.sha256))) {
      return { files: null, error: `${x.filename}: sha256 must be 64 hex characters.` };
    }
    files.push({ filename: x.filename, url: x.url, sizeBytes: x.sizeBytes, ...(x.sha256 ? { sha256: String(x.sha256).toLowerCase() } : {}) });
  }
  return { files, error: null };
}

export function packageError(p: Pick<VoicePkg, "id" | "name" | "type" | "version">): string | null {
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(p.id)) return "Id: lowercase letters, digits and hyphens.";
  if (!p.name.trim()) return "Name is required.";
  if (!(PKG_TYPES as readonly string[]).includes(p.type)) return "Unknown package type.";
  if (!Number.isInteger(p.version) || p.version < 1) return "Version must be a whole number from 1.";
  return null;
}

export function unverifiedFiles(p: VoicePkg): number {
  return p.files.filter((f) => !f.sha256).length;
}
