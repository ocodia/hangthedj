# IndexedDB Schema

## Overview

HangTheDJ uses IndexedDB as its primary structured storage layer. All persistent session data, personas, request history, and banter metadata live here.

Database name: `hangthedj`
Current schema version: `1`

---

## Object Stores

### `settings`

Stores key/value application settings (typed).

| Field   | Type   | Notes                         |
|---------|--------|-------------------------------|
| key     | string | Primary key                   |
| value   | any    | Serialized setting value      |

---

### `personas`

Stores DJ persona definitions.

| Field          | Type     | Notes                              |
|----------------|----------|------------------------------------|
| id             | string   | Primary key (UUID)                 |
| name           | string   | Display name                       |
| summary        | string   | Short persona description          |
| tone           | string   | e.g. "dry", "warm", "hyperactive"  |
| humourLevel    | string   | "low" / "medium" / "high"          |
| energyLevel    | string   | "low" / "medium" / "high"          |
| verbosity      | string   | "brief" / "moderate" / "verbose"   |
| factuality     | string   | "playful" / "balanced" / "grounded"|
| accent         | string?  | Optional accent/style hint         |
| voice          | string   | OpenAI voice ID                    |
| speechRate     | number?  | Optional (0.5–2.0, default 1.0)    |
| expressiveness | string?  | Optional style hint                |
| catchphrases   | string[] | Optional recurring phrases         |
| isPreset       | boolean  | True for built-in presets          |
| createdAt      | string   | ISO 8601                           |
| updatedAt      | string   | ISO 8601                           |

Indexes:
- `isPreset` (for filtering presets vs custom)

---

### `requests`

Stores listener call-in requests.

| Field                | Type    | Notes                                                        |
|----------------------|---------|--------------------------------------------------------------|
| id                   | string  | Primary key (UUID)                                           |
| sessionId            | string  | Session this request belongs to                              |
| callerName           | string? | Optional caller handle                                       |
| artistName           | string  | Requested artist                                             |
| trackName            | string? | Optional specific track                                      |
| moodSuggestion       | string? | Optional mood hint                                           |
| message              | string? | Optional short message                                       |
| submittedAt          | string  | ISO 8601                                                     |
| status               | string  | "pending" / "accepted" / "deferred" / "rejected" / "fulfilled"|
| spokenAcknowledgement| boolean | Whether the DJ has spoken about this                         |
| promisedForLater     | boolean | Whether the DJ implied it would come later                   |

Indexes:
- `sessionId` (for session-scoped queries)
- `status` (for pending/accepted filtering)
- `submittedAt` (for ordering)

---

### `sessions`

Stores session metadata.

| Field     | Type   | Notes                       |
|-----------|--------|-----------------------------|
| id        | string | Primary key (UUID)          |
| startedAt | string | ISO 8601                    |
| endedAt   | string?| ISO 8601, null if active    |
| mood      | string | Station mood for the session|
| personaId | string | Active persona              |

Indexes:
- `startedAt` (for recent sessions)

---

### `sessionMemory`

Stores running session context used by the banter engine.

| Field                 | Type     | Notes                               |
|-----------------------|----------|-------------------------------------|
| sessionId             | string   | Primary key (also the session ref)  |
| recentTracks          | Track[]  | Last N tracks played                |
| recentBanterSummaries | string[] | Short summaries of recent DJ lines  |
| recentRequestIds      | string[] | IDs of recently referenced requests |
| fulfilledRequestIds   | string[] | IDs of fulfilled requests           |
| phraseFingerprints    | string[] | Hashes/keys of recent phrases       |
| updatedAt             | string   | ISO 8601                            |

---

### `banterHistory`

Stores metadata about generated banter scripts (not full audio).

| Field                   | Type   | Notes                              |
|-------------------------|--------|------------------------------------|
| id                      | string | Primary key (UUID)                 |
| sessionId               | string | Session reference                  |
| text                    | string | Script text                        |
| segmentType             | string | e.g. "transition", "acknowledgement"|
| estimatedDurationSeconds| number | Approximate spoken duration        |
| tags                    | string[]| Contextual tags                   |
| generatedAt             | string | ISO 8601                           |
| fingerprint             | string | Short hash for anti-repetition     |

Indexes:
- `sessionId`
- `generatedAt`

---

### `clipMetadata`

Stores metadata about rendered voice clips (audio may be in Cache Storage or object URLs).

| Field           | Type   | Notes                              |
|-----------------|--------|------------------------------------|
| id              | string | Primary key (cacheKey)             |
| banterId        | string | Reference to banterHistory entry   |
| durationSeconds | number | Actual audio duration              |
| voice           | string | OpenAI voice used                  |
| format          | string | "mp3" / "wav"                      |
| cacheUrl        | string?| Cache Storage URL if persisted     |
| createdAt       | string | ISO 8601                           |

---

### `trackHistory`

Stores recently played track records.

| Field     | Type   | Notes              |
|-----------|--------|--------------------|
| id        | string | Track ID from Spotify|
| sessionId | string | Session reference  |
| title     | string | Track title        |
| artistName| string | Artist             |
| albumName | string?| Album              |
| durationMs| number?| Duration           |
| artworkUrl| string?| Artwork URL        |
| uri       | string?| Spotify URI        |
| playedAt  | string | ISO 8601           |

Indexes:
- `sessionId`
- `playedAt`

---

## Schema evolution

When the schema version increments:
- use the `onupgradeneeded` handler to apply migrations
- preserve existing data where possible
- document changes in this file with version annotations

## Cleanup policy

- Track history: keep last 50 entries per session
- Banter history: keep last 100 entries per session
- Old sessions: keep last 10 sessions and prune older ones
- Clip metadata: prune when associated cache entries are cleared
