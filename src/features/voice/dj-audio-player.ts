/**
 * DJAudioPlayer: plays generated DJ audio clips using HTMLAudioElement.
 *
 * Separate from Spotify audio — this plays the TTS-generated clips.
 * Emits events when playback completes or fails.
 */

export interface DJAudioPlayer {
  play(objectUrl: string): Promise<void>;
  stop(): void;
  isPlaying(): boolean;
  setVolume(volume: number): void;
  getVolume(): number;
}

class DJAudioPlayerImpl implements DJAudioPlayer {
  private audio: HTMLAudioElement | null = null;
  private _isPlaying = false;
  private _volume = 1.0;

  async play(objectUrl: string): Promise<void> {
    this.stop(); // Cancel any in-progress playback

    return new Promise<void>((resolve, reject) => {
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

      audio.play().catch((err: unknown) => {
        this._isPlaying = false;
        this.audio = null;
        reject(err);
      });
    });
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    this._isPlaying = false;
  }

  isPlaying(): boolean {
    return this._isPlaying;
  }

  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume));
    if (this.audio) {
      this.audio.volume = this._volume;
    }
  }

  getVolume(): number {
    return this._volume;
  }
}

export function createDJAudioPlayer(): DJAudioPlayer {
  return new DJAudioPlayerImpl();
}
