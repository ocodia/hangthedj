/**
 * SettingsPanel: OpenAI key management, ElevenLabs key config, app settings, and Spotify setup.
 */

import { appStore, updateSettings } from "../../stores/app-store.js";
import { saveSettings, loadSettings, hasSpotifyClientId } from "../../features/storage/storage-service.js";

export class SettingsPanel {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.isExpanded = false;

    this.element = document.createElement("div");
    this.element.className = "settings-panel panel";
    this._render();
    appStore.subscribe("ai", () => this._render());
  }

  _render() {
    const ai = appStore.get("ai");

    this.element.innerHTML = `
      <div class="settings-header" id="settings-toggle">
        <h3>⚙️ Settings</h3>
        <span class="settings-toggle-icon">${this.isExpanded ? "▲" : "▼"}</span>
      </div>
      <div class="settings-body" style="display:${this.isExpanded ? "block" : "none"}">
        <h4>OpenAI Key</h4>
        <p class="muted" style="font-size:0.8rem;margin-bottom:0.5rem">
          Your key is stored locally in your browser only.
          OpenAI usage is billed to your own account.
        </p>
        ${
          ai.hasOpenAiKey
            ? `<div class="key-status">
              <span style="color:var(--color-accent)">✓ Key set</span>
              <button class="secondary btn-sm" id="btn-clear-key" style="margin-left:0.75rem">Clear key</button>
            </div>`
            : `<div class="field">
              <label for="openai-key">API Key</label>
              <input type="password" id="openai-key" placeholder="sk-..." autocomplete="off" />
              <p class="muted" style="font-size:0.75rem;margin-top:0.25rem">Never shared. Stored in your browser only.</p>
            </div>
            <button id="btn-save-key">Save Key</button>`
        }
        <hr style="border-color:#333;margin:1rem 0" />
        <h4>ElevenLabs TTS <span class="muted" style="font-size:0.75rem">(optional)</span></h4>
        <p class="muted" style="font-size:0.8rem;margin-bottom:0.5rem">
          Use ElevenLabs for DJ voice instead of OpenAI TTS.
          Voices are configured per DJ persona.
        </p>
        ${
          ai.hasElevenLabsKey
            ? `<div class="key-status" style="margin-bottom:0.75rem">
              <span style="color:var(--color-accent)">✓ Key set</span>
              <button class="secondary btn-sm" id="btn-clear-elevenlabs-key" style="margin-left:0.75rem">Clear key</button>
            </div>`
            : `<div class="field">
              <label for="elevenlabs-key">API Key</label>
              <input type="password" id="elevenlabs-key" placeholder="Your ElevenLabs API key" autocomplete="off" />
              <p class="muted" style="font-size:0.75rem;margin-top:0.25rem">Never shared. Stored in your browser only.</p>
            </div>
            <button id="btn-save-elevenlabs-key">Save Key</button>`
        }
        <hr style="border-color:#333;margin:1rem 0" />
        <div class="field">
          <label for="dj-frequency">DJ Frequency</label>
          <select id="dj-frequency">
            <option value="every" ${appStore.get("settings").schedulerConfig.djFrequency === "every" ? "selected" : ""}>After Every Track (debug)</option>
            <option value="rarely" ${appStore.get("settings").schedulerConfig.djFrequency === "rarely" ? "selected" : ""}>Rarely (every 4+ tracks)</option>
            <option value="sometimes" ${appStore.get("settings").schedulerConfig.djFrequency === "sometimes" ? "selected" : ""}>Sometimes (every 2+ tracks)</option>
            <option value="often" ${appStore.get("settings").schedulerConfig.djFrequency === "often" ? "selected" : ""}>Often (every track)</option>
          </select>
        </div>
        <div class="field toggle-field">
          <label class="toggle-switch">
            <input type="checkbox" id="family-safe" ${appStore.get("settings").schedulerConfig.familySafe ? "checked" : ""} />
            <span class="toggle-slider"></span>
          </label>
          <span class="toggle-label-text">Family-safe mode</span>
        </div>
        <div class="field toggle-field">
          <label class="toggle-switch">
            <input type="checkbox" id="debug-mode" ${appStore.get("settings").debugMode ? "checked" : ""} />
            <span class="toggle-slider"></span>
          </label>
          <div class="toggle-label-group">
            <span class="toggle-label-text">Debug mode</span>
            <span class="muted" style="font-size:0.75rem">Show all activity details in DJ log</span>
          </div>
        </div>
        <div class="field">
          <label for="current-track-outro-dip">Current track outro dip (seconds)</label>
          <input
            type="number"
            id="current-track-outro-dip"
            min="1"
            max="15"
            step="1"
            value="${appStore.get("settings").audioTransition.currentTrackOutroDipSeconds}"
          />
          <p class="muted" style="font-size:0.75rem;margin-top:0.25rem">How many seconds before a song ends are safe for ducked banter.</p>
        </div>
        <div class="field">
          <label for="next-track-intro-dip">Next track intro dip (seconds)</label>
          <input
            type="number"
            id="next-track-intro-dip"
            min="1"
            max="15"
            step="1"
            value="${appStore.get("settings").audioTransition.nextTrackIntroDipSeconds}"
          />
          <p class="muted" style="font-size:0.75rem;margin-top:0.25rem">How many seconds at the start of the next song can stay ducked before music should fully return.</p>
        </div>
        <hr style="border-color:#333;margin:1rem 0" />
        <h4>Spotify Setup</h4>
        ${
          hasSpotifyClientId()
            ? `<div class="key-status">
              <span style="color:var(--color-accent)">✓ Client ID set</span>
            </div>
            <div class="settings-inline-actions">
              <button class="secondary btn-sm" id="btn-spotify-sign-out">Sign out</button>
              <button class="secondary btn-sm" id="btn-clear-spotify-id">Clear</button>
            </div>`
            : `<p class="muted" style="font-size:0.8rem">No Spotify Client ID set. Sign out and set it on the login screen.</p>`
        }
      </div>
    `;

    this._bindEvents();
  }

  _bindEvents() {
    this.element.querySelector("#settings-toggle")?.addEventListener("click", () => {
      this.isExpanded = !this.isExpanded;
      this._render();
    });

    this.element.querySelector("#btn-save-key")?.addEventListener("click", () => {
      const keyInput = this.element.querySelector("#openai-key");
      const key = keyInput?.value?.trim();
      if (key && key.startsWith("sk-")) {
        this.callbacks.onOpenAIKeySet(key);
      } else {
        alert("Please enter a valid OpenAI API key (starts with sk-).");
      }
    });

    this.element.querySelector("#btn-clear-key")?.addEventListener("click", () => {
      if (confirm("Clear your OpenAI key? DJ banter will be disabled.")) {
        this.callbacks.onOpenAIKeyClear();
      }
    });

    // ElevenLabs key
    this.element.querySelector("#btn-save-elevenlabs-key")?.addEventListener("click", () => {
      const keyInput = this.element.querySelector("#elevenlabs-key");
      const key = keyInput?.value?.trim();
      if (key) {
        this.callbacks.onElevenLabsKeySet(key);
      } else {
        alert("Please enter your ElevenLabs API key.");
      }
    });

    this.element.querySelector("#btn-clear-elevenlabs-key")?.addEventListener("click", () => {
      if (confirm("Clear your ElevenLabs key? DJ voice will fall back to OpenAI TTS.")) {
        this.callbacks.onElevenLabsKeyClear();
      }
    });

    this.element.querySelector("#dj-frequency")?.addEventListener("change", (e) => {
      const freq = e.target.value;
      const current = loadSettings();
      const updated = { ...current, schedulerConfig: { ...current.schedulerConfig, djFrequency: freq } };
      saveSettings(updated);
      updateSettings(updated);
    });

    this.element.querySelector("#family-safe")?.addEventListener("change", (e) => {
      const checked = e.target.checked;
      const current = loadSettings();
      const updated = { ...current, schedulerConfig: { ...current.schedulerConfig, familySafe: checked } };
      saveSettings(updated);
      updateSettings(updated);
    });

    this.element.querySelector("#debug-mode")?.addEventListener("change", (e) => {
      const checked = e.target.checked;
      const current = loadSettings();
      const updated = { ...current, debugMode: checked };
      saveSettings(updated);
      updateSettings(updated);
    });

    this.element.querySelector("#current-track-outro-dip")?.addEventListener("change", (e) => {
      this._saveAudioTransitionSetting("currentTrackOutroDipSeconds", e.target.value);
    });

    this.element.querySelector("#next-track-intro-dip")?.addEventListener("change", (e) => {
      this._saveAudioTransitionSetting("nextTrackIntroDipSeconds", e.target.value);
    });

    this.element.querySelector("#btn-clear-spotify-id")?.addEventListener("click", () => {
      if (confirm("Clear your Spotify Client ID? You will need to log in again.")) {
        this.callbacks.onSpotifyClientIdClear();
      }
    });

    this.element.querySelector("#btn-spotify-sign-out")?.addEventListener("click", () => {
      if (confirm("Sign out of Spotify?")) {
        this.callbacks.onLogout();
      }
    });
  }

  _saveAudioTransitionSetting(key, rawValue) {
    const value = Math.max(1, Math.min(15, Number.parseInt(rawValue, 10) || 5));
    const current = loadSettings();
    const updated = {
      ...current,
      audioTransition: {
        ...current.audioTransition,
        [key]: value,
      },
    };
    saveSettings(updated);
    updateSettings(updated);
  }
}
