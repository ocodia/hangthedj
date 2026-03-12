/**
 * SpotifyPlayerService: wraps the Spotify Web Playback SDK.
 *
 * Responsibilities:
 * - load and initialize the Spotify Web Playback SDK
 * - expose normalized playback state and track changes
 * - expose pause/resume controls for the playback coordinator
 * - emit events when state changes
 *
 * NOTE: The Web Playback SDK is only available for Spotify Premium accounts.
 * NOTE: The SDK is loaded dynamically from sdk.scdn.co — a network request is required.
 *
 * TODO: Test iOS Safari autoplay behaviour — user gesture may be required
 *       before the SDK can start playing audio.
 * TODO: Handle device transfer (user switches to another Spotify device mid-session).
 */

import type { Track } from "@/types/track";
import type { PlaybackState } from "@/types/playback";
import type { SpotifyAuthService } from "./spotify-auth-service";

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void;
    Spotify: typeof Spotify;
  }
}

// Minimal Spotify SDK types (not all fields — expand as needed)
declare namespace Spotify {
  interface Player {
    addListener(event: string, callback: (data: unknown) => void): void;
    removeListener(event: string): void;
    connect(): Promise<boolean>;
    disconnect(): void;
    pause(): Promise<void>;
    resume(): Promise<void>;
    getCurrentState(): Promise<WebPlaybackState | null>;
  }
  interface PlayerOptions {
    name: string;
    getOAuthToken: (cb: (token: string) => void) => void;
    volume?: number;
  }
  interface WebPlaybackState {
    paused: boolean;
    position: number;
    duration: number;
    track_window: {
      current_track: WebPlaybackTrack;
    };
  }
  interface WebPlaybackTrack {
    id: string;
    name: string;
    uri: string;
    duration_ms: number;
    album: {
      name: string;
      images: Array<{ url: string }>;
    };
    artists: Array<{ name: string }>;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Player: new (options: PlayerOptions) => Player;
}

const SDK_SCRIPT_URL = "https://sdk.scdn.co/spotify-player.js";

export interface SpotifyPlayerService {
  initialize(authService: SpotifyAuthService): Promise<void>;
  connect(): Promise<void>;
  disconnect(): void;
  getCurrentTrack(): Track | null;
  getPlaybackState(): PlaybackState | null;
  pause(): Promise<void>;
  resume(): Promise<void>;
  onStateChange(handler: (state: PlaybackState) => void): () => void;
  onTrackChange(handler: (track: Track | null) => void): () => void;
  getDeviceId(): string | null;
}

class SpotifyPlayerServiceImpl implements SpotifyPlayerService {
  private player: Spotify.Player | null = null;
  private deviceId: string | null = null;
  private currentState: PlaybackState | null = null;
  private currentTrack: Track | null = null;

  private stateChangeHandlers: Array<(state: PlaybackState) => void> = [];
  private trackChangeHandlers: Array<(track: Track | null) => void> = [];

  async initialize(authService: SpotifyAuthService): Promise<void> {
    await this.loadSdk();

    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Spotify SDK ready callback timed out after 10 seconds"));
      }, 10_000);

      window.onSpotifyWebPlaybackSDKReady = () => {
        clearTimeout(timeoutId);
        this.player = new window.Spotify.Player({
          name: "HangTheDJ",
          getOAuthToken: async (cb) => {
            const token = await authService.getAccessToken();
            if (token) cb(token);
          },
          volume: 0.8,
        });

        this.player.addListener("ready", (data) => {
          const { device_id } = data as { device_id: string };
          this.deviceId = device_id;
          console.log("[SpotifyPlayer] Ready, device ID:", device_id);
          resolve();
        });

        this.player.addListener("not_ready", () => {
          console.warn("[SpotifyPlayer] Device not ready");
          this.deviceId = null;
        });

        this.player.addListener("player_state_changed", (state) => {
          if (!state) return;
          this.handleStateChange(state as Spotify.WebPlaybackState);
        });

        this.player.addListener("authentication_error", (err) => {
          console.error("[SpotifyPlayer] Auth error:", err);
          reject(new Error("Spotify authentication error"));
        });

        this.player.addListener("account_error", (err) => {
          console.error("[SpotifyPlayer] Account error (Premium required?):", err);
          reject(new Error("Spotify account error — Premium required for browser playback"));
        });
      };
    });
  }

  async connect(): Promise<void> {
    if (!this.player) throw new Error("Player not initialized");
    const ok = await this.player.connect();
    if (!ok) throw new Error("Spotify player failed to connect");
  }

  disconnect(): void {
    this.player?.disconnect();
    this.deviceId = null;
    this.currentState = null;
    this.currentTrack = null;
  }

  getCurrentTrack(): Track | null {
    return this.currentTrack;
  }

  getPlaybackState(): PlaybackState | null {
    return this.currentState;
  }

  async pause(): Promise<void> {
    if (!this.player) throw new Error("Player not initialized");
    await this.player.pause();
  }

  async resume(): Promise<void> {
    if (!this.player) throw new Error("Player not initialized");
    await this.player.resume();
  }

  onStateChange(handler: (state: PlaybackState) => void): () => void {
    this.stateChangeHandlers.push(handler);
    return () => {
      this.stateChangeHandlers = this.stateChangeHandlers.filter((h) => h !== handler);
    };
  }

  onTrackChange(handler: (track: Track | null) => void): () => void {
    this.trackChangeHandlers.push(handler);
    return () => {
      this.trackChangeHandlers = this.trackChangeHandlers.filter((h) => h !== handler);
    };
  }

  getDeviceId(): string | null {
    return this.deviceId;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private handleStateChange(sdkState: Spotify.WebPlaybackState): void {
    const sdkTrack = sdkState.track_window.current_track;
    const track = sdkTrack ? this.normalizeTrack(sdkTrack) : null;

    const state: PlaybackState = {
      isPlaying: !sdkState.paused,
      progressMs: sdkState.position,
      track,
      isDjPause: false, // PlaybackCoordinator sets this when it causes a pause
    };

    const prevTrackId = this.currentTrack?.id;
    this.currentState = state;
    this.currentTrack = track;

    // Notify state change handlers
    this.stateChangeHandlers.forEach((h) => h(state));

    // Notify track change handlers only when track actually changes
    if (track?.id !== prevTrackId) {
      this.trackChangeHandlers.forEach((h) => h(track));
    }
  }

  private normalizeTrack(sdkTrack: Spotify.WebPlaybackTrack): Track {
    return {
      id: sdkTrack.id,
      title: sdkTrack.name,
      artistName: sdkTrack.artists.map((a) => a.name).join(", "),
      albumName: sdkTrack.album.name,
      durationMs: sdkTrack.duration_ms,
      artworkUrl: sdkTrack.album.images[0]?.url,
      uri: sdkTrack.uri,
    };
  }

  private loadSdk(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (document.querySelector(`script[src="${SDK_SCRIPT_URL}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = SDK_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Failed to load Spotify Web Playback SDK — check network or ad blocker"));
      document.body.appendChild(script);
    });
  }
}

export function createSpotifyPlayerService(): SpotifyPlayerService {
  return new SpotifyPlayerServiceImpl();
}
