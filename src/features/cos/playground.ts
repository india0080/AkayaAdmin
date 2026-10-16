// Conversation OS playground: a TypeScript MIRROR of the pure, deterministic
// plan / check logic, so an admin can preview what Akaya would do for a given
// text + channel + language WITHOUT any model call.
//
// HONESTY NOTE: the Dart implementation (Track A core, Track B gate) is the
// source of truth. This is a faithful-in-spirit port, not a byte-for-byte one:
//   * language detection ports the Dart lexicon approach (script counts +
//     Hinglish marker density) with a smaller marker list;
//   * intent detection is a compact keyword rule set (the Dart adapter layers
//     over the existing IntentEngine, which cannot run in a browser);
//   * the gate runs a representative subset of the Dart checks (tone, language,
//     repetition, relevance, completion, formatting, verbosity, identity leak,
//     forbidden phrases, malformed JSON, raw metadata, fake action success).
// MIRROR_VERSION is shown in the UI so a screenshot is never mistaken for the
// shipped behaviour. Pure: no clock, no randomness, no network.

import {
  CHANNELS, INTENTS, effectiveChannel, effectiveQuality, effectiveThresholds, effectiveTraits, effectiveLanguages, humanize,
  type Channel, type CosConfig, type Intent, type Language, type Mode, type Threshold, type Trait,
} from "./logic";

