/**
 * AppStore: centralized reactive state for HangTheDJ.
 *
 * Uses a simple event-emitter pattern — no external state library required.
 * Components subscribe to specific slices and receive updates when they change.
 *
 * All mutation goes through update() to ensure consistent notification.
 */

import type {
  AppStore,
  AuthState,
  SpotifyState,
  AppPlaybackState,
  SessionState,
  SchedulerState,
  RequestState,
  PersonaState,
  AiState,
  DjActivityEntry,
  DjActivityState,
} from "@/types/store";
import type { AppSettings } from "@/types/settings";
import { DEFAULT_SETTINGS } from "@/types/settings";

type StoreListener<T> = (value: T) => void;
type SliceKey = keyof AppStore;

function createInitialStore(): AppStore {
  return {
    auth: {
      isAuthenticated: false,
      userId: null,
      displayName: null,
    },
    spotify: {
      isConnected: false,
      deviceId: null,
      deviceName: null,
    },
    playback: {
      coordinator: "idle",
      spotify: null,
      currentTrack: null,
      recentTracks: [],
      progressMs: 0,
      durationMs: 0,
      nextTrack: null,
    },
    session: {
      activeSession: null,
      isRunning: false,
    },
    scheduler: {
      lastInsertionAt: null,
      tracksSinceLastInsert: 0,
      lastSegmentType: null,
    },
    requests: {
      requests: [],
      pendingCount: 0,
    },
    persona: {
      personas: [],
      activePersona: null,
    },
    ai: {
      hasOpenAiKey: false,
      isGenerating: false,
      isRendering: false,
      lastError: null,
    },
    settings: { ...DEFAULT_SETTINGS },
    djActivity: {
      entries: [],
    },
  };
}

class AppStoreImpl {
  private store: AppStore = createInitialStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private listeners = new Map<SliceKey, Set<StoreListener<any>>>();

  get<K extends SliceKey>(key: K): AppStore[K] {
    return this.store[key];
  }

  update<K extends SliceKey>(key: K, patch: Partial<AppStore[K]>): void {
    this.store[key] = { ...this.store[key], ...patch };
    const sliceListeners = this.listeners.get(key);
    if (sliceListeners) {
      sliceListeners.forEach((listener) => listener(this.store[key]));
    }
  }

  subscribe<K extends SliceKey>(key: K, listener: StoreListener<AppStore[K]>): () => void {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(listener);
    // Immediately emit current value
    listener(this.store[key]);
    return () => this.listeners.get(key)?.delete(listener);
  }

  reset(): void {
    this.store = createInitialStore();
    this.listeners.clear();
  }
}

// Singleton store instance
export const appStore = new AppStoreImpl();

// ──────────────────────────────────────────────────────────────────────────────
// Typed convenience accessors
// ──────────────────────────────────────────────────────────────────────────────

export function getAuthState(): AuthState {
  return appStore.get("auth");
}

export function updateAuthState(patch: Partial<AuthState>): void {
  appStore.update("auth", patch);
}

export function getSpotifyState(): SpotifyState {
  return appStore.get("spotify");
}

export function updateSpotifyState(patch: Partial<SpotifyState>): void {
  appStore.update("spotify", patch);
}

export function getPlaybackState(): AppPlaybackState {
  return appStore.get("playback");
}

export function updatePlaybackState(patch: Partial<AppPlaybackState>): void {
  appStore.update("playback", patch);
}

export function getSessionState(): SessionState {
  return appStore.get("session");
}

export function updateSessionState(patch: Partial<SessionState>): void {
  appStore.update("session", patch);
}

export function getSchedulerState(): SchedulerState {
  return appStore.get("scheduler");
}

export function updateSchedulerState(patch: Partial<SchedulerState>): void {
  appStore.update("scheduler", patch);
}

export function getRequestState(): RequestState {
  return appStore.get("requests");
}

export function updateRequestState(patch: Partial<RequestState>): void {
  appStore.update("requests", patch);
}

export function getPersonaState(): PersonaState {
  return appStore.get("persona");
}

export function updatePersonaState(patch: Partial<PersonaState>): void {
  appStore.update("persona", patch);
}

export function getAiState(): AiState {
  return appStore.get("ai");
}

export function updateAiState(patch: Partial<AiState>): void {
  appStore.update("ai", patch);
}

export function getSettings(): AppSettings {
  return appStore.get("settings");
}

export function updateSettings(patch: Partial<AppSettings>): void {
  appStore.update("settings", patch);
}

// ──────────────────────────────────────────────────────────────────────────────
// DJ Activity Log helpers
// ──────────────────────────────────────────────────────────────────────────────

export function getDjActivity(): DjActivityState {
  return appStore.get("djActivity");
}

export function addDjActivityEntry(entry: Omit<DjActivityEntry, "time">): void {
  const current = appStore.get("djActivity");
  const newEntry: DjActivityEntry = { ...entry, time: new Date().toLocaleTimeString() };
  appStore.update("djActivity", {
    entries: [newEntry, ...current.entries].slice(0, 50),
  });
}

export function clearDjActivity(): void {
  appStore.update("djActivity", { entries: [] });
}
