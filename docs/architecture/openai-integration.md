# OpenAI Integration

## Overview

HangTheDJ uses two OpenAI APIs:

1. **Chat Completions** — for DJ banter script generation
2. **Text-to-Speech (TTS)** — for voice rendering of generated scripts

Both are called directly from the browser using the user's own API key.

---

## API key handling

- The user supplies their own OpenAI API key
- The key is stored in localStorage via `StorageService`
- It is passed to `BanterEngine` and `VoiceEngine` at initialization
- The key is never logged, never sent to any proxy, and never hardcoded
- TODO: Validate whether OpenAI's API supports browser-originated requests (CORS) — the `openai` npm package supports browser environments; verify this works with the configured key

---

## BanterEngine

### Model

`gpt-5.3-chat-latest` is the model used in v1:

- fast enough for near-real-time use
- cost-effective for short DJ scripts
- good instruction-following for persona prompts

### Prompt structure

```
System prompt:
  [Persona definition]
  [Station mood and style constraints]
  [Format instructions: short, spoken, no stage directions]

User message:
  [Segment type instruction]
  [Current track context]
  [Recent tracks summary]
  [Request context if relevant]
  [Anti-repetition instruction with recent summaries]
  [Length constraint: max N words]
```

### Output format

Plain text, no markdown, no stage directions, no quotes. Just the spoken line.

### Length targets

| Segment type            | Target words | Max seconds |
| ----------------------- | ------------ | ----------- |
| transition              | 20–40        | 10–15       |
| request acknowledgement | 25–50        | 12–18       |
| vibe-setting line       | 15–30        | 8–12        |
| station ident           | 10–20        | 5–8         |
| artist introduction     | 20–40        | 10–15       |

### Error handling

- If the API call fails (network, rate limit, invalid key): cancel the transition, log the error, continue music
- If the output is empty or too long: discard and skip insertion
- If the output matches a recent fingerprint: discard and skip insertion

---

## VoiceEngine

### Model

`tts-1` for low latency in v1.
`tts-1-hd` as an option for higher quality if the user prefers it.

### Voices available (as of 2024)

`alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`

These are mapped to personas. The persona's `voice` field should be one of these identifiers.

### Request format

```
POST https://api.openai.com/v1/audio/speech
{
  "model": "tts-1",
  "input": "<script text>",
  "voice": "<voice id>",
  "response_format": "mp3",
  "speed": <speechRate or 1.0>
}
```

### Response handling

- Response is a binary mp3 blob
- Convert to an object URL for `HTMLAudioElement` playback
- Optionally cache the blob in Cache Storage under the clip's cacheKey
- Revoke object URLs when no longer needed to avoid memory leaks

### Caching strategy

Cache key = SHA-256 hash of (provider + text + voice + speechRate + format)

- Check in-memory object URL cache before calling the API
- If cache hit: return cached result without API call
- If cache miss: call API, create object URL, store result, return
- Cache is cleared when session ends (all object URLs are revoked)

### Error handling

- If API call fails: cancel voice rendering → cancel transition → continue music
- If audio playback fails after rendering: cancel transition → resume Spotify

---

---

## ElevenLabs Integration (Optional)

HangTheDJ supports **ElevenLabs** as an alternative TTS provider for higher-quality or custom voices.

### Provider selection

The VoiceEngine automatically selects the provider per render request:

- If an ElevenLabs API key is set **and** the active persona has an `elevenLabsVoiceId`: use ElevenLabs
- Otherwise: use OpenAI TTS

### ElevenLabs TTS request

```
POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}
Headers:
  xi-api-key: <user key>
  Content-Type: application/json
  Accept: audio/mpeg
Body:
{
  "text": "<script text>",
  "model_id": "eleven_multilingual_v2"
}
```

### Voice search

The app provides a voice search UI that queries the ElevenLabs voice library:

```
GET https://api.elevenlabs.io/v1/voices
Headers:
  xi-api-key: <user key>
```

Results are filtered client-side by name or labels. Users can preview and select voices from the persona editor.

### Key storage

The ElevenLabs API key is stored in localStorage under `hangthedj:elevenlabs_key`, managed by `StorageService`.

---

## Cost considerations

- Chat Completions: billed per token; short DJ scripts are cheap (< 500 tokens each)
- OpenAI TTS: billed per character; ~30 words ≈ 200 characters ≈ small cost per clip
- ElevenLabs TTS: billed per character under the user's ElevenLabs plan
- Caching rendered clips reduces repeated TTS calls significantly
- The app should clearly communicate usage to the user

---

## Assumptions

- OpenAI API permits browser-originated CORS requests with a user-supplied key
- `tts-1` response latency is typically 1–3 seconds for short clips — acceptable for pre-generation
- OpenAI voice API does not yet support custom accent or style injection beyond the voice ID selection; style is handled via prompt phrasing in the banter script itself
- ElevenLabs API permits browser-originated CORS requests with a user-supplied key
