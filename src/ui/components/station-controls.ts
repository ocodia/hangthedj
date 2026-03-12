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
import { appStore, updateSessionState, updateAiState, updatePlaybackState, addDjActivityEntry, clearDjActivity } from "@/stores/app-store";
import { saveSession } from "@/features/storage/storage-service";
import { v4 as uuidv4 } from "uuid";
import type { StationMood } from "@/types/session";
import type { SegmentType } from "@/types/banter";

const MOODS: { value: StationMood; label: string }[] = [
  { value: "freestyle", label: "Freestyle" },
  { value: "late-night", label: "Late Night" },
  { value: "upbeat", label: "Upbeat" },
  { value: "nostalgic", label: "Nostalgic" },
  { value: "focus", label: "Focus" },
  { value: "indie-evening", label: "Indie Evening" },
];

export class StationControls {
  element: HTMLElement;
  private sessionId: string | null = null;
  private sessionMood: StationMood = "freestyle";
  private unsubscribeTrackChange: (() => void) | null = null;
  private positionInterval: number | null = null;
  private isPreparingBanter = false;
  private banterEvaluatedForTrackId: string | null = null;

  // Pre-generated banter: generated at ~30s remaining, played at ~5s remaining
  private pendingTransition: { objectUrl: string; segmentType: string; banterText: string; trackInfo: string } | null = null;
  private pendingTransitionForTrackId: string | null = null;

  constructor(private services: AppServices) {
    this.element = document.createElement("div");
    this.element.className = "station-controls panel";
    this.render();

    appStore.subscribe("session", () => this.render());
    appStore.subscribe("ai", () => this.render());
    appStore.subscribe("spotify", () => this.render());
  }

  private render(): void {
    const session = appStore.get("session");
    const ai = appStore.get("ai");
    const spotify = appStore.get("spotify");

    const moodOptions = MOODS.map((m) => `<option value="${m.value}" ${m.value === "freestyle" ? "selected" : ""}>${m.label}</option>`).join("");

    this.element.innerHTML = `
      <div class="station-header">
        <h2>Station</h2>
        <span class="station-status ${session.isRunning ? "status-on" : "status-off"}">
          ${session.isRunning ? "● On Air" : "○ Off Air"}
        </span>
      </div>
      <div class="field">
        <label for="mood-select">Station Mood</label>
        <select id="mood-select" ${session.isRunning ? "disabled" : ""}>${moodOptions}</select>
      </div>
      ${!ai.hasOpenAiKey ? `<p class="muted" style="font-size:0.8rem">Set your OpenAI key in Settings to enable DJ banter.</p>` : ""}
      ${!spotify.isConnected && !session.isRunning ? `<p class="muted" style="font-size:0.8rem">Connect Spotify to start a session.</p>` : ""}
      <div class="station-actions">
        ${
          session.isRunning
            ? `<button class="danger" id="btn-stop">Stop Session</button>
             <button id="btn-debug-skip" style="margin-left:0.5rem;background:#555;color:#ff0;font-size:0.75rem;padding:0.25rem 0.5rem;border:1px dashed #ff0;border-radius:4px;cursor:pointer" title="Skip to ~12s before end of track">⏩ Skip to banter</button>`
            : `<button id="btn-start" ${!spotify.isConnected ? "disabled" : ""}>Start Session</button>`
        }
      </div>
      <div class="dj-status muted" id="dj-status">
        ${session.isRunning ? "DJ is monitoring the station..." : "Session stopped."}
      </div>
    `;

    this.element.querySelector("#btn-start")?.addEventListener("click", () => void this.startSession());
    this.element.querySelector("#btn-stop")?.addEventListener("click", () => this.stopSession());
    this.element.querySelector("#btn-debug-skip")?.addEventListener("click", () => void this.debugSkipToBanter());
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
    addDjActivityEntry({ type: "system", text: `⏩ Debug skip: jumping to ${Math.round(seekTo / 1000)}s (35s before end)` });
    await this.services.spotifyPlayer.seek(seekTo);
    // Reset banter flags so the position monitor will evaluate again
    this.banterEvaluatedForTrackId = null;
    this.pendingTransition = null;
    this.pendingTransitionForTrackId = null;
  }

