/**
 * AuthPanel: shown before Spotify login.
 *
 * - Shows app branding
 * - Spotify login button
 * - Brief description of what the app does
 */

import type { AppCallbacks } from "@/ui/render";

export class AuthPanel {
  element: HTMLElement;

  constructor(private callbacks: AppCallbacks) {
    this.element = document.createElement("div");
    this.element.className = "auth-panel";
    this.render();
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="auth-container">
        <div class="auth-logo">🎧</div>
        <h1 class="auth-title">HangTheDJ</h1>
        <p class="auth-tagline">Your personal AI radio station</p>
        <p class="auth-description">
          Sign in with Spotify to start your AI-DJ experience.<br>
          <span class="muted">Spotify Premium required for in-browser playback.</span>
        </p>
        <button class="btn-spotify" id="btn-login">
          <span>Connect with Spotify</span>
        </button>
        <p class="auth-note muted">
          HangTheDJ uses your Spotify account for playback only.<br>
          No data is stored on any server.
        </p>
      </div>
    `;

    this.element
      .querySelector("#btn-login")
      ?.addEventListener("click", () => this.callbacks.onLogin());
  }
}
