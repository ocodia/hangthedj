/**
 * RequestLinePanel: the listener call-in UI with interactive Spotify search.
 */

import { appStore } from "../../stores/app-store.js";

const CALLER_NAME_KEY = "htdj_caller_name";

export class RequestLinePanel {
  constructor(services) {
    this.services = services;
    this.searchTimer = null;
    this.selectedTrack = null;

    this.element = document.createElement("div");
    this.element.className = "request-line-panel panel";
    this._render();
  }

  _render() {
    const savedName = localStorage.getItem(CALLER_NAME_KEY) ?? "";

    this.element.innerHTML = `
      <h3>📞 Call In</h3>
      <p class="muted" style="font-size:0.85rem;margin-bottom:1rem">
        Request an artist, track, or mood for the DJ.
      </p>
      <form id="request-form" autocomplete="off">
        <div class="field">
          <label for="caller-name">Your name (optional)</label>
          <input type="text" id="caller-name" placeholder="e.g. Alex" maxlength="50" value="${escapeAttr(savedName)}" />
        </div>
        <div class="field" style="position:relative">
          <label for="search-input">Search artist or track *</label>
          <input type="text" id="search-input" placeholder="e.g. Radiohead Karma Police" maxlength="150" required autocomplete="off" />
          <div id="search-results" class="search-results" style="display:none"></div>
        </div>
        <div class="field" id="selected-track-field" style="display:none">
          <div class="selected-track">
            <img id="selected-artwork" class="selected-artwork" src="" alt="" />
            <div class="selected-info">
              <span id="selected-title" class="selected-title"></span>
              <span id="selected-artist" class="selected-artist muted"></span>
            </div>
            <button type="button" id="btn-clear-selection" class="btn-clear-selection" title="Clear selection">✕</button>
          </div>
        </div>
        <div class="field">
          <label for="message">Message (optional)</label>
          <textarea id="message" placeholder="Say something to the DJ..." maxlength="200" rows="2"></textarea>
        </div>
        <div id="request-feedback" class="request-feedback" style="display:none"></div>
        <button type="submit" id="btn-submit-request">Send Request</button>
      </form>
      <div class="request-history" id="request-history"></div>
    `;

    const form = this.element.querySelector("#request-form");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      void this._submitRequest();
    });

    const searchInput = this.element.querySelector("#search-input");
    searchInput.addEventListener("input", () => this._onSearchInput());
    searchInput.addEventListener("focus", () => this._onSearchInput());
    document.addEventListener("click", (e) => {
      if (!this.element.contains(e.target)) {
        this._hideSearchResults();
      }
    });

    this.element.querySelector("#btn-clear-selection")?.addEventListener("click", () => {
      this._clearSelection();
    });

    appStore.subscribe("requests", () => this._renderHistory());
  }

  // ── Spotify search ──────────────────────────────────────────────────────────

  _onSearchInput() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const query = this.element.querySelector("#search-input")?.value?.trim() ?? "";
    if (query.length < 2) {
      this._hideSearchResults();
      return;
    }
    this.searchTimer = setTimeout(() => void this._performSearch(query), 350);
  }

  async _performSearch(query) {
    const spotify = appStore.get("spotify");
    if (!spotify.isConnected) return;

    try {
      const results = await this.services.spotifyPlayer.searchTracks(query, 5);
      this._renderSearchResults(results);
    } catch {
      this._hideSearchResults();
    }
  }

  _renderSearchResults(tracks) {
    const container = this.element.querySelector("#search-results");
    if (tracks.length === 0) {
      container.style.display = "none";
      return;
    }

    container.innerHTML = tracks
      .map(
        (t) => `
      <div class="search-result-item" data-id="${escapeAttr(t.id)}" data-uri="${escapeAttr(t.uri ?? "")}" data-title="${escapeAttr(t.title)}" data-artist="${escapeAttr(t.artistName)}" data-album="${escapeAttr(t.albumName ?? "")}" data-artwork="${escapeAttr(t.artworkUrl ?? "")}">
        <img class="search-result-art" src="${escapeAttr(t.artworkUrl ?? "")}" alt="" />
        <div class="search-result-info">
          <span class="search-result-title">${escapeHtml(t.title)}</span>
          <span class="search-result-artist muted">${escapeHtml(t.artistName)}</span>
        </div>
      </div>`,
      )
      .join("");
    container.style.display = "block";

    container.querySelectorAll(".search-result-item").forEach((el) => {
      el.addEventListener("click", () => {
        const ds = el.dataset;
        this._selectTrack({
          id: ds.id,
          title: ds.title,
          artistName: ds.artist,
          albumName: ds.album || undefined,
          artworkUrl: ds.artwork || undefined,
          uri: ds.uri || undefined,
        });
      });
    });
  }

  _selectTrack(track) {
    this.selectedTrack = track;
    this._hideSearchResults();

    const searchInput = this.element.querySelector("#search-input");
    searchInput.value = `${track.title} — ${track.artistName}`;
    searchInput.disabled = true;

    const field = this.element.querySelector("#selected-track-field");
    field.style.display = "block";
    this.element.querySelector("#selected-artwork").src = track.artworkUrl ?? "";
    this.element.querySelector("#selected-title").textContent = track.title;
    this.element.querySelector("#selected-artist").textContent = track.artistName;
  }

  _clearSelection() {
    this.selectedTrack = null;
    const searchInput = this.element.querySelector("#search-input");
    searchInput.disabled = false;
    searchInput.value = "";
    searchInput.focus();
    this.element.querySelector("#selected-track-field").style.display = "none";
  }

  _hideSearchResults() {
    const el = this.element.querySelector("#search-results");
    if (el) el.style.display = "none";
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async _submitRequest() {
    const session = appStore.get("session");
    const feedback = this.element.querySelector("#request-feedback");

    if (!session.activeSession) {
      feedback.style.display = "block";
      feedback.className = "request-feedback error-text";
      feedback.textContent = "Start a session first before calling in.";
      return;
    }

    const callerName = this._getValue("caller-name");
    if (callerName) {
      localStorage.setItem(CALLER_NAME_KEY, callerName);
    }

    const searchInput = this.element.querySelector("#search-input");
    const rawQuery = searchInput.value.trim();

    const submission = {
      callerName,
      artistName: this.selectedTrack ? this.selectedTrack.artistName : rawQuery,
      trackName: this.selectedTrack ? this.selectedTrack.title : undefined,
      message: this._getValue("message"),
    };

    const btn = this.element.querySelector("#btn-submit-request");
    btn.disabled = true;

    try {
      const request = await this.services.requestManager.submit(session.activeSession.id, submission);

      feedback.style.display = "block";
      feedback.className = "request-feedback";
      feedback.style.color = "var(--color-accent)";
      feedback.textContent = `Request for ${request.artistName}${request.trackName ? " — " + request.trackName : ""} is in the queue!`;

      this.element.querySelector("#message").value = "";
      this._clearSelection();

      const all = await this.services.requestManager.getAll(session.activeSession.id);
      appStore.update("requests", {
        requests: all,
        pendingCount: all.filter((r) => r.status === "pending").length,
      });
    } catch (err) {
      feedback.style.display = "block";
      feedback.className = "request-feedback error-text";
      feedback.textContent = err instanceof Error ? err.message : "Request failed.";
    } finally {
      btn.disabled = false;
      setTimeout(() => {
        feedback.style.display = "none";
      }, 4000);
    }
  }

  _renderHistory() {
    const history = this.element.querySelector("#request-history");
    if (!history) return;

    const requests = appStore.get("requests").requests;
    if (requests.length === 0) {
      history.innerHTML = "";
      return;
    }

    const recent = [...requests].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 5);

    history.innerHTML = `
      <h4 style="margin-top:1rem;margin-bottom:0.5rem;font-size:0.9rem">Recent requests</h4>
      <ul class="request-list">
        ${recent
          .map(
            (r) => `
          <li class="request-item status-${r.status}">
            <span class="request-artist"${r.status === "fulfilled" ? ' style="text-decoration:line-through;opacity:0.6"' : ""}>${escapeHtml(r.artistName)}${r.trackName ? " — " + escapeHtml(r.trackName) : ""}</span>
            <span class="request-status muted">${r.status === "fulfilled" ? "Played" : r.status}</span>
          </li>`,
          )
          .join("")}
      </ul>
    `;
  }

  _getValue(id) {
    const val = this.element.querySelector(`#${id}`)?.value?.trim();
    return val || undefined;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeAttr(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
