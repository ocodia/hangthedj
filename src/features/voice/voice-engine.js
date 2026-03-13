/**
 * VoiceEngine: renders DJ scripts to audio using OpenAI TTS.
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
  constructor(apiKey) {
    this.apiKey = apiKey;
  }

  async render(req) {
    const cacheKey = await hashString(`${req.text}|${req.voice}|${req.speechRate ?? 1.0}|${req.format}`);
    const cached = objectUrlCache.get(cacheKey);
    if (cached) return cached;

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

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const result = { blob, objectUrl, cacheKey };
    objectUrlCache.set(cacheKey, result);
    return result;
  }

  /** Revoke all object URLs to free memory. Call when the session ends. */
  clearCache() {
    objectUrlCache.forEach((result) => {
      URL.revokeObjectURL(result.objectUrl);
    });
    objectUrlCache.clear();
  }
}

export function createVoiceEngine(apiKey) {
  return new VoiceEngineImpl(apiKey);
}
