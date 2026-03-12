# HangTheDJ

## Product Requirements Document

### Status

Draft v1

### Product tagline

Your personal AI radio station

---

## 1. Overview

### 1.1 Product summary

HangTheDJ is a client-side web app that turns personal Spotify listening into a DJ-led radio-style experience.

A user signs in with their own Spotify account, starts a station session, and listens while an AI DJ delivers short spoken segments between tracks. The DJ has a configurable personality, accent, tone, and speaking style, and can reference the current session mood, the music being played, and listener call-ins.

The user does not directly skip tracks. Instead, they can call in to suggest artists, songs, or moods. The DJ may acknowledge, accept, defer, or decline those requests in character, while the station retains editorial control over the flow.

Version 1 is intentionally simple:

- Spotify only
- no backend
- single-page SPA / PWA
- client-side state, scheduling, and storage
- user-supplied OpenAI API key for banter and voice generation
- compliant interstitial DJ mode only

### 1.2 Vision

Create the feeling of a personal AI radio station that is:

- playful
- distinctive
- musically aware
- personality-driven
- lightly interactive
- installable and self-contained

### 1.3 Product goals

- Turn passive playlist playback into a station-like listening experience
- Let users shape a memorable DJ personality and voice
- Introduce listener call-ins as a lightweight interaction model
- Keep the app entirely client-side for the first version
- Build a product that works without any required backend infrastructure

### 1.4 Non-goals

- Becoming a full music streaming service
- Supporting multiple music providers in v1
- Shipping a managed cloud product in v1
- Delivering live speech over songs as a required feature
- Building a traditional on-demand music player
- Native mobile apps in the MVP

---

## 2. Problem statement

Streaming services are efficient, but they often feel emotionally flat. They play music, but they do not create the sense of presence, humour, pacing, and companionship that people associate with radio.

Users who enjoy DJ-style context, curated flow, and personality-driven listening do not have many tools that sit on top of their own music service while still feeling personal and alive.

At the same time, modern LLMs and text-to-speech systems make it possible to generate short, contextual, entertaining spoken segments in real time.

HangTheDJ combines these capabilities into a client-side radio-station experience built on top of Spotify playback.

---

## 3. Product identity

HangTheDJ is a personal AI radio station, not a normal playlist controller.

Core identity traits:

- DJ-led
- personality-driven
- radio-inspired
- lightly interactive
- station-formatted
- listener-influenced rather than listener-controlled

The station should feel like it has taste, memory, and its own flow. The user participates by calling in and influencing the direction, but the DJ remains in charge.

---

## 4. Target users

### 4.1 Primary users

- Music fans who enjoy radio presentation and curation
- Users who want a more playful and personal Spotify experience
- People interested in AI personalities and voice-driven interfaces
- Hobbyists and self-hosters who like installable web apps

### 4.2 Secondary users

- Developers exploring AI-native media experiences
- Early adopters experimenting with local-first or client-side products
- People who want music context, not just music playback

---

## 5. Core use cases

### UC1: Personal station session

The user starts HangTheDJ and listens to a flowing station experience with short DJ banter between tracks.

### UC2: Mood-led listening

The user selects a station mood such as late night, upbeat, nostalgic, focus, or indie evening, and the DJ adapts accordingly.

### UC3: Artist or track context

The DJ introduces a track with a short remark, callback, or contextual observation.

### UC4: Personality-led listening

The user selects or creates a DJ persona with a distinct voice, humour level, rhythm, and style.

### UC5: Listener call-in

The user sends a request for an artist, track, or mood.

### UC6: DJ acknowledgement

The DJ references that request later, either accepting it, deferring it, or gently refusing it in character.

### UC7: Request-influenced programming

Accepted requests influence the future station flow without turning the app into an on-demand player.

---

## 6. Product principles

1. Music first
   The DJ should enhance listening, not dominate it.

2. Short and intentional
   Spoken segments should usually be concise and well-timed.

3. Strong personality
   The DJ should feel memorable and internally consistent.

4. Station flow matters
   Listener requests should influence the session without breaking the format.

5. Audience participation should feel real
   Requests should be acknowledged naturally and remembered consistently.

6. Promises should be tracked
   If the DJ implies a request is coming later, the system should honour that or avoid making that promise.

7. Client-side first
   The product should run entirely in the browser for v1.

8. User-owned keys and control
   The user is responsible for supplying and managing their own OpenAI API key.

9. Compliance by design
   The app should work well without relying on simultaneous speech over Spotify playback.

10. Graceful failure
    If AI generation fails, music playback should continue.

---

## 7. MVP scope

### 7.1 In scope

