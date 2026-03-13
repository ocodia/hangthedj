# Station Scheduler Rules

## Overview

The StationScheduler is the editorial brain of HangTheDJ. It decides:
- whether the DJ should speak at this moment
- what type of segment to generate
- whether a listener request should be acknowledged now
- how frequently the DJ interrupts the station flow

The scheduler runs on every meaningful playback event (track change, progress update).

---

## Inputs

| Input                | Source                   | Purpose                                 |
|----------------------|--------------------------|-----------------------------------------|
| currentTrack         | SpotifyPlayerService     | What is playing now                     |
| previousTracks       | SessionMemory            | Recent listening history                |
| sessionMood          | SessionStore             | Mood selected for the session           |
| activePersona        | PersonaService           | DJ persona settings (verbosity, energy) |
| pendingRequests      | RequestLineManager       | Requests awaiting acknowledgement       |
| recentBanter         | SessionMemory            | What the DJ has said recently           |
| playbackProgressMs   | SpotifyPlayerService     | Position in current track               |
| trackDurationMs      | currentTrack             | Length of current track                 |
| schedulerConfig      | Settings                 | User-configurable frequency and rules   |

---

## Output

```ts
interface SchedulerDecision {
  shouldInsert: boolean;
  segmentType: SegmentType | null;
  urgency: "low" | "normal" | "high";
  requestToAcknowledge: string | null; // request ID if relevant
  reason: string; // for debug/logging
}
```

---

## Insertion triggers

### Track change (highest confidence)
- A new track has started
- Apply cooldown: don't insert more than once per N tracks (default: every 2 tracks)
- Override cooldown if: a pending request is high-priority, or this is the first track of the session

### Near end of track
- Track is within the last 15–30 seconds
- Use this window to pre-generate the next clip
- Only trigger actual insertion on track change, not mid-track

### Request acknowledgement urgency
- A request has been pending for more than K insertions without acknowledgement
- Bump urgency to high; next insertion point should acknowledge it
- K default: 3 insertions (configurable)

---

## Segment type selection logic

Priority order:

1. **Station ident** — once per session, on first insertion
2. **Request acknowledgement** — if a pending request has not been spoken about and `requestBehaviour` is `responsive`
3. **Request deferment** — if more than 3 pending requests, the scheduler produces a deferment instead of full acknowledgement
4. **Transition** — default between-track comment

Note: `artistIntroduction` and `vibeSetting` segment types are supported by the BanterEngine but the scheduler currently defaults to `transition` when no higher-priority segment applies.

The scheduler also respects a brief-persona heuristic: if the persona's `verbosity` is `"brief"` and fewer than 3 tracks have passed since the last insertion, the scheduler will skip.

---

## Cooldown rules

| Rule                   | Default        | Configurable |
|------------------------|----------------|--------------|
| Min tracks between DJ  | 2              | Yes (via djFrequency) |
| Min time between DJ    | 3 minutes      | Yes (via djFrequency) |
| Max insertions per hour| 15             | Yes (via djFrequency) |
| Session ident cooldown | Once per session | No          |
| Same request repeat    | Never          | No           |

Cooldown checks are bypassed when `djFrequency` is set to `every` (debug mode).

---

## Request acceptance logic

When a new request arrives:

1. Does the artist/track exist on Spotify? — TODO: Spotify search not in v1 scope; treat as advisory
2. Does the request fit the current mood? — soft check based on mood tags
3. Is the request queue too long? — if > 5 pending, defer or reject new ones
4. Is the request a duplicate? — if same artist requested in last 10 minutes, reject

Accept/defer/reject decision is made by the scheduler and passed to the BanterEngine as context.

---

## Scheduler configuration (user-adjustable)

```ts
interface SchedulerConfig {
  djFrequency: "every" | "rarely" | "sometimes" | "often";  // maps to cooldown values
  requestBehaviour: "responsive" | "editorial";   // how quickly requests are addressed
  familySafe: boolean;                             // passed to banter generation
}
```

Mapping for `djFrequency`:
- `every` → minTracksBetweenDJ = 0, minMsBetweenDJ = 0, maxInsertionsPerHour = 999 (debug mode — DJ speaks on every track change)
- `rarely` → minTracksBetweenDJ = 4, minMsBetweenDJ = 300000 (5 min), maxInsertionsPerHour = 6
- `sometimes` → minTracksBetweenDJ = 2, minMsBetweenDJ = 180000 (3 min), maxInsertionsPerHour = 15 (default)
- `often` → minTracksBetweenDJ = 1, minMsBetweenDJ = 90000 (90 sec), maxInsertionsPerHour = 25

---

## Anti-repetition enforcement

The scheduler passes recent banter summaries and phrase fingerprints to the BanterEngine.
It also:
- tracks which segment types have been used recently
- avoids the same segmentType on two consecutive insertions unless urgency is high
- rejects BanterResult if its fingerprint matches a recent one (fallback: skip insertion)

---

## Edge cases

| Scenario                              | Behaviour                                       |
|---------------------------------------|-------------------------------------------------|
| User pauses Spotify manually          | Cancel any active or pending transition          |
| App tab goes to background            | Continue monitoring; pause active transition    |
| Network unavailable for OpenAI call   | Skip insertion, continue music                  |
| Multiple requests queued              | Acknowledge oldest high-priority one first      |
| Session just started                  | Insert station ident on first track change      |
| Clip not ready by insertion point     | Skip insertion, mark as missed                  |