  private async startSession(): Promise<void> {
    const moodSelect = this.element.querySelector<HTMLSelectElement>("#mood-select");
    const mood = (moodSelect?.value ?? "freestyle") as StationMood;
    const personaState = appStore.get("persona");

    if (!personaState.activePersona) {
      alert("Please select a DJ persona in Settings first.");
      return;
    }

    this.sessionMood = mood;
    this.sessionId = uuidv4();
    const now = new Date().toISOString();

    const session = {
      id: this.sessionId,
      startedAt: now,
      mood,
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
    addDjActivityEntry({ type: "system", text: "Session starting\u2026 DJ is warming up 🎤" });
    await this.playDjIntro(mood);

    // 3. Transfer playback to start the first track
    try {
      await this.services.spotifyPlayer.transferPlayback();
      addDjActivityEntry({ type: "system", text: "Music started — DJ is on the air!" });
    } catch (err) {
      console.error("[StationControls] Playback transfer failed:", err);
      addDjActivityEntry({ type: "error", text: "Could not start Spotify playback. Try playing a track in Spotify first." });
    }

    // 4. Subscribe to track changes (for logging + recent tracks)
    this.unsubscribeTrackChange = this.services.spotifyPlayer.onTrackChange((track) => {
      if (!track || !this.sessionId) return;
      updatePlaybackState({ currentTrack: track });
      this.services.scheduler.recordTrackChange();

      // Log the new track in the activity feed
      addDjActivityEntry({
        type: "track",
        text: `🎵 Now playing: "${track.title}" by ${track.artistName}`,
      });

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

    // 5. Start position monitor (polls every 1 s)
    this.startPositionMonitor();
  }

  private stopSession(): void {
    // Stop position monitor
    if (this.positionInterval !== null) {
      clearInterval(this.positionInterval);
      this.positionInterval = null;
    }

    this.unsubscribeTrackChange?.();
    this.unsubscribeTrackChange = null;
    this.services.coordinator.stopMonitoring();
    this.isPreparingBanter = false;
    this.banterEvaluatedForTrackId = null;
    this.pendingTransition = null;
    this.pendingTransitionForTrackId = null;

    updateSessionState({ isRunning: false });

    if (this.sessionId) {
      addDjActivityEntry({ type: "system", text: "Session ended. Thanks for listening!" });
      saveSession({
        ...appStore.get("session").activeSession!,
        endedAt: new Date().toISOString(),
      }).catch(console.error);
    }

    this.sessionId = null;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // DJ Intro — plays before the first track
  // ────────────────────────────────────────────────────────────────────────────

  private async playDjIntro(mood: StationMood): Promise<void> {
    const { banterEngine, voiceEngine } = this.services;
    if (!banterEngine || !voiceEngine) {
      addDjActivityEntry({ type: "system", text: "DJ banter disabled (no OpenAI key)." });
      return;
    }

    const personaState = appStore.get("persona");
    if (!personaState.activePersona) return;

    try {
      updateAiState({ isGenerating: true, lastError: null });

      const banterResult = await banterEngine.generate({
        persona: personaState.activePersona,
        segmentType: "stationIdent",
        stationMood: mood,
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
      addDjActivityEntry({ type: "system", text: `⏱️ ${Math.round(remaining / 1000)}s left — preparing DJ banter…` });
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
  }

  /**
   * Pre-generate banter text + TTS audio and store the result.
   * Called with ~30s of track remaining so it's ready before the track ends.
   */
  private async preGenerateBanter(): Promise<void> {
    const { banterEngine, voiceEngine } = this.services;
    if (!banterEngine || !voiceEngine) {
      console.warn("[Banter] No banterEngine or voiceEngine — is OpenAI key set?");
      addDjActivityEntry({ type: "error", text: "DJ banter disabled — no OpenAI key configured." });
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
      addDjActivityEntry({ type: "system", text: `DJ decided to skip: ${decision.reason}` });
      return;
    }

    try {
      updateAiState({ isGenerating: true, lastError: null });
      const statusEl = this.element.querySelector("#dj-status");
      if (statusEl) statusEl.textContent = "DJ is thinking…";
      addDjActivityEntry({ type: "system", text: "🧠 Generating banter script…" });

      const banterResult = await banterEngine.generate({
        persona: personaState.activePersona,
        segmentType: decision.segmentType,
        stationMood: this.sessionMood,
        currentTrack,
        recentTracks: appStore.get("playback").recentTracks,
        requestSummary: [],
        recentBanterSummaries: [],
        constraints: {
          maxWords: 50,
          maxSeconds: 20,
          familySafe: appStore.get("settings").schedulerConfig.familySafe,
          factualityMode: personaState.activePersona.factuality,
        },
      });

      console.log("[Banter] Script generated:", banterResult.text);
      updateAiState({ isGenerating: false, isRendering: true });
      if (statusEl) statusEl.textContent = "DJ is recording…";
      addDjActivityEntry({ type: "system", text: "🎙️ Rendering voice…" });

      const voiceResult = await voiceEngine.render({
        text: banterResult.text,
        voice: personaState.activePersona.voice,
        speechRate: personaState.activePersona.speechRate,
        format: "mp3",
      });

      console.log("[Banter] Voice rendered, caching for playback");
      updateAiState({ isRendering: false });

      const trackInfo = currentTrack ? ` [after "${currentTrack.title}" by ${currentTrack.artistName}]` : "";

      // Cache the result — Phase 2 will play it when the track is about to end
      this.pendingTransition = {
        objectUrl: voiceResult.objectUrl,
        segmentType: decision.segmentType,
        banterText: banterResult.text,
        trackInfo,
      };
      this.pendingTransitionForTrackId = currentTrackId;

      if (statusEl) statusEl.textContent = `DJ ready: "${banterResult.text.slice(0, 60)}…"`;
      addDjActivityEntry({ type: "system", text: "✅ Banter ready — waiting for track to end…" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Banter] Failed:", msg);
      updateAiState({ isGenerating: false, isRendering: false, lastError: msg });
      addDjActivityEntry({ type: "error", text: `Banter failed: ${msg}` });
    }
  }
}
