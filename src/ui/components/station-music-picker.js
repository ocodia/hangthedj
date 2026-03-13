/**
 * StationMusicPicker: search Spotify for an artist, album, track or playlist
 * to seed the station's music before tuning in.
 */

export class StationMusicPicker {
  constructor(spotifyPlayer) {
    this.spotifyPlayer = spotifyPlayer;
    this.selectedItem = null;
    this._onSelectionChange = null;
    this._debounceTimer = null;

    this.element = document.createElement("div");
    this.element.className = "music-picker";
    this._render();
  }

  /** Register a callback: (item | null) => void */
  onSelectionChange(fn) {
    this._onSelectionChange = fn;
  }

  getSelection() {
    return this.selectedItem;
  }

  clear() {
    this.selectedItem = null;
    this._render();
    this._onSelectionChange?.(null);
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  _render() {
    this.element.innerHTML = "";

    const label = document.createElement("label");
    label.className = "music-picker-label";
    label.textContent = "What should the station play?";
    this.element.appendChild(label);

    if (this.selectedItem) {
      this.element.appendChild(this._renderSelection());
    } else {
      this.element.appendChild(this._renderSearch());
    }
  }

  _renderSearch() {
    const wrapper = document.createElement("div");
    wrapper.className = "music-picker-search";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "music-picker-input";
    input.placeholder = "Search for an artist, album, track or playlist…";
    input.autocomplete = "off";

    const results = document.createElement("div");
    results.className = "music-picker-results";
    results.style.display = "none";

    input.addEventListener("input", () => {
      clearTimeout(this._debounceTimer);
      const query = input.value.trim();
      if (query.length < 2) {
        results.style.display = "none";
        results.innerHTML = "";
        return;
      }
      this._debounceTimer = setTimeout(() => void this._search(query, results), 350);
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        results.style.display = "none";
        input.blur();
      }
    });

    // Close results when clicking outside
    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) {
        results.style.display = "none";
      }
    });

    wrapper.appendChild(input);
    wrapper.appendChild(results);
    return wrapper;
  }

  _renderSelection() {
    const item = this.selectedItem;
    const chip = document.createElement("div");
    chip.className = "music-picker-selection";

    const typeLabels = { artist: "Artist", album: "Album", track: "Track", playlist: "Playlist" };
    const typeIcons = { artist: "🎤", album: "💿", track: "🎵", playlist: "📋" };
    const subtitle =
      item.type === "artist"
        ? typeLabels[item.type]
        : item.type === "track"
          ? item.artistName
          : item.type === "album"
            ? item.artistName
            : (item.ownerName ?? "Playlist");

    chip.innerHTML = `
      ${item.imageUrl ? `<img class="music-picker-art" src="${escapeAttr(item.imageUrl)}" alt="" />` : `<span class="music-picker-art-placeholder">${typeIcons[item.type] ?? "🎵"}</span>`}
      <div class="music-picker-sel-info">
        <span class="music-picker-sel-name">${escapeHtml(item.name)}</span>
        <span class="music-picker-sel-meta muted">${typeIcons[item.type]} ${escapeHtml(subtitle)}</span>
      </div>
      <button class="btn-clear-selection" title="Clear selection">✕</button>
    `;

    chip.querySelector(".btn-clear-selection").addEventListener("click", () => this.clear());
    return chip;
  }

  // ── Search ──────────────────────────────────────────────────────────────────

  async _search(query, resultsEl) {
    resultsEl.innerHTML = `<div class="music-picker-loading muted">Searching…</div>`;
    resultsEl.style.display = "block";

    try {
      const data = await this.spotifyPlayer.searchAll(query, 10);
      const items = [...data.artists, ...data.albums, ...data.playlists];

      if (items.length === 0) {
        resultsEl.innerHTML = `<div class="music-picker-loading muted">No results found.</div>`;
        return;
      }

      resultsEl.innerHTML = "";

      const grouped = this._groupResults(data);
      for (const group of grouped) {
        if (group.items.length === 0) continue;
        const header = document.createElement("div");
        header.className = "music-picker-group-header muted";
        header.textContent = group.label;
        resultsEl.appendChild(header);

        for (const item of group.items) {
          resultsEl.appendChild(this._renderResultItem(item));
        }
      }
    } catch (err) {
      console.error("[MusicPicker] Search failed:", err);
      resultsEl.innerHTML = `<div class="music-picker-loading muted">Search failed.</div>`;
    }
  }

  _groupResults(data) {
    return [
      { label: "Artists", items: data.artists },
      { label: "Albums", items: data.albums },
      { label: "Playlists", items: data.playlists },
    ];
  }

  _renderResultItem(item) {
    const typeIcons = { artist: "🎤", album: "💿", track: "🎵", playlist: "📋" };
    const subtitle = item.type === "artist" ? "Artist" : (item.artistName ?? item.ownerName ?? "");

    const row = document.createElement("div");
    row.className = "music-picker-result";
    row.innerHTML = `
      ${item.imageUrl ? `<img class="music-picker-result-art" src="${escapeAttr(item.imageUrl)}" alt="" />` : `<span class="music-picker-result-art-placeholder">${typeIcons[item.type] ?? "🎵"}</span>`}
      <div class="music-picker-result-info">
        <span class="music-picker-result-name">${escapeHtml(item.name)}</span>
        <span class="music-picker-result-sub muted">${escapeHtml(subtitle)}</span>
      </div>
    `;

    row.addEventListener("click", () => {
      this.selectedItem = item;
      this._render();
      this._onSelectionChange?.(item);
    });

    return row;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeAttr(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
