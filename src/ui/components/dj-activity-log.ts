/**
 * DjActivityLog: shows recent DJ banter lines and activity.
 */

import { appStore } from "@/stores/app-store";

interface LogEntry {
  time: string;
  text: string;
  type: "dj" | "system" | "error";
}

export class DjActivityLog {
  element: HTMLElement;
  private entries: LogEntry[] = [];

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "dj-activity-log panel";
    this.render();

    appStore.subscribe("ai", (ai) => {
      if (ai.lastError) {
        this.addEntry({ type: "error", text: `Error: ${ai.lastError}` });
      }
    });

    appStore.subscribe("playback", (playback) => {
      if (playback.coordinator === "playingDjClip") {
        this.addEntry({ type: "system", text: "Playing DJ clip..." });
      }
    });
  }

  addEntry(entry: Omit<LogEntry, "time">): void {
    this.entries.unshift({ ...entry, time: new Date().toLocaleTimeString() });
    this.entries = this.entries.slice(0, 20);
    this.render();
  }

  private render(): void {
    const entryHtml =
      this.entries.length === 0
        ? `<p class="muted" style="font-size:0.85rem">DJ activity will appear here once a session starts.</p>`
        : this.entries
            .map(
              (e) => `
          <div class="log-entry log-entry--${e.type}">
            <span class="log-time muted">${e.time}</span>
            <span class="log-text">${escapeHtml(e.text)}</span>
          </div>`
            )
            .join("");

    this.element.innerHTML = `
      <h3>🎙️ DJ Activity</h3>
      <div class="log-entries">${entryHtml}</div>
    `;
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
