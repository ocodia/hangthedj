# App Flow

## Overview

This document describes the major user flows and state transitions in HangTheDJ.

---

## 1. Startup flow

```
App loads (index.html → main.js)
  │
  ├─ Register service worker
  ├─ Initialize StorageService (IndexedDB open + schema verify)
  ├─ Load app settings from localStorage
  ├─ Seed default personas if not present
  ├─ Restore last active persona (or default to first preset)
  │
  ├─ Check Spotify auth state
  │   ├─ Token present and valid → restore session → go to PlayerReady
  │   ├─ PKCE callback detected → exchange code → store token → go to PlayerReady
  │   └─ No token → show Auth screen
  │
  └─ Check OpenAI key presence
      ├─ Key present → initialize BanterEngine + VoiceEngine
      └─ No key → show warning banner (non-blocking, DJ inactive until provided)
```

---

## 2. Station session flow

```
PlayerReady
  │
  ├─ User selects persona
  ├─ User optionally selects music context (artist/album/playlist via Music Picker)
  ├─ User clicks "Tune In"
  │
  ├─ Session created and saved to IndexedDB
  ├─ SpotifyPlayerService initialized (SDK loaded if needed)
  ├─ PlaybackCoordinator enters Monitoring state
  ├─ Spotify volume set to 0 (for intro fade-in)
  ├─ Music playback starts from selected context
  ├─ DJ intro generated and played with fade-in
  │
  └─ Position Monitor Loop (~1s intervals):
      ├─ Fetch current playback position
      │
      ├─ Phase 1 (< 30s remaining):
      │   ├─ StationScheduler evaluates insertion opportunity
      │   ├─ If approved: BanterEngine generates script
      │   ├─ VoiceEngine renders audio (cached for Phase 2)
      │   └─ Store pre-generated clip for upcoming transition
      │
      ├─ Phase 2 (< 10s remaining):
      │   └─ PlaybackCoordinator.executeTransition()
      │       ├─ Fade music volume to 20% (3s, 15 steps)
      │       ├─ Play DJ audio clip over ducked music
      │       └─ Fade music volume back to original (1.5s, 8 steps)
      │
      └─ Phase 3: Process pending call-in queue
          ├─ Search Spotify for requested tracks
          ├─ Accept or reject requests
          └─ Queue accepted tracks on Spotify
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
      ├─ Classifies segment as: requestAcknowledgement or requestDeferment
      │
      ├─ acknowledged → BanterEngine generates acknowledgement script
      │                 DJ speaks the acknowledgement
      │                 Status → "accepted"
      │
      └─ rejected → DJ declines in character
                    Status → "rejected"

Request with "Play right now" flag:
  ├─ Spotify search for track immediately
  ├─ If found: add to Spotify queue, generate immediate banter
  ├─ If not found: reject request
```

---

## 4. Transition state machine (PlaybackCoordinator)

```
States:
  idle
  monitoring
  fadingOut
  playingDjClip
  resumingPlayback

Transitions:
  idle → monitoring                    (session started)
  monitoring → fadingOut               (transition triggered with DJ clip ready)
  fadingOut → playingDjClip            (music ducked to 20% volume)
  playingDjClip → resumingPlayback     (DJ clip completed or errored)
  resumingPlayback → monitoring        (music volume restored)
  monitoring → idle                    (session ended)
```

Note: The coordinator uses **volume ducking** (crossfade) rather than full pause/resume. Music continues playing at reduced volume while the DJ speaks, then fades back to the original volume.

### Crossfade parameters

| Parameter         | Value  |
| ----------------- | ------ |
| Fade-out duration | 3000ms |
| Fade-out steps    | 15     |
| Ducked volume     | 0.2    |
| Fade-in duration  | 1500ms |
| Fade-in steps     | 8      |

---

## 5. Failure flow

```
Any state during transition:
  │
  ├─ BanterEngine fails → skip transition → continue monitoring
  ├─ VoiceEngine fails → skip transition → continue monitoring
  ├─ Fade-out fails → log warning, continue transition anyway
  ├─ DJ clip playback fails → log warning, proceed to resume
  ├─ Fade-in fails → snap volume to original → continue monitoring
  └─ Unexpected error → restore volume → return to monitoring
```

---

## 6. Settings and persona flow

```
Settings panel open
  ├─ Load personas from IndexedDB
  ├─ User edits or creates persona via persona editor
  │   ├─ Name, system prompt, voice selection
  │   ├─ Optional: ElevenLabs voice search and selection
  │   └─ Speech rate adjustment
  ├─ PersonaService.save(persona)
  ├─ Persona stored in IndexedDB
  └─ Active persona updated in session store

Key management:
  ├─ User enters OpenAI key in Settings
  ├─ StorageService.setOpenAIKey(key)
  ├─ Key stored in localStorage
  └─ BanterEngine + VoiceEngine re-initialized with new key

  ├─ User enters ElevenLabs key in Settings (optional)
  ├─ StorageService.setElevenLabsKey(key)
  └─ VoiceEngine updated with ElevenLabs config

  ├─ User clears OpenAI key
  ├─ StorageService.clearOpenAIKey()
  └─ DJ generation disabled until key re-entered
```
