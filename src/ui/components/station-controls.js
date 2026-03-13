/**
 * StationControls: start/stop session, mood selector, DJ status.
 *
 * Two-phase banter system:
 *   Phase 1: < 30s remaining → pre-generate banter + TTS
 *   Phase 2: < 10s remaining → crossfade transition
 */

import {
  appStore,
  updateSessionState,
  updateAiState,
  updatePlaybackState,
  updatePersonaState,
  addDjActivityEntry,
  clearDjActivity,
} from "../../stores/app-store.js";
import { saveSettings, loadSettings, saveSession } from "../../features/storage/storage-service.js";
import { generateUUID } from "../../utils.js";
import { PersonaEditor } from "./persona-editor.js";
import { StationMusicPicker } from "./station-music-picker.js";

export class StationControls {
  constructor(services) {
    this.services = services;
    this.sessionId = null;
    this.unsubscribeTrackChange = null;
    this.unsubscribeRequests = null;
    this.positionInterval = null;
    this.isPreparingBanter = false;
    this.banterEvaluatedForTrackId = null;
    this.isStopping = false;

    this.userMusicVolume = 1.0;
    this.isFading = false;
    this.shuffleEnabled = false;

    this.pendingTransition = null;
    this.pendingTransitionForTrackId = null;

    this.pendingCallIns = [];
    this.isProcessingCallIn = false;
    this.processedCallInSummaries = [];

    this.personaEditor = new PersonaEditor(services, {
      onClose: () => {
        this.personaEditor.close();
        this._render();
      },
      getElevenLabsKey: () => this.services.callbacks?.getElevenLabsKey?.() ?? null,
    });

    this.musicPicker = new StationMusicPicker(services.spotifyPlayer);
    this.musicPicker.onSelectionChange(() => this._render());

    this.element = document.createElement("div");
    this.element.className = "station-controls panel";
    this._render();

    appStore.subscribe("session", () => this._render());
    appStore.subscribe("ai", () => this._render());
    appStore.subscribe("spotify", () => this._render());
    appStore.subscribe("settings", () => this._render());
    appStore.subscribe("persona", () => this._render());
    appStore.subscribe("playback", () => this._updatePlayPause());

    this.services.coordinator.onVolumeChange((vol) => {
      const slider = this.element.querySelector("#vol-music");
      const label = this.element.querySelector("#vol-music-value");
      const pct = Math.round(vol * 100);
      if (slider) {
        slider.value = String(pct);
        slider.style.setProperty("--fill", `${pct}%`);
        slider.disabled = true;
      }
      if (label) label.textContent = `${pct}%`;
    });

    this.services.coordinator.onStateChange((state) => {
      if (state === "monitoring" || state === "idle") {
        const slider = this.element.querySelector("#vol-music");
        if (slider) slider.disabled = false;
      }
    });
  }

