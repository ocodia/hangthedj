/**
 * AppStore: centralized reactive state for HangTheDJ.
 * Simple event-emitter pattern — no external state library required.
 */

import { DEFAULT_SETTINGS } from '../features/storage/storage-service.js';

function createInitialStore() {
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
      coordinator: 'idle',
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
  constructor() {
    this.store = createInitialStore();
    this.listeners = new Map();
  }

  get(key) {
    return this.store[key];
  }

  update(key, patch) {
    this.store[key] = { ...this.store[key], ...patch };
    const sliceListeners = this.listeners.get(key);
    if (sliceListeners) {
      sliceListeners.forEach((listener) => listener(this.store[key]));
    }
  }

  subscribe(key, listener) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(listener);
    // Immediately emit current value
    listener(this.store[key]);
    return () => this.listeners.get(key)?.delete(listener);
  }

  reset() {
    this.store = createInitialStore();
    this.listeners.clear();
  }
}

export const appStore = new AppStoreImpl();

// ── Typed convenience accessors ───────────────────────────────────────────────

export function getAuthState() {
  return appStore.get('auth');
}

export function updateAuthState(patch) {
  appStore.update('auth', patch);
}

export function getSpotifyState() {
  return appStore.get('spotify');
}

export function updateSpotifyState(patch) {
  appStore.update('spotify', patch);
}

export function getPlaybackState() {
  return appStore.get('playback');
}

export function updatePlaybackState(patch) {
  appStore.update('playback', patch);
}

export function getSessionState() {
  return appStore.get('session');
}

export function updateSessionState(patch) {
  appStore.update('session', patch);
}

export function getSchedulerState() {
  return appStore.get('scheduler');
}

export function updateSchedulerState(patch) {
  appStore.update('scheduler', patch);
}

export function getRequestState() {
  return appStore.get('requests');
}

export function updateRequestState(patch) {
  appStore.update('requests', patch);
}

export function getPersonaState() {
  return appStore.get('persona');
}

export function updatePersonaState(patch) {
  appStore.update('persona', patch);
}

export function getAiState() {
  return appStore.get('ai');
}

export function updateAiState(patch) {
  appStore.update('ai', patch);
}

export function getSettings() {
  return appStore.get('settings');
}

export function updateSettings(patch) {
  appStore.update('settings', patch);
}

// ── DJ Activity Log helpers ───────────────────────────────────────────────────

export function getDjActivity() {
  return appStore.get('djActivity');
}

export function addDjActivityEntry(entry) {
  const current = appStore.get('djActivity');
  const newEntry = { ...entry, time: new Date().toLocaleTimeString() };
  appStore.update('djActivity', {
    entries: [newEntry, ...current.entries].slice(0, 50),
  });
}

export function clearDjActivity() {
  appStore.update('djActivity', { entries: [] });
}
