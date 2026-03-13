/**
 * AppShell: bootstraps and coordinates the entire HangTheDJ application.
 */

import {
  initStorage,
  loadSettings,
  saveSettings,
  hasOpenAIKey,
  getOpenAIKey,
  setOpenAIKey,
  clearOpenAIKey,
  hasElevenLabsKey,
  getElevenLabsKey,
  setElevenLabsKey,
  clearElevenLabsKey,
  setSpotifyClientId,
  clearSpotifyClientId,
  clearSpotifyTokens,
} from "../features/storage/storage-service.js";
import { createSpotifyAuthService } from "../features/spotify/spotify-auth-service.js";
import { createSpotifyPlayerService } from "../features/spotify/spotify-player-service.js";
import { createPersonaService } from "../features/personas/persona-service.js";
import { createRequestLineManager } from "../features/requests/request-line-manager.js";
import { createStationScheduler } from "../features/scheduler/station-scheduler.js";
import { createPlaybackCoordinator } from "../features/playback/playback-coordinator.js";
import { createDJAudioPlayer } from "../features/voice/dj-audio-player.js";
import { createBanterEngine } from "../features/banter/banter-engine.js";
import { createVoiceEngine } from "../features/voice/voice-engine.js";
import { updateAuthState, updateSpotifyState, updatePersonaState, updateAiState, updateSettings, getSettings } from "../stores/app-store.js";
import { renderApp } from "../ui/render.js";

export class AppShell {
  constructor() {
    this.services = null;
  }

  async init() {
    // 1. Initialize storage (opens IndexedDB)
    await initStorage();

    // 2. Restore settings from localStorage
    const settings = loadSettings();
    updateSettings(settings);

    // 3. Set up core services
    const spotifyAuth = createSpotifyAuthService();
    const spotifyPlayer = createSpotifyPlayerService();
    const personaService = createPersonaService();
    const requestManager = createRequestLineManager();
    const scheduler = createStationScheduler();
    const djPlayer = createDJAudioPlayer();
    const coordinator = createPlaybackCoordinator(spotifyPlayer, djPlayer);

    // 4. Seed preset personas
    await personaService.seedPresets();
    const personas = await personaService.getAll();
    updatePersonaState({ personas });

    // 5. Restore active persona
    const activePersonaId = settings.activePersonaId;
    if (activePersonaId) {
      const active = await personaService.getById(activePersonaId);
      if (active) updatePersonaState({ activePersona: active });
    }
    // Fall back to first preset if no active persona
    if (!getSettings().activePersonaId && personas.length > 0) {
      const first = personas[0];
      updatePersonaState({ activePersona: first });
      updateSettings({ activePersonaId: first.id });
      saveSettings({ ...settings, activePersonaId: first.id });
    }

    // 6. Set up AI services if key is present
    let banterEngine = null;
    let voiceEngine = null;
    const hasKey = hasOpenAIKey();
    const hasElKey = hasElevenLabsKey();
    updateAiState({
      hasOpenAiKey: hasKey,
      hasElevenLabsKey: hasElKey,
    });

    if (hasKey) {
      const key = getOpenAIKey();
      banterEngine = createBanterEngine(key, personaService);
      voiceEngine = createVoiceEngine(key, hasElKey ? getElevenLabsKey() : null);
    }

    this.services = {
      spotifyAuth,
      spotifyPlayer,
      personaService,
      requestManager,
      scheduler,
      coordinator,
      djPlayer,
      banterEngine,
      voiceEngine,
    };

    // 7. Handle Spotify PKCE callback if present
    const callbackHandled = await spotifyAuth.handleCallback(window.location.href);
    if (callbackHandled) {
      console.log("[AppShell] Spotify auth callback handled successfully");
    }

    // 8. Check auth state
    const isAuthenticated = spotifyAuth.isAuthenticated();
    if (isAuthenticated) {
      updateAuthState({ isAuthenticated: true });

      try {
        await spotifyPlayer.initialize(spotifyAuth);
        await spotifyPlayer.connect();
        updateSpotifyState({
          isConnected: true,
          deviceId: spotifyPlayer.getDeviceId(),
        });
        console.log("[AppShell] Spotify player connected, device:", spotifyPlayer.getDeviceId());
      } catch (err) {
        console.error("[AppShell] Spotify player init failed:", err);
      }
    }

    // 9. Mount the UI
    const app = document.getElementById("app");
    if (!app) throw new Error("No #app element found in DOM");

    const services = this.services;
    const callbacks = {
      onOpenAIKeySet: (key) => {
        setOpenAIKey(key);
        updateAiState({ hasOpenAiKey: true, lastError: null });
        if (services) {
          services.banterEngine = createBanterEngine(key, personaService);
          const elKey = hasElevenLabsKey() ? getElevenLabsKey() : null;
          services.voiceEngine = createVoiceEngine(key, elKey);
        }
      },
      onOpenAIKeyClear: () => {
        clearOpenAIKey();
        updateAiState({ hasOpenAiKey: false });
        if (services) {
          services.banterEngine = null;
          services.voiceEngine = null;
        }
      },
      onElevenLabsKeySet: (key) => {
        setElevenLabsKey(key);
        updateAiState({ hasElevenLabsKey: true });
        if (services?.voiceEngine) {
          services.voiceEngine.setElevenLabsConfig(key);
        }
      },
      onElevenLabsKeyClear: () => {
        clearElevenLabsKey();
        updateAiState({ hasElevenLabsKey: false });
        if (services?.voiceEngine) {
          services.voiceEngine.setElevenLabsConfig(null);
        }
      },
      getElevenLabsKey: () => getElevenLabsKey(),
      onLogin: () => spotifyAuth.login(),
      onLogout: () => {
        spotifyAuth.logout();
        updateAuthState({ isAuthenticated: false, userId: null, displayName: null });
      },
      onSpotifyClientIdSave: (id) => {
        setSpotifyClientId(id);
      },
      onSpotifyClientIdClear: () => {
        clearSpotifyClientId();
        clearSpotifyTokens();
        spotifyAuth.logout();
        updateAuthState({ isAuthenticated: false, userId: null, displayName: null });
      },
    };

    // Attach callbacks to services so components can access them
    services.callbacks = callbacks;

    renderApp(app, services, callbacks);
  }

  getServices() {
    return this.services;
  }
}