  _render() {
    const session = appStore.get("session");
    const ai = appStore.get("ai");
    const spotify = appStore.get("spotify");

    const persona = appStore.get("persona");
    const personaOptions = persona.personas
      .map(
        (p) =>
          `<option value="${p.id}" ${p.id === persona.activePersona?.id ? "selected" : ""}>
            ${escapeHtml(p.name)}${p.isPreset ? " ★" : ""}
          </option>`,
      )
      .join("");

    this.element.innerHTML = `
      <div class="station-header">
        <h2>Station</h2>
        <span class="station-status ${session.isRunning ? "status-on" : "status-off"}">
          ${session.isRunning ? "● On Air" : "○ Off Air"}
        </span>
      </div>
      <div class="field">
        <label for="persona-select">DJ Persona</label>
        <div style="display:flex;gap:0.5rem;align-items:center">
          <select id="persona-select" style="flex:1">${personaOptions}</select>
          <button class="secondary btn-sm" id="btn-edit-persona">Edit</button>
          <button class="secondary btn-sm" id="btn-add-persona">+ New</button>
        </div>
      </div>
      <div id="persona-editor-mount"></div>
      ${!ai.hasOpenAiKey ? `<p class="muted" style="font-size:0.8rem">Set your OpenAI key in Settings to enable DJ banter.</p>` : ""}
      ${!spotify.isConnected && !session.isRunning ? `<p class="muted" style="font-size:0.8rem">Connect Spotify to start a session.</p>` : ""}
      <div id="music-picker-mount"></div>
      <div class="station-actions">
        ${
          !session.isRunning
            ? `
        <div class="field toggle-field" style="margin-bottom:0">
          <label class="toggle-switch">
            <input type="checkbox" id="chk-shuffle" ${this.shuffleEnabled ? "checked" : ""} />
            <span class="toggle-slider"></span>
          </label>
          <div class="toggle-label-group">
            <span class="toggle-label-text">DJ's choice</span>
            <span class="muted" style="font-size:0.75rem">Shuffle the playlist</span>
          </div>
        </div>`
            : ""
        }
        ${
          this.isStopping
            ? `<button disabled style="background:#e67e22;color:#fff;cursor:not-allowed">Signing off…</button>`
            : session.isRunning
              ? `<button class="playback-toggle" id="btn-play-pause" title="${appStore.get("playback").isPlaying ? "Pause" : "Play"}">${appStore.get("playback").isPlaying ? "⏸" : "▶"}</button>
                 <button class="danger" id="btn-stop">Sign Off</button>
               ${appStore.get("settings").debugMode ? `<button id="btn-debug-skip" style="margin-left:0.5rem;background:#555;color:#ff0;font-size:0.75rem;padding:0.25rem 0.5rem;border:1px dashed #ff0;border-radius:4px;cursor:pointer" title="Skip to ~35s before end of track">⏩ Skip to banter</button>` : ""}`
              : `<button id="btn-start" ${!spotify.isConnected || !this.musicPicker.getSelection() ? "disabled" : ""}>Tune In</button>`
        }
      </div>
      <div class="volume-sliders">
        <div class="volume-slider-row">
          <label class="volume-label">🎵 Music</label>
          <input type="range" id="vol-music" min="0" max="100" value="100" class="volume-slider" />
          <span class="volume-value" id="vol-music-value">100%</span>
        </div>
        <div class="volume-slider-row">
          <label class="volume-label">🎙️ DJ Voice</label>
          <input type="range" id="vol-dj" min="0" max="100" value="100" class="volume-slider" />
          <span class="volume-value" id="vol-dj-value">100%</span>
        </div>
      </div>
      <div class="dj-status muted" id="dj-status">
        ${session.isRunning ? "DJ is monitoring the station..." : "Session stopped."}
      </div>
    `;

    this.element.querySelector("#btn-start")?.addEventListener("click", () => void this._startSession());
    this.element.querySelector("#btn-stop")?.addEventListener("click", () => void this._stopSession());
    this.element.querySelector("#btn-debug-skip")?.addEventListener("click", () => void this._debugSkipToBanter());
    this.element.querySelector("#chk-shuffle")?.addEventListener("change", (e) => {
      this.shuffleEnabled = e.target.checked;
    });
    this.element.querySelector("#btn-play-pause")?.addEventListener("click", () => {
      const pb = appStore.get("playback");
      if (pb.isPlaying) {
        this.services.spotifyPlayer.pause().catch(console.error);
      } else {
        this.services.spotifyPlayer.resume().catch(console.error);
      }
    });

    // Mount the music picker when off-air
    const pickerMount = this.element.querySelector("#music-picker-mount");
    if (pickerMount) {
      if (!session.isRunning) {
        pickerMount.appendChild(this.musicPicker.element);
      }
    }

    this.element.querySelector("#btn-edit-persona")?.addEventListener("click", () => {
      const active = appStore.get("persona").activePersona;
      if (active) {
        this.personaEditor.open(active);
        const mount = this.element.querySelector("#persona-editor-mount");
        if (mount) {
          mount.innerHTML = "";
          mount.appendChild(this.personaEditor.element);
        }
      }
    });
    this.element.querySelector("#btn-add-persona")?.addEventListener("click", () => {
      this.personaEditor.open(null);
      const mount = this.element.querySelector("#persona-editor-mount");
      if (mount) {
        mount.innerHTML = "";
        mount.appendChild(this.personaEditor.element);
      }
    });

    const musicSlider = this.element.querySelector("#vol-music");
    const djSlider = this.element.querySelector("#vol-dj");
    const musicValue = this.element.querySelector("#vol-music-value");
    const djValue = this.element.querySelector("#vol-dj-value");

    {
      const pct = Math.round(this.userMusicVolume * 100);
      if (musicSlider) {
        musicSlider.value = String(pct);
        musicSlider.style.setProperty("--fill", `${pct}%`);
        musicSlider.disabled = this.isFading;
      }
      if (musicValue) musicValue.textContent = `${pct}%`;
    }
    const djVol = this.services.djPlayer.getVolume();
    if (djSlider) {
      djSlider.value = String(Math.round(djVol * 100));
      djSlider.style.setProperty("--fill", `${Math.round(djVol * 100)}%`);
    }
    if (djValue) djValue.textContent = `${Math.round(djVol * 100)}%`;

    musicSlider?.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      if (musicValue) musicValue.textContent = `${val}%`;
      e.target.style.setProperty("--fill", `${val}%`);
      const vol = val / 100;
      this.userMusicVolume = vol;
      this.services.coordinator.setTargetVolume(vol);
      this.services.spotifyPlayer.setVolume(vol).catch(() => {});
    });
    djSlider?.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      if (djValue) djValue.textContent = `${val}%`;
      e.target.style.setProperty("--fill", `${val}%`);
      this.services.djPlayer.setVolume(val / 100);
    });

    this.element.querySelector("#persona-select")?.addEventListener("change", async (e) => {
      const id = e.target.value;
      const p = await this.services.personaService.getById(id);
      if (p) {
        updatePersonaState({ activePersona: p });
        const current = loadSettings();
        saveSettings({ ...current, activePersonaId: id });
      }
    });
  }

  // ── Session lifecycle ───────────────────────────────────────────────────────

  async _debugSkipToBanter() {
    const pos = await this.services.spotifyPlayer.fetchCurrentPosition();
    if (!pos) {
      console.warn("[DebugSkip] No position data");
      return;
    }
    const seekTo = Math.max(0, pos.durationMs - 35_000);
    console.log(`[DebugSkip] Seeking to ${Math.round(seekTo / 1000)}s / ${Math.round(pos.durationMs / 1000)}s (35s before end)`);
    addDjActivityEntry({ type: "system", text: `⏩ Debug skip: jumping to ${Math.round(seekTo / 1000)}s (35s before end)`, debug: true });
    await this.services.spotifyPlayer.seek(seekTo);
    this.banterEvaluatedForTrackId = null;
    this.pendingTransition = null;
    this.pendingTransitionForTrackId = null;
  }

  async _startSession() {
    const personaState = appStore.get("persona");

    if (!personaState.activePersona) {
      alert("Please select a DJ persona first.");
      return;
    }

    this.sessionId = generateUUID();
    const now = new Date().toISOString();

    const session = {
      id: this.sessionId,
      startedAt: now,
      personaId: personaState.activePersona.id,
    };

    await saveSession(session);
    updateSessionState({ activeSession: session, isRunning: true });
    clearDjActivity();

    this.services.coordinator.startMonitoring();
    this.services.scheduler.resetSession();

    // 1. Ensure Spotify player is connected
    if (!this.services.spotifyPlayer.getDeviceId()) {
      try {
        await this.services.spotifyPlayer.initialize(this.services.spotifyAuth);
        await this.services.spotifyPlayer.connect();
        appStore.update("spotify", {
          isConnected: true,
          deviceId: this.services.spotifyPlayer.getDeviceId(),
        });
      } catch (err) {
        console.error("[StationControls] Spotify init failed:", err);
        addDjActivityEntry({ type: "error", text: "Spotify connection failed. Please try again." });
        this._stopSession();
        return;
      }
    }

    addDjActivityEntry({ type: "system", text: "Tuning in… DJ is warming up 🎤", debug: true });

    // 2. Set volume to 0 so music plays silently during intro
    await this.services.spotifyPlayer.setVolume(0).catch(() => {});

    // 3. Subscribe to track changes (before transfer so the first track event is captured)
    this.unsubscribeTrackChange = this.services.spotifyPlayer.onTrackChange((track) => {
      if (!track || !this.sessionId) return;
      updatePlaybackState({ currentTrack: track });
      this.services.scheduler.recordTrackChange();

      addDjActivityEntry({
        type: "track",
        text: `🎵 Now playing: "${track.title}" by ${track.artistName}`,
      });

      this._checkCallInFulfillment(track);

      const current = appStore.get("playback");
      updatePlaybackState({
        recentTracks: [track, ...current.recentTracks].slice(0, 10),
      });

      this.banterEvaluatedForTrackId = null;
      this.pendingTransition = null;
      this.pendingTransitionForTrackId = null;
    });

    // 4. Start playback with the selected music context
    const selectedMusic = this.musicPicker.getSelection();
    try {
      if (selectedMusic?.uri) {
        await this.services.spotifyPlayer.playContext(selectedMusic.uri);
        addDjActivityEntry({ type: "system", text: `Music started: ${selectedMusic.name} — DJ taking the mic!`, debug: true });
      } else {
        await this.services.spotifyPlayer.transferPlayback();
        addDjActivityEntry({ type: "system", text: "Music started — DJ taking the mic!", debug: true });
      }
      // Apply shuffle setting after playback starts
      await this.services.spotifyPlayer.setShuffle(this.shuffleEnabled).catch((err) => {
        console.warn("[StationControls] Failed to set shuffle:", err);
      });
    } catch (err) {
      console.error("[StationControls] Playback start failed:", err);
      addDjActivityEntry({ type: "error", text: "Could not start Spotify playback. Try a different selection." });
    }

    // 5. Play DJ intro over the silent music, fading in music near the end
    await this._playDjIntroWithFade();
    this.services.coordinator.setTargetVolume(this.userMusicVolume);

    // 6. Subscribe to request state changes
    this.unsubscribeRequests = appStore.subscribe("requests", (reqState) => {
      if (!this.sessionId) return;
      const newRequests = reqState.requests.filter((r) => r.status === "pending" && !r.spokenAcknowledgement && !r.spotifyUri);
      for (const req of newRequests) {
        if (!this.pendingCallIns.some((c) => c.id === req.id)) {
          this.pendingCallIns.push(req);
        }
      }
    });

    // 7. Start position monitor (polls every 1s)
    this._startPositionMonitor();
  }

  async _stopSession() {
    if (this.isStopping) return;
    this.isStopping = true;
    this._render();

    if (this.positionInterval !== null) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }
    this.unsubscribeTrackChange?.();
    this.unsubscribeTrackChange = null;
    this.unsubscribeRequests?.();
    this.unsubscribeRequests = null;
    this.services.coordinator.stopMonitoring();
    this.isPreparingBanter = false;
    this.isProcessingCallIn = false;
    this.banterEvaluatedForTrackId = null;
    this.pendingTransition = null;
    this.pendingTransitionForTrackId = null;
    this.pendingCallIns = [];
    this.processedCallInSummaries = [];

    await this._playDjSignOff();

    this.services.spotifyPlayer.pause().catch((err) => {
      console.warn("[StationControls] Failed to pause Spotify on stop:", err);
    });

    updateSessionState({ isRunning: false });

    if (this.sessionId) {
      addDjActivityEntry({ type: "system", text: "Signed off. Thanks for listening!" });
      saveSession({
        ...appStore.get("session").activeSession,
        endedAt: new Date().toISOString(),
      }).catch(console.error);
    }

    this.sessionId = null;
    this.isStopping = false;
    this.musicPicker.clear();
    this._render();
  }

  // ── DJ Sign-off ─────────────────────────────────────────────────────────────

  async _playDjSignOff() {
    const { banterEngine, voiceEngine } = this.services;
    if (!banterEngine || !voiceEngine) {
      addDjActivityEntry({ type: "system", text: "DJ banter disabled (no OpenAI key) — skipping sign-off.", debug: true });
      await this._fadeSpotifyVolume(await this.services.spotifyPlayer.getVolume().catch(() => 0.8), 0, 3_000);
      return;
    }

    const personaState = appStore.get("persona");
    if (!personaState.activePersona) {
      await this._fadeSpotifyVolume(await this.services.spotifyPlayer.getVolume().catch(() => 0.8), 0, 3_000);
      return;
    }

    const savedVolume = this.userMusicVolume;
    try {
      updateAiState({ isGenerating: true, lastError: null });
      addDjActivityEntry({ type: "system", text: "🧠 Generating sign-off banter…", debug: true });

      const banterResult = await banterEngine.generate({
        persona: personaState.activePersona,
        segmentType: "signOff",
        currentTrack: appStore.get("playback").currentTrack,
        recentTracks: appStore.get("playback").recentTracks,
        requestSummary: [],
        recentBanterSummaries: [],
        constraints: {
          maxWords: 60,
          maxSeconds: 25,
          familySafe: appStore.get("settings").schedulerConfig.familySafe,
        },
      });

      this._logPromptsIfDebug(banterResult);

      updateAiState({ isGenerating: false, isRendering: true });
      addDjActivityEntry({ type: "system", text: "🎙️ Rendering sign-off voice…", debug: true });

      const voiceResult = await voiceEngine.render({
        text: banterResult.text,
        voice: personaState.activePersona.voice,
        elevenLabsVoiceId: personaState.activePersona.elevenLabsVoiceId,
        speechRate: personaState.activePersona.speechRate,
        format: "mp3",
      });

      updateAiState({ isRendering: false });

      addDjActivityEntry({ type: "dj", text: `🎤 ${banterResult.text}` });

      await this._fadeSpotifyVolume(savedVolume, 0.15, 2_000);
      await this.services.djPlayer.play(voiceResult.objectUrl);
      await this._fadeSpotifyVolume(0.15, 0, 2_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[StationControls] DJ sign-off failed:", msg);
      updateAiState({ isGenerating: false, isRendering: false, lastError: msg });
      addDjActivityEntry({ type: "error", text: `DJ sign-off failed: ${msg}` });
      await this._fadeSpotifyVolume(savedVolume, 0, 2_000).catch(() => {});
    }
  }

  // ── DJ Intro ────────────────────────────────────────────────────────────────

  async _playDjIntro() {
    const { banterEngine, voiceEngine } = this.services;
    if (!banterEngine || !voiceEngine) {
      addDjActivityEntry({ type: "system", text: "DJ banter disabled (no OpenAI key).", debug: true });
      return;
    }

    const personaState = appStore.get("persona");
    if (!personaState.activePersona) return;

    try {
      updateAiState({ isGenerating: true, lastError: null });

      const banterResult = await banterEngine.generate({
        persona: personaState.activePersona,
        segmentType: "stationIdent",
        currentTrack: null,
        recentTracks: [],
        requestSummary: [],
        recentBanterSummaries: [],
        constraints: {
          maxWords: 60,
          maxSeconds: 25,
          familySafe: appStore.get("settings").schedulerConfig.familySafe,
        },
      });

      this._logPromptsIfDebug(banterResult);

      updateAiState({ isGenerating: false, isRendering: true });

      const voiceResult = await voiceEngine.render({
        text: banterResult.text,
        voice: personaState.activePersona.voice,
        elevenLabsVoiceId: personaState.activePersona.elevenLabsVoiceId,
        speechRate: personaState.activePersona.speechRate,
        format: "mp3",
      });

      updateAiState({ isRendering: false });

      addDjActivityEntry({
        type: "dj",
        text: `🎤 ${banterResult.text}`,
      });

      await this.services.djPlayer.play(voiceResult.objectUrl);
      this.services.scheduler.recordInsertion("stationIdent");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[StationControls] DJ intro failed:", msg);
      updateAiState({ isGenerating: false, isRendering: false, lastError: msg });
      addDjActivityEntry({ type: "error", text: `DJ intro failed: ${msg}` });
    }
  }

  /**
   * Play the DJ intro and fade music in 2.5s before the banter clip finishes.
   */
  async _playDjIntroWithFade() {
    const { banterEngine, voiceEngine } = this.services;
    if (!banterEngine || !voiceEngine) {
      addDjActivityEntry({ type: "system", text: "DJ banter disabled (no OpenAI key).", debug: true });
      await this._fadeSpotifyVolume(0, this.userMusicVolume, 2_000);
      return;
    }

    const personaState = appStore.get("persona");
    if (!personaState.activePersona) {
      await this._fadeSpotifyVolume(0, this.userMusicVolume, 2_000);
      return;
    }

    try {
      updateAiState({ isGenerating: true, lastError: null });

      // Wait briefly for the first track to arrive from the Spotify SDK
      let firstTrack = appStore.get("playback").currentTrack ?? null;
      if (!firstTrack) {
        firstTrack = await new Promise((resolve) => {
          const timeout = setTimeout(() => resolve(null), 3_000);
          const unsub = appStore.subscribe("playback", (pb) => {
            if (pb.currentTrack) {
              clearTimeout(timeout);
              unsub();
              resolve(pb.currentTrack);
            }
          });
        });
      }

      const playbackState = appStore.get("playback");
      const banterResult = await banterEngine.generate({
        persona: personaState.activePersona,
        segmentType: "stationIdent",
        currentTrack: firstTrack,
        nextTrack: firstTrack,
        recentTracks: playbackState.recentTracks ?? [],
        requestSummary: [],
        recentBanterSummaries: [],
        constraints: {
          maxWords: 60,
          maxSeconds: 25,
          familySafe: appStore.get("settings").schedulerConfig.familySafe,
        },
      });

      this._logPromptsIfDebug(banterResult);

      updateAiState({ isGenerating: false, isRendering: true });

      const voiceResult = await voiceEngine.render({
        text: banterResult.text,
        voice: personaState.activePersona.voice,
        elevenLabsVoiceId: personaState.activePersona.elevenLabsVoiceId,
        speechRate: personaState.activePersona.speechRate,
        format: "mp3",
      });

      updateAiState({ isRendering: false });

      addDjActivityEntry({
        type: "dj",
        text: `🎤 ${banterResult.text}`,
      });

      // Play intro and start fading music in 3s before the clip ends
      await this.services.djPlayer.playWithFadeCallback(voiceResult.objectUrl, 2.5, () => {
        this._fadeSpotifyVolume(0, this.userMusicVolume, 3_000);
      });
      this.services.scheduler.recordInsertion("stationIdent");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[StationControls] DJ intro (with fade) failed:", msg);
      updateAiState({ isGenerating: false, isRendering: false, lastError: msg });
      addDjActivityEntry({ type: "error", text: `DJ intro failed: ${msg}` });
      // Ensure music is audible even if intro failed
      await this._fadeSpotifyVolume(0, this.userMusicVolume, 2_000).catch(() => {});
    }
  }

  // ── Position monitor ────────────────────────────────────────────────────────

  _startPositionMonitor() {
    this.positionInterval = window.setInterval(() => {
      void this._checkPosition();
    }, 1_000);
  }

  async _checkPosition() {
    if (!this.sessionId) return;

    const position = await this.services.spotifyPlayer.fetchCurrentPosition();
    if (!position || !position.isPlaying) return;

    const remaining = position.durationMs - position.progressMs;
    const currentTrackId = appStore.get("playback").currentTrack?.id ?? null;

    updatePlaybackState({
      progressMs: position.progressMs,
      durationMs: position.durationMs,
      nextTrack: this.services.spotifyPlayer.getNextTrack(),
    });

    if (remaining > 0 && remaining % 5000 < 1100) {
      console.log(
        `[PositionMonitor] ${Math.round(remaining / 1000)}s remaining | preparing=${this.isPreparingBanter} | hasPending=${!!this.pendingTransition} | coordinator=${this.services.coordinator.getState()}`,
      );
    }

    // Phase 1: Pre-generate banter when < 30s remaining
    if (
      remaining <= 30_000 &&
      remaining > 10_000 &&
      !this.isPreparingBanter &&
      !this.pendingTransition &&
      currentTrackId !== this.banterEvaluatedForTrackId
    ) {
      console.log(`[PositionMonitor] ⚡ Phase 1: ${Math.round(remaining / 1000)}s remaining — pre-generating banter`);
      addDjActivityEntry({ type: "system", text: `⏱️ ${Math.round(remaining / 1000)}s left — preparing DJ banter…`, debug: true });
      this.banterEvaluatedForTrackId = currentTrackId;
      this.isPreparingBanter = true;
      try {
        await this._preGenerateBanter();
      } finally {
        this.isPreparingBanter = false;
      }
    }

    // Phase 2: Execute crossfade when < 10s remaining and clip is ready
    if (
      remaining <= 10_000 &&
      remaining > 0 &&
      this.pendingTransition &&
      this.pendingTransitionForTrackId === currentTrackId &&
      this.services.coordinator.getState() === "monitoring"
    ) {
      console.log(`[PositionMonitor] 🎙️ Phase 2: ${Math.round(remaining / 1000)}s remaining — executing transition`);
      const transition = this.pendingTransition;
      this.pendingTransition = null;
      this.pendingTransitionForTrackId = null;

      addDjActivityEntry({ type: "dj", text: `🎤 ${transition.banterText}${transition.trackInfo}` });

      await this.services.coordinator.executeTransition(transition.objectUrl);
      this.services.scheduler.recordInsertion(transition.segmentType);

      const statusEl = this.element.querySelector("#dj-status");
      if (statusEl) statusEl.textContent = "DJ is monitoring the station…";
    }

    // Phase 3: Process call-in queue
    if (this.pendingCallIns.length > 0 && !this.isProcessingCallIn) {
      void this._processNextCallIn();
    }
  }

  async _preGenerateBanter() {
    const { banterEngine, voiceEngine } = this.services;
    if (!banterEngine || !voiceEngine) {
      console.warn("[Banter] No banterEngine or voiceEngine — is OpenAI key set?");
      addDjActivityEntry({ type: "error", text: "DJ banter disabled — no OpenAI key configured.", debug: true });
      return;
    }
    if (!appStore.get("ai").hasOpenAiKey) {
      console.warn("[Banter] hasOpenAiKey is false in store");
      return;
    }

    const personaState = appStore.get("persona");
    if (!personaState.activePersona) {
      console.warn("[Banter] No active persona");
      addDjActivityEntry({ type: "error", text: "No DJ persona selected." });
      return;
    }

    const currentTrack = appStore.get("playback").currentTrack;
    const currentTrackId = currentTrack?.id ?? null;

    const decision = this.services.scheduler.onTrackChange(
      currentTrack,
      this.services.spotifyPlayer.getPlaybackState(),
      personaState.activePersona,
      null,
      [],
      [],
      appStore.get("settings").schedulerConfig,
    );

    console.log("[Banter] Scheduler decision:", decision);
    if (!decision.shouldInsert || !decision.segmentType) {
      console.log("[Banter] Scheduler says skip:", decision.reason);
      addDjActivityEntry({ type: "system", text: `DJ decided to skip: ${decision.reason}`, debug: true });
      return;
    }

    try {
      updateAiState({ isGenerating: true, lastError: null });
      const statusEl = this.element.querySelector("#dj-status");
      if (statusEl) statusEl.textContent = "DJ is thinking…";
      addDjActivityEntry({ type: "system", text: "🧠 Generating banter script…", debug: true });

      const banterResult = await banterEngine.generate({
        persona: personaState.activePersona,
        segmentType: decision.segmentType,
        currentTrack,
        nextTrack: this.services.spotifyPlayer.getNextTrack(),
        recentTracks: appStore.get("playback").recentTracks,
        requestSummary: [...this.processedCallInSummaries],
        recentBanterSummaries: [],
        constraints: {
          maxWords: 60,
          maxSeconds: 20,
          familySafe: appStore.get("settings").schedulerConfig.familySafe,
        },
      });

      this.processedCallInSummaries = [];
      this._logPromptsIfDebug(banterResult);

      console.log("[Banter] Script generated:", banterResult.text);
      updateAiState({ isGenerating: false, isRendering: true });
      if (statusEl) statusEl.textContent = "DJ is recording…";
      addDjActivityEntry({ type: "system", text: "🎙️ Rendering voice…", debug: true });

      const voiceResult = await voiceEngine.render({
        text: banterResult.text,
        voice: personaState.activePersona.voice,
        elevenLabsVoiceId: personaState.activePersona.elevenLabsVoiceId,
        speechRate: personaState.activePersona.speechRate,
        format: "mp3",
      });

      console.log("[Banter] Voice rendered, caching for playback");
      updateAiState({ isRendering: false });

      const trackInfo = currentTrack ? ` [after "${currentTrack.title}" by ${currentTrack.artistName}]` : "";
      const wordCount = banterResult.text.split(/\s+/).length;
      addDjActivityEntry({ type: "system", text: `✅ Banter ready (${wordCount} words) — waiting for track to end…`, debug: true });

      this.pendingTransition = {
        objectUrl: voiceResult.objectUrl,
        segmentType: decision.segmentType,
        banterText: banterResult.text,
        trackInfo,
      };
      this.pendingTransitionForTrackId = currentTrackId;

      if (statusEl) statusEl.textContent = `DJ ready: "${banterResult.text.slice(0, 60)}…"`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Banter] Failed:", msg);
      updateAiState({ isGenerating: false, isRendering: false, lastError: msg });
      addDjActivityEntry({ type: "error", text: `Banter failed: ${msg}` });
    }
  }

  // ── Call-in processing ──────────────────────────────────────────────────────

  async _processNextCallIn() {
    if (this.pendingCallIns.length === 0 || this.isProcessingCallIn) return;

    this.isProcessingCallIn = true;
    const request = this.pendingCallIns.shift();
    const callerLabel = request.callerName ?? "A listener";
    const messageSnippet = request.message ? ` They say: "${request.message}"` : "";

    try {
      const queryParts = [request.artistName];
      if (request.trackName) queryParts.push(request.trackName);
      const query = queryParts.join(" ");

      addDjActivityEntry({
        type: "call-in",
        text: `📞 ${callerLabel} called in requesting: "${query}"${request.playNow ? " ⚡ RIGHT NOW" : ""}`,
      });
      addDjActivityEntry({ type: "system", text: `🔍 Searching Spotify for "${query}"…`, debug: true });

      const foundTrack = await this.services.spotifyPlayer.searchTrack(query);

      if (foundTrack && foundTrack.uri) {
        await this.services.spotifyPlayer.addToQueue(foundTrack.uri);
        await this.services.requestManager.updateStatus(request.id, "accepted", false, false);
        request.spotifyUri = foundTrack.uri;
        request.spotifyTrackTitle = foundTrack.title;
        request.status = "accepted";

        addDjActivityEntry({
          type: "call-in",
          text: `✅ Found: "${foundTrack.title}" by ${foundTrack.artistName} — added to queue!`,
        });

        this._refreshRequestStore();

        if (request.playNow) {
          const summary = `${callerLabel} called in and requested "${foundTrack.title}" by ${foundTrack.artistName}.${messageSnippet} Play it right now! Announce the caller and hype the track.`;
          await this._playCallInBanterNow("requestAcknowledgement", [summary], true);
        } else {
          const summary = `${callerLabel} called in and requested "${foundTrack.title}" by ${foundTrack.artistName}.${messageSnippet} It's coming up next — hype the request without referencing the current track.`;
          const banterText = await this._generateCallInBanterText("requestAcknowledgement", [summary], false);
          if (banterText) {
            addDjActivityEntry({ type: "dj", text: `📞💬 ${banterText}` });
          }
          this.processedCallInSummaries.push(summary);
        }
      } else {
        addDjActivityEntry({
          type: "call-in",
          text: `❌ Couldn't find "${query}" on Spotify.`,
        });

        await this.services.requestManager.updateStatus(request.id, "rejected", false, false);
        request.status = "rejected";

        this._refreshRequestStore();

        if (request.playNow) {
          const summary = `${callerLabel} called in and requested "${query}" but it couldn't be found on Spotify. Let them down gently.`;
          await this._playCallInBanterNow("requestRefusal", [summary], false);
        } else {
          const summary = `${callerLabel} called in and requested "${query}" but it couldn't be found on Spotify. Let them down gently.`;
          const banterText = await this._generateCallInBanterText("requestRefusal", [summary], false);
          if (banterText) {
            addDjActivityEntry({ type: "dj", text: `📞💬 ${banterText}` });
          }
          this.processedCallInSummaries.push(summary);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[CallIn] Processing failed:", msg);
      addDjActivityEntry({ type: "error", text: `Call-in processing failed: ${msg}` });
    } finally {
      this.isProcessingCallIn = false;
    }
  }

  async _generateCallInBanterText(segmentType, requestSummary, includeCurrentTrack) {
    const { banterEngine } = this.services;
    if (!banterEngine) return null;

    const personaState = appStore.get("persona");
    if (!personaState.activePersona) return null;

    try {
      const banterResult = await banterEngine.generate({
        persona: personaState.activePersona,
        segmentType,
        currentTrack: includeCurrentTrack ? appStore.get("playback").currentTrack : null,
        recentTracks: includeCurrentTrack ? appStore.get("playback").recentTracks : [],
        requestSummary,
        recentBanterSummaries: [],
        constraints: {
          maxWords: 60,
          maxSeconds: 25,
          familySafe: appStore.get("settings").schedulerConfig.familySafe,
        },
      });
      this._logPromptsIfDebug(banterResult);
      return banterResult.text;
    } catch (err) {
      console.warn("[CallIn] Text-only banter generation failed:", err);
      return null;
    }
  }

  async _playCallInBanterNow(segmentType, requestSummary, skipToNext) {
    const { banterEngine, voiceEngine } = this.services;
    if (!banterEngine || !voiceEngine) return;

    const personaState = appStore.get("persona");
    if (!personaState.activePersona) return;

    const savedVolume = this.userMusicVolume;
    try {
      updateAiState({ isGenerating: true, lastError: null });
      addDjActivityEntry({ type: "system", text: "🧠 Generating call-in banter…", debug: true });

      const banterResult = await banterEngine.generate({
        persona: personaState.activePersona,
        segmentType,
        currentTrack: appStore.get("playback").currentTrack,
        recentTracks: appStore.get("playback").recentTracks,
        requestSummary,
        recentBanterSummaries: [],
        constraints: {
          maxWords: 25,
          maxSeconds: 10,
          familySafe: appStore.get("settings").schedulerConfig.familySafe,
        },
      });

      this._logPromptsIfDebug(banterResult);

      updateAiState({ isGenerating: false, isRendering: true });
      addDjActivityEntry({ type: "system", text: "🎤 Rendering call-in voice…", debug: true });

      const voiceResult = await voiceEngine.render({
        text: banterResult.text,
        voice: personaState.activePersona.voice,
        elevenLabsVoiceId: personaState.activePersona.elevenLabsVoiceId,
        speechRate: personaState.activePersona.speechRate,
        format: "mp3",
      });

      updateAiState({ isRendering: false });

      addDjActivityEntry({ type: "dj", text: `📞🎤 ${banterResult.text}` });

      await this._fadeSpotifyVolume(savedVolume, 0, 2_000);
      await this.services.djPlayer.play(voiceResult.objectUrl);

      if (skipToNext) {
        try {
          await this.services.spotifyPlayer.nextTrack();
        } catch (err) {
          console.warn("[CallIn] Skip to next track failed:", err);
        }
      }

      await this._fadeSpotifyVolume(0, savedVolume, 1_500);
      this.services.scheduler.recordInsertion(segmentType);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[CallIn] Banter failed:", msg);
      updateAiState({ isGenerating: false, isRendering: false, lastError: msg });
      addDjActivityEntry({ type: "error", text: `Call-in banter failed: ${msg}` });
      await this.services.spotifyPlayer.setVolume(savedVolume).catch(() => {});
    }
  }

  _fadeSpotifyVolume(from, to, durationMs) {
    const debugMode = appStore.get("settings").debugMode;
    if (debugMode) {
      addDjActivityEntry({
        type: "system",
        text: `🔊 Volume fade: ${Math.round(from * 100)}% → ${Math.round(to * 100)}% over ${(durationMs / 1000).toFixed(1)}s`,
        debug: true,
      });
    }
    this.isFading = true;
    const slider = this.element.querySelector("#vol-music");
    if (slider) slider.disabled = true;

    const steps = 12;
    const intervalMs = durationMs / steps;
    const delta = (to - from) / steps;
    return new Promise((resolve) => {
      let step = 0;
      const timer = setInterval(() => {
        step++;
        const vol = step >= steps ? to : from + delta * step;
        this.services.spotifyPlayer.setVolume(vol).catch(() => {});
        const sl = this.element.querySelector("#vol-music");
        const label = this.element.querySelector("#vol-music-value");
        const pct = Math.round(vol * 100);
        if (sl) {
          sl.value = String(pct);
          sl.style.setProperty("--fill", `${pct}%`);
        }
        if (label) label.textContent = `${pct}%`;
        if (debugMode && step % 4 === 0) {
          addDjActivityEntry({ type: "system", text: `🔊 Volume: ${Math.round(vol * 100)}%`, debug: true });
        }
        if (step >= steps) {
          clearInterval(timer);
          this.isFading = false;
          const s = this.element.querySelector("#vol-music");
          if (s) s.disabled = false;
          resolve();
        }
      }, intervalMs);
    });
  }

  _updatePlayPause() {
    const btn = this.element.querySelector("#btn-play-pause");
    if (!btn) return;
    const isPlaying = appStore.get("playback").isPlaying;
    btn.textContent = isPlaying ? "⏸" : "▶";
    btn.title = isPlaying ? "Pause" : "Play";
  }

  _logPromptsIfDebug(result) {
    if (!appStore.get("settings").debugMode) return;
    addDjActivityEntry({ type: "system", text: `📋 System prompt: ${result.systemPrompt}`, debug: true });
    addDjActivityEntry({ type: "system", text: `📋 User prompt: ${result.userPrompt}`, debug: true });
  }

  _checkCallInFulfillment(track) {
    const requests = appStore.get("requests").requests;
    const matched = requests.find((r) => r.status === "accepted" && r.spotifyUri && track.uri && r.spotifyUri === track.uri);

    if (matched) {
      const callerLabel = matched.callerName ?? "A listener";
      addDjActivityEntry({
        type: "call-in",
        text: `🎉 Now playing ${callerLabel}'s request: "${track.title}" by ${track.artistName}!`,
      });

      this.services.requestManager.updateStatus(matched.id, "fulfilled", true, false).catch(console.error);
      matched.status = "fulfilled";
      matched.spokenAcknowledgement = true;
      this._refreshRequestStore();

      this.processedCallInSummaries.push(`This track was requested by ${callerLabel}. Give them a shout-out!`);
    }
  }

  _refreshRequestStore() {
    if (!this.sessionId) return;
    this.services.requestManager
      .getAll(this.sessionId)
      .then((all) => {
        appStore.update("requests", {
          requests: all,
          pendingCount: all.filter((r) => r.status === "pending").length,
        });
      })
      .catch(console.error);
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
