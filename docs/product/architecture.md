# HangTheDJ

## Technical Architecture Specification

### Status

Draft v1

### Architecture direction

Spotify-first, browser-only, no backend, client-side PWA

---

## 1. Purpose

This document defines the technical architecture for HangTheDJ version 1.

The architecture is designed around a client-side compliant playback model:

- Spotify provides music playback in the browser
- the app monitors playback state and track transitions
- the app decides when a DJ insertion should happen
- the app ducks volume and plays a separate audio clip for the DJ segment
- the app generates or retrieves a DJ clip using OpenAI APIs
- the app plays a separate audio clip for the DJ segment
- Spotify playback resumes afterward

The app is intentionally browser-only in v1:

- no backend
- no server-side storage
- no server-side key management
- all orchestration happens in the client

---

## 2. Technical goals

- Run entirely in the browser as a single-page app and installable PWA
- Use Spotify as the only music provider in v1
- Use OpenAI APIs for both script generation and voice generation
- Store user settings, personas, request history, and session state locally
- Keep the playback flow resilient even when AI generation fails
- Make the architecture modular enough to support a future backend if needed
- Preserve a future path for experimental playback features without affecting the compliant core

---

## 3. Constraints

### 3.1 Product constraints

- Spotify only in v1
- no backend in v1
- user provides their own OpenAI API key
- no direct track skipping by the listener
- interstitial DJ mode only

### 3.2 Platform constraints

- Spotify Premium is required for browser playback
- browser autoplay and audio unlock rules apply
- browser storage limits and quota behaviour apply
- OpenAI key use occurs in the browser and must be treated as user-managed

### 3.3 Design constraints

- the app must still work if advanced queue introspection is limited
- playback continuity is more important than squeezing in every DJ segment
- all key UX-critical state should survive refreshes where practical

---

## 4. High-level architecture

```text
PWA / SPA Client
  ├─ App Shell
  ├─ Spotify Auth Layer
  ├─ Spotify Player Layer
  ├─ Playback Coordinator
  ├─ Station Scheduler
  ├─ Request Line Manager
  ├─ Persona Service
  ├─ Context Builder
  ├─ Banter Engine (OpenAI)
  ├─ Voice Engine (OpenAI)
  ├─ DJ Audio Player
  ├─ Local Cache Layer
  ├─ Session Store
  └─ Service Worker

Browser Storage
  ├─ IndexedDB
  ├─ localStorage
  └─ Cache Storage
```

---

## 5. Architectural style

Use a modular client-side application architecture with clear domain boundaries.

Recommended shape:

- one SPA frontend
- one shared state layer
- internal service modules for playback, AI generation, request handling, and storage
- no network dependencies other than Spotify and OpenAI APIs

This keeps the system simple while allowing a future backend to replace selected service implementations later.

---

## 6. Core client modules

## 6.1 App shell

Responsibilities:

- bootstrap the app
- register service worker
- initialize storage and settings
- route between screens or panels
- manage installable PWA shell behaviour

Suggested concerns:

- app startup
- storage initialization
- auth/session restoration
- settings loading

---

## 6.2 Spotify auth service

Responsibilities:

- perform Spotify Authorization Code with PKCE flow
- store Spotify tokens locally
- refresh or re-authenticate as needed
- expose auth state to the app

Suggested interface:

```ts
interface SpotifyAuthService {
  login(): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | null>;
  isAuthenticated(): Promise<boolean>;
}
```

Design notes:

- token storage should be abstracted behind a storage service
- auth restoration should happen on app load where possible

---

## 6.3 Spotify player service

Responsibilities:

- initialize Spotify Web Playback SDK
- expose playback state
- expose track change events
- expose pause/resume controls
- normalize SDK events into app-level state

Suggested interface:

```ts
interface SpotifyPlayerService {
  initialize(): Promise<void>;
  connect(): Promise<void>;
  getCurrentTrack(): Promise<Track | null>;
  getPlaybackState(): Promise<PlaybackState | null>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  addPlaybackListener(handler: (state: PlaybackState) => void): void;
  addTrackListener(handler: (track: Track | null) => void): void;
}
```

Design notes:

- separate low-level Spotify SDK state from app domain state
- treat playback event quality as variable and build resilience into coordination logic

---

## 6.4 Playback coordinator

Responsibilities:

- orchestrate volume ducking → DJ clip → volume restore
- own compliant-mode transition flow
- prevent race conditions when user actions or playback changes occur mid-transition
- decide when a prepared clip should be used or discarded

### State machine

```text
idle
  -> monitoring
  -> fadingOut
  -> playingDjClip
  -> resumingPlayback
  -> monitoring
```

