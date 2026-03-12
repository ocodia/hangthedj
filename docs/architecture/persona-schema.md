# Persona Schema

## Overview

A Persona defines how the DJ sounds, behaves, and speaks. Personas are stored in IndexedDB and referenced by session state.

---

## TypeScript interface

```ts
interface Persona {
  id: string;           // UUID
  name: string;         // Display name, e.g. "Nova Nightshift"
  summary: string;      // 1-2 sentence description used in system prompt
  tone: string;         // e.g. "dry", "warm", "sarcastic", "enthusiastic"
  humourLevel: "low" | "medium" | "high";
  energyLevel: "low" | "medium" | "high";
  verbosity: "brief" | "moderate" | "verbose";
  factuality: "playful" | "balanced" | "grounded";
  accent?: string;      // Style hint only; TTS does not support accent directly
  voice: SpotifyVoiceId; // One of: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"
  speechRate?: number;  // 0.5–2.0, default 1.0
  expressiveness?: string; // Style hint passed into prompt, e.g. "deadpan delivery"
  catchphrases?: string[]; // Optional recurring phrases for the DJ
  allowedTopics?: string[]; // Topics the DJ can reference
  disallowedTopics?: string[]; // Topics the DJ should avoid
  profanityPolicy: "none" | "mild" | "moderate"; // Controls language in banter
  familySafe: boolean;  // Strict family-safe mode
  isPreset: boolean;    // True for built-in presets
  createdAt: string;    // ISO 8601
  updatedAt: string;    // ISO 8601
}
```

---

## Preset archetypes

### Nova Nightshift (preset)
```json
{
  "name": "Nova Nightshift",
  "summary": "A smooth, late-night DJ with dry wit and a love of album deep cuts.",
  "tone": "dry",
  "humourLevel": "medium",
  "energyLevel": "low",
  "verbosity": "brief",
  "factuality": "balanced",
  "voice": "nova",
  "speechRate": 0.95,
  "expressiveness": "calm and understated",
  "profanityPolicy": "none",
  "familySafe": true
}
```

### Hype Machine (preset)
```json
{
  "name": "Hype Machine",
  "summary": "An energetic tastemaker who lives for new discoveries and big moments.",
  "tone": "enthusiastic",
  "humourLevel": "high",
  "energyLevel": "high",
  "verbosity": "moderate",
  "factuality": "playful",
  "voice": "echo",
  "speechRate": 1.15,
  "expressiveness": "upbeat and expressive",
  "profanityPolicy": "none",
  "familySafe": true
}
```

### The Curator (preset)
```json
{
  "name": "The Curator",
  "summary": "A thoughtful, slightly nerdy music presenter who knows everything about artists.",
  "tone": "warm",
  "humourLevel": "low",
  "energyLevel": "medium",
  "verbosity": "moderate",
  "factuality": "grounded",
  "voice": "fable",
  "speechRate": 1.0,
  "expressiveness": "considered and warm",
  "profanityPolicy": "none",
  "familySafe": true
}
```

---

## How persona fields map to prompts

| Field            | Prompt usage                                               |
|------------------|------------------------------------------------------------|
| summary          | Included verbatim in system prompt                         |
| tone             | Guides language register and delivery style                |
| humourLevel      | Controls joke frequency and style                          |
| energyLevel      | Controls pacing and enthusiasm in output                   |
| verbosity        | Maps to word count targets for generation                  |
| factuality       | Controls balance of facts vs personality-led commentary    |
| accent           | Added as a style note; does not affect TTS voice directly  |
| catchphrases     | Injected as optional flavour (use sparingly)               |
| profanityPolicy  | Explicit constraint in system prompt                       |
| familySafe       | Adds family-safe instruction override                      |

---

## Persona resolution

Before calling the BanterEngine, the PersonaService resolves the active persona into a structured system prompt block:

```
You are [name], a radio DJ. [summary]

Style: [tone], [humourLevel] humour, [energyLevel] energy.
Delivery: [expressiveness or default].
Keep responses [verbosity mapping: brief=under 30 words, moderate=30-50, verbose=50-80].
Language: [profanityPolicy mapping].
[If familySafe]: Keep all content family-friendly.
[If catchphrases]: You sometimes say: [catchphrases joined].
Do not use stage directions, quotes, or markdown. Speak directly.
```
