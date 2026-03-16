/**
 * VoiceEngine: renders DJ scripts to audio using OpenAI TTS or ElevenLabs TTS.
 * Uses fetch() directly — no npm dependency needed.
 */

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

const objectUrlCache = new Map();

function measureAudioDuration(objectUrl) {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";

    const cleanup = () => {
      audio.onloadedmetadata = null;
      audio.onerror = null;
      audio.src = "";
    };

    audio.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(audio.duration) ? audio.duration : null;
      cleanup();
      resolve(durationSeconds);
    };

    audio.onerror = () => {
      cleanup();
      resolve(null);
    };

    audio.src = objectUrl;
  });
}

class VoiceEngineImpl {
  constructor(apiKey, elevenLabsKey = null) {
    this.apiKey = apiKey;
    this.elevenLabsKey = elevenLabsKey;
  }

  setElevenLabsConfig(key) {
    this.elevenLabsKey = key;
  }

  _useElevenLabs(req) {
    return !!(this.elevenLabsKey && req.elevenLabsVoiceId);
  }

  async render(req) {
    const useEL = this._useElevenLabs(req);
    const provider = useEL ? "elevenlabs" : "openai";
    const voiceId = useEL ? req.elevenLabsVoiceId : req.voice;
    const cacheKey = await hashString(`${provider}|${req.text}|${voiceId}|${req.speechRate ?? 1.0}|${req.format}`);
    const cached = objectUrlCache.get(cacheKey);
    if (cached) return cached;

    const blob = useEL ? await this._renderElevenLabs(req) : await this._renderOpenAI(req);

    const objectUrl = URL.createObjectURL(blob);
    const durationSeconds = await measureAudioDuration(objectUrl);
    const result = { blob, objectUrl, cacheKey, durationSeconds };
    objectUrlCache.set(cacheKey, result);
    return result;
  }

  async _renderOpenAI(req) {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: req.text,
        voice: req.voice,
        response_format: req.format === "mp3" ? "mp3" : "opus",
        speed: req.speechRate ?? 1.0,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI TTS error ${response.status}: ${errText}`);
    }

    return response.blob();
  }

  async _renderElevenLabs(req) {
    const voiceId = req.elevenLabsVoiceId;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        "xi-api-key": this.elevenLabsKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: req.text,
        model_id: "eleven_multilingual_v2",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs TTS error ${response.status}: ${errText}`);
    }

    return response.blob();
  }

  /** Revoke all object URLs to free memory. Call when the session ends. */
  clearCache() {
    objectUrlCache.forEach((result) => {
      URL.revokeObjectURL(result.objectUrl);
    });
    objectUrlCache.clear();
  }
}

export function createVoiceEngine(apiKey, elevenLabsKey = null) {
  return new VoiceEngineImpl(apiKey, elevenLabsKey);
}

/**
 * Search ElevenLabs voices by name.
 * Returns an array of { voice_id, name, category, labels, preview_url }.
 */
export async function searchElevenLabsVoices(apiKey, query) {
  const response = await fetch("https://api.elevenlabs.io/v1/voices", {
    method: "GET",
    headers: {
      "xi-api-key": apiKey,
    },
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const voices = data.voices || [];

  if (!query || !query.trim()) return voices;

  const lower = query.toLowerCase();
  return voices.filter(
    (v) => v.name.toLowerCase().includes(lower) || (v.labels && Object.values(v.labels).some((l) => l.toLowerCase().includes(lower))),
  );
}