- Single-page web app
- PWA installability
- Spotify authentication and playback
- Playback state and track awareness
- Interstitial DJ segments between tracks or during intentional pauses
- Configurable DJ persona
- Voice, accent, tone, humour, and speaking style controls
- Listener request line / call-in flow
- Request queue and request status tracking
- DJ acknowledgement of listener requests
- Station scheduling logic for accepted, deferred, or rejected requests
- Client-side session memory for recent requests, banter, and tracks
- IndexedDB or local storage persistence
- User-supplied OpenAI API key
- OpenAI-based banter generation
- OpenAI-based speech generation
- Anti-repetition handling
- Safe fallback behaviour if AI generation fails

### 7.2 Out of scope

- Any required backend service
- Apple Music support
- Multiple provider support in v1
- Live speech over songs as a required feature
- Full audio mixing over third-party streams
- Direct user track skipping
- Native mobile apps
- Social/multiplayer sessions
- Monetisation features

---

## 8. Product constraints

### 8.1 Platform constraints

- Spotify Premium is required for browser playback
- Spotify playback must use supported browser playback APIs and SDKs
- The app should not depend on simultaneous speech-over-song behaviour

### 8.2 Architecture constraints

- No backend in v1
- No server-side key storage
- No cloud persistence required
- All orchestration should happen in the browser

### 8.3 Key management constraints

- The user provides their own OpenAI API key
- The key is stored locally in the browser only
- The app must make it easy to clear or replace the key
- The app must clearly communicate that the user is responsible for their own API usage and costs

---

## 9. User experience

### 9.1 Core session flow

1. User opens HangTheDJ
2. User signs into Spotify
3. User enters an OpenAI API key locally
4. User selects a station mood and DJ persona
5. User starts the session
6. Music begins playing through Spotify
7. The app monitors tracks, session context, and pending requests
8. At selected transition points, the DJ speaks between tracks
9. The user can send requests through the request line
10. The DJ may reference those requests later during the session

### 9.2 DJ insertion moments

The DJ may speak:

- between tracks
- after every few songs
- when there is a meaningful shift in mood or artist
- when acknowledging a request
- when introducing a requested artist later in the queue
- when there is a strong contextual moment

### 9.3 Request line interaction

The user can submit:

- caller name or handle
- artist name
- optional track name
- optional short message
- optional mood suggestion

The UI should acknowledge receipt immediately. The spoken acknowledgement can happen later.

### 9.4 Listener controls

Users should be able to control:

- DJ frequency
- DJ verbosity
- humour level
- factual vs playful balance
- voice
- accent or regional style where supported
- station mood
- request behaviour preference
- family-safe mode

---

## 10. DJ persona system

### 10.1 Persona concept

A persona defines how the DJ sounds, reacts, and speaks.

### 10.2 Persona fields

- DJ name
- short persona summary
- tone
- humour level
- energy level
- intimacy level
- speech rhythm
- verbosity
- factuality preference
- catchphrases or recurring style markers
- allowed topics
- disallowed topics
- profanity policy
- OpenAI voice choice
- accent or style preference
- speech rate
- expressiveness

### 10.3 Persona goals

The persona system should create DJs that feel:

- distinct
- coherent
- recognisable
- tunable without becoming generic

### 10.4 Example archetypes

- Dry late-night host
- Warm classic FM presenter
- Deadpan music nerd
- Hyperactive tastemaker
- Calm curator
- Pirate radio-inspired personality

---

## 11. Functional requirements

### 11.1 Spotify integration

The system shall:

- authenticate the user with Spotify
- retrieve current track metadata
- retrieve playback state
- detect track changes and playback progress where available
- inspect upcoming track information where supported
- pause playback
- resume playback
- handle Spotify playback capability limitations cleanly

### 11.2 Playback and transition flow

The system shall:

- identify valid moments for DJ insertion
- pause playback or use a natural transition gap
- play a separate DJ audio clip
- resume playback afterward
- cancel or skip transitions safely if timing fails or the session changes unexpectedly

### 11.3 Script generation

The system shall:

- generate short DJ scripts based on session context
- support script types such as transition, acknowledgement, request response, vibe-setting, and station ident
- respect persona settings
- enforce length limits
- reduce repetition across the session
- distinguish grounded statements from playful commentary where relevant

### 11.4 Voice rendering

The system shall:

- render DJ scripts into spoken audio using OpenAI APIs
- support multiple voice/style configurations where available
- support pace and expressiveness controls where possible
- cache generated clips where practical

### 11.5 Listener request handling

The system shall:

- accept listener requests
- store request details and status client-side
- classify requests as accepted, deferred, rejected, or fulfilled
- let the DJ acknowledge requests later in banter
- allow accepted requests to influence future programming
- maintain consistency between what the DJ says and what the station later does

### 11.6 Station scheduling

The system shall:

