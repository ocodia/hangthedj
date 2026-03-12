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
`gpt-4o-mini` is recommended for v1:
- fast enough for near-real-time use
- cost-effective for short DJ scripts
- good instruction-following for persona prompts

Alternative: `gpt-4o` for higher quality if latency allows.

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

| Segment type          | Target words | Max seconds |
|-----------------------|--------------|-------------|
| transition            | 20–40        | 10–15       |
| request acknowledgement| 25–50       | 12–18       |
| vibe-setting line     | 15–30        | 8–12        |
| station ident         | 10–20        | 5–8         |
| artist introduction   | 20–40        | 10–15       |

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

Cache key = hash of (text + voice + speechRate)

- Check local Cache Storage before calling the API
- If cache hit: return cached blob without API call
- If cache miss: call API, store result, return blob
- Cache is pruned when session ends or storage approaches quota

### Error handling

- If API call fails: cancel voice rendering → cancel transition → continue music
- If audio playback fails after rendering: cancel transition → resume Spotify

---

## Cost considerations

- Chat Completions: billed per token; short DJ scripts are cheap (< 500 tokens each)
- TTS: billed per character; ~30 words ≈ 200 characters ≈ small cost per clip
- Caching rendered clips reduces repeated TTS calls significantly
- The app should clearly communicate usage to the user
- TODO: Add a session cost estimator or usage counter in settings

---

## Assumptions

- OpenAI API permits browser-originated CORS requests with a user-supplied key
- `tts-1` response latency is typically 1–3 seconds for short clips — acceptable for pre-generation
- OpenAI voice API does not yet support custom accent or style injection beyond the voice ID selection; style is handled via prompt phrasing in the banter script itself
