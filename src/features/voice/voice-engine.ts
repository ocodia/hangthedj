/**
 * VoiceEngine: renders DJ scripts to audio using OpenAI TTS.
 *
 * Audio is returned as a Blob + object URL for HTMLAudioElement playback.
 * Rendered clips are optionally cached in Cache Storage.
 *
 * The OpenAI key is user-supplied and passed at construction.
 *
 * TODO: Validate CORS behaviour for OpenAI TTS from browser context.
 * TODO: Implement Cache Storage persistence for rendered clips (v1 does in-memory only).
 */

import OpenAI from "openai";
import type { VoiceEngine as IVoiceEngine, VoiceRenderRequest, VoiceRenderResult } from "@/types/voice";

// Simple hash for cache keys
async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// In-memory cache of object URLs for the current session
const objectUrlCache = new Map<string, VoiceRenderResult>();

class VoiceEngineImpl implements IVoiceEngine {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  async render(req: VoiceRenderRequest): Promise<VoiceRenderResult> {
    const cacheKey = await hashString(
      `${req.text}|${req.voice}|${req.speechRate ?? 1.0}|${req.format}`
    );

    // Return cached result if available
    const cached = objectUrlCache.get(cacheKey);
    if (cached) return cached;

    const response = await this.client.audio.speech.create({
      model: "tts-1",
      input: req.text,
      voice: req.voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
      response_format: req.format === "mp3" ? "mp3" : "opus",
      speed: req.speechRate ?? 1.0,
    });

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const result: VoiceRenderResult = {
      blob,
      objectUrl,
      cacheKey,
    };

    objectUrlCache.set(cacheKey, result);
    return result;
  }

  /** Revoke all object URLs to free memory. Call when the session ends. */
  clearCache(): void {
    objectUrlCache.forEach((result) => {
      URL.revokeObjectURL(result.objectUrl);
    });
    objectUrlCache.clear();
  }
}

export interface VoiceEngineWithCleanup extends IVoiceEngine {
  clearCache(): void;
}

export function createVoiceEngine(apiKey: string): VoiceEngineWithCleanup {
  return new VoiceEngineImpl(apiKey);
}
