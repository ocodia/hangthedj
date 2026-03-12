/**
 * NowPlayingBar: shows current track info from Spotify.
 */

import { appStore } from "@/stores/app-store";

export class NowPlayingBar {
  element: HTMLElement;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "now-playing-bar panel";
    this.render(null);

    appStore.subscribe("playback", (state) => {
      this.render(state.currentTrack);
    });
  }

  private render(track: { title: string; artistName: string; artworkUrl?: string } | null): void {
    if (!track) {
      this.element.innerHTML = `
        <div class="now-playing-empty muted">
          No track playing. Open Spotify and start playing music.
        </div>
      `;
      return;
    }

    this.element.innerHTML = `
      <div class="now-playing-content">
        ${track.artworkUrl ? `<img class="track-artwork" src="${track.artworkUrl}" alt="Album art" />` : ""}
        <div class="track-info">
          <span class="track-title">${escapeHtml(track.title)}</span>
          <span class="track-artist muted">${escapeHtml(track.artistName)}</span>
        </div>
        <div class="now-playing-label">♫ Now playing</div>
      </div>
    `;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
