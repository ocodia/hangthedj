/**
 * StationScheduler: the editorial brain of the station.
 *
 * Decides whether and when the DJ should speak, what type of segment to
 * generate, and whether a listener request should be acknowledged now.
 *
 * Rules are documented in docs/architecture/scheduler-rules.md.
 */

import type { Track } from "@/types/track";
import type { PlaybackState } from "@/types/playback";
import type { Persona } from "@/types/persona";
import type { ListenerRequest } from "@/types/request";
import type { SegmentType } from "@/types/banter";
import type {
  SchedulerConfig,
  SchedulerDecision,
  DjFrequency,
} from "@/types/scheduler";
import type { StationMood } from "@/types/session";

// ──────────────────────────────────────────────────────────────────────────────
// Cooldown configuration per frequency setting
// ──────────────────────────────────────────────────────────────────────────────

interface CooldownConfig {
  minTracksBetweenDJ: number;
  minMsBetweenDJ: number;
  maxInsertionsPerHour: number;
}

const COOLDOWNS: Record<DjFrequency, CooldownConfig> = {
  every: { minTracksBetweenDJ: 0, minMsBetweenDJ: 0, maxInsertionsPerHour: 999 },
  rarely: { minTracksBetweenDJ: 4, minMsBetweenDJ: 5 * 60_000, maxInsertionsPerHour: 6 },
  sometimes: { minTracksBetweenDJ: 2, minMsBetweenDJ: 3 * 60_000, maxInsertionsPerHour: 15 },
  often: { minTracksBetweenDJ: 1, minMsBetweenDJ: 90_000, maxInsertionsPerHour: 25 },
};

// ──────────────────────────────────────────────────────────────────────────────
// Scheduler state (in-memory, resets on session start)
// ──────────────────────────────────────────────────────────────────────────────

export interface SchedulerState {
  lastInsertionAt: number | null;
  tracksSinceLastInsert: number;
  insertionCountThisHour: number;
  hourWindowStart: number;
  lastSegmentType: SegmentType | null;
  sessionIdentDone: boolean;
}

export function createInitialSchedulerState(): SchedulerState {
  return {
    lastInsertionAt: null,
    tracksSinceLastInsert: 0,
    insertionCountThisHour: 0,
    hourWindowStart: Date.now(),
    lastSegmentType: null,
    sessionIdentDone: false,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// StationScheduler
// ──────────────────────────────────────────────────────────────────────────────

export interface StationScheduler {
  onTrackChange(
    currentTrack: Track | null,
    playbackState: PlaybackState | null,
    persona: Persona,
    mood: StationMood,
    pendingRequests: ListenerRequest[],
    recentBanterSummaries: string[],
    config: SchedulerConfig
  ): SchedulerDecision;
  recordInsertion(segmentType: SegmentType): void;
  recordTrackChange(): void;
  resetSession(): void;
  getState(): Readonly<SchedulerState>;
}

class StationSchedulerImpl implements StationScheduler {
  private state: SchedulerState = createInitialSchedulerState();

  onTrackChange(
    currentTrack: Track | null,
    _playbackState: PlaybackState | null,
    persona: Persona,
    _mood: StationMood,
    pendingRequests: ListenerRequest[],
    _recentBanterSummaries: string[],
    config: SchedulerConfig
  ): SchedulerDecision {
    if (!currentTrack) {
      return { shouldInsert: false, segmentType: null, urgency: "low", requestToAcknowledge: null, reason: "No track playing" };
    }

    const cooldown = COOLDOWNS[config.djFrequency];
    const now = Date.now();

    // Reset hourly counter if needed
    if (now - this.state.hourWindowStart > 3_600_000) {
      this.state.insertionCountThisHour = 0;
      this.state.hourWindowStart = now;
    }

    // "every" mode: skip all cooldown checks entirely (debug mode)
    if (config.djFrequency !== "every") {
      // Hard stop: hourly limit reached
      if (this.state.insertionCountThisHour >= cooldown.maxInsertionsPerHour) {
        return {
          shouldInsert: false,
          segmentType: null,
          urgency: "low",
          requestToAcknowledge: null,
          reason: `Hourly insertion limit (${cooldown.maxInsertionsPerHour}) reached`,
        };
      }

      // Track cooldown check
      if (this.state.tracksSinceLastInsert < cooldown.minTracksBetweenDJ) {
        return {
          shouldInsert: false,
          segmentType: null,
          urgency: "low",
          requestToAcknowledge: null,
          reason: `Tracks since last insert (${this.state.tracksSinceLastInsert}) < min (${cooldown.minTracksBetweenDJ})`,
        };
      }

      // Time cooldown check
      if (
        this.state.lastInsertionAt !== null &&
        now - this.state.lastInsertionAt < cooldown.minMsBetweenDJ
      ) {
        return {
          shouldInsert: false,
          segmentType: null,
          urgency: "low",
          requestToAcknowledge: null,
          reason: "Time since last insertion is below minimum",
        };
      }
    }

    // ── Decide segment type ──────────────────────────────────────────────────

    // 1. Station ident on first insertion
    if (!this.state.sessionIdentDone) {
      return {
        shouldInsert: true,
        segmentType: "stationIdent",
        urgency: "normal",
        requestToAcknowledge: null,
        reason: "First insertion of session",
      };
    }

    // 2. High-priority request acknowledgement
    const urgentRequest = pendingRequests.find(
      (r) => r.status === "pending" && !r.spokenAcknowledgement
    );
    if (urgentRequest && config.requestBehaviour === "responsive") {
      // Accept or decide to defer based on queue size
      const segmentType: SegmentType =
        pendingRequests.filter((r) => r.status === "pending").length > 3
          ? "requestDeferment"
          : "requestAcknowledgement";
      return {
        shouldInsert: true,
        segmentType,
        urgency: "high",
        requestToAcknowledge: urgentRequest.id,
        reason: `Pending request from ${urgentRequest.callerName ?? "listener"}`,
      };
    }

    // 3. Persona verbosity adjustment (skipped when djFrequency is "every")
    if (
      config.djFrequency !== "every" &&
      persona.verbosity === "brief" &&
      this.state.tracksSinceLastInsert < 3
    ) {
      return {
        shouldInsert: false,
        segmentType: null,
        urgency: "low",
        requestToAcknowledge: null,
        reason: "Brief persona: waiting for more tracks",
      };
    }

    // 4. Default transition
    return {
      shouldInsert: true,
      segmentType: "transition",
      urgency: "normal",
      requestToAcknowledge: null,
      reason: "Regular track change insertion",
    };
  }

  recordInsertion(segmentType: SegmentType): void {
    const now = Date.now();
    this.state.lastInsertionAt = now;
    this.state.tracksSinceLastInsert = 0;
    this.state.insertionCountThisHour += 1;
    this.state.lastSegmentType = segmentType;
    if (segmentType === "stationIdent") {
      this.state.sessionIdentDone = true;
    }
  }

  recordTrackChange(): void {
    this.state.tracksSinceLastInsert += 1;
  }

  resetSession(): void {
    this.state = createInitialSchedulerState();
  }

  getState(): Readonly<SchedulerState> {
    return { ...this.state };
  }
}

export function createStationScheduler(): StationScheduler {
  return new StationSchedulerImpl();
}