The coordinator uses **volume ducking** rather than pause/resume. Music continues playing at 20% volume while the DJ clip plays, then fades back to the user's original volume.

### Crossfade parameters

- Fade-out: 3000ms over 15 steps
- Ducked volume: 0.2
- Fade-in: 1500ms over 8 steps

### Failure handling

- if clip is not ready in time, skip insertion
- if fade-out fails, log warning and continue
- if DJ audio fails, proceed to restore volume
- if fade-in fails, snap volume to original
- if playback changes unexpectedly, restore volume and return to monitoring

---

## 6.5 Station scheduler

Responsibilities:

- decide whether the DJ should speak
- decide what kind of segment should be generated
- balance station flow with user requests
- prevent over-talking
- provide a simple editorial brain for the station

### Inputs

- current track
- recent tracks
- session mood
- recent banter
- recent requests
- persona settings
- scheduler rules

### Outputs

- insertion decision
- segment type
- relative urgency
- whether a request should be acknowledged now
- whether a request should influence future playback planning

### Example segment types

- transition
- request acknowledgement
- request refusal
- request deferment
- vibe-setting line
- station ident
- artist introduction

---

## 6.6 Request line manager

Responsibilities:

- accept user call-ins
- validate and normalize request data
- store requests locally
- classify request status
- notify scheduler of new pending requests
- track whether a request has been acknowledged or fulfilled

### Suggested request model

```ts
interface ListenerRequest {
  id: string;
  sessionId: string;
  callerName?: string;
  artistName: string;
  trackName?: string;
  moodSuggestion?: string;
  message?: string;
  submittedAt: string;
  status: "pending" | "accepted" | "rejected" | "fulfilled";
  spokenAcknowledgement: boolean;
  promisedForLater: boolean;
  playNow: boolean;
  spotifyUri?: string;
  spotifyTrackTitle?: string;
}
```

### Design rule

The request line should feel like a station feature, not a search box. Keep the UX framed around call-ins and requests rather than direct queue editing.

---

## 6.7 Persona service

Responsibilities:

- store persona definitions
- validate persona settings
- resolve persona fields into generation instructions
- provide quick controls for changing style during a session

### Suggested persona model

```ts
interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  elevenLabsVoiceId?: string;
  voice: string;
  speechRate?: number;
  isPreset: boolean;
  createdAt: string;
  updatedAt: string;
}
```

Design rule:
Personas use a free-form `systemPrompt` that encodes all personality traits in natural language. This gives users full control and simplifies the data model while preserving expressive power.

---

## 6.8 Context builder

Note: In the current implementation, context assembly is handled inline by `StationControls` (which builds the `BanterRequest` object) and `buildUserPrompt()` within the `BanterEngine`. There is no separate `ContextBuilder` module — the functionality is distributed across these two locations.

Responsibilities:

- assemble generation context from current app state
- summarize recent tracks and recent banter
- summarize request state
- produce compact prompt-ready input for the banter engine

### Context inputs

- current track
- previous tracks
- active persona
- station mood
- recent listener requests
- recent generated scripts
- pending request outcomes

### Design rule

Avoid overloading the prompt with raw history. Summarize aggressively and keep context compact.

---

## 6.9 Banter engine

Responsibilities:

- generate short DJ scripts using OpenAI text generation
- respect persona, context, and scheduling constraints
- reject repetitive or low-quality outputs where possible

### Suggested interface

```ts
interface BanterEngine {
  generate(request: BanterRequest): Promise<BanterResult>;
}

interface BanterRequest {
  persona: Persona;
  segmentType: string;
  stationMood?: string;
  currentTrack?: Track | null;
  recentTracks: Track[];
  requestSummary: string[];
  recentBanterSummaries: string[];
  constraints: {
    maxWords: number;
    maxSeconds: number;
    playful: boolean;
    factualityMode: "playful" | "balanced" | "grounded";
  };
}

interface BanterResult {
  text: string;
  estimatedDurationSeconds: number;
  tags: string[];
}
```

### Quality strategy

- keep outputs short
- add anti-repetition checks client-side
- cache summaries of recent outputs
- discard weak outputs rather than forcing playback interruption

---

## 6.10 Voice engine

Responsibilities:

- render banter scripts into audio clips using OpenAI TTS or ElevenLabs TTS
- select provider based on configuration (ElevenLabs if key + voice ID present, otherwise OpenAI)
- apply voice/style selection
- return playable audio blobs or URLs
- support in-memory caching via SHA-256 content hashing

### Suggested interface

```ts
interface VoiceEngine {
  render(request: VoiceRenderRequest): Promise<VoiceRenderResult>;
}

interface VoiceRenderRequest {
  text: string;
  voice: string;
  elevenLabsVoiceId?: string;
  speechRate?: number;
  format: "mp3" | "wav";
}

interface VoiceRenderResult {
  blob: Blob;
  objectUrl: string;
  durationSeconds?: number;
  cacheKey: string;
}
```

