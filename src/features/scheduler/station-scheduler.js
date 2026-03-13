/**
 * StationScheduler: the editorial brain of the station.
 * Decides whether and when the DJ should speak.
 */

// ── Cooldown configuration per frequency setting ──────────────────────────────

const COOLDOWNS = {
  every: { minTracksBetweenDJ: 0, minMsBetweenDJ: 0, maxInsertionsPerHour: 999 },
  rarely: { minTracksBetweenDJ: 4, minMsBetweenDJ: 5 * 60_000, maxInsertionsPerHour: 6 },
  sometimes: { minTracksBetweenDJ: 2, minMsBetweenDJ: 3 * 60_000, maxInsertionsPerHour: 15 },
  often: { minTracksBetweenDJ: 1, minMsBetweenDJ: 90_000, maxInsertionsPerHour: 25 },
};

export function createInitialSchedulerState() {
  return {
    lastInsertionAt: null,
    tracksSinceLastInsert: 0,
    insertionCountThisHour: 0,
    hourWindowStart: Date.now(),
    lastSegmentType: null,
    sessionIdentDone: false,
  };
}

// ── StationScheduler ──────────────────────────────────────────────────────────

class StationSchedulerImpl {
  constructor() {
    this.state = createInitialSchedulerState();
  }

  onTrackChange(currentTrack, _playbackState, persona, _mood, pendingRequests, _recentBanterSummaries, config) {
    if (!currentTrack) {
      return { shouldInsert: false, segmentType: null, urgency: 'low', requestToAcknowledge: null, reason: 'No track playing' };
    }

    const cooldown = COOLDOWNS[config.djFrequency];
    const now = Date.now();

    if (now - this.state.hourWindowStart > 3_600_000) {
      this.state.insertionCountThisHour = 0;
      this.state.hourWindowStart = now;
    }

    if (config.djFrequency !== 'every') {
      if (this.state.insertionCountThisHour >= cooldown.maxInsertionsPerHour) {
        return {
          shouldInsert: false,
          segmentType: null,
          urgency: 'low',
          requestToAcknowledge: null,
          reason: `Hourly insertion limit (${cooldown.maxInsertionsPerHour}) reached`,
        };
      }

      if (this.state.tracksSinceLastInsert < cooldown.minTracksBetweenDJ) {
        return {
          shouldInsert: false,
          segmentType: null,
          urgency: 'low',
          requestToAcknowledge: null,
          reason: `Tracks since last insert (${this.state.tracksSinceLastInsert}) < min (${cooldown.minTracksBetweenDJ})`,
        };
      }

      if (
        this.state.lastInsertionAt !== null &&
        now - this.state.lastInsertionAt < cooldown.minMsBetweenDJ
      ) {
        return {
          shouldInsert: false,
          segmentType: null,
          urgency: 'low',
          requestToAcknowledge: null,
          reason: 'Time since last insertion is below minimum',
        };
      }
    }

    // 1. Station ident on first insertion
    if (!this.state.sessionIdentDone) {
      return {
        shouldInsert: true,
        segmentType: 'stationIdent',
        urgency: 'normal',
        requestToAcknowledge: null,
        reason: 'First insertion of session',
      };
    }

    // 2. High-priority request acknowledgement
    const urgentRequest = pendingRequests.find(
      (r) => r.status === 'pending' && !r.spokenAcknowledgement
    );
    if (urgentRequest && config.requestBehaviour === 'responsive') {
      const segmentType =
        pendingRequests.filter((r) => r.status === 'pending').length > 3
          ? 'requestDeferment'
          : 'requestAcknowledgement';
      return {
        shouldInsert: true,
        segmentType,
        urgency: 'high',
        requestToAcknowledge: urgentRequest.id,
        reason: `Pending request from ${urgentRequest.callerName ?? 'listener'}`,
      };
    }

    // 3. Persona verbosity adjustment
    if (
      config.djFrequency !== 'every' &&
      persona.verbosity === 'brief' &&
      this.state.tracksSinceLastInsert < 3
    ) {
      return {
        shouldInsert: false,
        segmentType: null,
        urgency: 'low',
        requestToAcknowledge: null,
        reason: 'Brief persona: waiting for more tracks',
      };
    }

    // 4. Default transition
    return {
      shouldInsert: true,
      segmentType: 'transition',
      urgency: 'normal',
      requestToAcknowledge: null,
      reason: 'Regular track change insertion',
    };
  }

  recordInsertion(segmentType) {
    const now = Date.now();
    this.state.lastInsertionAt = now;
    this.state.tracksSinceLastInsert = 0;
    this.state.insertionCountThisHour += 1;
    this.state.lastSegmentType = segmentType;
    if (segmentType === 'stationIdent') {
      this.state.sessionIdentDone = true;
    }
  }

  recordTrackChange() {
    this.state.tracksSinceLastInsert += 1;
  }

  resetSession() {
    this.state = createInitialSchedulerState();
  }

  getState() {
    return { ...this.state };
  }
}

export function createStationScheduler() {
  return new StationSchedulerImpl();
}
