/**
 * AppShell: bootstraps and coordinates the entire HangTheDJ application.
 *
 * Responsibilities:
 * - Initialize storage
 * - Restore auth and settings
 * - Seed preset personas
 * - Handle Spotify PKCE callback
 * - Mount the UI
 * - Wire up services
 */

import { initStorage } from "@/features/storage/storage-service";
import {
  loadSettings,
  saveSettings,
  hasOpenAIKey,
  getOpenAIKey,
  setOpenAIKey,
  clearOpenAIKey,
} from "@/features/storage/storage-service";
import { createSpotifyAuthService } from "@/features/spotify/spotify-auth-service";
import { createSpotifyPlayerService } from "@/features/spotify/spotify-player-service";
import { createPersonaService } from "@/features/personas/persona-service";
import { createRequestLineManager } from "@/features/requests/request-line-manager";
import { createStationScheduler } from "@/features/scheduler/station-scheduler";
import { createPlaybackCoordinator } from "@/features/playback/playback-coordinator";
import { createDJAudioPlayer } from "@/features/voice/dj-audio-player";
import { createBanterEngine } from "@/features/banter/banter-engine";
import { createVoiceEngine } from "@/features/voice/voice-engine";
import {
  updateAuthState,
  updatePersonaState,
  updateAiState,
  updateSettings,
  getSettings,
} from "@/stores/app-store";
import { renderApp } from "@/ui/render";
import type { SpotifyAuthService } from "@/features/spotify/spotify-auth-service";
import type { SpotifyPlayerService } from "@/features/spotify/spotify-player-service";
import type { PersonaService } from "@/features/personas/persona-service";
import type { RequestLineManager } from "@/features/requests/request-line-manager";
import type { StationScheduler } from "@/features/scheduler/station-scheduler";
import type { PlaybackCoordinator } from "@/features/playback/playback-coordinator";
import type { DJAudioPlayer } from "@/features/voice/dj-audio-player";
import type { BanterEngine } from "@/types/banter";
import type { VoiceEngineWithCleanup } from "@/features/voice/voice-engine";

export interface AppServices {
  spotifyAuth: SpotifyAuthService;
  spotifyPlayer: SpotifyPlayerService;
  personaService: PersonaService;
  requestManager: RequestLineManager;
  scheduler: StationScheduler;
  coordinator: PlaybackCoordinator;
  djPlayer: DJAudioPlayer;
  banterEngine: BanterEngine | null;
  voiceEngine: VoiceEngineWithCleanup | null;
}

export class AppShell {
  private services: AppServices | null = null;

  async init(): Promise<void> {
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
    let banterEngine: BanterEngine | null = null;
    let voiceEngine: VoiceEngineWithCleanup | null = null;
    const hasKey = hasOpenAIKey();
    updateAiState({ hasOpenAiKey: hasKey });

    if (hasKey) {
      const key = getOpenAIKey()!;
      banterEngine = createBanterEngine(key, personaService);
      voiceEngine = createVoiceEngine(key);
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
    }

    // 9. Mount the UI (pass services for wiring)
    const app = document.getElementById("app");
    if (!app) throw new Error("No #app element found in DOM");

    renderApp(app, this.services, {
      onOpenAIKeySet: (key: string) => {
        setOpenAIKey(key);
        updateAiState({ hasOpenAiKey: true, lastError: null });
        // Reinitialize AI services with new key
        if (this.services) {
          this.services.banterEngine = createBanterEngine(key, personaService);
          this.services.voiceEngine = createVoiceEngine(key);
        }
      },
      onOpenAIKeyClear: () => {
        clearOpenAIKey();
        updateAiState({ hasOpenAiKey: false });
        if (this.services) {
          this.services.banterEngine = null;
          this.services.voiceEngine = null;
        }
      },
      onLogin: () => spotifyAuth.login(),
      onLogout: () => {
        spotifyAuth.logout();
        updateAuthState({ isAuthenticated: false, userId: null, displayName: null });
      },
    });
  }

  getServices(): AppServices | null {
    return this.services;
  }
}