### Design notes

- rendered clips should be treated as cacheable session assets
- cache key is SHA-256 of (provider + text + voice + speechRate + format)
- clear object URLs when no longer needed
- ElevenLabs uses `eleven_multilingual_v2` model
- OpenAI uses `tts-1` model

---

## 6.11 DJ audio player

Responsibilities:

- play generated DJ clips
- emit playback completion or failure events
- remain separate from Spotify audio handling

Suggested implementation:

- HTMLAudioElement first
- optional wrapper for future Web Audio handling

Design rule:
Keep DJ audio playback separate and simple in v1.

---

## 6.12 Local storage service

Responsibilities:

- abstract browser persistence
- provide typed storage access to IndexedDB, localStorage, and cache storage
- support schema evolution and cleanup

### Storage split

#### IndexedDB

Use for:

- personas
- requests
- session memory
- recent track history
- generated banter metadata
- optional rendered clip blobs or references

#### localStorage

Use for:

- lightweight app settings
- small UI flags
- maybe the OpenAI key reference or encrypted-at-rest placeholder if used

#### Cache Storage

Use for:

- app shell assets
- static resources
- optionally generated audio if that fits the chosen implementation

### Design notes

- prefer IndexedDB for structured persistent state
- keep key storage isolated and easy to clear
- make cache cleanup explicit

---

## 6.13 Session store

Responsibilities:

- hold active in-memory state during runtime
- expose app state to UI components
- synchronize with persistent local storage where appropriate

Suggested state partitions:

- authState
- spotifyState
- playbackState
- sessionState
- schedulerState
- requestState
- personaState
- aiState
- settingsState
- cacheState

Design rule:
Distinguish clearly between:

- user-paused playback
- DJ-induced volume ducking
- playback interruption or error

---

## 6.14 Service worker

Responsibilities:

- provide installable PWA behaviour
- cache app shell assets
- support offline loading of the UI
- support versioned cache updates

Important limitation:

- offline shell does not mean offline Spotify playback or offline AI generation
- the PWA should be resilient, not fully offline-capable

---

## 7. Data flow

## 7.1 Session startup flow

```text
1. App loads
2. Local settings and personas are restored
3. Spotify auth state is restored or login is requested
4. OpenAI key presence is checked
5. Spotify player is initialized
6. Session state moves to ready
```

## 7.2 Transition flow

```text
1. Playback state updates
2. Station scheduler detects likely insertion point
3. Context builder assembles compact prompt context
4. Banter engine generates short script
5. Voice engine renders script to audio
6. Playback coordinator reaches insertion point
7. Music volume ducks to 20%
8. DJ audio clip plays
9. DJ audio completes
10. Spotify playback resumes
11. Session memory updates
```

## 7.3 Request line flow

```text
1. User submits request
2. Request line manager validates and stores it
3. Scheduler marks request as pending input
4. A later insertion point is chosen
5. Banter engine generates a DJ acknowledgement
6. DJ clip plays
7. Request status is updated to accepted or rejected
```

## 7.4 Failure flow

```text
1. Scheduler wants a DJ segment
2. Banter generation fails or voice rendering fails
3. Transition is cancelled
4. Spotify playback continues uninterrupted
5. Failure is recorded locally
```

---

## 8. Domain model

### 8.1 Track

```ts
interface Track {
  id: string;
  title: string;
  artistName: string;
  albumName?: string;
  durationMs?: number;
  artworkUrl?: string;
  uri?: string;
}
```

### 8.2 PlaybackState

```ts
interface PlaybackState {
  isPlaying: boolean;
  progressMs: number;
  volume?: number;
  track: Track | null;
  deviceName?: string;
}
```

### 8.3 ListenerRequest

```ts
interface ListenerRequest {
  id: string;
  sessionId: string;
  callerName?: string;
  artistName: string;
  trackName?: string;
  moodSuggestion?: string;
  message?: string;
  submittedAt: string;
  status: "pending" | "accepted" | "rejected" | "fulfilled";
  spokenAcknowledgement: boolean;
  promisedForLater: boolean;
  playNow: boolean;
  spotifyUri?: string;
  spotifyTrackTitle?: string;
}
```

### 8.4 Persona

