/**
 * DjActivityLog: shows recent DJ banter lines and activity.
 */

import { appStore } from '../../stores/app-store.js';

export class DjActivityLog {
  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'dj-activity-log panel';
    this._render([]);

    appStore.subscribe('djActivity', () => {
      this._renderCurrent();
    });
    appStore.subscribe('settings', () => {
      this._renderCurrent();
    });
  }

  _renderCurrent() {
    const entries = appStore.get('djActivity').entries;
    this._render(entries);
  }

  _render(entries) {
    const debugMode = appStore.get('settings').debugMode;
    const filtered = debugMode ? entries : entries.filter((e) => !e.debug && e.type !== 'system');

    const entryHtml =
      filtered.length === 0
        ? `<p class="muted" style="font-size:0.85rem">DJ activity will appear here once a session starts.</p>`
        : filtered
            .map(
              (e) => `
          <div class="log-entry log-entry--${e.type}">
            <span class="log-time muted">${e.time}</span>
            <span class="log-text">${escapeHtml(e.text)}</span>
          </div>`,
            )
            .join('');

    this.element.innerHTML = `
      <h3>🎙️ DJ Activity</h3>
      <div class="log-entries">${entryHtml}</div>
    `;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