export const MIRROR_VERSION = "ts-mirror-1";

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const norm = (s: string) => s.normalize("NFC").toLowerCase();
function tokens(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of norm(s)) {
    const c = ch.codePointAt(0) ?? 0;
    const word = (c >= 0x30 && c <= 0x39) || (c >= 0x61 && c <= 0x7a) || c === 0x27 || (c >= 0x900 && c <= 0x97f);
    if (word) cur += ch;
    else if (cur) { out.push(cur); cur = ""; }
  }
  if (cur) out.push(cur);
  return out;
}
export function scriptOf(s: string): "latin" | "devanagari" | "mixed" | "other" | "none" {
  let lat = 0; let dev = 0; let oth = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x900 && c <= 0x97f) dev++;
    else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) lat++;
    else if (c > 0x2fff && c < 0xd800) oth++;
    else if (c >= 0x590 && c <= 0x8ff) oth++;
  }
  if (lat + dev + oth === 0) return "none";
  if (oth > lat + dev) return "other";
  if (dev > 0 && lat > 0) return dev >= 3 && lat >= 3 ? "mixed" : dev > lat ? "devanagari" : "latin";
  return dev > 0 ? "devanagari" : "latin";
}
const sentencesOf = (s: string) => s.split(/(?<=[.!?।])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
export const wordCount = (s: string) => tokens(s).length;

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

const HI_STRONG = new Set(("hai hain hoon tha thi raha rahi rahe kya kyun kyu kaise kaisa kaisi kab kahan kaun kitna kitne kitni kuch koi nahi nahin " +
  "nhi mat haan han ji theek thik accha acha achha bahut bohot bhai yaar dost mujhe mujhko mera meri mere tera teri tumhara apna apni uska uski " +
  "hum tum aap aapko aapka woh wo yeh ye isko usko ko ka ki ke se mein maine kar karo karna karne kare kiya bol bolo bata batao btao dikhao " +
  "likho bhejo dena dedo chahiye sakta sakti sakte wala wali abhi aaj kal parso phir fir aur lekin magar toh bhi sirf bas jab tab agar kyunki " +
  "isliye matlab samajh pata dekho suno chalo jao aao yaad baje subah shaam raat ghar paise kaam naam baat zyada thoda bilkul wapas dobara pehle " +
  "doosra teesra banao hota hoti hua gaya gayi hoga hogi milega kijiye dijiye shukriya namaste maaf sahi galat").split(" "));
const HI_WEAK = new Set(["main", "me", "pe", "hi", "ho", "hu", "par", "kam", "sab", "ek", "ya", "na", "tu", "ab"]);
const EN_FN = new Set(("the a an and or but of in on at for with about from by is are was were be been am i you he she it we they my your me this that " +
  "these those what who when where why how can could would should will shall do does did have has had not no yes please tell give make write send to " +
  "if then than so just there here also any some all one its our their his her up out into over now today tomorrow need want know think like get let").split(" "));

export interface LanguageResult { language: Language; confidence: number; script: string; switched: boolean }

export function detectLanguage(text: string, previous?: Language): LanguageResult {
  const script = scriptOf(text);
  const prev = previous;
  const fin = (language: Language, confidence: number, sc: string): LanguageResult => {
    if (prev && confidence < 0.6 && language !== "other") return { language: prev, confidence, script: sc, switched: false };
    const hindiFam = (l: Language) => l === "hi" || l === "hinglish" || l === "mixed";
    const switched = !!prev && prev !== language && !(hindiFam(prev) && hindiFam(language) && prev !== "hi" && language !== "hi");
    return { language, confidence, script: sc, switched };
  };
  if (script === "none") return { language: prev ?? "en", confidence: 0.2, script: "latin", switched: false };
  if (script === "other") return fin("other", 0.8, "other");
  if (script === "devanagari") return fin("hi", 0.95, "devanagari");
  if (script === "mixed") return fin("mixed", 0.8, "mixed");
  let hi = 0; let en = 0; let n = 0;
  for (const t of tokens(text)) {
    if (t.length === 1 && t !== "i" && t !== "a") continue;
    n++;
    if (HI_STRONG.has(t)) hi += 1;
    else if (HI_WEAK.has(t)) hi += 0.25;
    if (EN_FN.has(t)) en += 1;
  }
  if (n === 0) return fin(prev ?? "en", 0.2, "latin");
  const density = hi / n;
  if (hi >= 1 && (density >= 0.2 || hi >= 2) && hi >= en * 0.5) return fin("hinglish", Math.min(0.98, Math.max(0.55, 0.55 + density)), "latin");
  if (hi >= 0.5 && n <= 3 && en === 0) return fin("hinglish", 0.5, "latin");
  let conf = Math.min(0.99, Math.max(0.5, 0.6 + (en / n) * 0.4));
  if (n <= 2 && en === 0 && hi === 0) conf = 0.5;
  return fin("en", conf, "latin");
}

// ---------------------------------------------------------------------------
// Intent (compact rules) + mode selection
// ---------------------------------------------------------------------------

interface Rule { intent: Intent; words: string[]; phrases?: string[]; tools?: boolean }
const RULES: Rule[] = [
  { intent: "emotionalSupport", words: ["sad", "anxious", "depressed", "lonely", "stressed", "overwhelmed", "upset", "scared", "dukhi", "udaas", "akela", "tension"], phrases: ["i feel", "feeling low", "can't cope"] },
  { intent: "reminder", words: ["remind", "reminder", "yaad"], phrases: ["remind me", "yaad dila", "set a reminder"], tools: true },
  { intent: "calendar", words: ["calendar", "meeting", "schedule", "appointment"], phrases: ["add to calendar", "book a meeting"], tools: true },
  { intent: "emailDraft", words: ["email", "mail"], phrases: ["draft an email", "write an email", "reply to this email", "mail likho"] },
  { intent: "messageDraft", words: ["whatsapp", "sms", "text"], phrases: ["send a message", "message to", "msg bhejo", "text him", "text her"] },
  { intent: "translation", words: ["translate", "translation", "anuvad"], phrases: ["in hindi", "in english", "ka matlab", "translate this"] },
  { intent: "rewrite", words: ["rewrite", "rephrase", "paraphrase", "proofread"], phrases: ["make it shorter", "make this more formal", "fix grammar"] },
  { intent: "summarize", words: ["summarize", "summarise", "summary", "tldr", "saransh"], phrases: ["sum up", "key points"] },
  { intent: "coding", words: ["code", "function", "bug", "compile", "python", "javascript", "dart", "flutter", "regex", "sql", "api"], phrases: ["stack trace"] },
  { intent: "troubleshooting", words: ["error", "crash", "crashed", "crashing", "crashes", "broken", "fails", "failing", "not working", "issue"], phrases: ["doesn't work", "not working", "kaam nahi kar"] },
  { intent: "search", words: ["search", "google", "latest", "news", "price", "weather", "score"], phrases: ["look up", "find online", "aaj ka"] },
  { intent: "memory", words: ["remember", "recall"], phrases: ["do you remember", "what did i tell", "mera naam"] },
  { intent: "imageAction", words: ["image", "photo", "picture", "screenshot", "draw", "tasveer"], phrases: ["generate an image", "edit this photo"] },
  { intent: "documentAction", words: ["pdf", "document", "docx", "spreadsheet", "file"], phrases: ["this document", "attached file"] },
  { intent: "phoneAction", words: ["call", "dial", "ring"], phrases: ["call mom", "phone karo", "call karo"], tools: true },
  { intent: "deviceAction", words: ["bluetooth", "wifi", "flashlight", "brightness", "volume", "silent", "torch"], phrases: ["turn on", "turn off", "switch on", "switch off"], tools: true },
  { intent: "toolAction", words: ["open", "launch", "navigate", "directions"], phrases: ["open the app", "take me to"], tools: true },
  { intent: "task", words: ["todo", "task", "checklist", "plan"], phrases: ["add a task", "to-do", "make a list"], tools: true },
  { intent: "business", words: ["invoice", "revenue", "client", "proposal", "pitch", "marketing", "startup", "quote"], phrases: ["business plan", "sales email"] },
  { intent: "deepReasoning", words: ["prove", "derive", "analyse", "analyze", "tradeoff", "trade-off", "strategy"], phrases: ["step by step", "think through", "pros and cons", "why does"] },
  { intent: "factualQuestion", words: ["capital", "population", "founded", "invented", "distance", "tallest"], phrases: ["who is", "who was", "when did", "how many", "kaun hai"] },
  { intent: "command", words: ["stop", "cancel", "undo", "pause", "resume"], phrases: ["never mind", "go back"] },
  { intent: "followUp", words: [], phrases: ["what about", "and then", "also", "same as before", "second one", "pehla wala", "doosra wala"] },
  { intent: "casualChat", words: ["hi", "hello", "hey", "thanks", "thank", "bye", "namaste", "shukriya", "lol", "ok", "okay"], phrases: ["how are you", "kaise ho", "good morning", "good night"] },
  { intent: "generalQuestion", words: ["what", "why", "how", "explain", "kya", "kyun", "kaise"], phrases: ["tell me about", "can you explain"] },
];
const PREFERRED: Partial<Record<Intent, Mode>> = {
  casualChat: "concise", reminder: "actionConfirmation", calendar: "actionConfirmation", phoneAction: "actionConfirmation", deviceAction: "actionConfirmation",
  toolAction: "actionConfirmation", command: "instant", translation: "translation", emailDraft: "professionalDraft", messageDraft: "professionalDraft",
  rewrite: "professionalDraft", deepReasoning: "deepReasoning", coding: "detailed", troubleshooting: "detailed", business: "professionalDraft",
  summarize: "concise", factualQuestion: "concise", task: "actionConfirmation",
};

export interface IntentGuess { primary: Intent; confidence: number; requiresTools: boolean; preferredMode: Mode; layer: "rule" | "default" }
export function detectIntent(text: string, channel: Channel): IntentGuess {
  const s = norm(text);
  const toks = new Set(tokens(text));
  let best: { rule: Rule; score: number } | null = null;
  for (const r of RULES) {
    let score = 0;
    for (const w of r.words) if (w.includes(" ") ? s.includes(w) : toks.has(w)) score += 1;
    for (const p of r.phrases ?? []) if (s.includes(p)) score += 2;
    if (score > 0 && (!best || score > best.score)) best = { rule: r, score };
  }
  if (channel === "floatingTranslation") return { primary: "translation", confidence: 0.9, requiresTools: false, preferredMode: "translation", layer: "rule" };
  if (!best) {
    const wc = tokens(text).length;
    const intent: Intent = text.trim().endsWith("?") ? "generalQuestion" : wc <= 2 ? "casualChat" : "ambiguous";
    return { primary: intent, confidence: 0.35, requiresTools: false, preferredMode: PREFERRED[intent] ?? "standard", layer: "default" };
  }
  const intent = best.rule.intent;
  return {
    primary: intent, confidence: Math.min(0.95, 0.5 + best.score * 0.15), requiresTools: !!best.rule.tools,
    preferredMode: PREFERRED[intent] ?? "standard", layer: "rule",
  };
}

/// Mode precedence mirrored here: admin intent override > brief-channel default
/// (voice/floating/notification/translation) > intent preferred mode > channel default.
export function selectMode(cfg: CosConfig, channel: Channel, intent: IntentGuess): { mode: Mode; why: string } {
  const io = cfg.intents?.[intent.primary]?.mode;
  if (io) return { mode: io, why: `intent profile for ${humanize(intent.primary)}` };
  const ch = effectiveChannel(cfg, channel);
  if (channel === "voice" || channel === "notification" || channel === "floating" || channel === "floatingTranslation") {
    return { mode: ch.defaultMode, why: `${humanize(channel)} channel default` };
  }
  if (intent.preferredMode !== "standard") return { mode: intent.preferredMode, why: `detected intent (${humanize(intent.primary)}) preferred mode` };
  return { mode: ch.defaultMode, why: `${humanize(channel)} channel default` };
}

// ---------------------------------------------------------------------------
// Composition (order is part of the contract: personality first, operational LAST)
// ---------------------------------------------------------------------------

export const COMPOSE_ORDER = ["personality", "channelRules", "intentRules", "languageRules", "userPreferenceRules", "modelAdapterRules", "operational"] as const;

function level(v: number, lo: string, mid: string, hi: string): string {
  return v < 0.34 ? lo : v < 0.67 ? mid : hi;
}
export function traitLines(traits: Record<Trait, number>): string[] {
  return [
    `Tone: ${level(traits.friendliness, "reserved", "friendly", "very friendly")} and ${level(traits.warmth, "neutral", "warm", "very warm")}.`,
    `Register: ${level(traits.formality, "casual", "balanced", "formal")}; stay ${level(traits.professionalism, "relaxed", "professional", "strictly professional")}.`,
    `Style: ${level(traits.directness, "gentle and indirect", "clear", "direct and to the point")}; ${level(traits.verbosity, "brief", "moderate length", "thorough")} answers.`,
    `Empathy: ${level(traits.empathy, "low-key", "acknowledge feelings briefly", "acknowledge feelings first")}. Humour: ${level(traits.humor, "none", "occasional", "playful")}.`,
    `Depth: ${level(traits.technicalDepth, "plain-language explanations", "balanced detail", "expert technical depth")}.`,
  ];
}

export interface PreviewInput {
  channel: Channel;
  intent: IntentGuess;
  language: LanguageResult;
  mode: Mode;
  adapterRules?: string;
  userPreference?: { length?: string; formality?: string; emoji?: string };
  operational?: string;
}
export interface Composed { personality: string; channelRules: string; intentRules: string; languageRules: string; userPreferenceRules: string; modelAdapterRules: string; operational: string; full: string }

export function compose(cfg: CosConfig, p: PreviewInput): Composed {
  const traits = effectiveTraits(cfg);
  const personality = [
    "You are Akaya.",
    (cfg.personalityText ?? "").trim(),
    ...traitLines(traits),
    ...(cfg.forbiddenPhrases?.length ? [`Never use these phrases: ${cfg.forbiddenPhrases.map((x) => `"${x}"`).join(", ")}.`] : []),
  ].filter(Boolean).join("\n");
  const ch = effectiveChannel(cfg, p.channel);
  const channelRules = [
    `Channel: ${humanize(p.channel)}. Response mode: ${humanize(p.mode)}.`,
    ch.maxSentences ? `Use at most ${ch.maxSentences} sentence${ch.maxSentences === 1 ? "" : "s"}.` : "",
    ch.allowMarkdown ? "" : "No markdown formatting.",
    ch.allowHeadings ? "" : "No headings.",
    ch.allowBullets ? "" : "No bullet lists.",
    ch.allowEmoji ? "Emoji are allowed sparingly." : "No emoji.",
    ch.readUrls ? "" : "Do not read URLs aloud.",
    ch.toneNote ? `Channel note: ${ch.toneNote}` : "",
  ].filter(Boolean).join("\n");
  const ip = cfg.intents?.[p.intent.primary];
  const intentRules = [
    `Detected intent: ${humanize(p.intent.primary)}.`,
    ip?.confirmationFirst ? "Ask for confirmation before acting; never claim an action is done until the tool confirms it." : "",
    ip?.toneNote ? `Intent note: ${ip.toneNote}` : "",
  ].filter(Boolean).join("\n");
  const langs = effectiveLanguages(cfg);
  const enabled = langs.enabled.includes(p.language.language);
  const target = enabled ? p.language.language : langs.fallback;
  const languageRules = target === "hinglish" ? "Reply in Hinglish (Hindi in Roman script), matching the user's mix."
    : target === "hi" ? "Reply in Hindi (Devanagari)." : target === "mixed" ? "Reply in the user's Hindi-English mix, matching their script."
      : target === "other" ? "Reply in the user's language." : "Reply in English.";
  const up = p.userPreference ?? {};
  const userPreferenceRules = [
    up.length ? `Preferred length: ${up.length}.` : "", up.formality ? `Preferred formality: ${up.formality} (never below professional).` : "",
    up.emoji ? `Emoji preference: ${up.emoji}.` : "",
  ].filter(Boolean).join("\n");
  const parts: Composed = {
    personality, channelRules, intentRules, languageRules, userPreferenceRules,
    modelAdapterRules: (p.adapterRules ?? "").trim(), operational: (p.operational ?? "").trim(), full: "",
  };
  parts.full = COMPOSE_ORDER.map((k) => (parts[k] ? parts[k] : "")).filter(Boolean).join("\n\n");
  return parts;
}

// ---------------------------------------------------------------------------
// Gate (representative subset)
// ---------------------------------------------------------------------------

export type ViolationCode =
  | "rude" | "condescending" | "wrongLanguage" | "irrelevant" | "repetition" | "identityLeak" | "unfinished" | "malformedJson"
  | "fakeActionSuccess" | "verbose" | "tooTerse" | "formatting" | "instructionFailure" | "rawMetadata" | "filler";

export interface CheckInput {
  candidate: string;
  userText: string;
  channel: Channel;
  mode: Mode;
  expectedLanguage: Language;
  actionRequested?: boolean;
  actionSucceeded?: boolean;
  jsonExpected?: boolean;
}
export interface Violation { code: ViolationCode; detail: string }
export interface GateReport {
  evaluated: boolean;
  pass: boolean;
  scores: Record<string, number>;
  thresholds: { name: Threshold; kind: "min" | "max"; limit: number; value: number; ok: boolean }[];
  violations: Violation[];
  repairRequired: boolean;
  note: string;
}

const RUDE = ["stupid", "idiot", "dumb", "shut up", "moron", "useless", "pathetic", "bakwas", "pagal", "bewakoof", "gadha"];
const CONDESCENDING = ["obviously", "as i already said", "like i said", "it's simple", "you should know", "as everyone knows", "clearly you"];
const FILLER = ["certainly!", "great question", "absolutely!", "sure thing!", "of course!", "i'd be happy to help", "as an ai", "i hope this helps", "feel free to ask"];
const IDENTITY = ["openai", "anthropic", "google deepmind", "i am gpt", "i'm gpt", "chatgpt", "i am claude", "i'm claude", "i am gemini", "i'm gemini", "language model", "trained by", "my system prompt", "my instructions are"];
const ACTION_DONE = ["i've sent", "i have sent", "message sent", "email sent", "reminder set", "i've set", "i have set", "i've called", "i've scheduled", "done!", "ho gaya", "bhej diya", "kar diya", "set kar diya"];
const META = ["<|im_start|>", "<|im_end|>", "[inst]", "[/inst]", "<s>", "###system", "role\":\"assistant", "role\": \"assistant", "tool_call_id"];

export function maxWordsForMode(mode: Mode, channel: Channel): number | null {
  let w: number | null = null;
  switch (mode) {
    case "instant": w = 25; break;
    case "concise": w = 50; break;
    case "spoken": w = 55; break;
    case "actionConfirmation": w = 30; break;
    case "standard": w = 220; break;
    default: w = null;
  }
  if (channel === "notification") w = w === null || w > 40 ? 40 : w;
  return w;
}

const hasAny = (s: string, list: string[]) => list.filter((x) => s.includes(x));
const hasMarkdown = (s: string) => /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|^\s*#{1,6}\s|\[[^\]]+\]\([^)]+\))/m.test(s);
const hasHeading = (s: string) => /^\s*#{1,6}\s/m.test(s);
const hasBullets = (s: string) => /^\s*([-*•]|\d+[.)])\s+\S/m.test(s);
function hasEmoji(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x1f300 && c <= 0x1faff) || (c >= 0x2600 && c <= 0x27bf)) return true;
  }
  return false;
}
const STOP = new Set([...EN_FN, ...HI_WEAK, "tell", "please", "kya", "hai", "ko", "ka", "ki", "ke"]);

