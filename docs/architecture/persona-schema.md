# Persona Schema

## Overview

A Persona defines how the DJ sounds, behaves, and speaks. Personas are stored in IndexedDB and referenced by session state.

---

## Data model

Each persona is stored as a plain object in IndexedDB with the following fields:

| Field             | Type    | Notes                                                    |
| ----------------- | ------- | -------------------------------------------------------- |
| id                | string  | UUID, primary key                                        |
| name              | string  | Display name, e.g. "DJ Pirate"                           |
| systemPrompt      | string  | Free-form prompt text defining the persona's personality |
| elevenLabsVoiceId | string  | Optional ElevenLabs voice ID for premium TTS             |
| voice             | string  | OpenAI TTS voice ID (fallback when ElevenLabs not used)  |
| speechRate        | number  | 0.5–1.5, default 1.0                                     |
| isPreset          | boolean | True for built-in presets                                |
| createdAt         | string  | ISO 8601                                                 |
| updatedAt         | string  | ISO 8601                                                 |

The persona model uses a **free-form `systemPrompt`** rather than structured personality fields (tone, humourLevel, etc.). This gives users full control over the DJ's personality through natural language, and allows presets to embed style, delivery, and word count constraints directly in the prompt.

---

## Preset personas

### DJ Pirate (preset)

```json
{
  "name": "DJ Pirate",
  "systemPrompt": "Gritty pirate radio DJ broadcasting from a hidden studio.\nTone: mischievous, rebellious, underground.\nDelivery: relaxed but edgy pacing with attitude.\nKeep responses 30–50 words.\n\nSound like you're broadcasting illegal late-night underground music.",
  "elevenLabsVoiceId": "7ktJCfz71Z44ppWOelh3",
  "voice": "onyx",
  "speechRate": 1.0,
  "isPreset": true
}
```

### DJ Classic Rock (preset)

```json
{
  "name": "DJ Classic Rock",
  "systemPrompt": "Loud, charismatic 1980s rock station DJ.\nTone: confident, bold, slightly over-the-top.\nDelivery: dramatic emphasis, punchy rhythm.\nKeep responses 30–50 words.\n\nSound like a classic rock station host introducing a stadium anthem.",
  "elevenLabsVoiceId": "mKoqwDP2laxTdq1gEgU6",
  "voice": "echo",
  "speechRate": 1.0,
  "isPreset": true
}
```

---

## Persona resolution

Before calling the BanterEngine, the `PersonaService.resolveSystemPrompt()` method wraps the persona's raw system prompt with output rules:

```
You are [name], a radio DJ.

[systemPrompt contents]

Output rules:
- Speak directly as the DJ with no stage directions, markdown, or quotes.
- Do not explain what you are doing — just deliver the line.
- Do not start with 'I' or the DJ name.
- Sound natural and spoken, not written.
```

---

## Voice resolution

Voice provider is determined at render time by the VoiceEngine:

1. If the user has an ElevenLabs API key set **and** the persona has an `elevenLabsVoiceId`: use ElevenLabs with model `eleven_multilingual_v2`
2. Otherwise: use OpenAI TTS (`tts-1`) with the persona's `voice` field

Available OpenAI voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

---

## Creating and editing personas

Users can create custom personas via the persona editor UI. The editor provides:

- Name field
- System prompt text area (free-form)
- OpenAI voice selector (dropdown of available voices)
- ElevenLabs voice ID field (if ElevenLabs key is set, a voice search UI is available)
- Speech rate slider (0.5–1.5)

Preset personas cannot be deleted but can be supplemented with custom personas.
