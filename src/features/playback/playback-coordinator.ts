/**
 * PlaybackCoordinator: orchestrates the pause → DJ clip → resume flow.
 *
 * State machine:
 *   idle → monitoring → preparingTransition → waitingForInsertionPoint
 *       → pausingPlayback → playingDjClip → resumingPlayback → monitoring
 *
 * Failure at any point cancels the transition and returns to monitoring.
 * Music playback is never blocked — if something goes wrong, we skip.
 */

import type { PlaybackCoordinatorState } from "@/types/playback";
import type { SpotifyPlayerService } from "@/features/spotify/spotify-player-service";
import type { DJAudioPlayer } from "@/features/voice/dj-audio-player";

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

  constructor(
    private spotifyPlayer: SpotifyPlayerService,
    private djAudioPlayer: DJAudioPlayer
  ) {}

  startMonitoring(): void {
    this.setState("monitoring");
  }

  stopMonitoring(): void {
    this.djAudioPlayer.stop();
    this.setState("idle");
  }

  /**
   * Execute a full pause → DJ clip → resume transition.
   * If any step fails, the transition is cancelled and music resumes.
   */
  async executeTransition(djClipUrl: string): Promise<void> {
    if (this._state !== "monitoring") {
      // Another transition may be in progress or the coordinator is idle
      return;
    }

    try {
      // Pause Spotify
      this.setState("pausingPlayback");
      try {
        await this.spotifyPlayer.pause();
      } catch (err) {
        console.warn("[PlaybackCoordinator] Pause failed, skipping transition:", err);
        this.setState("monitoring");
        return;
      }

      // Play DJ clip
      this.setState("playingDjClip");
      try {
        await this.djAudioPlayer.play(djClipUrl);
      } catch (err) {
        console.warn("[PlaybackCoordinator] DJ clip playback failed:", err);
        // Fall through to resume music regardless
      }

      // Skip to next track and resume Spotify.
      // We don't just resume() because there may be a tail-end of the old
      // track left — skipping ensures a clean start on the next track.
      this.setState("resumingPlayback");
      try {
        await this.spotifyPlayer.nextTrack();
      } catch (err) {
        console.warn("[PlaybackCoordinator] nextTrack failed, trying resume:", err);
        try {
          await this.spotifyPlayer.resume();
        } catch (resumeErr) {
          console.error("[PlaybackCoordinator] Resume also failed:", resumeErr);
        }
      }

      this.setState("monitoring");
    } catch (err) {
      // Catch-all: always return to monitoring
      console.error("[PlaybackCoordinator] Unexpected error in transition:", err);
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

  private setState(state: PlaybackCoordinatorState): void {
    this._state = state;
    this.stateHandlers.forEach((h) => h(state));
  }
}

export function createPlaybackCoordinator(
  spotifyPlayer: SpotifyPlayerService,
  djAudioPlayer: DJAudioPlayer
): PlaybackCoordinator {
  return new PlaybackCoordinatorImpl(spotifyPlayer, djAudioPlayer);
}
