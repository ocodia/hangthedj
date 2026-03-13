/**
 * SettingsPanel: OpenAI key management, ElevenLabs voice config, app settings, and Spotify setup.
 */

import { appStore, updateSettings } from "../../stores/app-store.js";
import { saveSettings, loadSettings, hasSpotifyClientId } from "../../features/storage/storage-service.js";
import { searchElevenLabsVoices } from "../../features/voice/voice-engine.js";

export class SettingsPanel {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.isExpanded = false;
    this._voiceResults = [];
    this._voiceSearching = false;
    this._voiceSearchError = null;

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
        <h4>ElevenLabs Voice <span class="muted" style="font-size:0.75rem">(optional)</span></h4>
        <p class="muted" style="font-size:0.8rem;margin-bottom:0.5rem">
          Use ElevenLabs for DJ voice instead of OpenAI TTS.
          Your key is stored locally in your browser only.
        </p>
        ${
          ai.hasElevenLabsKey
            ? `<div class="key-status" style="margin-bottom:0.75rem">
              <span style="color:var(--color-accent)">✓ Key set</span>
              <button class="secondary btn-sm" id="btn-clear-elevenlabs-key" style="margin-left:0.75rem">Clear key</button>
            </div>
            ${
              ai.elevenLabsVoiceId
                ? `<div class="key-status" style="margin-bottom:0.75rem">
                    <span style="color:var(--color-accent)">✓ Voice: ${ai.elevenLabsVoiceId}</span>
                    <button class="secondary btn-sm" id="btn-clear-elevenlabs-voice" style="margin-left:0.75rem">Change</button>
                  </div>`
                : ""
            }
            <div class="field" style="margin-bottom:0.5rem">
              <label for="elevenlabs-voice-search">Search Voices</label>
              <div style="display:flex;gap:0.5rem">
                <input type="text" id="elevenlabs-voice-search" placeholder="e.g. Rachel, British, deep..." autocomplete="off" style="flex:1" />
                <button id="btn-search-voices" class="secondary btn-sm" ${this._voiceSearching ? "disabled" : ""}>${this._voiceSearching ? "Searching..." : "Search"}</button>
              </div>
              ${this._voiceSearchError ? `<p style="color:#e74c3c;font-size:0.75rem;margin-top:0.25rem">${this._voiceSearchError}</p>` : ""}
            </div>
            ${this._renderVoiceResults()}`
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
        <hr style="border-color:#333;margin:1rem 0" />
        <h4>Spotify Setup</h4>
        ${
          hasSpotifyClientId()
            ? `<div class="key-status">
              <span style="color:var(--color-accent)">✓ Client ID set</span>
              <button class="secondary btn-sm" id="btn-clear-spotify-id" style="margin-left:0.75rem">Clear</button>
            </div>`
            : `<p class="muted" style="font-size:0.8rem">No Spotify Client ID set. Sign out and set it on the login screen.</p>`
        }
      </div>
    `;

    this._bindEvents();
  }

  _renderVoiceResults() {
    if (this._voiceResults.length === 0) return "";
    const rows = this._voiceResults
      .map((v) => {
        const labels = v.labels ? Object.values(v.labels).join(", ") : "";
        const isSelected = appStore.get("ai").elevenLabsVoiceId === v.voice_id;
        return `<tr class="voice-result-row" data-voice-id="${v.voice_id}" style="cursor:pointer;${isSelected ? "background:var(--color-surface-hover,#333)" : ""}">
        <td style="padding:0.35rem 0.5rem">${v.name}</td>
        <td style="padding:0.35rem 0.5rem;font-size:0.75rem;color:#999">${labels}</td>
        <td style="padding:0.35rem 0.5rem">
          ${v.preview_url ? `<button class="secondary btn-sm btn-preview-voice" data-preview="${v.preview_url}" style="font-size:0.7rem">▶</button>` : ""}
        </td>
        <td style="padding:0.35rem 0.5rem">
          <button class="btn-sm btn-select-voice" data-voice-id="${v.voice_id}" data-voice-name="${v.name}">${isSelected ? "✓ Selected" : "Select"}</button>
        </td>
      </tr>`;
      })
      .join("");

    return `<div style="max-height:200px;overflow-y:auto;margin-top:0.5rem">
      <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
        <thead><tr style="text-align:left;border-bottom:1px solid #333">
          <th style="padding:0.35rem 0.5rem">Name</th>
          <th style="padding:0.35rem 0.5rem">Labels</th>
          <th style="padding:0.35rem 0.5rem"></th>
          <th style="padding:0.35rem 0.5rem"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
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
        this._voiceResults = [];
        this.callbacks.onElevenLabsKeyClear();
      }
    });

    this.element.querySelector("#btn-clear-elevenlabs-voice")?.addEventListener("click", () => {
      this.callbacks.onElevenLabsVoiceClear();
    });

    // Voice search
    this.element.querySelector("#btn-search-voices")?.addEventListener("click", () => {
      this._searchVoices();
    });

    this.element.querySelector("#elevenlabs-voice-search")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._searchVoices();
    });

    // Voice select buttons
    this.element.querySelectorAll(".btn-select-voice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const voiceId = btn.dataset.voiceId;
        this.callbacks.onElevenLabsVoiceSelect(voiceId);
      });
    });

    // Voice preview buttons
    this.element.querySelectorAll(".btn-preview-voice").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = btn.dataset.preview;
        const audio = new Audio(url);
        audio.play().catch(() => {});
      });
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

    this.element.querySelector("#btn-clear-spotify-id")?.addEventListener("click", () => {
      if (confirm("Clear your Spotify Client ID? You will need to log in again.")) {
        this.callbacks.onSpotifyClientIdClear();
      }
    });
  }

  async _searchVoices() {
    const ai = appStore.get("ai");
    if (!ai.hasElevenLabsKey) return;

    const searchInput = this.element.querySelector("#elevenlabs-voice-search");
    const query = searchInput?.value?.trim() || "";

    this._voiceSearching = true;
    this._voiceSearchError = null;
    this._render();

    try {
      const key = this.callbacks.getElevenLabsKey();
      this._voiceResults = await searchElevenLabsVoices(key, query);
      this._voiceSearching = false;
      this._render();
    } catch (err) {
      this._voiceSearching = false;
      this._voiceSearchError = err.message;
      this._render();
    }
  }
}
