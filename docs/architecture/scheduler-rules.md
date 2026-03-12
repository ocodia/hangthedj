# Station Scheduler Rules

## Overview

The StationScheduler is the editorial brain of HangTheDJ. It decides:
- whether the DJ should speak at this moment
- what type of segment to generate
- whether a listener request should be acknowledged now or deferred
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
2. **Request acknowledgement** — if a pending request has urgency >= high
3. **Request refusal / deferment** — if a rejected/deferred request needs speaking
4. **Artist introduction** — if a newly accepted request artist is now playing
5. **Transition** — default between-track comment
6. **Vibe-setting line** — if mood changed or after a long gap

---

## Cooldown rules

| Rule                   | Default        | Configurable |
|------------------------|----------------|--------------|
| Min tracks between DJ  | 2              | Yes          |
| Min time between DJ    | 3 minutes      | Yes          |
| Max insertions per hour| 15             | Yes          |
| Session ident cooldown | Once per session | No          |
| Same request repeat    | Never          | No           |

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
  djFrequency: "rarely" | "sometimes" | "often";  // maps to cooldown values
  requestBehaviour: "responsive" | "editorial";   // how quickly requests are addressed
  familySafe: boolean;                             // passed to banter generation
}
```

Mapping for `djFrequency`:
- `rarely` → minTracksBetweenDJ = 4, maxInsertionsPerHour = 6
- `sometimes` → minTracksBetweenDJ = 2, maxInsertionsPerHour = 15 (default)
- `often` → minTracksBetweenDJ = 1, maxInsertionsPerHour = 25

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
