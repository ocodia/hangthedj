/**
 * PersonaEditor: inline form to add or edit a DJ persona.
 * Supports ElevenLabs voice search when an API key is available.
 */

import { appStore, updatePersonaState } from "../../stores/app-store.js";
import { saveSettings, loadSettings } from "../../features/storage/storage-service.js";
import { searchElevenLabsVoices } from "../../features/voice/voice-engine.js";

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

export class PersonaEditor {
  constructor(services, callbacks) {
    this.services = services;
    this.callbacks = callbacks;
    this._persona = null;
    this._isNew = true;
    this._voiceResults = [];
    this._voiceSearching = false;
    this._voiceSearchError = null;

    this.element = document.createElement("div");
    this.element.className = "persona-editor";
  }

  open(persona) {
    if (persona) {
      this._persona = { ...persona };
      this._isNew = false;
    } else {
      this._persona = {
        name: "",
        systemPrompt: "Keep responses 30–50 words.",
        elevenLabsVoiceId: "",
        voice: "nova",
        speechRate: 1.0,
        isPreset: false,
      };
      this._isNew = true;
    }
    this._voiceResults = [];
    this._voiceSearchError = null;
    this._render();
  }

  close() {
    this._persona = null;
    this.element.innerHTML = "";
  }

  isOpen() {
    return this._persona !== null;
  }

  _render() {
    if (!this._persona) {
      this.element.innerHTML = "";
      return;
    }

    const p = this._persona;
    const ai = appStore.get("ai");
    const voiceOptions = OPENAI_VOICES.map((v) => `<option value="${v}" ${v === p.voice ? "selected" : ""}>${v}</option>`).join("");

    this.element.innerHTML = `
      <div class="persona-editor-form">
        <h3>${this._isNew ? "Add DJ Persona" : "Edit DJ Persona"}</h3>
        <div class="field">
          <label for="pe-name">Name</label>
          <input type="text" id="pe-name" value="${escapeHtml(p.name)}" placeholder="e.g. DJ Midnight" maxlength="60" autocomplete="off" />
        </div>
        <div class="field">
          <label for="pe-system-prompt">System Prompt</label>
          <textarea id="pe-system-prompt" rows="6"
            placeholder="Describe the DJ's personality, tone, delivery style…"
            style="width:100%;resize:vertical;font-size:0.85rem">${escapeHtml(p.systemPrompt)}</textarea>
          <p class="muted" style="font-size:0.75rem;margin-top:0.25rem">This is the character description sent to the AI. Include tone, delivery style, and word count guidance.</p>
        </div>
        <div class="field">
          <label for="pe-voice">OpenAI Voice (fallback)</label>
          <select id="pe-voice">${voiceOptions}</select>
          <p class="muted" style="font-size:0.75rem;margin-top:0.25rem">Used when no ElevenLabs API key is configured.</p>
        </div>
        <div class="field">
          <label for="pe-elevenlabs-voice-id">ElevenLabs Voice ID</label>
          <input type="text" id="pe-elevenlabs-voice-id" value="${escapeHtml(p.elevenLabsVoiceId || "")}" placeholder="e.g. 7ktJCfz71Z44ppWOelh3" autocomplete="off" />
          ${
            ai.hasElevenLabsKey
              ? `
          <div style="display:flex;gap:0.5rem;margin-top:0.5rem">
            <input type="text" id="pe-voice-search" placeholder="Search voices…" autocomplete="off" style="flex:1" />
            <button id="btn-pe-search-voices" class="secondary btn-sm" ${this._voiceSearching ? "disabled" : ""}>${this._voiceSearching ? "Searching…" : "Search"}</button>
          </div>
          ${this._voiceSearchError ? `<p style="color:#e74c3c;font-size:0.75rem;margin-top:0.25rem">${escapeHtml(this._voiceSearchError)}</p>` : ""}
          ${this._renderVoiceResults()}
          `
              : `<p class="muted" style="font-size:0.75rem;margin-top:0.25rem">Add an ElevenLabs API key in Settings to search voices.</p>`
          }
        </div>
        <div class="field">
          <label for="pe-speech-rate">Speech Rate</label>
          <input type="range" id="pe-speech-rate" min="0.5" max="1.5" step="0.05" value="${p.speechRate}" style="width:100%" />
          <span class="muted" style="font-size:0.75rem" id="pe-speech-rate-value">${p.speechRate.toFixed(2)}</span>
        </div>
        <div class="persona-editor-actions">
          <button id="btn-pe-save">${this._isNew ? "Add Persona" : "Save Changes"}</button>
          ${!this._isNew && !p.isPreset ? `<button class="danger btn-sm" id="btn-pe-delete">Delete</button>` : ""}
          <button class="secondary btn-sm" id="btn-pe-cancel">Cancel</button>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _renderVoiceResults() {
    if (this._voiceResults.length === 0) return "";
    const rows = this._voiceResults
      .map((v) => {
        const labels = v.labels ? Object.values(v.labels).join(", ") : "";
        const isSelected = this._persona?.elevenLabsVoiceId === v.voice_id;
        return `<tr class="voice-result-row" style="cursor:pointer;${isSelected ? "background:var(--color-surface-hover,#333)" : ""}">
          <td style="padding:0.35rem 0.5rem">${escapeHtml(v.name)}</td>
          <td style="padding:0.35rem 0.5rem;font-size:0.75rem;color:#999">${escapeHtml(labels)}</td>
          <td style="padding:0.35rem 0.5rem">
            ${v.preview_url ? `<button class="secondary btn-sm btn-pe-preview" data-preview="${escapeAttr(v.preview_url)}" style="font-size:0.7rem">▶</button>` : ""}
          </td>
          <td style="padding:0.35rem 0.5rem">
            <button class="btn-sm btn-pe-pick-voice" data-voice-id="${escapeAttr(v.voice_id)}">${isSelected ? "✓ Selected" : "Select"}</button>
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
    this.element.querySelector("#pe-speech-rate")?.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      const label = this.element.querySelector("#pe-speech-rate-value");
      if (label) label.textContent = val.toFixed(2);
    });