```ts
interface Persona {
  id: string;
  name: string;
  systemPrompt: string;
  elevenLabsVoiceId?: string;
  voice: string;
  speechRate?: number;
  isPreset: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 8.5 SessionMemory

```ts
interface SessionMemory {
  recentTracks: Track[];
  recentBanterSummaries: string[];
  recentRequestIds: string[];
  fulfilledRequestIds: string[];
  phraseFingerprints: string[];
}
```

---

## 9. Storage design

## 9.1 IndexedDB stores

Suggested object stores:

- `settings`
- `personas`
- `requests`
- `sessions`
- `sessionMemory`
- `banterHistory`
- `clipMetadata`
- `trackHistory`

## 9.2 localStorage

Suggested uses:

- small app preferences
- install flags
- last active persona id
- feature flags

## 9.3 API key storage

Suggested initial approach:

- store the OpenAI key locally only
- isolate key read/write logic in one service
- make clear in the UI that the key is stored locally in the browser
- provide explicit clear/remove controls

Design note:
This is acceptable for a hobby/self-hosted PWA but should not be treated as a production-grade secret management strategy.

---

## 10. Prompt and generation strategy

### 10.1 Prompt structure

Prompt inputs should be separated into:

- persona definition
- session mood
- current music context
- request context
- recent banter summary
- style and safety constraints

### 10.2 Generation rules

- keep scripts short
- avoid over-explaining songs
- avoid repeating greeting patterns
- use request acknowledgements sparingly but consistently
- never block playback waiting too long for a great line

### 10.3 Anti-repetition

Use local checks to reduce repetition:

- recent phrase fingerprinting
- script similarity checks
- banned phrase lists
- cooldowns for recurring segment types

---

## 11. Performance strategy

To keep transitions feeling smooth:

- detect likely insertion opportunities early
- pre-generate clips when possible
- cache clip outputs locally
- keep prompts and scripts short
- skip insertions when timing is poor

Rule of thumb:
Playback continuity is more important than squeezing in every DJ moment.

---

## 12. Security and privacy

### 12.1 Security considerations

- the OpenAI key is user-managed and exposed to the client environment
- the app must never hardcode shared keys
- the app should minimize places where the key is accessed
- storage and retrieval of the key should be centralized

### 12.2 Privacy considerations

- all user data is local in v1 unless sent to Spotify or OpenAI APIs as part of required usage
- users should be able to clear request history, personas, and cache
- no account system or backend persistence exists in v1

---

## 13. PWA model

The app should support:

- installable app shell
- offline access to UI shell and local settings
- restoration of prior local state after reopen

The app should not promise:

- offline Spotify playback
- offline OpenAI generation
- full offline station operation

---

## 14. Suggested repository structure

```text
README.md
/docs
  /product
    hangthedj-prd.md
  /architecture
    hangthedj-architecture.md
  /decisions
/src
  /app
  /features
    /spotify
    /playback
    /scheduler
    /requests
    /personas
    /banter
    /voice
    /storage
  /components
  /stores
  /services
  /lib
  /types
/public
```

### Suggested feature boundaries

```text
/src/features
  /spotify
    spotify-auth-service.ts
    spotify-player-service.ts
  /playback
    playback-coordinator.ts
  /scheduler
    station-scheduler.ts
  /requests
    request-line-manager.ts
  /personas
    persona-service.ts
  /banter
    banter-engine.ts
  /voice
    voice-engine.ts
  /storage
    storage-service.ts
    indexeddb.ts
```

---

## 15. Suggested implementation order

### Step 1

- build app shell
- implement local settings storage
- implement Spotify auth and playback startup

### Step 2

- implement playback coordinator
- implement simple pause → clip → resume flow with test clips

### Step 3

- implement OpenAI key entry and local storage
- implement banter generation and voice rendering

### Step 4

- implement personas and mood controls
- implement local request line and request state

### Step 5

- implement station scheduler
- add anti-repetition logic and caching

### Step 6

- add PWA polish
- add startup restoration and cleanup logic
- refine failure handling and edge cases

---

## 16. ADRs to write next

Recommended architecture decisions:

- Spotify-first provider decision
- no-backend v1 decision
- local API key storage decision
- IndexedDB storage model decision
- state management library decision
- audio playback implementation decision
- prompt anti-repetition strategy decision

---

## 17. Future extension points

Designed but not required for v1:

- optional backend token or generation proxy
- additional music providers
- richer station identity and jingles
- more advanced request fulfilment logic
- experimental ducked-overlay mode behind flags
- desktop wrapper

---

## 18. Summary

HangTheDJ v1 should be built as a browser-only Spotify-first PWA with no backend. Spotify handles music playback, OpenAI handles banter and voice generation, and the app coordinates everything locally using browser state, IndexedDB, and a simple scheduling model.

The cleanest approach is to isolate Spotify playback, scheduling, requests, personas, generation, and storage into separate client-side modules from the start. That gives you a practical v1 with minimal infrastructure while keeping a future path open for optional backend services later.
