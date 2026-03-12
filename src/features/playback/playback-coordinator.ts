/**
 * PlaybackCoordinator: orchestrates a crossfade transition from music to DJ clip.
 *
 * State machine:
 *   idle → monitoring → fadingOut → playingDjClip → resumingPlayback → monitoring
 *
 * Instead of hard-pausing Spotify, we fade the music volume down and play
 * the DJ clip over the tail of the track, creating a smooth radio-style
 * crossfade. When the clip ends we fade the music back up and let it ride.
 *
 * Failure at any point restores volume and returns to monitoring.
 * Music playback is never blocked — if something goes wrong, we skip.
 */

import type { PlaybackCoordinatorState } from "@/types/playback";
import type { SpotifyPlayerService } from "@/features/spotify/spotify-player-service";
import type { DJAudioPlayer } from "@/features/voice/dj-audio-player";

/** Duration (ms) of the volume fade-out before the DJ clip starts */
const FADE_DURATION_MS = 3_000;
/** Number of discrete volume steps during the fade */
const FADE_STEPS = 15;
/** Volume level the music is "ducked" to while the DJ is talking */
const DUCKED_VOLUME = 0.08;
/** Duration (ms) to fade the music back up after the DJ clip */
const FADE_IN_DURATION_MS = 1_500;
const FADE_IN_STEPS = 8;

export interface PlaybackCoordinator {
  startMonitoring(): void;
  stopMonitoring(): void;
  executeTransition(djClipUrl: string): Promise<void>;
  getState(): PlaybackCoordinatorState;
  onStateChange(handler: (state: PlaybackCoordinatorState) => void): () => void;
}

class PlaybackCoordinatorImpl implements PlaybackCoordinator {
  private _state: PlaybackCoordinatorState = "idle";
  private stateHandlers: Array<(state: PlaybackCoordinatorState) => void> = [];
  private originalVolume = 0.8;

  constructor(
    private spotifyPlayer: SpotifyPlayerService,
    private djAudioPlayer: DJAudioPlayer,
  ) {}

  startMonitoring(): void {
    this.setState("monitoring");
  }

  stopMonitoring(): void {
    this.djAudioPlayer.stop();
    // Restore volume in case we're mid-transition
    this.spotifyPlayer.setVolume(this.originalVolume).catch(() => {});
    this.setState("idle");
  }

  /**
   * Execute a crossfade transition:
   *   1. Fade Spotify volume down over ~3 s
   *   2. Play DJ clip while music continues at ducked volume
   *   3. When clip finishes → fade volume back up on the already-playing track
   */
  async executeTransition(djClipUrl: string): Promise<void> {
    if (this._state !== "monitoring") {
      return;
    }

    try {
      // Remember the current volume so we can restore it
      try {
        this.originalVolume = await this.spotifyPlayer.getVolume();
      } catch {
        this.originalVolume = 0.8;
      }

      // ── Phase 1: Fade out ──────────────────────────────────────────────
      this.setState("fadingOut");
      try {
        await this.fadeVolume(this.originalVolume, DUCKED_VOLUME, FADE_DURATION_MS, FADE_STEPS);
      } catch (err) {
        console.warn("[PlaybackCoordinator] Fade-out failed, continuing anyway:", err);
      }

      // ── Phase 2: Play DJ clip over the ducked music ────────────────────
      this.setState("playingDjClip");
      try {
        await this.djAudioPlayer.play(djClipUrl);
      } catch (err) {
        console.warn("[PlaybackCoordinator] DJ clip playback failed:", err);
        // Fall through to restore volume and advance track
      }

      // ── Phase 3: Restore volume on the already-playing track ──────────
      this.setState("resumingPlayback");

      // Fade volume back up to the original level
      try {
        await this.fadeVolume(DUCKED_VOLUME, this.originalVolume, FADE_IN_DURATION_MS, FADE_IN_STEPS);
      } catch (err) {
        console.warn("[PlaybackCoordinator] Fade-in failed, snapping volume:", err);
        await this.spotifyPlayer.setVolume(this.originalVolume).catch(() => {});
      }

      this.setState("monitoring");
    } catch (err) {
      // Catch-all: always restore volume and return to monitoring
      console.error("[PlaybackCoordinator] Unexpected error in transition:", err);
      await this.spotifyPlayer.setVolume(this.originalVolume).catch(() => {});
      this.setState("monitoring");
    }
  }

  getState(): PlaybackCoordinatorState {
    return this._state;
  }

  onStateChange(handler: (state: PlaybackCoordinatorState) => void): () => void {
    this.stateHandlers.push(handler);
    return () => {
      this.stateHandlers = this.stateHandlers.filter((h) => h !== handler);
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  private setState(state: PlaybackCoordinatorState): void {
    this._state = state;
    this.stateHandlers.forEach((h) => h(state));
  }

  /**
   * Smoothly interpolate Spotify volume between two levels.
   * Returns a promise that resolves when the fade is complete.
   */
  private fadeVolume(from: number, to: number, durationMs: number, steps: number): Promise<void> {
    return new Promise<void>((resolve) => {
      let step = 0;
      const intervalMs = durationMs / steps;
      const delta = (to - from) / steps;

      const timer = setInterval(() => {
        step++;
        const volume = step >= steps ? to : from + delta * step;
        this.spotifyPlayer.setVolume(volume).catch(() => {});
        if (step >= steps) {
          clearInterval(timer);
          resolve();
        }
      }, intervalMs);
    });
  }
}

export function createPlaybackCoordinator(spotifyPlayer: SpotifyPlayerService, djAudioPlayer: DJAudioPlayer): PlaybackCoordinator {
  return new PlaybackCoordinatorImpl(spotifyPlayer, djAudioPlayer);
}