export function checkResponse(cfg: CosConfig, input: CheckInput): GateReport {
  const q = effectiveQuality(cfg);
  const th = effectiveThresholds(cfg);
  if (!q.gateEnabled) {
    return { evaluated: false, pass: true, scores: {}, thresholds: [], violations: [], repairRequired: false, note: "The quality gate is switched off in this configuration, so nothing is evaluated." };
  }
  const out = input.candidate;
  const lower = norm(out);
  const ch = effectiveChannel(cfg, input.channel);
  const violations: Violation[] = [];
  const add = (code: ViolationCode, detail: string) => violations.push({ code, detail });
  const scores: Record<string, number> = {};

  // tone
  const rude = hasAny(lower, RUDE);
  const cond = hasAny(lower, CONDESCENDING);
  const rudeness = Math.min(1, rude.length * 0.5);
  scores.rudeness = rudeness;
  if (rude.length) add("rude", `Rude wording: ${rude.join(", ")}`);
  if (cond.length) add("condescending", `Condescending wording: ${cond.join(", ")}`);
  const filler = hasAny(lower, FILLER);
  if (filler.length) add("filler", `Filler / canned phrase: ${filler.join(", ")}`);
  scores.professionalism = Math.max(0, 1 - rude.length * 0.4 - cond.length * 0.2 - filler.length * 0.1);

  // forbidden phrases (admin-defined)
  for (const f of cfg.forbiddenPhrases ?? []) {
    if (lower.includes(norm(f))) add("instructionFailure", `Contains forbidden phrase "${f}"`);
  }
  // identity
  const idHits = hasAny(lower, IDENTITY);
  if (idHits.length) add("identityLeak", `Discloses model/vendor/prompt: ${idHits.join(", ")}`);
  // raw metadata
  const metaHits = hasAny(lower, META);
  if (metaHits.length) add("rawMetadata", `Raw protocol/metadata leaked: ${metaHits.join(", ")}`);

  // language
  const got = detectLanguage(out).language;
  const fam = (l: Language) => (l === "hi" || l === "hinglish" || l === "mixed" ? "hindi" : l);
  let langScore = 1;
  if (got !== input.expectedLanguage) langScore = fam(got) === fam(input.expectedLanguage) ? 0.7 : 0;
  if (input.expectedLanguage === "other") langScore = 1;
  scores.languageMatch = langScore;
  if (langScore < th.languageMatch) add("wrongLanguage", `Expected ${input.expectedLanguage}, response reads as ${got}`);

  // repetition
  const sents = sentencesOf(out).map((s) => norm(s).replace(/\s+/g, " "));
  const dup = sents.length - new Set(sents).size;
  const ts = tokens(out);
  const tri: string[] = [];
  for (let i = 0; i + 2 < ts.length; i++) tri.push(ts.slice(i, i + 3).join(" "));
  const triRepeat = tri.length ? 1 - new Set(tri).size / tri.length : 0;
  const repetition = Math.min(1, Math.max(sents.length > 1 ? dup / sents.length : 0, triRepeat));
  scores.repetition = Math.round(repetition * 100) / 100;
  if (repetition > th.repetition) add("repetition", `Repeats itself (${Math.round(repetition * 100)}% repeated)`);

  // relevance
  const userTokens = tokens(input.userText).filter((t) => t.length > 2 && !STOP.has(t));
  const outTokens = new Set(ts);
  const overlap = userTokens.filter((t) => outTokens.has(t)).length;
  const relevance = userTokens.length === 0 ? 1 : Math.min(1, overlap / Math.min(3, userTokens.length) + (ts.length >= 8 ? 0.15 : 0));
  scores.relevance = Math.round(Math.min(1, relevance) * 100) / 100;
  if (scores.relevance < th.relevance && ts.length > 0) add("irrelevant", "Shares almost no content with the question");

  // completion
  const trimmed = out.trim();
  const fences = (trimmed.match(/```/g) ?? []).length;
  const endsOk = /[.!?।)"'\]}:]$/.test(trimmed) || /\p{Extended_Pictographic}$/u.test(trimmed) || trimmed.length === 0;
  const trailing = /(\band\b|\bor\b|\bbut\b|\bthe\b|\bto\b|,|:|\.\.\.|…)$/i.test(trimmed);
  const unfinished = fences % 2 === 1 || (!endsOk && ts.length > 3) || trailing;
  scores.completion = unfinished ? 0.4 : 1;
  if (scores.completion < th.completion) add("unfinished", fences % 2 === 1 ? "Unclosed code block" : "Ends mid-sentence");
  if (trimmed === "") add("unfinished", "Empty response");

  // formatting vs channel
  let fmt = 1;
  const fmtIssues: string[] = [];
  if (!ch.allowMarkdown && hasMarkdown(out)) { fmt -= 0.4; fmtIssues.push("markdown"); }
  if (!ch.allowHeadings && hasHeading(out)) { fmt -= 0.3; fmtIssues.push("headings"); }
  if (!ch.allowBullets && hasBullets(out)) { fmt -= 0.3; fmtIssues.push("bullets"); }
  if (!ch.allowEmoji && hasEmoji(out)) { fmt -= 0.3; fmtIssues.push("emoji"); }
  if (!ch.readUrls && /https?:\/\//i.test(out)) { fmt -= 0.3; fmtIssues.push("URLs"); }
  scores.formatting = Math.max(0, Math.round(fmt * 100) / 100);
  if (scores.formatting < th.formatting) add("formatting", `Not allowed on ${humanize(input.channel)}: ${fmtIssues.join(", ")}`);

  // verbosity
  const words = ts.length;
  const budget = maxWordsForMode(input.mode, input.channel);
  if (budget !== null && words > budget * 1.5) add("verbose", `${words} words for a ${humanize(input.mode)} answer (budget about ${budget})`);
  const sentCount = sentencesOf(out).length;
  if (ch.maxSentences && sentCount > ch.maxSentences + 1) add("verbose", `${sentCount} sentences; this channel allows ${ch.maxSentences}`);
  if (words === 1 && input.mode !== "instant" && input.mode !== "concise" && wordCount(input.userText) > 4) add("tooTerse", "One word for a substantive question");

  // structure / action truth
  if (input.jsonExpected) {
    try { JSON.parse(trimmed); } catch { add("malformedJson", "Expected JSON but it does not parse"); }
  }
  if (input.actionRequested && !input.actionSucceeded && hasAny(lower, ACTION_DONE).length) {
    add("fakeActionSuccess", "Claims the action is done but the tool layer did not confirm it");
  }

  const prof = Math.round(scores.professionalism * 100) / 100;
  scores.professionalism = prof;
  const thresholds: GateReport["thresholds"] = [
    { name: "professionalism", kind: "min", limit: th.professionalism, value: prof, ok: prof >= th.professionalism },
    { name: "rudeness", kind: "max", limit: th.rudeness, value: rudeness, ok: rudeness <= th.rudeness },
    { name: "repetition", kind: "max", limit: th.repetition, value: scores.repetition, ok: scores.repetition <= th.repetition },
    { name: "languageMatch", kind: "min", limit: th.languageMatch, value: langScore, ok: langScore >= th.languageMatch },
    { name: "relevance", kind: "min", limit: th.relevance, value: scores.relevance, ok: scores.relevance >= th.relevance },
    { name: "completion", kind: "min", limit: th.completion, value: scores.completion, ok: scores.completion >= th.completion },
    { name: "formatting", kind: "min", limit: th.formatting, value: scores.formatting, ok: scores.formatting >= th.formatting },
  ];
  const pass = violations.length === 0;
  return {
    evaluated: true, pass, scores, thresholds, violations, repairRequired: !pass && q.repairEnabled,
    note: pass ? "Passed every check."
      : q.repairEnabled ? "Local deterministic repair would run first; a model repair (max one attempt) only if that cannot fix it."
        : "Repair is switched off: the response would be escalated or replaced by the fallback text.",
  };
}

// ---------------------------------------------------------------------------
// One-shot plan (what the Playground shows)
// ---------------------------------------------------------------------------

export interface PlanResult {
  language: LanguageResult;
  intent: IntentGuess;
  mode: Mode;
  modeWhy: string;
  composed: Composed;
  enabledLanguage: boolean;
}
export function plan(cfg: CosConfig, text: string, channel: Channel, opts: { previous?: Language; adapterRules?: string; operational?: string; userPreference?: PreviewInput["userPreference"] } = {}): PlanResult {
  const language = detectLanguage(text, opts.previous);
  const intent = detectIntent(text, channel);
  const { mode, why } = selectMode(cfg, channel, intent);
  const langs = effectiveLanguages(cfg);
  const composed = compose(cfg, { channel, intent, language, mode, adapterRules: opts.adapterRules, operational: opts.operational, userPreference: opts.userPreference });
  return { language, intent, mode, modeWhy: why, composed, enabledLanguage: langs.enabled.includes(language.language) };
}

export const PLAYGROUND_CHANNELS = CHANNELS;
export const PLAYGROUND_INTENTS = INTENTS;
