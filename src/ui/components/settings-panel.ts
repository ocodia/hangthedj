/**
 * SettingsPanel: persona selection, OpenAI key management, and app settings.
 */

import type { AppServices } from "@/app/app-shell";
import type { AppCallbacks } from "@/ui/render";
import { appStore, updatePersonaState, updateSettings } from "@/stores/app-store";
import { saveSettings, loadSettings } from "@/features/storage/storage-service";

export class SettingsPanel {
  element: HTMLElement;
  private isExpanded = false;

  constructor(
    private services: AppServices,
    private callbacks: AppCallbacks
  ) {
    this.element = document.createElement("div");
    this.element.className = "settings-panel panel";
    this.render();
    appStore.subscribe("ai", () => this.render());
    appStore.subscribe("persona", () => this.render());
  }

  private render(): void {
    const ai = appStore.get("ai");
    const persona = appStore.get("persona");

    const personaOptions = persona.personas
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === persona.activePersona?.id ? "selected" : ""}>
            ${escapeHtml(p.name)}${p.isPreset ? " ★" : ""}
          </option>`
      )
      .join("");

    this.element.innerHTML = `
      <div class="settings-header" id="settings-toggle">
        <h3>⚙️ Settings</h3>
        <span class="settings-toggle-icon">${this.isExpanded ? "▲" : "▼"}</span>
      </div>
      <div class="settings-body" style="display:${this.isExpanded ? "block" : "none"}">
        <div class="field">
          <label for="persona-select">DJ Persona</label>
          <select id="persona-select">${personaOptions}</select>
        </div>
        <hr style="border-color:#333;margin:1rem 0" />
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
            <option value="rarely">Rarely (every 4+ tracks)</option>
            <option value="sometimes" selected>Sometimes (every 2+ tracks)</option>
            <option value="often">Often (every track)</option>
          </select>
        </div>
        <div class="field">
          <label>
            <input type="checkbox" id="family-safe" ${appStore.get("settings").schedulerConfig.familySafe ? "checked" : ""} />
            Family-safe mode
          </label>
        </div>
      </div>
    `;

    this.element.querySelector("#settings-toggle")?.addEventListener("click", () => {
      this.isExpanded = !this.isExpanded;
      this.render();
    });

    this.element.querySelector<HTMLSelectElement>("#persona-select")?.addEventListener("change", async (e) => {
      const id = (e.target as HTMLSelectElement).value;
      const p = await this.services.personaService.getById(id);
      if (p) {
        updatePersonaState({ activePersona: p });
        const current = loadSettings();
        saveSettings({ ...current, activePersonaId: id });
        updateSettings({ activePersonaId: id });
      }
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
      const freq = (e.target as HTMLSelectElement).value as "rarely" | "sometimes" | "often";
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
