/**
 * MainPanel: the main application UI after Spotify auth.
 *
 * Renders:
 * - Header with DJ name and logout
 * - Now Playing section
 * - Station controls (start/stop session, mood)
 * - Request line
 * - Settings (persona, OpenAI key)
 * - Activity feed / DJ log
 */

import type { AppServices } from "@/app/app-shell";
import type { AppCallbacks } from "@/ui/render";
import { NowPlayingBar } from "./now-playing-bar";
import { StationControls } from "./station-controls";
import { RequestLinePanel } from "./request-line-panel";
import { SettingsPanel } from "./settings-panel";
import { DjActivityLog } from "./dj-activity-log";
import { appStore } from "@/stores/app-store";

export class MainPanel {
  element: HTMLElement;

  constructor(
    private services: AppServices,
    private callbacks: AppCallbacks
  ) {
    this.element = document.createElement("div");
    this.element.className = "main-panel";
    this.render();
  }

  private render(): void {
    // Header
    const header = document.createElement("header");
    header.className = "app-header";
    header.innerHTML = `
      <div class="header-left">
        <span class="app-icon">🎧</span>
        <span class="app-name">HangTheDJ</span>
      </div>
      <div class="header-right">
        <button class="secondary btn-sm" id="btn-logout">Sign out</button>
      </div>
    `;
    header.querySelector("#btn-logout")?.addEventListener("click", () =>
      this.callbacks.onLogout()
    );
    this.element.appendChild(header);

    // Main content area
    const content = document.createElement("main");
    content.className = "main-content";

    // Now playing bar
    const nowPlaying = new NowPlayingBar();
    content.appendChild(nowPlaying.element);

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

    // Station controls
    const stationControls = new StationControls(this.services);
    content.appendChild(stationControls.element);

    // Two-column layout: left = activity log, right = request line + settings
    const columns = document.createElement("div");
    columns.className = "columns";

    const leftCol = document.createElement("div");
    leftCol.className = "col-main";
    const activityLog = new DjActivityLog();
    leftCol.appendChild(activityLog.element);

    const rightCol = document.createElement("div");
    rightCol.className = "col-side";
    const requestLine = new RequestLinePanel(this.services);
    rightCol.appendChild(requestLine.element);

    const settingsPanel = new SettingsPanel(this.services, this.callbacks);
    rightCol.appendChild(settingsPanel.element);

    columns.appendChild(leftCol);
    columns.appendChild(rightCol);
    content.appendChild(columns);

    this.element.appendChild(content);
  }
}
