/**
 * PlaybackCoordinator: orchestrates a crossfade transition from music to DJ clip.
 *
 * State machine:
 *   idle → monitoring → fadingOut → playingDjClip → resumingPlayback → monitoring
 */

const FADE_DURATION_MS = 3_000;
const FADE_STEPS = 15;
const DUCKED_VOLUME = 0.2;
const FADE_IN_DURATION_MS = 1_500;
const FADE_IN_STEPS = 8;

class PlaybackCoordinatorImpl {
  constructor(spotifyPlayer, djAudioPlayer) {
    this._state = "idle";
    this.stateHandlers = [];
    this.volumeHandlers = [];
    this.originalVolume = 1.0;
    this.spotifyPlayer = spotifyPlayer;
    this.djAudioPlayer = djAudioPlayer;
  }

  setTargetVolume(volume) {
    this.originalVolume = volume;
  }

  startMonitoring() {
    this._setState("monitoring");
  }

  stopMonitoring() {
    this.djAudioPlayer.stop();
    this.spotifyPlayer.setVolume(this.originalVolume).catch(() => {});
    this._setState("idle");
  }

  async executeTransition(djClipUrl) {
    if (this._state !== "monitoring") {
      return;
    }

    try {
      const fadeBackTo = this.originalVolume;

      // Phase 1: Fade out
      this._setState("fadingOut");
      try {
        await this._fadeVolume(fadeBackTo, DUCKED_VOLUME, FADE_DURATION_MS, FADE_STEPS);
      } catch (err) {
        console.warn("[PlaybackCoordinator] Fade-out failed, continuing anyway:", err);
      }

      // Phase 2: Play DJ clip over the ducked music
      this._setState("playingDjClip");
      try {
        await this.djAudioPlayer.play(djClipUrl);
      } catch (err) {
        console.warn("[PlaybackCoordinator] DJ clip playback failed:", err);
      }

      // Phase 3: Restore volume
      this._setState("resumingPlayback");
      try {
        await this._fadeVolume(DUCKED_VOLUME, fadeBackTo, FADE_IN_DURATION_MS, FADE_IN_STEPS);
      } catch (err) {
        console.warn("[PlaybackCoordinator] Fade-in failed, snapping volume:", err);
        await this.spotifyPlayer.setVolume(fadeBackTo).catch(() => {});
      }

      this._setState("monitoring");
    } catch (err) {
      console.error("[PlaybackCoordinator] Unexpected error in transition:", err);
      await this.spotifyPlayer.setVolume(this.originalVolume).catch(() => {});
      this._setState("monitoring");
    }
  }

  getState() {
    return this._state;
  }

  onStateChange(handler) {
    this.stateHandlers.push(handler);
    return () => {
      this.stateHandlers = this.stateHandlers.filter((h) => h !== handler);
    };
  }

  onVolumeChange(handler) {
    this.volumeHandlers.push(handler);
    return () => {
      this.volumeHandlers = this.volumeHandlers.filter((h) => h !== handler);
    };
  }

  _setState(state) {
    this._state = state;
    this.stateHandlers.forEach((h) => h(state));
  }

  _fadeVolume(from, to, durationMs, steps) {
    return new Promise((resolve) => {
      let step = 0;
      const intervalMs = durationMs / steps;
      const delta = (to - from) / steps;

      const timer = setInterval(() => {
        step++;
        const volume = step >= steps ? to : from + delta * step;
        this.spotifyPlayer.setVolume(volume).catch(() => {});
        this.volumeHandlers.forEach((h) => h(volume));
        if (step >= steps) {
          clearInterval(timer);
          resolve();
        }
      }, intervalMs);
    });
  }
}

export function createPlaybackCoordinator(spotifyPlayer, djAudioPlayer) {
  return new PlaybackCoordinatorImpl(spotifyPlayer, djAudioPlayer);
}
