# App Flow

## Overview

This document describes the major user flows and state transitions in HangTheDJ.

---

## 1. Startup flow

```
App loads (index.html → main.ts)
  │
  ├─ Register service worker
  ├─ Initialize StorageService (IndexedDB open + schema verify)
  ├─ Load app settings from localStorage
  ├─ Restore last active persona
  │
  ├─ Check Spotify auth state
  │   ├─ Token present and valid → restore session → go to PlayerReady
  │   ├─ PKCE callback detected → exchange code → store token → go to PlayerReady
  │   └─ No token → show Auth screen
  │
  └─ Check OpenAI key presence
      ├─ Key present → ready for generation
      └─ No key → prompt for key (non-blocking, DJ inactive until provided)
```

---

## 2. Station session flow

```
PlayerReady
  │
  ├─ User selects mood and persona
  ├─ User starts session
  │
  ├─ SpotifyPlayerService.connect() → device ready
  ├─ PlaybackCoordinator enters Monitoring state
  │
  └─ Loop:
      ├─ Track changes detected
      ├─ StationScheduler evaluates insertion opportunity
      │   ├─ No insertion → continue monitoring
      │   └─ Insertion approved →
      │       ├─ ContextBuilder assembles context
      │       ├─ BanterEngine generates script
      │       ├─ VoiceEngine renders audio
      │       ├─ PlaybackCoordinator waits for insertion point
      │       ├─ SpotifyPlayerService.pause()
      │       ├─ DJAudioPlayer.play(clip)
      │       ├─ DJAudioPlayer completes
      │       ├─ SpotifyPlayerService.resume()
      │       └─ SessionMemory updated
      └─ Repeat
```

---

## 3. Request line flow

```
User fills in request form
  │
  ├─ RequestLineManager.submit(request)
  ├─ Request stored in IndexedDB with status: "pending"
  ├─ UI shows acknowledgement (immediate)
  │
  └─ On next scheduler evaluation:
      ├─ Scheduler sees pending request
      ├─ Classifies as: accept / defer / reject
      │
      ├─ accepted → BanterEngine generates acknowledgement script
      │             DJ speaks the acknowledgement
      │             Status → "accepted"
      │             promisedForLater = true if applicable
      │
      ├─ deferred → DJ may or may not mention it now
      │             Status → "deferred"
      │
      └─ rejected → DJ declines in character
                    Status → "rejected"
```

---

## 4. Transition state machine

```
States:
  Idle
  Monitoring
  PreparingTransition
  WaitingForInsertionPoint
  PausingPlayback
  PlayingDjClip
  ResumingPlayback

Transitions:
  Idle → Monitoring                    (session started)
  Monitoring → PreparingTransition     (scheduler approves insertion)
  PreparingTransition → WaitingForInsertionPoint  (clip generated and ready)
  PreparingTransition → Monitoring     (generation failed → skip, resume monitoring)
  WaitingForInsertionPoint → PausingPlayback  (insertion point reached)
  WaitingForInsertionPoint → Monitoring (opportunity expired → skip)
  PausingPlayback → PlayingDjClip      (Spotify paused successfully)
  PausingPlayback → Monitoring         (pause failed → skip)
  PlayingDjClip → ResumingPlayback     (DJ clip completed)
  PlayingDjClip → ResumingPlayback     (DJ clip errored → skip to resume)
  ResumingPlayback → Monitoring        (Spotify resumed)
  Monitoring → Idle                    (session ended)
```

---

## 5. Failure flow

```
Any state in PreparingTransition or later:
  │
  ├─ BanterEngine fails → cancel transition → Monitoring
  ├─ VoiceEngine fails → cancel transition → Monitoring
  ├─ SpotifyPlayerService.pause() fails → cancel transition → Monitoring
  ├─ DJAudioPlayer.play() fails → skip to ResumingPlayback
  └─ SpotifyPlayerService.resume() fails → retry once → log error → Monitoring
```

---

## 6. Settings and persona flow

```
Settings panel open
  ├─ Load personas from IndexedDB
  ├─ User edits or creates persona
  ├─ PersonaService.save(persona)
  ├─ Persona stored in IndexedDB
  └─ Active persona updated in session store

Key management:
  ├─ User enters OpenAI key
  ├─ StorageService.setOpenAIKey(key)
  ├─ Key stored in localStorage
  └─ BanterEngine + VoiceEngine re-initialized with new key

  ├─ User clears OpenAI key
  ├─ StorageService.clearOpenAIKey()
  └─ DJ generation disabled until key re-entered
```
