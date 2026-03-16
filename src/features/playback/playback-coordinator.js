/**
 * PlaybackCoordinator: orchestrates DJ transitions over Spotify playback.
 *
 * State machine:
 *   idle → monitoring → fadingOut → playingDjClip → holdingNextTrack? → resumingPlayback → monitoring
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
    this.activeTransition = null;
  }

  setTargetVolume(volume) {
    this.originalVolume = volume;
  }

  startMonitoring() {
    this._setState("monitoring");
  }

  stopMonitoring() {
    this.activeTransition = null;
    this.djAudioPlayer.stop();
    this.spotifyPlayer.setVolume(this.originalVolume).catch(() => {});
    this._setState("idle");
  }

  async executeTransition(transition) {
    if (this._state !== "monitoring") {
      return;
    }

    const activeTransition = {
      id: crypto.randomUUID(),
      mode: transition.transitionMode ?? "overlay",
      fadeBackTo: this.originalVolume,
      duckedVolume: DUCKED_VOLUME,
      waitingForBoundary: (transition.transitionMode ?? "overlay") === "hold-next-track",
      pausedNextTrack: false,
    };

    this.activeTransition = activeTransition;

    try {
      this._setState("fadingOut");
      await this._fadeVolume(activeTransition.fadeBackTo, activeTransition.duckedVolume, FADE_DURATION_MS, FADE_STEPS);

      if (this.activeTransition !== activeTransition) return;

      this._setState("playingDjClip");

      if (activeTransition.mode === "hold-next-track") {
        void this.djAudioPlayer
          .play(transition.objectUrl)
          .then(() => this._finishHoldTransition(activeTransition))
          .catch((err) => {
            console.warn("[PlaybackCoordinator] DJ clip playback failed:", err);
            return this._finishHoldTransition(activeTransition);
          });
        return;
      }

      await this.djAudioPlayer.play(transition.objectUrl);
      await this._finishTransition(activeTransition, false);
    } catch (err) {
      console.error("[PlaybackCoordinator] Unexpected error in transition:", err);
      if (this.activeTransition === activeTransition) {
        await this.spotifyPlayer.setVolume(this.originalVolume).catch(() => {});
        this.activeTransition = null;
      }
      this._setState("monitoring");
    }
  }

  async handleTrackBoundary() {
    const activeTransition = this.activeTransition;
    if (!activeTransition || activeTransition.mode !== "hold-next-track") {
      return false;
    }

    activeTransition.waitingForBoundary = false;

    if (activeTransition.pausedNextTrack) {
      return true;
    }

    this._setState("holdingNextTrack");
    try {
      await this.spotifyPlayer.pause();
      activeTransition.pausedNextTrack = true;
    } catch (err) {
      console.warn("[PlaybackCoordinator] Failed to pause next track:", err);
    }

    return true;
  }

  isCarryingTransitionAcrossBoundary() {
    return !!(
      this.activeTransition &&
      this.activeTransition.mode === "hold-next-track" &&
      (this.activeTransition.waitingForBoundary || this.activeTransition.pausedNextTrack)
    );
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

  async _finishHoldTransition(activeTransition) {
    if (this.activeTransition !== activeTransition) return;
    activeTransition.waitingForBoundary = false;
    await this._finishTransition(activeTransition, activeTransition.pausedNextTrack);
  }

  async _finishTransition(activeTransition, resumePlayback) {
    if (this.activeTransition !== activeTransition) return;

    this._setState("resumingPlayback");
    try {
      if (resumePlayback) {
        await this.spotifyPlayer.setVolume(activeTransition.fadeBackTo).catch(() => {});
        await this.spotifyPlayer.resume().catch(() => {});
        this.volumeHandlers.forEach((handler) => handler(activeTransition.fadeBackTo));
      } else {
        await this._fadeVolume(activeTransition.duckedVolume, activeTransition.fadeBackTo, FADE_IN_DURATION_MS, FADE_IN_STEPS);
      }
    } finally {
      if (this.activeTransition === activeTransition) {
        this.activeTransition = null;
      }
      this._setState("monitoring");
    }
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
