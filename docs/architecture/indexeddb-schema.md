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

| Field             | Type    | Notes                                        |
|-------------------|---------|----------------------------------------------|
| id                | string  | Primary key (UUID)                           |
| name              | string  | Display name                                 |
| systemPrompt      | string  | Free-form persona prompt text                |
| elevenLabsVoiceId | string  | Optional ElevenLabs voice ID                 |
| voice             | string  | OpenAI TTS voice ID (fallback)               |
| speechRate        | number  | 0.5–1.5, default 1.0                        |
| isPreset          | boolean | True for built-in presets                    |
| createdAt         | string  | ISO 8601                                     |
| updatedAt         | string  | ISO 8601                                     |

Indexes:
- `isPreset` (for filtering presets vs custom)

---

### `requests`

Stores listener call-in requests.

| Field                | Type    | Notes                                                      |
|----------------------|---------|---------------------------------------------------------   |
| id                   | string  | Primary key (UUID)                                         |
| sessionId            | string  | Session this request belongs to                            |
| callerName           | string? | Optional caller handle (max 50 chars)                      |
| artistName           | string  | Requested artist (max 100 chars)                           |
| trackName            | string? | Optional specific track (max 100 chars)                    |
| moodSuggestion       | string? | Optional mood hint (max 100 chars)                         |
| message              | string? | Optional short message (max 200 chars)                     |
| submittedAt          | string  | ISO 8601                                                   |
| status               | string  | "pending" / "accepted" / "rejected" / "fulfilled"          |
| spokenAcknowledgement| boolean | Whether the DJ has spoken about this                       |
| promisedForLater     | boolean | Whether the DJ implied it would come later                 |
| playNow              | boolean | Whether the user requested immediate playback              |
| spotifyUri           | string? | Spotify URI if track was found                             |
| spotifyTrackTitle    | string? | Resolved track title from Spotify search                   |

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

Compound primary key: `[id, sessionId]`

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
