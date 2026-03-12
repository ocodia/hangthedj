import type { Track } from "./track";

export type StationMood =
  | "late-night"
  | "upbeat"
  | "nostalgic"
  | "focus"
  | "indie-evening"
  | "freestyle";

export interface SessionRecord {
  id: string;
  startedAt: string;
  endedAt?: string;
  mood: StationMood;
  /** Free-text mood prompt passed to the banter engine */
  moodPrompt?: string;
  personaId: string;
}

export interface SessionMemory {
  sessionId: string;
  /** Last N tracks played */
  recentTracks: Track[];
  /** Short summaries/topics of recent DJ lines */
  recentBanterSummaries: string[];
  /** IDs of recently referenced requests */
  recentRequestIds: string[];
  /** IDs of fulfilled requests */
  fulfilledRequestIds: string[];
  /** Simple string fingerprints for anti-repetition */
  phraseFingerprints: string[];
  updatedAt: string;
}
