/**
 * DJAudioPlayer: plays generated DJ audio clips using HTMLAudioElement.
 */

class DJAudioPlayerImpl {
  constructor() {
    this.audio = null;
    this._isPlaying = false;
    this._volume = 1.0;
  }

  async play(objectUrl) {
    this.stop();

    return new Promise((resolve, reject) => {
      const audio = new Audio(objectUrl);
      audio.volume = this._volume;
      this.audio = audio;
      this._isPlaying = true;

      audio.onended = () => {
        this._isPlaying = false;
        this.audio = null;
        resolve();
      };

      audio.onerror = (e) => {
        this._isPlaying = false;
        this.audio = null;
        reject(new Error(`DJAudioPlayer: audio playback failed: ${String(e)}`));
      };

      audio.play().catch((err) => {
        this._isPlaying = false;
        this.audio = null;
        reject(err);
      });
    });
  }

  /**
   * Play audio and invoke a callback N seconds before it ends.
   * Returns a promise that resolves when playback finishes.
   */
  async playWithFadeCallback(objectUrl, secondsBefore, callback) {
    this.stop();

    return new Promise((resolve, reject) => {
      const audio = new Audio(objectUrl);
      audio.volume = this._volume;
      this.audio = audio;
      this._isPlaying = true;
      let callbackFired = false;

      audio.onended = () => {
        this._isPlaying = false;
        this.audio = null;
        if (!callbackFired) {
          callbackFired = true;
          callback();
        }
        resolve();
      };

      audio.onerror = (e) => {
        this._isPlaying = false;
        this.audio = null;
        reject(new Error(`DJAudioPlayer: audio playback failed: ${String(e)}`));
      };

      audio.ontimeupdate = () => {
        if (callbackFired) return;
        if (audio.duration && audio.currentTime >= audio.duration - secondsBefore) {
          callbackFired = true;
          callback();
        }
      };

      audio.play().catch((err) => {
        this._isPlaying = false;
        this.audio = null;
        reject(err);
      });
    });
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    this._isPlaying = false;
  }

  isPlaying() {
    return this._isPlaying;
  }

  setVolume(volume) {
    this._volume = Math.max(0, Math.min(1, volume));
    if (this.audio) {
      this.audio.volume = this._volume;
    }
  }

  getVolume() {
    return this._volume;
  }
}

export function createDJAudioPlayer() {
  return new DJAudioPlayerImpl();
}
