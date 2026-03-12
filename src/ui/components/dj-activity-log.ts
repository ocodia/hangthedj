/**
 * DjActivityLog: shows recent DJ banter lines and activity.
 *
 * Reads from the centralized djActivity store slice.
 */

import { appStore } from "@/stores/app-store";
import type { DjActivityEntry } from "@/types/store";

export class DjActivityLog {
  element: HTMLElement;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "dj-activity-log panel";
    this.render([]);

    appStore.subscribe("djActivity", (activity) => {
      this.render(activity.entries);
    });
  }

  private render(entries: DjActivityEntry[]): void {
    const entryHtml =
      entries.length === 0
        ? `<p class="muted" style="font-size:0.85rem">DJ activity will appear here once a session starts.</p>`
        : entries
            .map(
              (e) => `
          <div class="log-entry log-entry--${e.type}">
            <span class="log-time muted">${e.time}</span>
            <span class="log-text">${escapeHtml(e.text)}</span>
          </div>`,
            )
            .join("");

    this.element.innerHTML = `
      <h3>🎙️ DJ Activity</h3>
      <div class="log-entries">${entryHtml}</div>
    `;
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