    this.element.querySelector("#btn-pe-save")?.addEventListener("click", () => void this._save());
    this.element.querySelector("#btn-pe-cancel")?.addEventListener("click", () => this.callbacks.onClose());
    this.element.querySelector("#btn-pe-delete")?.addEventListener("click", () => void this._delete());

    this.element.querySelector("#btn-pe-search-voices")?.addEventListener("click", () => void this._searchVoices());
    this.element.querySelector("#pe-voice-search")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") void this._searchVoices();
    });

    this.element.querySelectorAll(".btn-pe-pick-voice").forEach((btn) => {
      btn.addEventListener("click", () => {
        const voiceId = btn.dataset.voiceId;
        const input = this.element.querySelector("#pe-elevenlabs-voice-id");
        if (input) input.value = voiceId;
        if (this._persona) this._persona.elevenLabsVoiceId = voiceId;
        this._render();
      });
    });

    this.element.querySelectorAll(".btn-pe-preview").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = btn.dataset.preview;
        const audio = new Audio(url);
        audio.play().catch(() => {});
      });
    });
  }

  async _searchVoices() {
    const ai = appStore.get("ai");
    if (!ai.hasElevenLabsKey) return;

    const searchInput = this.element.querySelector("#pe-voice-search");
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

  async _save() {
    const name = this.element.querySelector("#pe-name")?.value?.trim();
    const systemPrompt = this.element.querySelector("#pe-system-prompt")?.value?.trim();
    const voice = this.element.querySelector("#pe-voice")?.value || "nova";
    const elevenLabsVoiceId = this.element.querySelector("#pe-elevenlabs-voice-id")?.value?.trim() || "";
    const speechRate = parseFloat(this.element.querySelector("#pe-speech-rate")?.value) || 1.0;

    if (!name) {
      alert("Please enter a persona name.");
      return;
    }
    if (!systemPrompt) {
      alert("Please enter a system prompt.");
      return;
    }

    try {
      let saved;
      if (this._isNew) {
        saved = await this.services.personaService.save({
          name,
          systemPrompt,
          voice,
          elevenLabsVoiceId,
          speechRate,
          isPreset: false,
        });
      } else {
        saved = await this.services.personaService.update({
          ...this._persona,
          name,
          systemPrompt,
          voice,
          elevenLabsVoiceId,
          speechRate,
        });
      }

      // Refresh personas list
      const personas = await this.services.personaService.getAll();
      updatePersonaState({ personas });

      // If this is the active persona, update it
      const active = appStore.get("persona").activePersona;
      if (active && active.id === saved.id) {
        updatePersonaState({ activePersona: saved });
      }

      // If new, make it active
      if (this._isNew) {
        updatePersonaState({ activePersona: saved });
        const current = loadSettings();
        saveSettings({ ...current, activePersonaId: saved.id });
      }

      this.callbacks.onClose();
    } catch (err) {
      alert("Failed to save persona: " + err.message);
    }
  }

  async _delete() {
    if (!this._persona || this._persona.isPreset) return;
    if (!confirm(`Delete "${this._persona.name}"? This cannot be undone.`)) return;

    try {
      await this.services.personaService.remove(this._persona.id);
      const personas = await this.services.personaService.getAll();
      updatePersonaState({ personas });

      // If deleted persona was active, switch to first available
      const active = appStore.get("persona").activePersona;
      if (active && active.id === this._persona.id && personas.length > 0) {
        updatePersonaState({ activePersona: personas[0] });
        const current = loadSettings();
        saveSettings({ ...current, activePersonaId: personas[0].id });
      }

      this.callbacks.onClose();
    } catch (err) {
      alert("Failed to delete persona: " + err.message);
    }
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeAttr(str) {
  if (!str) return "";
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
