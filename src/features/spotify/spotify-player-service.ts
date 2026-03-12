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
    seek(positionMs: number): Promise<void>;
    nextTrack(): Promise<void>;
    getCurrentState(): Promise<WebPlaybackState | null>;
    setVolume(volume: number): Promise<void>;
    getVolume(): Promise<number>;
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
  seek(positionMs: number): Promise<void>;
  nextTrack(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  getVolume(): Promise<number>;
  transferPlayback(): Promise<void>;
  onStateChange(handler: (state: PlaybackState) => void): () => void;
  onTrackChange(handler: (track: Track | null) => void): () => void;
  getDeviceId(): string | null;
  getNextTrack(): Track | null;
  fetchCurrentPosition(): Promise<{ progressMs: number; durationMs: number; isPlaying: boolean } | null>;
}

class SpotifyPlayerServiceImpl implements SpotifyPlayerService {
  private player: Spotify.Player | null = null;
  private authService: SpotifyAuthService | null = null;
  private deviceId: string | null = null;
  private currentState: PlaybackState | null = null;
  private currentTrack: Track | null = null;
  private nextTrack: Track | null = null;

  private stateChangeHandlers: Array<(state: PlaybackState) => void> = [];
  private trackChangeHandlers: Array<(track: Track | null) => void> = [];

  // Position interpolation: the SDK only reports position at state-change events,
  // so we record the timestamp and calculate real-time position ourselves.
  private lastPositionMs = 0;
  private lastPositionTimestamp = 0;
  private lastDurationMs = 0;
  private lastIsPlaying = false;

  async initialize(authService: SpotifyAuthService): Promise<void> {
    this.authService = authService;
    return new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Spotify SDK ready callback timed out after 10 seconds"));
      }, 10_000);

      // Set the ready callback BEFORE loading the SDK to avoid a race condition.
      // The SDK calls window.onSpotifyWebPlaybackSDKReady synchronously during
      // script execution, so it must already be defined when the script runs.
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

        // Connect immediately after setting up listeners so the "ready" event can fire.
        this.player.connect().then((ok) => {
          if (!ok) reject(new Error("Spotify player failed to connect"));
        });
      };

      // Load the SDK after the callback is in place
      this.loadSdk().catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  async connect(): Promise<void> {
    // connect() is now called inside initialize(), so this is a no-op
    // if the player is already connected.
    if (this.deviceId) return;
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

  async seek(positionMs: number): Promise<void> {
    if (!this.player) throw new Error("Player not initialized");
    await this.player.seek(positionMs);
  }

  async nextTrack(): Promise<void> {
    if (!this.player) throw new Error("Player not initialized");
    await this.player.nextTrack();
  }

  async setVolume(volume: number): Promise<void> {
    if (!this.player) throw new Error("Player not initialized");
    await this.player.setVolume(Math.max(0, Math.min(1, volume)));
  }

  async getVolume(): Promise<number> {
    if (!this.player) throw new Error("Player not initialized");
    return this.player.getVolume();
  }

  async resume(): Promise<void> {
    if (!this.player) throw new Error("Player not initialized");
    await this.player.resume();
  }

  /**
   * Transfer Spotify playback to the HangTheDJ device using the Web API.
   * If the user has music playing elsewhere, it moves here.
   * If nothing is playing, it activates this device so play commands work.
   */
  async transferPlayback(): Promise<void> {
    if (!this.deviceId) throw new Error("No device ID — player not ready");
    if (!this.authService) throw new Error("Auth service not available");

    const token = await this.authService.getAccessToken();
    if (!token) throw new Error("No access token available");

    const res = await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        device_ids: [this.deviceId],
        play: true,
      }),
    });

    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`Transfer playback failed: ${res.status} ${text}`);
    }

    console.log("[SpotifyPlayer] Playback transferred to HangTheDJ device");
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

  getNextTrack(): Track | null {
    return this.nextTrack;
  }

  async fetchCurrentPosition(): Promise<{ progressMs: number; durationMs: number; isPlaying: boolean } | null> {
    // If we haven't received any state events yet, fall back to SDK query
    if (this.lastPositionTimestamp === 0) {
      if (!this.player) return null;
      const state = await this.player.getCurrentState();
      if (!state) return null;
      // Seed interpolation state from this first query
      this.lastPositionMs = state.position;
      this.lastDurationMs = state.duration;
      this.lastIsPlaying = !state.paused;
      this.lastPositionTimestamp = Date.now();
      return {
        progressMs: state.position,
        durationMs: state.duration,
        isPlaying: !state.paused,
      };
    }

    // Interpolate: real position = last known + elapsed time (if playing)
    const elapsed = this.lastIsPlaying ? Date.now() - this.lastPositionTimestamp : 0;
    const progressMs = Math.min(this.lastPositionMs + elapsed, this.lastDurationMs);

    return {
      progressMs,
      durationMs: this.lastDurationMs,
      isPlaying: this.lastIsPlaying,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private handleStateChange(sdkState: Spotify.WebPlaybackState): void {
    const sdkTrack = sdkState.track_window.current_track;
    const track = sdkTrack ? this.normalizeTrack(sdkTrack) : null;

    // Capture next track from the SDK track window
    const sdkNextTrack = sdkState.track_window.next_tracks[0];
    this.nextTrack = sdkNextTrack ? this.normalizeTrack(sdkNextTrack) : null;

    // Update interpolation state on every SDK event
    this.lastPositionMs = sdkState.position;
    this.lastDurationMs = sdkState.duration;
    this.lastIsPlaying = !sdkState.paused;
    this.lastPositionTimestamp = Date.now();

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
      script.onerror = () => reject(new Error("Failed to load Spotify Web Playback SDK — check network or ad blocker"));
      document.body.appendChild(script);
    });
  }
}

export function createSpotifyPlayerService(): SpotifyPlayerService {
  return new SpotifyPlayerServiceImpl();
}
