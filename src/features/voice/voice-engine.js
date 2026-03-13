/**
 * VoiceEngine: renders DJ scripts to audio using OpenAI TTS or ElevenLabs TTS.
 * Uses fetch() directly — no npm dependency needed.
 */

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const objectUrlCache = new Map();

class VoiceEngineImpl {
  constructor(apiKey, elevenLabsKey = null, elevenLabsVoiceId = null) {
    this.apiKey = apiKey;
    this.elevenLabsKey = elevenLabsKey;
    this.elevenLabsVoiceId = elevenLabsVoiceId;
  }

  setElevenLabsConfig(key, voiceId) {
    this.elevenLabsKey = key;
    this.elevenLabsVoiceId = voiceId;
  }

  _useElevenLabs() {
    return !!(this.elevenLabsKey && this.elevenLabsVoiceId);
  }

  async render(req) {
    const provider = this._useElevenLabs() ? 'elevenlabs' : 'openai';
    const cacheKey = await hashString(`${provider}|${req.text}|${req.voice}|${req.speechRate ?? 1.0}|${req.format}`);
    const cached = objectUrlCache.get(cacheKey);
    if (cached) return cached;

    const blob = this._useElevenLabs()
      ? await this._renderElevenLabs(req)
      : await this._renderOpenAI(req);

    const objectUrl = URL.createObjectURL(blob);
    const result = { blob, objectUrl, cacheKey };
    objectUrlCache.set(cacheKey, result);
    return result;
  }

  async _renderOpenAI(req) {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: req.text,
        voice: req.voice,
        response_format: req.format === 'mp3' ? 'mp3' : 'opus',
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
    const voiceId = this.elevenLabsVoiceId;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.elevenLabsKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: req.text,
        model_id: 'eleven_multilingual_v2',
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

export function createVoiceEngine(apiKey, elevenLabsKey = null, elevenLabsVoiceId = null) {
  return new VoiceEngineImpl(apiKey, elevenLabsKey, elevenLabsVoiceId);
}

/**
 * Search ElevenLabs voices by name.
 * Returns an array of { voice_id, name, category, labels, preview_url }.
 */
export async function searchElevenLabsVoices(apiKey, query) {
  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    method: 'GET',
    headers: {
      'xi-api-key': apiKey,
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
  return voices.filter((v) =>
    v.name.toLowerCase().includes(lower) ||
    (v.labels && Object.values(v.labels).some((l) => l.toLowerCase().includes(lower)))
  );
}
