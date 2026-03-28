/**
 * PersonaPanel: select, create, and edit DJ personas in a dedicated side panel.
 */

import { appStore, updatePersonaState } from "../../stores/app-store.js";
import { saveSettings, loadSettings } from "../../features/storage/storage-service.js";
import { PersonaEditor } from "./persona-editor.js";

export class PersonaPanel {
  constructor(services) {
    this.services = services;

    this.personaEditor = new PersonaEditor(services, {
      onClose: () => {
        this.personaEditor.close();
        this._render();
      },
      getElevenLabsKey: () => this.services.callbacks?.getElevenLabsKey?.() ?? null,
    });

    this.element = document.createElement("div");
    this.element.className = "persona-panel panel";
    this._render();

    appStore.subscribe("persona", () => this._render());
    appStore.subscribe("ai", () => this._render());
  }

  _render() {
    const persona = appStore.get("persona");
    const ai = appStore.get("ai");
    const personaOptions = persona.personas
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === persona.activePersona?.id ? "selected" : ""}>
            ${escapeHtml(p.name)}${p.isPreset ? " ★" : ""}
          </option>`,
      )
      .join("");

    this.element.innerHTML = `
      <h2>🎙️ DJ Persona</h2>
      <div class="field">
        <label for="persona-select">Active Persona</label>
        <div style="display:flex;gap:0.5rem;align-items:center">
          <select id="persona-select" style="flex:1">${personaOptions}</select>
          <button class="secondary" id="btn-edit-persona">Edit</button>
          <button class="secondary" id="btn-add-persona">+ New</button>
        </div>
      </div>
      ${!ai.hasOpenAiKey ? `<p class="muted" style="font-size:0.8rem">Set your OpenAI key in Settings to enable DJ banter.</p>` : ""}
      <div id="persona-editor-mount"></div>
    `;

    this.element.querySelector("#persona-select")?.addEventListener("change", async (e) => {
      const id = e.target.value;
      const selectedPersona = await this.services.personaService.getById(id);
      if (selectedPersona) {
        updatePersonaState({ activePersona: selectedPersona });
        const current = loadSettings();
        saveSettings({ ...current, activePersonaId: id });
      }
    });

    this.element.querySelector("#btn-edit-persona")?.addEventListener("click", () => {
      const active = appStore.get("persona").activePersona;
      if (active) {
        this.personaEditor.open(active);
        this._mountEditor();
      }
    });

    this.element.querySelector("#btn-add-persona")?.addEventListener("click", () => {
      this.personaEditor.open(null);
      this._mountEditor();
    });

    if (this.personaEditor.isOpen()) {
      this._mountEditor();
    }
  }

  _mountEditor() {
    const mount = this.element.querySelector("#persona-editor-mount");
    if (mount) {
      mount.innerHTML = "";
      mount.appendChild(this.personaEditor.element);
    }
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
