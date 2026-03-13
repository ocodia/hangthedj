/**
 * SpotifyPlayerService: wraps the Spotify Web Playback SDK.
 * Handles SDK loading, normalized state, track changes, and Spotify Web API calls.
 */

const SDK_SCRIPT_URL = "https://sdk.scdn.co/spotify-player.js";

class SpotifyPlayerServiceImpl {
  constructor() {
    this.player = null;
    this.authService = null;
    this.deviceId = null;
    this.currentState = null;
    this.currentTrack = null;
    this._nextTrackInfo = null;

    this.stateChangeHandlers = [];
    this.trackChangeHandlers = [];

    this.lastPositionMs = 0;
    this.lastPositionTimestamp = 0;
    this.lastDurationMs = 0;
    this.lastIsPlaying = false;
  }

  async initialize(authService) {
    this.authService = authService;
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("Spotify SDK ready callback timed out after 10 seconds"));
      }, 10_000);

      window.onSpotifyWebPlaybackSDKReady = () => {
        clearTimeout(timeoutId);
        this.player = new window.Spotify.Player({
          name: "HangTheDJ",
          getOAuthToken: async (cb) => {
            const token = await authService.getAccessToken();
            if (token) cb(token);
          },
          volume: 1.0,
        });

        this.player.addListener("ready", (data) => {
          const { device_id } = data;
          this.deviceId = device_id;
          console.log("[SpotifyPlayer] Ready, device ID:", device_id);
          resolve();
        });

        this.player.addListener("not_ready", () => {
          console.warn("[SpotifyPlayer] Device not ready");
          this.deviceId = null;
        });

        this.player.addListener("player_state_changed", (state) => {
          if (!state) return;
          this._handleStateChange(state);
        });

        this.player.addListener("authentication_error", (err) => {
          console.error("[SpotifyPlayer] Auth error:", err);
          reject(new Error("Spotify authentication error"));
        });

        this.player.addListener("account_error", (err) => {
          console.error("[SpotifyPlayer] Account error (Premium required?):", err);
          reject(new Error("Spotify account error — Premium required for browser playback"));
        });

        this.player.connect().then((ok) => {
          if (!ok) reject(new Error("Spotify player failed to connect"));
        });
      };

      this._loadSdk().catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  async connect() {
    if (this.deviceId) return;
    if (!this.player) throw new Error("Player not initialized");
    const ok = await this.player.connect();
    if (!ok) throw new Error("Spotify player failed to connect");
  }

  disconnect() {
    this.player?.disconnect();
    this.deviceId = null;
    this.currentState = null;
    this.currentTrack = null;
  }

  getCurrentTrack() {
    return this.currentTrack;
  }

  getPlaybackState() {
    return this.currentState;
  }

  async pause() {
    if (!this.player) throw new Error("Player not initialized");
    await this.player.pause();
  }

  async seek(positionMs) {
    if (!this.player) throw new Error("Player not initialized");
    await this.player.seek(positionMs);
  }

  async nextTrack() {
    if (!this.player) throw new Error("Player not initialized");
    await this.player.nextTrack();
  }

  async setVolume(volume) {
    if (!this.player) throw new Error("Player not initialized");
    await this.player.setVolume(Math.max(0, Math.min(1, volume)));
  }

  async getVolume() {
    if (!this.player) throw new Error("Player not initialized");
    return this.player.getVolume();
  }

  async resume() {
    if (!this.player) throw new Error("Player not initialized");
    await this.player.resume();
  }

  async transferPlayback() {
    if (!this.deviceId) throw new Error("No device ID — player not ready");
    if (!this.authService) throw new Error("Auth service not available");

    const token = await this.authService.getAccessToken();
    if (!token) throw new Error("No access token available");

    const res = await fetch("https://api.spotify.com/v1/me/player", {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        device_ids: [this.deviceId],
        play: true,
      }),
    });

    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`Transfer playback failed: ${res.status} ${text}`);
    }

    console.log("[SpotifyPlayer] Playback transferred to HangTheDJ device");
  }

  onStateChange(handler) {
    this.stateChangeHandlers.push(handler);
    return () => {
      this.stateChangeHandlers = this.stateChangeHandlers.filter((h) => h !== handler);
    };
  }

  onTrackChange(handler) {
    this.trackChangeHandlers.push(handler);
    return () => {
      this.trackChangeHandlers = this.trackChangeHandlers.filter((h) => h !== handler);
    };
  }

  getDeviceId() {
    return this.deviceId;
  }

  getNextTrack() {
    return this._nextTrackInfo;
  }

  async fetchCurrentPosition() {
    if (this.lastPositionTimestamp === 0) {
      if (!this.player) return null;
      const state = await this.player.getCurrentState();
      if (!state) return null;
      this.lastPositionMs = state.position;
      this.lastDurationMs = state.duration;
      this.lastIsPlaying = !state.paused;
      this.lastPositionTimestamp = Date.now();
      return {
        progressMs: state.position,
        durationMs: state.duration,
        isPlaying: !state.paused,
      };
    }

    const elapsed = this.lastIsPlaying ? Date.now() - this.lastPositionTimestamp : 0;
    const progressMs = Math.min(this.lastPositionMs + elapsed, this.lastDurationMs);

    return {
      progressMs,
      durationMs: this.lastDurationMs,
      isPlaying: this.lastIsPlaying,
    };
  }

  async searchTrack(query) {
    if (!this.authService) throw new Error("Auth service not available");
    const token = await this.authService.getAccessToken();
    if (!token) throw new Error("No access token available");

    const params = new URLSearchParams({ q: query, type: "track", limit: "1" });
    const res = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify search failed: ${res.status} ${text}`);
    }

    const data = await res.json();
    const item = data?.tracks?.items?.[0];
    if (!item) return null;

    return {
      id: item.id,
      title: item.name,
      artistName: item.artists?.map((a) => a.name).join(", ") ?? "Unknown",
      albumName: item.album?.name,
      durationMs: item.duration_ms,
      artworkUrl: item.album?.images?.[0]?.url,
      uri: item.uri,
    };
  }

  async searchTracks(query, limit = 5) {
    if (!this.authService) throw new Error("Auth service not available");
    const token = await this.authService.getAccessToken();
    if (!token) throw new Error("No access token available");

    const params = new URLSearchParams({ q: query, type: "track", limit: String(limit) });
    const res = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const items = data?.tracks?.items;
    if (!Array.isArray(items)) return [];

    return items.map((item) => ({
      id: item.id,
      title: item.name,
      artistName: item.artists?.map((a) => a.name).join(", ") ?? "Unknown",
      albumName: item.album?.name,
      durationMs: item.duration_ms,
      artworkUrl: item.album?.images?.[0]?.url,
      uri: item.uri,
    }));
  }

  async addToQueue(trackUri) {
    if (!this.authService) throw new Error("Auth service not available");
    const token = await this.authService.getAccessToken();
    if (!token) throw new Error("No access token available");

    const params = new URLSearchParams({ uri: trackUri });
    const res = await fetch(`https://api.spotify.com/v1/me/player/queue?${params.toString()}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`Add to queue failed: ${res.status} ${text}`);
    }
  }

  /**
   * Search Spotify for artists, albums, and playlists.
   * Returns categorised results.
   */
  async searchAll(query, limit = 10) {
    if (!this.authService) throw new Error("Auth service not available");
    const token = await this.authService.getAccessToken();
    if (!token) throw new Error("No access token available");

    const params = new URLSearchParams({
      q: query,
      type: "artist,album,playlist",
      limit: String(limit),
    });
    const res = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return { artists: [], albums: [], playlists: [] };

    const data = await res.json();

    const artists = (data.artists?.items ?? []).map((a) => ({
      type: "artist",
      id: a.id,
      name: a.name,
      imageUrl: a.images?.[0]?.url ?? null,
      uri: a.uri,
    }));

    const albums = (data.albums?.items ?? []).map((a) => ({
      type: "album",
      id: a.id,
      name: a.name,
      artistName: a.artists?.map((ar) => ar.name).join(", ") ?? "Unknown",
      imageUrl: a.images?.[0]?.url ?? null,
      uri: a.uri,
    }));

    const playlists = (data.playlists?.items ?? []).filter(Boolean).map((p) => ({
      type: "playlist",
      id: p.id,
      name: p.name,
      ownerName: p.owner?.display_name ?? "Spotify",
      imageUrl: p.images?.[0]?.url ?? null,
      uri: p.uri,
    }));

    return { artists, albums, playlists };
  }

  /**
   * Start playback with a Spotify context URI (artist, album, playlist)
   * or a single track URI.
   */
  async playContext(contextUri) {
    if (!this.deviceId) throw new Error("No device ID — player not ready");
    if (!this.authService) throw new Error("Auth service not available");
    const token = await this.authService.getAccessToken();
    if (!token) throw new Error("No access token available");

    const body = contextUri.startsWith("spotify:track:") ? { uris: [contextUri] } : { context_uri: contextUri };

    const params = new URLSearchParams({ device_id: this.deviceId });
    const res = await fetch(`https://api.spotify.com/v1/me/player/play?${params.toString()}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok && res.status !== 204) {
      const text = await res.text();
      throw new Error(`Play context failed: ${res.status} ${text}`);
    }

    console.log("[SpotifyPlayer] Started playback with context:", contextUri);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  _handleStateChange(sdkState) {
    const sdkTrack = sdkState.track_window.current_track;
    const track = sdkTrack ? this._normalizeTrack(sdkTrack) : null;

    const sdkNextTrack = sdkState.track_window.next_tracks?.[0];
    this._nextTrackInfo = sdkNextTrack ? this._normalizeTrack(sdkNextTrack) : null;

    this.lastPositionMs = sdkState.position;
    this.lastDurationMs = sdkState.duration;
    this.lastIsPlaying = !sdkState.paused;
    this.lastPositionTimestamp = Date.now();

    const state = {
      isPlaying: !sdkState.paused,
      progressMs: sdkState.position,
      track,
      isDjPause: false,
    };

    const prevTrackId = this.currentTrack?.id;
    this.currentState = state;
    this.currentTrack = track;

    this.stateChangeHandlers.forEach((h) => h(state));

    if (track?.id !== prevTrackId) {
      this.trackChangeHandlers.forEach((h) => h(track));
    }
  }

  _normalizeTrack(sdkTrack) {
    return {
      id: sdkTrack.id,
      title: sdkTrack.name,
      artistName: sdkTrack.artists.map((a) => a.name).join(", "),
      albumName: sdkTrack.album.name,
      durationMs: sdkTrack.duration_ms,
      artworkUrl: sdkTrack.album.images[0]?.url,
      uri: sdkTrack.uri,
    };
  }

  _loadSdk() {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${SDK_SCRIPT_URL}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = SDK_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Spotify Web Playback SDK — check network or ad blocker"));
      document.body.appendChild(script);
    });
  }
}

export function createSpotifyPlayerService() {
  return new SpotifyPlayerServiceImpl();
}
