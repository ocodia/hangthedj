/**
 * StationControls: start/stop session, mood selector, DJ status.
 *
 * Session flow:
 *   1. DJ introduces themselves (stationIdent banter → TTS → play)
 *   2. Transfer Spotify playback → first track starts
 *   3. Position monitor polls every second
 *   4. When < 30 s remain on a track → generate transition banter → TTS
 *   5. When < 10 s remain → crossfade: fade music volume down, play DJ clip
 *      over the ducked track tail, then skip to next track and restore volume
 *   6. Spotify auto-advances to the next track → repeat from step 3
 */

import type { AppServices } from "@/app/app-shell";
import {
  appStore,
  updateSessionState,
  updateAiState,
  updatePlaybackState,
  updatePersonaState,
  addDjActivityEntry,
  clearDjActivity,
} from "@/stores/app-store";
import { saveSettings, loadSettings } from "@/features/storage/storage-service";
import { saveSession } from "@/features/storage/storage-service";
import { v4 as uuidv4 } from "uuid";
import type { StationMood } from "@/types/session";
import type { SegmentType } from "@/types/banter";
import type { BanterResult } from "@/types/banter";
import type { ListenerRequest } from "@/types/request";

const MOODS: { value: StationMood; label: string }[] = [
  { value: "freestyle", label: "Freestyle" },
  { value: "late-night", label: "Late Night" },
  { value: "upbeat", label: "Upbeat" },
  { value: "nostalgic", label: "Nostalgic" },
  { value: "focus", label: "Focus" },
  { value: "indie-evening", label: "Indie Evening" },
];

const MOOD_PROMPTS: Record<StationMood, string> = {
  freestyle: "Anything goes — let the DJ read the room and go with the flow.",
  "late-night": "Late night, relaxed, atmospheric vibes. Dim the lights.",
  upbeat: "High energy, feel-good, upbeat bangers. Keep the party going.",
  nostalgic: "Throwbacks and classics. Take us down memory lane.",
  focus: "Lo-fi, ambient, concentration-friendly. Keep it smooth and unobtrusive.",
  "indie-evening": "Indie, alternative, chill evening listening. Warm and intimate.",
};

export class StationControls {
  element: HTMLElement;
  private sessionId: string | null = null;
  private sessionMood: StationMood = "freestyle";
  private sessionMoodPrompt: string = MOOD_PROMPTS["freestyle"];
  private unsubscribeTrackChange: (() => void) | null = null;
  private unsubscribeRequests: (() => void) | null = null;
  private positionInterval: number | null = null;
  private isPreparingBanter = false;
  private banterEvaluatedForTrackId: string | null = null;

  private isStopping = false;

  // Pre-generated banter: generated at ~30s remaining, played at ~5s remaining
  private pendingTransition: { objectUrl: string; segmentType: string; banterText: string; trackInfo: string } | null = null;
  private pendingTransitionForTrackId: string | null = null;

  // Call-in queue: deferred until banter completes
  private pendingCallIns: ListenerRequest[] = [];
  private isProcessingCallIn = false;
  // Summaries of processed call-ins to include in the next transition banter
  private processedCallInSummaries: string[] = [];

  constructor(private services: AppServices) {
    this.element = document.createElement("div");
    this.element.className = "station-controls panel";
    this.render();

    appStore.subscribe("session", () => this.render());
    appStore.subscribe("ai", () => this.render());
    appStore.subscribe("spotify", () => this.render());
    appStore.subscribe("settings", () => this.render());
    appStore.subscribe("persona", () => this.render());

    // Keep the music volume slider in sync when the coordinator fades during transitions
    this.services.coordinator.onVolumeChange((vol) => {
      const slider = this.element.querySelector<HTMLInputElement>("#vol-music");
      const label = this.element.querySelector<HTMLSpanElement>("#vol-music-value");
      const pct = Math.round(vol * 100);
      if (slider) slider.value = String(pct);
      if (label) label.textContent = `${pct}%`;
    });
  }

