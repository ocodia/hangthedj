export interface VoiceRenderRequest {
  text: string;
  voice: string;
  /** 0.5–2.0, default 1.0 */
  speechRate?: number;
  /** Style hint passed to the TTS (future use) */
  styleHint?: string;
  format: "mp3" | "opus" | "aac" | "flac";
}

export interface VoiceRenderResult {
  blob: Blob;
  /** Object URL for HTMLAudioElement playback — must be revoked when done */
  objectUrl: string;
  durationSeconds?: number;
  /** Hash-based key for caching */
  cacheKey: string;
}

export interface VoiceEngine {
  render(req: VoiceRenderRequest): Promise<VoiceRenderResult>;
}

export interface ClipMetadataRecord {
  /** Same as cacheKey */
  id: string;
  banterId: string;
  durationSeconds: number;
  voice: string;
  format: string;
  /** Cache Storage URL if persisted */
  cacheUrl?: string;
  createdAt: string;
}
