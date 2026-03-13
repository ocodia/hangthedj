import type { Track } from "./track";
import type { Persona } from "./persona";

export type SegmentType =
  | "transition"
  | "requestAcknowledgement"
  | "requestRefusal"
  | "requestDeferment"
  | "vibeSetting"
  | "stationIdent"
  | "artistIntroduction"
  | "signOff";

export interface BanterRequest {
  persona: Persona;
  segmentType: SegmentType;
  stationMood?: string;
  currentTrack?: Track | null;
  /** Next track in queue — used for transition banter to hype the upcoming song */
  nextTrack?: Track | null;
  recentTracks: Track[];
  /** Compact summaries of pending/accepted requests */
  requestSummary: string[];
  /** Compact summaries of recent DJ lines */
  recentBanterSummaries: string[];
  constraints: BanterConstraints;
}

export interface BanterConstraints {
  maxWords: number;
  maxSeconds: number;
  familySafe: boolean;
  factualityMode: "playful" | "balanced" | "grounded";
}

export interface BanterResult {
  text: string;
  estimatedDurationSeconds: number;
  /** Short contextual tags for memory/repetition checks */
  tags: string[];
  /** Simple fingerprint for anti-repetition */
  fingerprint: string;
  /** System prompt sent to the model (for debug logging) */
  systemPrompt: string;
  /** User prompt sent to the model (for debug logging) */
  userPrompt: string;
}

export interface BanterEngine {
  generate(req: BanterRequest): Promise<BanterResult>;
}

export interface BanterHistoryRecord {
  id: string;
  sessionId: string;
  text: string;
  segmentType: SegmentType;
  estimatedDurationSeconds: number;
  tags: string[];
  fingerprint: string;
  generatedAt: string;
}
