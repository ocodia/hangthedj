import type { Track } from "./track";

export type PlaybackCoordinatorState =
  | "idle"
  | "monitoring"
  | "preparingTransition"
  | "waitingForInsertionPoint"
  | "pausingPlayback"
  | "playingDjClip"
  | "resumingPlayback";

export interface PlaybackState {
  isPlaying: boolean;
  progressMs: number;
  volume?: number;
  track: Track | null;
  deviceName?: string;
  /** True when the DJ has caused the pause (not the user) */
  isDjPause: boolean;
}