  private render(): void {
    const session = appStore.get("session");
    const ai = appStore.get("ai");
    const spotify = appStore.get("spotify");

    const moodOptions = MOODS.map((m) => `<option value="${m.value}" ${m.value === this.sessionMood ? "selected" : ""}>${m.label}</option>`).join("");

    const currentMoodPrompt = session.isRunning ? this.sessionMoodPrompt : (MOOD_PROMPTS[this.sessionMood] ?? MOOD_PROMPTS["freestyle"]);

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
        <select id="persona-select" ${session.isRunning ? "disabled" : ""}>${personaOptions}</select>
      </div>
      <div class="field">
        <label for="mood-select">Station Mood</label>
        <select id="mood-select" ${session.isRunning ? "disabled" : ""}>${moodOptions}</select>
      </div>
      <div class="field">
        <label for="mood-prompt">Mood Prompt</label>
        <textarea id="mood-prompt" rows="2" maxlength="300" ${session.isRunning ? "disabled" : ""}
          placeholder="Describe the vibe you want the DJ to set…"
          style="width:100%;resize:vertical;font-size:0.85rem">${escapeHtml(currentMoodPrompt)}</textarea>
        <p class="muted" style="font-size:0.75rem;margin-top:0.25rem">This prompt shapes the DJ's personality and banter style for the session.</p>
      </div>
      ${!ai.hasOpenAiKey ? `<p class="muted" style="font-size:0.8rem">Set your OpenAI key in Settings to enable DJ banter.</p>` : ""}
      ${!spotify.isConnected && !session.isRunning ? `<p class="muted" style="font-size:0.8rem">Connect Spotify to start a session.</p>` : ""}
      <div class="station-actions">
        ${
          this.isStopping
            ? `<button disabled style="background:#e67e22;color:#fff;cursor:not-allowed">Stopping…</button>`
            : session.isRunning
              ? `<button class="danger" id="btn-stop">Stop Session</button>
               ${appStore.get("settings").debugMode ? `<button id="btn-debug-skip" style="margin-left:0.5rem;background:#555;color:#ff0;font-size:0.75rem;padding:0.25rem 0.5rem;border:1px dashed #ff0;border-radius:4px;cursor:pointer" title="Skip to ~35s before end of track">⏩ Skip to banter</button>` : ""}`
              : `<button id="btn-start" ${!spotify.isConnected ? "disabled" : ""}>Start Session</button>`
        }
      </div>
      <div class="volume-sliders">
        <div class="volume-slider-row">
          <label class="volume-label">🎵 Music</label>
          <input type="range" id="vol-music" min="0" max="100" value="80" class="volume-slider" />
          <span class="volume-value" id="vol-music-value">80%</span>
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

    this.element.querySelector("#btn-start")?.addEventListener("click", () => void this.startSession());
    this.element.querySelector("#btn-stop")?.addEventListener("click", () => void this.stopSession());
    this.element.querySelector("#btn-debug-skip")?.addEventListener("click", () => void this.debugSkipToBanter());

    // Volume sliders
    const musicSlider = this.element.querySelector<HTMLInputElement>("#vol-music");
    const djSlider = this.element.querySelector<HTMLInputElement>("#vol-dj");
    const musicValue = this.element.querySelector<HTMLSpanElement>("#vol-music-value");
    const djValue = this.element.querySelector<HTMLSpanElement>("#vol-dj-value");

    // Restore current volumes into the sliders
    this.services.spotifyPlayer.getVolume().then((v) => {
      if (musicSlider) musicSlider.value = String(Math.round(v * 100));
      if (musicValue) musicValue.textContent = `${Math.round(v * 100)}%`;
    }).catch(() => {});
    const djVol = this.services.djPlayer.getVolume();
    if (djSlider) djSlider.value = String(Math.round(djVol * 100));
    if (djValue) djValue.textContent = `${Math.round(djVol * 100)}%`;

    musicSlider?.addEventListener("input", (e) => {
      const val = Number((e.target as HTMLInputElement).value);
      if (musicValue) musicValue.textContent = `${val}%`;
      this.services.spotifyPlayer.setVolume(val / 100).catch(() => {});
    });
    djSlider?.addEventListener("input", (e) => {
      const val = Number((e.target as HTMLInputElement).value);
      if (djValue) djValue.textContent = `${val}%`;
      this.services.djPlayer.setVolume(val / 100);
    });

    // Persona dropdown
    this.element.querySelector<HTMLSelectElement>("#persona-select")?.addEventListener("change", async (e) => {
      const id = (e.target as HTMLSelectElement).value;
      const p = await this.services.personaService.getById(id);
      if (p) {
        updatePersonaState({ activePersona: p });
        const current = loadSettings();
        saveSettings({ ...current, activePersonaId: id });
      }
    });

    // Mood dropdown auto-populates the mood prompt textarea
    this.element.querySelector("#mood-select")?.addEventListener("change", (e) => {
      const select = e.target as HTMLSelectElement;
      this.sessionMood = select.value as StationMood;
      const textarea = this.element.querySelector<HTMLTextAreaElement>("#mood-prompt");
      if (textarea) textarea.value = MOOD_PROMPTS[this.sessionMood] ?? "";
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Session lifecycle
  // ────────────────────────────────────────────────────────────────────────────

  private async debugSkipToBanter(): Promise<void> {
    const pos = await this.services.spotifyPlayer.fetchCurrentPosition();
    if (!pos) {
      console.warn("[DebugSkip] No position data");
      return;
    }
    // Seek to 35 seconds before end — gives 5s buffer before the 30s pre-generation trigger
    const seekTo = Math.max(0, pos.durationMs - 35_000);
    console.log(`[DebugSkip] Seeking to ${Math.round(seekTo / 1000)}s / ${Math.round(pos.durationMs / 1000)}s (35s before end)`);
    addDjActivityEntry({ type: "system", text: `⏩ Debug skip: jumping to ${Math.round(seekTo / 1000)}s (35s before end)`, debug: true });
    await this.services.spotifyPlayer.seek(seekTo);
    // Reset banter flags so the position monitor will evaluate again
    this.banterEvaluatedForTrackId = null;
    this.pendingTransition = null;
    this.pendingTransitionForTrackId = null;
  }

  private async startSession(): Promise<void> {
    const moodSelect = this.element.querySelector<HTMLSelectElement>("#mood-select");
    const mood = (moodSelect?.value ?? "freestyle") as StationMood;
    const moodPromptTextarea = this.element.querySelector<HTMLTextAreaElement>("#mood-prompt");
    const moodPrompt = moodPromptTextarea?.value?.trim() || MOOD_PROMPTS[mood];
    const personaState = appStore.get("persona");

    if (!personaState.activePersona) {
      alert("Please select a DJ persona in Settings first.");
      return;
    }

    this.sessionMood = mood;
    this.sessionMoodPrompt = moodPrompt;
    this.sessionId = uuidv4();
    const now = new Date().toISOString();

    const session = {
      id: this.sessionId,
      startedAt: now,
      mood,
      moodPrompt,
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
        this.stopSession();
        return;
      }
    }

    // 2. Play DJ intro (banter → TTS → audio) BEFORE starting music
    addDjActivityEntry({ type: "system", text: "Session starting… DJ is warming up 🎤", debug: true });
    await this.playDjIntro(mood, moodPrompt);

    // 3. Transfer playback to start the first track
    try {
      await this.services.spotifyPlayer.transferPlayback();
      addDjActivityEntry({ type: "system", text: "Music started — DJ is on the air!", debug: true });
    } catch (err) {
      console.error("[StationControls] Playback transfer failed:", err);
      addDjActivityEntry({ type: "error", text: "Could not start Spotify playback. Try playing a track in Spotify first." });
    }

    // 4. Subscribe to track changes (for logging + recent tracks + call-in fulfillment)
    this.unsubscribeTrackChange = this.services.spotifyPlayer.onTrackChange((track) => {
      if (!track || !this.sessionId) return;
      updatePlaybackState({ currentTrack: track });
      this.services.scheduler.recordTrackChange();

      // Log the new track in the activity feed
      addDjActivityEntry({
        type: "track",
        text: `🎵 Now playing: "${track.title}" by ${track.artistName}`,
      });

      // Check for call-in fulfillment: if this track matches an accepted request
      this.checkCallInFulfillment(track);

      // Update recent tracks
      const current = appStore.get("playback");
      updatePlaybackState({
        recentTracks: [track, ...current.recentTracks].slice(0, 10),
      });

      // Reset banter evaluation flags for the new track
      this.banterEvaluatedForTrackId = null;
      this.pendingTransition = null;
      this.pendingTransitionForTrackId = null;
    });

    // 5. Subscribe to request state changes to detect new call-ins
    this.unsubscribeRequests = appStore.subscribe("requests", (reqState) => {
      if (!this.sessionId) return;
      const newRequests = reqState.requests.filter((r) => r.status === "pending" && !r.spokenAcknowledgement && !r.spotifyUri);
      // Add any genuinely new pending requests to the call-in queue
      for (const req of newRequests) {
        if (!this.pendingCallIns.some((c) => c.id === req.id)) {
          this.pendingCallIns.push(req);
        }
      }
    });

    // 6. Start position monitor (polls every 1 s)
    this.startPositionMonitor();
  }

  private async stopSession(): Promise<void> {
    if (this.isStopping) return;
    this.isStopping = true;
    this.render();

    // Stop position monitor and subscriptions immediately so no new banter is triggered
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

    // Generate and play goodbye banter, then fade out
    await this.playDjSignOff();

    // Stop Spotify playback
    this.services.spotifyPlayer.pause().catch((err) => {
      console.warn("[StationControls] Failed to pause Spotify on stop:", err);
    });

    updateSessionState({ isRunning: false });

    if (this.sessionId) {
      addDjActivityEntry({ type: "system", text: "Session ended. Thanks for listening!" });
      saveSession({
        ...appStore.get("session").activeSession!,
        endedAt: new Date().toISOString(),
      }).catch(console.error);
    }

    this.sessionId = null;
    this.isStopping = false;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DJ Sign-off — goodbye banter before the station goes off air
  // ────────────────────────────────────────────────────────────────────────────

  private async playDjSignOff(): Promise<void> {
    const { banterEngine, voiceEngine } = this.services;
    if (!banterEngine || !voiceEngine) {
      addDjActivityEntry({ type: "system", text: "DJ banter disabled (no OpenAI key) — skipping sign-off.", debug: true });
      // No banter available — just fade out
      await this.fadeSpotifyVolume(await this.services.spotifyPlayer.getVolume().catch(() => 0.8), 0, 3_000);
      return;
    }

    const personaState = appStore.get("persona");
    if (!personaState.activePersona) {
      await this.fadeSpotifyVolume(await this.services.spotifyPlayer.getVolume().catch(() => 0.8), 0, 3_000);
      return;
    }

    let savedVolume = 0.8;
    try {
      savedVolume = await this.services.spotifyPlayer.getVolume().catch(() => 0.8);

      updateAiState({ isGenerating: true, lastError: null });
      addDjActivityEntry({ type: "system", text: "🧠 Generating sign-off banter…", debug: true });

      const banterResult = await banterEngine.generate({
        persona: personaState.activePersona,
        segmentType: "signOff",
        stationMood: this.sessionMoodPrompt,
        currentTrack: appStore.get("playback").currentTrack,
        recentTracks: appStore.get("playback").recentTracks,
        requestSummary: [],
        recentBanterSummaries: [],
        constraints: {
          maxWords: 60,
          maxSeconds: 25,
          familySafe: appStore.get("settings").schedulerConfig.familySafe,
          factualityMode: personaState.activePersona.factuality,
        },
      });

      this.logPromptsIfDebug(banterResult);

      updateAiState({ isGenerating: false, isRendering: true });
      addDjActivityEntry({ type: "system", text: "🎙️ Rendering sign-off voice…", debug: true });

      const voiceResult = await voiceEngine.render({
        text: banterResult.text,
        voice: personaState.activePersona.voice,
        speechRate: personaState.activePersona.speechRate,
        format: "mp3",
      });

      updateAiState({ isRendering: false });

      addDjActivityEntry({ type: "dj", text: `🎤 ${banterResult.text}` });

      // Dip the music volume, play the DJ sign-off clip
      await this.fadeSpotifyVolume(savedVolume, 0.15, 2_000);
      await this.services.djPlayer.play(voiceResult.objectUrl);

      // Fade the music to silence
      await this.fadeSpotifyVolume(0.15, 0, 2_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[StationControls] DJ sign-off failed:", msg);
      updateAiState({ isGenerating: false, isRendering: false, lastError: msg });
      addDjActivityEntry({ type: "error", text: `DJ sign-off failed: ${msg}` });
      // Best-effort fade out on failure
      await this.fadeSpotifyVolume(savedVolume, 0, 2_000).catch(() => {});
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DJ Intro — plays before the first track
  // ────────────────────────────────────────────────────────────────────────────

  private async playDjIntro(_mood: StationMood, moodPrompt: string): Promise<void> {
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
        stationMood: moodPrompt,
        currentTrack: null,
        recentTracks: [],
        requestSummary: [],
        recentBanterSummaries: [],
        constraints: {
          maxWords: 60,
          maxSeconds: 25,
          familySafe: appStore.get("settings").schedulerConfig.familySafe,
          factualityMode: personaState.activePersona.factuality,
        },
      });

      this.logPromptsIfDebug(banterResult);

      updateAiState({ isGenerating: false, isRendering: true });

      const voiceResult = await voiceEngine.render({
        text: banterResult.text,
        voice: personaState.activePersona.voice,
        speechRate: personaState.activePersona.speechRate,
        format: "mp3",
      });

      updateAiState({ isRendering: false });

      // Log the intro banter
      addDjActivityEntry({
        type: "dj",
        text: `🎤 ${banterResult.text}`,
      });

      // Play the DJ intro clip directly (no Spotify pause needed)
      await this.services.djPlayer.play(voiceResult.objectUrl);
      this.services.scheduler.recordInsertion("stationIdent");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[StationControls] DJ intro failed:", msg);
      updateAiState({ isGenerating: false, isRendering: false, lastError: msg });
      addDjActivityEntry({ type: "error", text: `DJ intro failed: ${msg}` });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Position monitor — two-phase approach:
  //   Phase 1: < 30 s remaining → pre-generate banter + TTS (cache the clip)
  //   Phase 2: < 10 s remaining → crossfade (fade music → play clip over tail → next track)
  // ────────────────────────────────────────────────────────────────────────────

  private startPositionMonitor(): void {
    this.positionInterval = window.setInterval(() => {
      void this.checkPosition();
    }, 1_000);
  }

  private async checkPosition(): Promise<void> {
    if (!this.sessionId) return;

    const position = await this.services.spotifyPlayer.fetchCurrentPosition();
    if (!position || !position.isPlaying) return;

    const remaining = position.durationMs - position.progressMs;
    const currentTrackId = appStore.get("playback").currentTrack?.id ?? null;

    // Push position + next track to store for UI debug display
    updatePlaybackState({
      progressMs: position.progressMs,
      durationMs: position.durationMs,
      nextTrack: this.services.spotifyPlayer.getNextTrack(),
    });

    // Debug: log every ~5 seconds so we can see the monitor is alive
    if (remaining > 0 && remaining % 5000 < 1100) {
      console.log(
        `[PositionMonitor] ${Math.round(remaining / 1000)}s remaining | preparing=${this.isPreparingBanter} | hasPending=${!!this.pendingTransition} | coordinator=${this.services.coordinator.getState()}`,
      );
    }

    // ── Phase 1: Pre-generate banter when < 30s remaining ──────────────────
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
        await this.preGenerateBanter();
      } finally {
        this.isPreparingBanter = false;
      }
    }

    // ── Phase 2: Execute crossfade transition when < 10s remaining and clip is ready
    //    The coordinator will fade the music down over ~3s, then play the DJ
    //    clip over the ducked track tail before skipping to the next song.
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
      this.services.scheduler.recordInsertion(transition.segmentType as SegmentType);

      const statusEl = this.element.querySelector("#dj-status");
      if (statusEl) statusEl.textContent = "DJ is monitoring the station…";
    }

    // ── Phase 3: Process call-in queue (search + queue only, no banter) ─────────
    if (this.pendingCallIns.length > 0 && !this.isProcessingCallIn) {
      void this.processNextCallIn();
    }
  }

  /**
   * Pre-generate banter text + TTS audio and store the result.
   * Called with ~30s of track remaining so it's ready before the track ends.
   */
  private async preGenerateBanter(): Promise<void> {
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

    // Ask the scheduler whether the DJ should speak
    const decision = this.services.scheduler.onTrackChange(
      currentTrack,
      this.services.spotifyPlayer.getPlaybackState(),
      personaState.activePersona,
      this.sessionMood,
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
        stationMood: this.sessionMoodPrompt,
        currentTrack,
        nextTrack: this.services.spotifyPlayer.getNextTrack(),
        recentTracks: appStore.get("playback").recentTracks,
        requestSummary: [...this.processedCallInSummaries],
        recentBanterSummaries: [],
        constraints: {
          maxWords: 50,
          maxSeconds: 20,
          familySafe: appStore.get("settings").schedulerConfig.familySafe,
          factualityMode: personaState.activePersona.factuality,
        },
      });

      // Drain call-in summaries now that they've been included in the banter
      this.processedCallInSummaries = [];

      this.logPromptsIfDebug(banterResult);

      console.log("[Banter] Script generated:", banterResult.text);
      updateAiState({ isGenerating: false, isRendering: true });
      if (statusEl) statusEl.textContent = "DJ is recording…";
      addDjActivityEntry({ type: "system", text: "🎙️ Rendering voice…", debug: true });

      const voiceResult = await voiceEngine.render({
        text: banterResult.text,
        voice: personaState.activePersona.voice,
        speechRate: personaState.activePersona.speechRate,
        format: "mp3",
      });

      console.log("[Banter] Voice rendered, caching for playback");
      updateAiState({ isRendering: false });

      const trackInfo = currentTrack ? ` [after "${currentTrack.title}" by ${currentTrack.artistName}]` : "";
      const wordCount = banterResult.text.split(/\s+/).length;
      addDjActivityEntry({ type: "system", text: `✅ Banter ready (${wordCount} words) — waiting for track to end…`, debug: true });

      // Cache the result — Phase 2 will play it when the track is about to end
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

  // ────────────────────────────────────────────────────────────────────────────
  // Call-in processing: Spotify search + queue + banter
  // ────────────────────────────────────────────────────────────────────────────

  private async processNextCallIn(): Promise<void> {
    if (this.pendingCallIns.length === 0 || this.isProcessingCallIn) return;

    this.isProcessingCallIn = true;
    const request = this.pendingCallIns.shift()!;
    const callerLabel = request.callerName ?? "A listener";
    const messageSnippet = request.message ? ` They say: "${request.message}"` : "";

    try {
      // Build search query from artist + track
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
        // Track found — add to Spotify queue
        await this.services.spotifyPlayer.addToQueue(foundTrack.uri);

        // Update the request with Spotify info
        await this.services.requestManager.updateStatus(request.id, "accepted", false, false);
        request.spotifyUri = foundTrack.uri;
        request.spotifyTrackTitle = foundTrack.title;
        request.status = "accepted";

        addDjActivityEntry({
          type: "call-in",
          text: `✅ Found: "${foundTrack.title}" by ${foundTrack.artistName} — added to queue!`,
        });

        this.refreshRequestStore();

        if (request.playNow) {
          // ── RIGHT NOW mode: fade out music, play banter, skip to the queued track ──
          const summary = `${callerLabel} called in and requested "${foundTrack.title}" by ${foundTrack.artistName}.${messageSnippet} Play it right now! Announce the caller and hype the track.`;
          await this.playCallInBanterNow("requestAcknowledgement", [summary], true);
        } else {
          // ── QUEUED mode: generate banter text for the feed (no audio), defer to next transition ──
          const summary = `${callerLabel} called in and requested "${foundTrack.title}" by ${foundTrack.artistName}.${messageSnippet} It's coming up next — hype the request without referencing the current track.`;
          const banterText = await this.generateCallInBanterText("requestAcknowledgement", [summary], false);
          if (banterText) {
            addDjActivityEntry({ type: "dj", text: `📞💬 ${banterText}` });
          }
          this.processedCallInSummaries.push(summary);
        }
      } else {
        // Track not found
        addDjActivityEntry({
          type: "call-in",
          text: `❌ Couldn't find "${query}" on Spotify.`,
        });

        await this.services.requestManager.updateStatus(request.id, "rejected", false, false);
        request.status = "rejected";

        this.refreshRequestStore();

        if (request.playNow) {
          // RIGHT NOW but not found — announce it live (no skip needed)
          const summary = `${callerLabel} called in and requested "${query}" but it couldn't be found on Spotify. Let them down gently.`;
          await this.playCallInBanterNow("requestRefusal", [summary], false);
        } else {
          // Generate text for feed, defer to next transition
          const summary = `${callerLabel} called in and requested "${query}" but it couldn't be found on Spotify. Let them down gently.`;
          const banterText = await this.generateCallInBanterText("requestRefusal", [summary], false);
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

  /**
   * Generate banter TEXT only (no TTS/audio). Returns the script text for the activity feed.
   * When includeCurrentTrack is false, the current track context is omitted so the DJ
   * focuses on the request itself rather than referencing what's currently playing.
   */
  private async generateCallInBanterText(segmentType: SegmentType, requestSummary: string[], includeCurrentTrack: boolean): Promise<string | null> {
    const { banterEngine } = this.services;
    if (!banterEngine) return null;

    const personaState = appStore.get("persona");
    if (!personaState.activePersona) return null;

    try {
      const banterResult = await banterEngine.generate({
        persona: personaState.activePersona,
        segmentType,
        stationMood: this.sessionMoodPrompt,
        currentTrack: includeCurrentTrack ? appStore.get("playback").currentTrack : null,
        recentTracks: includeCurrentTrack ? appStore.get("playback").recentTracks : [],
        requestSummary,
        recentBanterSummaries: [],
        constraints: {
          maxWords: 60,
          maxSeconds: 25,
          familySafe: appStore.get("settings").schedulerConfig.familySafe,
          factualityMode: personaState.activePersona.factuality,
        },
      });
      this.logPromptsIfDebug(banterResult);
      return banterResult.text;
    } catch (err) {
      console.warn("[CallIn] Text-only banter generation failed:", err);
      return null;
    }
  }

  /**
   * Generate banter + TTS, fade out music, play banter, then optionally skip to next track.
   * When skipToNext is true the requested track (already queued) starts after the DJ clip.
   */
  private async playCallInBanterNow(segmentType: SegmentType, requestSummary: string[], skipToNext: boolean): Promise<void> {
    const { banterEngine, voiceEngine } = this.services;
    if (!banterEngine || !voiceEngine) return;

    const personaState = appStore.get("persona");
    if (!personaState.activePersona) return;

    let savedVolume = 0.8;
    try {
      updateAiState({ isGenerating: true, lastError: null });
      addDjActivityEntry({ type: "system", text: "🧠 Generating call-in banter…", debug: true });

      const banterResult = await banterEngine.generate({
        persona: personaState.activePersona,
        segmentType,
        stationMood: this.sessionMoodPrompt,
        currentTrack: appStore.get("playback").currentTrack,
        recentTracks: appStore.get("playback").recentTracks,
        requestSummary,
        recentBanterSummaries: [],
        constraints: {
          maxWords: 25,
          maxSeconds: 10,
          familySafe: appStore.get("settings").schedulerConfig.familySafe,
          factualityMode: personaState.activePersona.factuality,
        },
      });

      this.logPromptsIfDebug(banterResult);

      updateAiState({ isGenerating: false, isRendering: true });
      addDjActivityEntry({ type: "system", text: "🎤 Rendering call-in voice…", debug: true });

      const voiceResult = await voiceEngine.render({
        text: banterResult.text,
        voice: personaState.activePersona.voice,
        speechRate: personaState.activePersona.speechRate,
        format: "mp3",
      });

      updateAiState({ isRendering: false });

      addDjActivityEntry({ type: "dj", text: `📞🎤 ${banterResult.text}` });

      // ── Fade music out completely ──
      try {
        savedVolume = await this.services.spotifyPlayer.getVolume();
      } catch {
        savedVolume = 0.8;
      }
      await this.fadeSpotifyVolume(savedVolume, 0, 2_000);

      // ── Play the DJ clip over silence ──
      await this.services.djPlayer.play(voiceResult.objectUrl);

      // ── After clip finishes: skip to the requested track if needed ──
      if (skipToNext) {
        try {
          await this.services.spotifyPlayer.nextTrack();
        } catch (err) {
          console.warn("[CallIn] Skip to next track failed:", err);
        }
      }

      // ── Restore music volume ──
      await this.fadeSpotifyVolume(0, savedVolume, 1_500);

      this.services.scheduler.recordInsertion(segmentType);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[CallIn] Banter failed:", msg);
      updateAiState({ isGenerating: false, isRendering: false, lastError: msg });
      addDjActivityEntry({ type: "error", text: `Call-in banter failed: ${msg}` });
      // Best-effort volume restore on failure
      await this.services.spotifyPlayer.setVolume(savedVolume).catch(() => {});
    }
  }

  /** Smoothly fade Spotify volume between two levels over the given duration. */
  private fadeSpotifyVolume(from: number, to: number, durationMs: number): Promise<void> {
    const debugMode = appStore.get("settings").debugMode;
    if (debugMode) {
      addDjActivityEntry({
        type: "system",
        text: `🔊 Volume fade: ${Math.round(from * 100)}% → ${Math.round(to * 100)}% over ${(durationMs / 1000).toFixed(1)}s`,
        debug: true,
      });
    }
    const steps = 12;
    const intervalMs = durationMs / steps;
    const delta = (to - from) / steps;
    return new Promise<void>((resolve) => {
      let step = 0;
      const timer = setInterval(() => {
        step++;
        const vol = step >= steps ? to : from + delta * step;
        this.services.spotifyPlayer.setVolume(vol).catch(() => {});
        // Update the music volume slider to reflect the fade
        const slider = this.element.querySelector<HTMLInputElement>("#vol-music");
        const label = this.element.querySelector<HTMLSpanElement>("#vol-music-value");
        const pct = Math.round(vol * 100);
        if (slider) slider.value = String(pct);
        if (label) label.textContent = `${pct}%`;
        if (debugMode && step % 4 === 0) {
          addDjActivityEntry({ type: "system", text: `🔊 Volume: ${Math.round(vol * 100)}%`, debug: true });
        }
        if (step >= steps) {
          clearInterval(timer);
          resolve();
        }
      }, intervalMs);
    });
  }

  /** Log system and user prompts to the DJ activity feed when debug mode is enabled. */
  private logPromptsIfDebug(result: BanterResult): void {
    if (!appStore.get("settings").debugMode) return;
    addDjActivityEntry({ type: "system", text: `📋 System prompt: ${result.systemPrompt}`, debug: true });
    addDjActivityEntry({ type: "system", text: `📋 User prompt: ${result.userPrompt}`, debug: true });
  }

  private checkCallInFulfillment(track: { id: string; title: string; artistName: string; uri?: string }): void {
    const requests = appStore.get("requests").requests;
    const matched = requests.find((r) => r.status === "accepted" && r.spotifyUri && track.uri && r.spotifyUri === track.uri);

    if (matched) {
      const callerLabel = matched.callerName ?? "A listener";
      addDjActivityEntry({
        type: "call-in",
        text: `🎉 Now playing ${callerLabel}'s request: "${track.title}" by ${track.artistName}!`,
      });

      // Mark as fulfilled
      this.services.requestManager.updateStatus(matched.id, "fulfilled", true, false).catch(console.error);
      matched.status = "fulfilled";
      matched.spokenAcknowledgement = true;
      this.refreshRequestStore();

      // Add summary so the DJ references the caller in the next transition
      this.processedCallInSummaries.push(`This track was requested by ${callerLabel}. Give them a shout-out!`);
    }
  }

  private refreshRequestStore(): void {
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

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
