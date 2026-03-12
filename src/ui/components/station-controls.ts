/**
 * StationControls: start/stop session, mood selector, DJ status.
 */

import type { AppServices } from "@/app/app-shell";
import { appStore, updateSessionState, updateAiState, updatePlaybackState } from "@/stores/app-store";
import { saveSession } from "@/features/storage/storage-service";
import { v4 as uuidv4 } from "uuid";
import type { StationMood } from "@/types/session";

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
  private unsubscribeTrackChange: (() => void) | null = null;

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

    const moodOptions = MOODS.map(
      (m) =>
        `<option value="${m.value}" ${m.value === "freestyle" ? "selected" : ""}>${m.label}</option>`
    ).join("");

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
        ${session.isRunning
          ? `<button class="danger" id="btn-stop">Stop Session</button>`
          : `<button id="btn-start" ${!spotify.isConnected ? "disabled" : ""}>Start Session</button>`
        }
      </div>
      <div class="dj-status muted" id="dj-status">
        ${session.isRunning ? "DJ is monitoring the station..." : "Session stopped."}
      </div>
    `;

    this.element.querySelector("#btn-start")?.addEventListener("click", () => void this.startSession());
    this.element.querySelector("#btn-stop")?.addEventListener("click", () => this.stopSession());
  }

  private async startSession(): Promise<void> {
    const moodSelect = this.element.querySelector<HTMLSelectElement>("#mood-select");
    const mood = (moodSelect?.value ?? "freestyle") as StationMood;
    const personaState = appStore.get("persona");

    if (!personaState.activePersona) {
      alert("Please select a DJ persona in Settings first.");
      return;
    }

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

    this.services.coordinator.startMonitoring();
    this.services.scheduler.resetSession();

    this.unsubscribeTrackChange = this.services.spotifyPlayer.onTrackChange(
      async (track) => {
        if (!track || !this.sessionId) return;

        updatePlaybackState({ currentTrack: track });
        this.services.scheduler.recordTrackChange();

        const decision = this.services.scheduler.onTrackChange(
          track,
          this.services.spotifyPlayer.getPlaybackState(),
          personaState.activePersona!,
          mood,
          [],
          [],
          appStore.get("settings").schedulerConfig
        );

        if (!decision.shouldInsert || !decision.segmentType) return;

        const { banterEngine, voiceEngine } = this.services;
        if (!banterEngine || !voiceEngine) return;

        if (!appStore.get("ai").hasOpenAiKey) return;

        try {
          updateAiState({ isGenerating: true, lastError: null });

          const banterResult = await banterEngine.generate({
            persona: personaState.activePersona!,
            segmentType: decision.segmentType,
            stationMood: mood,
            currentTrack: track,
            recentTracks: appStore.get("playback").recentTracks,
            requestSummary: [],
            recentBanterSummaries: [],
            constraints: {
              maxWords: 50,
              maxSeconds: 20,
              familySafe: appStore.get("settings").schedulerConfig.familySafe,
              factualityMode: personaState.activePersona!.factuality,
            },
          });

          updateAiState({ isGenerating: false, isRendering: true });

          const voiceResult = await voiceEngine.render({
            text: banterResult.text,
            voice: personaState.activePersona!.voice,
            speechRate: personaState.activePersona!.speechRate,
            format: "mp3",
          });

          updateAiState({ isRendering: false });

          const statusEl = this.element.querySelector("#dj-status");
          if (statusEl) statusEl.textContent = `DJ: "${banterResult.text}"`;

          await this.services.coordinator.executeTransition(voiceResult.objectUrl);
          this.services.scheduler.recordInsertion(decision.segmentType);

          const current = appStore.get("playback");
          updatePlaybackState({
            recentTracks: [track, ...current.recentTracks].slice(0, 10),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error("[StationControls] DJ insertion failed:", msg);
          updateAiState({ isGenerating: false, isRendering: false, lastError: msg });
        }
      }
    );

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
        this.stopSession();
      }
    }
  }

  private stopSession(): void {
    this.unsubscribeTrackChange?.();
    this.unsubscribeTrackChange = null;
    this.services.coordinator.stopMonitoring();
    updateSessionState({ isRunning: false });

    if (this.sessionId) {
      saveSession({
        ...appStore.get("session").activeSession!,
        endedAt: new Date().toISOString(),
      }).catch(console.error);
    }

    this.sessionId = null;
  }
}
