/**
 * NowPlayingBar: shows current track info from Spotify.
 */

import { appStore, updatePlaybackState } from "../../stores/app-store.js";

export class NowPlayingBar {
  constructor(services) {
    this.services = services;
    this.element = document.createElement("div");
    this.element.className = "now-playing-bar panel";
    this._render(appStore.get("playback"));

    appStore.subscribe("playback", (state) => {
      this._render(state);
    });
    appStore.subscribe("session", () => {
      this._render(appStore.get("playback"));
    });

    if (services?.spotifyPlayer) {
      services.spotifyPlayer.onStateChange((state) => {
        updatePlaybackState({ isPlaying: state.isPlaying });
      });
    }
  }

  _render(playback) {
    const track = playback.currentTrack;
    if (!track) {
      this.element.innerHTML = `
        <div class="now-playing-empty muted">
          No track playing. Open Spotify and start playing music.
        </div>
      `;
      return;
    }

    const remainingMs = playback.durationMs - playback.progressMs;
    const remainingSec = Math.max(0, Math.round(remainingMs / 1000));
    const progressSec = Math.round(playback.progressMs / 1000);
    const durationSec = Math.round(playback.durationMs / 1000);
    const pct = playback.durationMs > 0 ? Math.min(100, (playback.progressMs / playback.durationMs) * 100) : 0;

    const nextTrack = playback.nextTrack;
    const coordinatorState = playback.coordinator;

    this.element.innerHTML = `
      <div class="now-playing-content">
        ${track.artworkUrl ? `<img class="track-artwork" src="${track.artworkUrl}" alt="Album art" />` : ""}
        <div class="track-info">
          <span class="track-title">${escapeHtml(track.title)}</span>
          <span class="track-artist muted">${escapeHtml(track.artistName)}</span>
          <div class="track-progress">
            <div class="track-progress-bar">
              <div class="track-progress-fill" style="width: ${pct.toFixed(1)}%"></div>
            </div>
            <span class="track-time muted">${formatTime(progressSec)} / ${formatTime(durationSec)}  ·  ${remainingSec}s left</span>
          </div>
        </div>
        <div class="now-playing-meta">
          <div class="now-playing-label">♫ Now playing</div>
          <div class="debug-info muted">
            <span class="debug-coordinator" title="Coordinator state">${coordinatorState}</span>
          </div>
          ${nextTrack ? `<div class="next-track-info muted" title="Next in queue">⏭ ${escapeHtml(nextTrack.title)} — ${escapeHtml(nextTrack.artistName)}</div>` : ""}
        </div>
      </div>
    `;
  }
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
