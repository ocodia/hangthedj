/**
 * AuthPanel: shown before Spotify login.
 * Shows a 2-step flow:
 *   1. If no Spotify client ID stored: show setup form
 *   2. If client ID exists: show Connect with Spotify button
 */

import { hasSpotifyClientId } from '../../features/storage/storage-service.js';

export class AuthPanel {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.element = document.createElement('div');
    this.element.className = 'auth-panel';
    this.render();
  }

  render() {
    if (!hasSpotifyClientId()) {
      this.renderSetup();
    } else {
      this.renderLogin();
    }
  }

  renderSetup() {
    this.element.innerHTML = `
      <div class="auth-container">
        <div class="auth-logo">🎧</div>
        <h1 class="auth-title">HangTheDJ</h1>
        <p class="auth-tagline">Your personal AI radio station</p>
        <p class="auth-description">
          To get started, you need a free Spotify Developer App.<br>
          <span class="muted">Create one at <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com/dashboard</a></span>
        </p>
        <ol class="setup-steps muted" style="text-align:left;margin:1rem auto;max-width:360px;font-size:0.85rem">
          <li>Create a new app at the Spotify Developer Dashboard</li>
          <li>Set the Redirect URI to: <code id="redirect-uri-display" style="word-break:break-all;color:var(--color-accent)"></code></li>
          <li>Copy your Client ID and paste it below</li>
        </ol>
        <div class="field" style="max-width:360px;margin:0 auto">
          <label for="spotify-client-id">Spotify Client ID</label>
          <input type="text" id="spotify-client-id" placeholder="Enter your Spotify Client ID" autocomplete="off" />
        </div>
        <button id="btn-save-client-id" style="margin-top:1rem">Continue →</button>
        <p class="auth-note muted" style="margin-top:1rem">
          Your Client ID is stored only in your browser. No data is sent to any server.
        </p>
      </div>
    `;

    const redirectDisplay = this.element.querySelector('#redirect-uri-display');
    if (redirectDisplay) {
      redirectDisplay.textContent = window.location.origin + window.location.pathname;
    }

    this.element.querySelector('#btn-save-client-id')?.addEventListener('click', () => {
      const input = this.element.querySelector('#spotify-client-id');
      const id = input?.value?.trim();
      if (!id) { alert('Please enter your Spotify Client ID.'); return; }
      this.callbacks.onSpotifyClientIdSave(id);
      this.render();
    });
  }

  renderLogin() {
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
        <p style="margin-top:1rem">
          <button class="secondary btn-sm" id="btn-change-client-id">Change Spotify Client ID</button>
        </p>
      </div>
    `;

    this.element.querySelector('#btn-login')?.addEventListener('click', () => this.callbacks.onLogin());
    this.element.querySelector('#btn-change-client-id')?.addEventListener('click', () => {
      this.callbacks.onSpotifyClientIdClear();
      this.render();
    });
  }
}