- maintain editorial control of the station
- blend station flow with listener requests
- avoid abrupt or chaotic shifts unless intentional
- decide when a request fits the current session
- reject or defer requests when necessary without breaking immersion

### 11.7 Session memory

The system shall:

- remember recently played tracks
- remember recent banter topics and phrasing
- remember recent listener requests
- remember whether a request has already been acknowledged
- remember whether the DJ has implied a future fulfilment
- persist relevant state locally between reloads where appropriate

### 11.8 Key and settings management

The system shall:

- allow the user to enter, update, and clear an OpenAI API key
- store the key locally in the browser
- clearly explain that the key is user-supplied and locally stored
- persist personas and settings locally

### 11.9 Failure handling

The system shall:

- continue music playback if banter generation fails
- continue music playback if speech generation fails
- skip DJ insertion if it cannot be executed cleanly
- avoid blocking the listening session due to AI errors

---

## 12. Non-functional requirements

### 12.1 Performance

- DJ clips should usually be ready before the insertion point
- transitions should feel intentional rather than delayed
- the app should skip low-confidence or slow insertions rather than stalling playback

### 12.2 Reliability

- playback should resume correctly after DJ segments
- local session state should survive refreshes where practical
- request history and persona settings should persist reliably

### 12.3 Privacy

- only the minimum required local data should be stored
- the user should be able to clear local state easily
- no backend persistence is required in v1

### 12.4 Cost transparency

- the app should make it clear that OpenAI usage is billed to the user’s own key
- generation frequency should be configurable to manage usage
- cached outputs should reduce unnecessary regeneration

### 12.5 Extensibility

- the Spotify integration should be isolated behind a provider layer
- the OpenAI banter and voice logic should be isolated behind service boundaries
- the architecture should leave room for a future optional backend without requiring a rewrite of the UI

---

## 13. Compliance-first operating model

### 13.1 Default mode

The MVP operates in interstitial mode:

- DJ clips are separate from Spotify music playback
- music is paused or a natural gap is used
- the product does not depend on simultaneous speech over songs

### 13.2 Future experimental mode

A future ducked-overlay mode may be explored, but:

- it is optional
- it is not required for the product to make sense
- it is isolated from the compliant core design

---

## 14. Success criteria

The MVP is successful if:

- a user can sign in with Spotify
- a user can provide an OpenAI API key locally
- the app can run a stable station session in the browser
- the DJ can speak naturally between tracks
- the user can configure the DJ’s personality and voice
- the user can submit listener requests
- the DJ can reference those requests later in a believable way
- accepted requests can influence the station without breaking its flow
- repeated banter is reduced noticeably
- AI generation failures do not break music playback

---

## 15. Key risks

### Product risks

- The DJ may become repetitive or annoying
- Request handling may feel arbitrary if station rules are unclear
- Weak voice quality may break immersion

### Technical risks

- Spotify playback and queue information may have limitations in-browser
- Browser audio behaviour may complicate smooth transitions
- Real-time generation latency may reduce polish
- Local storage and cache management may become messy over time

### Security risks

- User-supplied OpenAI keys are exposed to the browser environment
- The app must treat local key storage carefully and transparently

---

## 16. Recommended delivery phases

### Phase 1: Foundation

- Spotify authentication
- Spotify playback integration
- local OpenAI key entry and storage
- basic pause → DJ clip → resume flow
- basic persona presets
- OpenAI banter generation
- OpenAI speech generation

### Phase 2: Station identity

- request line
- request memory and acknowledgement flow
- station mood modes
- richer persona controls

### Phase 3: Quality and scheduling

- anti-repetition memory
- stronger station scheduling
- improved request acceptance/defer/reject logic
- better local cache and pre-generation behaviour

### Phase 4: Expansion

- richer station identity features
- improved installable PWA experience
- optional future provider abstraction work
- experimental playback behaviours behind flags

---

## 17. Open questions

1. Should the first version use only preset personas, or also allow full custom persona editing?
2. Should request fulfilment be soft-guaranteed when valid, or purely advisory?
3. How much should the DJ reference prior sessions versus only the current session?
4. Should the app support offline access to past generated clips, settings, and session memory when the app shell is installed?
5. Should the station have an explicit sub-brand layer such as idents, jingles, and themed modes beyond HangTheDJ itself?

---

## 18. Summary

HangTheDJ is a Spotify-first, client-side AI radio experience built as a single-page installable web app. It combines configurable DJ personality, OpenAI-generated banter, OpenAI speech synthesis, local session memory, and a listener request line to create something more alive than a normal playlist player.

The MVP should focus on a stable browser-only foundation with no backend, strong station identity, believable request handling, and polished interstitial playback. If that core works, HangTheDJ becomes a distinctive product without requiring server infrastructure or live speech over music.
