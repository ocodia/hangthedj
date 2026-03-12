import type { PlaybackState, PlaybackCoordinatorState } from "./playback";
import type { Track } from "./track";
import type { Persona } from "./persona";
import type { SessionRecord } from "./session";
import type { ListenerRequest } from "./request";
import type { SegmentType } from "./banter";
import type { AppSettings } from "./settings";

export interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  displayName: string | null;
}

export interface SpotifyState {
  isConnected: boolean;
  deviceId: string | null;
  deviceName: string | null;
}

export interface AppPlaybackState {
  coordinator: PlaybackCoordinatorState;
  spotify: PlaybackState | null;
  currentTrack: Track | null;
  recentTracks: Track[];
}

export interface SessionState {
  activeSession: SessionRecord | null;
  isRunning: boolean;
}

export interface SchedulerState {
  lastInsertionAt: number | null;
  tracksSinceLastInsert: number;
  lastSegmentType: SegmentType | null;
}

export interface RequestState {
  requests: ListenerRequest[];
  pendingCount: number;
}

export interface PersonaState {
  personas: Persona[];
  activePersona: Persona | null;
}

export interface AiState {
  hasOpenAiKey: boolean;
  isGenerating: boolean;
  isRendering: boolean;
  lastError: string | null;
}

export interface DjActivityEntry {
  time: string;
  text: string;
  type: "dj" | "system" | "error" | "track";
}

export interface DjActivityState {
  entries: DjActivityEntry[];
}

export interface AppStore {
  auth: AuthState;
  spotify: SpotifyState;
  playback: AppPlaybackState;
  session: SessionState;
  scheduler: SchedulerState;
  requests: RequestState;
  persona: PersonaState;
  ai: AiState;
  settings: AppSettings;
  djActivity: DjActivityState;
}
