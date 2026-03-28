/**
 * MainPanel: the main application UI after Spotify auth.
 */

import { StationControls } from "./station-controls.js";
import { RequestLinePanel } from "./request-line-panel.js";
import { PersonaPanel } from "./persona-panel.js";
import { SettingsPanel } from "./settings-panel.js";
import { DjActivityLog } from "./dj-activity-log.js";
import { appStore } from "../../stores/app-store.js";

export class MainPanel {
  constructor(services, callbacks) {
    this.services = services;
    this.callbacks = callbacks;

    this.element = document.createElement("div");
    this.element.className = "main-panel";
    this._render();
  }

  _render() {
    // Main content area
    const content = document.createElement("main");
    content.className = "main-content";

    // AI key warning if not set
    const aiState = appStore.get("ai");
    if (!aiState.hasOpenAiKey) {
      const warning = document.createElement("div");
      warning.className = "key-warning panel";
      warning.innerHTML = `
        <p>⚠️ <strong>OpenAI key not set.</strong>
        DJ banter and voice are disabled until you add your key in Settings.</p>
      `;
      content.appendChild(warning);
    }

    // Two-column layout
    const columns = document.createElement("div");
    columns.className = "columns";

    const leftCol = document.createElement("div");
    leftCol.className = "col-main";
    const stationControls = new StationControls(this.services);
    leftCol.appendChild(stationControls.element);
    const activityLog = new DjActivityLog();
    leftCol.appendChild(activityLog.element);

    const rightCol = document.createElement("div");
    rightCol.className = "col-side";
    const personaPanel = new PersonaPanel(this.services);
    rightCol.appendChild(personaPanel.element);

    const requestLine = new RequestLinePanel(this.services);
    rightCol.appendChild(requestLine.element);

    const settingsPanel = new SettingsPanel(this.callbacks);
    rightCol.appendChild(settingsPanel.element);

    columns.appendChild(leftCol);
    columns.appendChild(rightCol);
    content.appendChild(columns);

    this.element.appendChild(content);
  }
}
