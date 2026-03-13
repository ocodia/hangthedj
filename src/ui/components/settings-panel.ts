/**
 * SettingsPanel: OpenAI key management and app settings.
 */

import type { AppCallbacks } from "@/ui/render";
import { appStore, updateSettings } from "@/stores/app-store";
import { saveSettings, loadSettings } from "@/features/storage/storage-service";

export class SettingsPanel {
  element: HTMLElement;
  private isExpanded = false;

  constructor(
    private callbacks: AppCallbacks
  ) {
    this.element = document.createElement("div");
    this.element.className = "settings-panel panel";
    this.render();
    appStore.subscribe("ai", () => this.render());
  }

  private render(): void {
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
        ${ai.hasOpenAiKey
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
      </div>
    `;

    this.element.querySelector("#settings-toggle")?.addEventListener("click", () => {
      this.isExpanded = !this.isExpanded;
      this.render();
    });

    this.element.querySelector("#btn-save-key")?.addEventListener("click", () => {
      const keyInput = this.element.querySelector<HTMLInputElement>("#openai-key");
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

    this.element.querySelector<HTMLSelectElement>("#dj-frequency")?.addEventListener("change", (e) => {
      const freq = (e.target as HTMLSelectElement).value as "every" | "rarely" | "sometimes" | "often";
      const current = loadSettings();
      const updated = { ...current, schedulerConfig: { ...current.schedulerConfig, djFrequency: freq } };
      saveSettings(updated);
      updateSettings(updated);
    });

    this.element.querySelector<HTMLInputElement>("#family-safe")?.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      const current = loadSettings();
      const updated = { ...current, schedulerConfig: { ...current.schedulerConfig, familySafe: checked } };
      saveSettings(updated);
      updateSettings(updated);
    });

    this.element.querySelector<HTMLInputElement>("#debug-mode")?.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      const current = loadSettings();
      const updated = { ...current, debugMode: checked };
      saveSettings(updated);
      updateSettings(updated);
    });
  }
}
