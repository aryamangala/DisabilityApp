import * as Speech from "expo-speech";

const voiceCache = new Map();
let playbackToken = 0;

function mapAppLanguageToVoice(language) {
  const normalized = (language || "").toLowerCase();
  if (normalized.startsWith("en")) return "en-US";
  return "es-ES";
}

function normalizeLanguageTag(languageTag) {
  return (languageTag || "").toLowerCase().replace("_", "-");
}

function scoreVoice(voice = {}) {
  const quality = String(voice.quality || "").toLowerCase();
  const name = String(voice.name || "").toLowerCase();
  const identifier = String(voice.identifier || "").toLowerCase();

  let score = 0;

  if (quality.includes("enhanced") || quality.includes("premium")) score += 8;
  if (quality.includes("high")) score += 5;
  if (name.includes("neural") || name.includes("natural")) score += 6;
  if (name.includes("enhanced") || name.includes("premium")) score += 4;
  if (identifier.includes("google")) score += 2;
  if (voice.networkConnectionRequired === false) score += 1;

  return score;
}

function splitIntoSpeakableParts(text) {
  // Shorter parts improve pause cadence and reduce robotic run-on delivery.
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getBestVoiceIdentifier(languageTag) {
  const normalized = normalizeLanguageTag(languageTag);
  if (voiceCache.has(normalized)) {
    return voiceCache.get(normalized);
  }

  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const baseLang = normalized.split("-")[0];
    const candidates = (voices || []).filter((voice) => {
      const voiceLang = normalizeLanguageTag(voice.language);
      return voiceLang === normalized || voiceLang.startsWith(`${baseLang}-`);
    });

    if (!candidates.length) {
      voiceCache.set(normalized, null);
      return null;
    }

    const bestVoice = candidates.sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
    const selected = bestVoice?.identifier || null;
    voiceCache.set(normalized, selected);
    return selected;
  } catch {
    voiceCache.set(normalized, null);
    return null;
  }
}

export async function stopSpeech() {
  playbackToken += 1;
  await Speech.stop();
}

export function getSpeechLanguage(language) {
  return mapAppLanguageToVoice(language);
}

export async function speakText(
  text,
  { language = "es", rate = 0.9, onStart, onDone, onPartStart } = {}
) {
  const trimmedText = (text || "").trim();
  if (!trimmedText) return;

  await stopSpeech();
  const sessionToken = playbackToken;
  const voiceLanguage = mapAppLanguageToVoice(language);
  const bestVoiceIdentifier = await getBestVoiceIdentifier(voiceLanguage);
  const parts = splitIntoSpeakableParts(trimmedText);
  const speakParts = parts.length ? parts : [trimmedText];

  return speakPartsList(speakParts, {
    sessionToken,
    language: voiceLanguage,
    rate,
    voiceIdentifier: bestVoiceIdentifier,
    onStart,
    onDone,
    onPartStart
  });
}

export async function speakSentenceList(
  sentences,
  { language = "es", rate = 0.9, onStart, onDone, onPartStart } = {}
) {
  const cleanSentences = (Array.isArray(sentences) ? sentences : [])
    .map((sentence) => (sentence || "").trim())
    .filter(Boolean);

  if (!cleanSentences.length) return;

  await stopSpeech();
  const sessionToken = playbackToken;

  const voiceLanguage = mapAppLanguageToVoice(language);
  const bestVoiceIdentifier = await getBestVoiceIdentifier(voiceLanguage);

  return speakPartsList(cleanSentences, {
    sessionToken,
    language: voiceLanguage,
    rate,
    voiceIdentifier: bestVoiceIdentifier,
    onStart,
    onDone,
    onPartStart
  });
}

async function speakPartsList(
  parts,
  { sessionToken, language, rate, voiceIdentifier, onStart, onDone, onPartStart }
) {
  const speakParts = (Array.isArray(parts) ? parts : []).filter(Boolean);
  if (!speakParts.length) return;

  const isCancelled = () => sessionToken !== playbackToken;

  let started = false;
  for (let i = 0; i < speakParts.length; i += 1) {
    if (isCancelled()) return;
    const part = speakParts[i];

    await new Promise((resolve, reject) => {
      Speech.speak(part, {
        language,
        voice: voiceIdentifier || undefined,
        rate,
        pitch: 1.0,
        onStart: () => {
          if (!started && typeof onStart === "function") {
            started = true;
            onStart();
          }

          if (typeof onPartStart === "function") {
            onPartStart(i);
          }
        },
        onDone: () => {
          resolve();
        },
        onStopped: () => {
          resolve();
        },
        onError: (error) => {
          if (isCancelled()) {
            resolve();
            return;
          }
          reject(error);
        }
      });
    });

    if (isCancelled()) return;

    if (i < speakParts.length - 1) {
      await delay(120);
    }
  }

  if (isCancelled()) return;
  if (typeof onDone === "function") onDone();
}
