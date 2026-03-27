/**
 * PlaybackCoordinator: orchestrates DJ transitions over Spotify playback.
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
      duckedVolume: (transition.transitionMode ?? "overlay") === "pause-and-duck" ? 0 : DUCKED_VOLUME,
      pausedSpotify: false,
      pausedTrackId: this.spotifyPlayer.getCurrentTrack()?.id ?? null,
      expectedNextTrackId: this.spotifyPlayer.getNextTrack()?.id ?? null,
    };

    this.activeTransition = activeTransition;

    try {
      this._setState("fadingOut");
      await this._fadeVolume(activeTransition.fadeBackTo, activeTransition.duckedVolume, FADE_DURATION_MS, FADE_STEPS);

      if (this.activeTransition !== activeTransition) return;

      this._setState("playingDjClip");

      if (activeTransition.mode === "pause-and-duck") {
        try {
          await this.spotifyPlayer.pause();
          activeTransition.pausedSpotify = true;
        } catch (err) {
          console.warn("[PlaybackCoordinator] Failed to pause Spotify before DJ clip:", err);
        }
      }

      try {
        await this.djAudioPlayer.play(transition.objectUrl);
      } catch (err) {
        console.warn("[PlaybackCoordinator] DJ clip playback failed:", err);
      }

      await this._finishTransition(activeTransition);
    } catch (err) {
      console.error("[PlaybackCoordinator] Unexpected error in transition:", err);
      if (this.activeTransition === activeTransition) {
        await this.spotifyPlayer.setVolume(this.originalVolume).catch(() => {});
        this.activeTransition = null;
      }
      this._setState("monitoring");
    }
  }

  isCarryingTransitionAcrossBoundary() {
    return false;
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

  async _finishTransition(activeTransition) {
    if (this.activeTransition !== activeTransition) return;

    this._setState("resumingPlayback");
    try {
      if (activeTransition.pausedSpotify) {
        await this.spotifyPlayer.setVolume(0).catch(() => {});
        const advancedToNextTrack = await this._prepareNextTrack(activeTransition);
        if (!advancedToNextTrack) {
          console.warn("[PlaybackCoordinator] Falling back to resuming paused track after banter");
        }
        await this.spotifyPlayer.resume().catch(() => {});
      }
      await this._fadeVolume(activeTransition.duckedVolume, activeTransition.fadeBackTo, FADE_IN_DURATION_MS, FADE_IN_STEPS);
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

  async _prepareNextTrack(activeTransition) {
    const currentTrackId = this.spotifyPlayer.getCurrentTrack()?.id ?? null;
    const shouldAdvance =
      !!activeTransition.pausedTrackId &&
      currentTrackId === activeTransition.pausedTrackId;

    if (!shouldAdvance) {
      return currentTrackId !== activeTransition.pausedTrackId;
    }

    try {
      await this.spotifyPlayer.nextTrack();
    } catch (err) {
      console.warn("[PlaybackCoordinator] Failed to skip to next Spotify track before resume:", err);
      return false;
    }

    return this._waitForTrackReady(activeTransition);
  }

  _waitForTrackReady(activeTransition) {
    return new Promise((resolve) => {
      const timeoutMs = 2_500;
      const startedAt = Date.now();
      let settled = false;
      let timeoutId = null;
      let unsubscribe = () => {};

      const finish = (ready) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        resolve(ready);
      };

      const checkReady = () => {
        const currentTrackId = this.spotifyPlayer.getCurrentTrack()?.id ?? null;
        const expectedNextTrackId = activeTransition.expectedNextTrackId;
        const movedOffPausedTrack =
          !!activeTransition.pausedTrackId && currentTrackId !== activeTransition.pausedTrackId;
        const reachedExpectedTrack =
          !!expectedNextTrackId && currentTrackId === expectedNextTrackId;

        if (reachedExpectedTrack || movedOffPausedTrack) {
          finish(true);
          return true;
        }

        if (Date.now() - startedAt >= timeoutMs) {
          finish(false);
          return true;
        }

        return false;
      };

      if (checkReady()) {
        return;
      }

      unsubscribe = this.spotifyPlayer.onStateChange(() => {
        if (checkReady()) {
          return;
        }
      });

      timeoutId = window.setTimeout(() => {
        checkReady();
      }, timeoutMs);
    });
  }
}

export function createPlaybackCoordinator(spotifyPlayer, djAudioPlayer) {
  return new PlaybackCoordinatorImpl(spotifyPlayer, djAudioPlayer);
}
